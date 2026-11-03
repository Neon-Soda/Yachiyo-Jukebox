import { reactive, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import english from "./locale-en.json";
import type {
  Config,
  Preferences,
  Theme,
  Catalog,
  Status,
  CacheInfo,
  ThemeEntry,
  Snapshot,
  Settings,
  Draft,
} from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const defaultTheme = (): Theme => ({
  version: 1,
  name: "月夜 · Yachiyo",
  colors: {},
  texts: {},
  images: {},
});
export const state = reactive({
  ready: false,
  fatal: "",
  busy: false,
  preferenceSaving: false,
  page: "overview",
  version: "2.0.0",
  pending: false,
  showKey: false,
  config: {
    version: 1,
    guildId: "",
    clientId: "",
    activityEnabled: true,
    publicOrigin: "",
    port: 3178,
    bind: "127.0.0.1",
    connectionMode: "direct",
    sshHost: "",
    sshUser: "",
    sshPort: 22,
    remotePort: 43178,
    cacheMb: 1024,
    idleMinutes: 5,
    autoStart: true,
    launchAtLogin: false,
  } as Config,
  saved: {} as Record<string, boolean>,
  secrets: {
    botToken: "",
    clientSecret: "",
    sshKey: "",
    knownHosts: "",
  } as Record<string, string>,
  preferences: { language: "zh-CN", appTheme: "forest" } as Preferences,
  status: {
    bot: "stopped",
    local: "stopped",
    public: "unchecked",
    tunnel: "off",
    reason: "尚未启动",
    rooms: 0,
    ping: null,
    pid: null,
    tunnelPid: null,
    wanted: false,
    events: [],
  } as Status,
  catalog: { colors: {}, texts: {} } as Catalog,
  theme: defaultTheme(),
  themeId: "",
  library: [] as ThemeEntry[],
  themeState: "当前主题",
  previewUrl: "",
  previewSrc: "",
  previewError: "",
  copySearch: "",
  copyGroup: "all",
  copyPage: 0,
  cache: { bytes: 0, count: 0, limitMb: 1024 } as CacheInfo,
  toast: "",
  toastError: false,
});
export const pages: Record<string, [string, string, string]> = {
  overview: ["运行概览", "OVERVIEW", "◉"],
  connection: ["连接与账户", "CONNECTION", "⌁"],
  playback: ["播放与启动", "PLAYBACK", "▷"],
  appearance: ["应用外观", "APPEARANCE", "◒"],
  theme: ["点歌台主题", "THEME", "◐"],
  copy: ["提示文案", "COPY", "≡"],
  storage: ["缓存与诊断", "STORAGE", "▤"],
};
export function t(source: string, vars: Record<string, unknown> = {}) {
  let value =
    state.preferences.language === "en"
      ? ((english as Record<string, string>)[source] ?? source)
      : source;
  if (state.preferences.language === "en" && source.startsWith("Bot 已退出"))
    value = "Bot exited; reconnecting automatically";
  return value.replace(/\{(\w+)\}/g, (all, key) => String(vars[key] ?? all));
}
export async function call<T = unknown>(
  operation: string,
  data?: unknown,
): Promise<T> {
  const result = await invoke<{ ok: boolean; value: T; error: string }>("rpc", {
    operation,
    data: data ?? null,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
let toastTimer: ReturnType<typeof setTimeout>,
  previewTimer: ReturnType<typeof setTimeout>,
  draftTimer: ReturnType<typeof setTimeout>;
export function toast(message: string, error = false) {
  state.toast = message;
  state.toastError = error;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (state.toast = ""), error ? 9000 : 4500);
}
export async function run(action: () => Promise<unknown>, success = "") {
  if (state.busy) return;
  state.busy = true;
  try {
    await action();
    if (success) toast(success);
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : "操作未完成，请检查设置或文件是否可用。",
      true,
    );
  } finally {
    state.busy = false;
  }
}
export async function service(operation: string) {
  await run(
    async () => {
      state.status = await call<Status>(operation);
      if (operation === "restart" || operation === "start")
        state.pending = false;
    },
    operation === "check" ? "连接检查已完成。" : "",
  );
}
export function go(page: string) {
  if (!pages[page]) return;
  state.page = page;
  window.scrollTo(0, 0);
  if (page === "storage") void run(refreshCache);
  if (page === "theme") void refreshPreview();
}
export const labels: Record<string, string> = {
  stopped: "已停止",
  connecting: "正在连接",
  starting: "正在启动",
  online: "已连接",
  offline: "未连接",
  retrying: "自动重试中",
  disabled: "未启用",
  unchecked: "尚未检查",
  off: "无需隧道",
  external: "外部管理",
  unverified: "公网待验证",
};
export const overall = computed(() =>
  state.status.bot === "online"
    ? !state.config.activityEnabled || state.status.public === "online"
      ? "online"
      : "warning"
    : "offline",
);
export const statusText = computed(() =>
  !state.ready
    ? "正在读取状态"
    : overall.value === "online"
      ? "已连接"
      : overall.value === "warning"
        ? "Bot 在线，点歌台待检查"
        : labels[state.status.bot] || "未连接",
);
export function dot(status: string) {
  return status === "online"
    ? "online"
    : ["connecting", "retrying", "starting"].includes(status)
      ? "warning"
      : "";
}
export const hostname = computed(() => {
  try {
    return new URL(state.config.publicOrigin).host;
  } catch {
    return "music.example.com";
  }
});
export const caddy = computed(
  () =>
    `${hostname.value} {\n    reverse_proxy 127.0.0.1:${state.config.connectionMode === "ssh" ? state.config.remotePort : state.config.port}\n}`,
);
export function savedText(key: string) {
  return t(state.saved[key] ? "已加密保存" : "未导入");
}
function updates(sshOnly = false) {
  return Object.fromEntries(
    Object.entries(state.secrets).filter(
      ([key, value]) =>
        value.trim() && (!sshOnly || ["sshKey", "knownHosts"].includes(key)),
    ),
  );
}
function acceptSettings(result: Settings, fill = false) {
  state.saved = result.saved;
  if (fill) state.config = clone(result.config);
}
export async function saveSettings() {
  await run(async () => {
    acceptSettings(
      await call<Settings>("saveSettings", {
        config: state.config,
        secrets: updates(),
      }),
      true,
    );
    for (const key in state.secrets) state.secrets[key] = "";
    state.showKey = false;
    state.pending = true;
  }, "设置已保存，重启 Bot 后生效。");
}
export async function saveSsh() {
  await run(async () => {
    acceptSettings(await call<Settings>("saveSshCredentials", updates(true)));
    state.secrets.sshKey = state.secrets.knownHosts = "";
    state.showKey = false;
    state.pending = true;
  }, "SSH 凭据已加密保存，重启 Bot 后生效。");
}
export async function importSecret(key: string) {
  await run(async () => {
    const result = await call<Settings | null>("importSecret", key);
    if (result) {
      acceptSettings(result);
      if (key in state.secrets) state.secrets[key] = "";
      state.pending = true;
      toast("凭据已加密保存。");
    }
  });
}
export async function removeSecret(key: string) {
  await run(async () => {
    acceptSettings(await call<Settings>("removeSecret", key));
    state.pending = true;
  }, "已移除保存的凭据。");
}
export async function importProject() {
  await run(async () => {
    const result = await call<Settings | null>("importProject");
    if (result) {
      acceptSettings(result, true);
      state.pending = true;
      toast("已从旧项目导入配置，凭据已加密保存。启动前请停用旧版自启任务。");
    }
  });
}
export async function savePreferences(patch: Partial<Preferences>) {
  if (!state.ready || state.preferenceSaving) return;
  const previous = clone(state.preferences);
  state.preferenceSaving = true;
  Object.assign(state.preferences, patch);
  try {
    state.preferences = await call<Preferences>("savePreferences", patch);
    toast(patch.language ? "界面语言已切换。" : "应用外观已保存。");
  } catch (error) {
    state.preferences = previous;
    toast((error as Error).message, true);
  } finally {
    state.preferenceSaving = false;
  }
}
export async function simple(operation: string) {
  await run(() => call(operation));
}
export async function refreshCache() {
  state.cache = await call<CacheInfo>("cacheInfo");
}
export async function clearCache() {
  await run(async () => {
    state.cache = await call<CacheInfo>("clearCache");
  }, "音频缓存已清理。");
}
export async function exportDiagnostics() {
  await run(async () => {
    if (await call("exportDiagnostics")) toast("脱敏诊断已导出。");
  });
}
export async function loadLibrary() {
  state.library = await call<ThemeEntry[]>("loadThemes");
}
export function selectTheme(id: string) {
  const entry = state.library.find((item) => item.id === id);
  if (entry) {
    state.theme = clone(entry.theme);
    state.themeId = id;
    state.themeState = "已载入主题";
  }
}
export function resetTheme() {
  state.theme = defaultTheme();
  state.themeId = "";
  state.themeState = "未保存的更改";
}
export async function saveTheme() {
  await run(async () => {
    const result = await call<ThemeEntry>("saveTheme", {
      theme: state.theme,
      id: state.themeId,
    });
    state.themeId = result.id;
    state.theme = result.theme;
    await loadLibrary();
    state.themeState = "已保存到主题库";
  }, "主题已保存。");
}
export async function applyTheme() {
  await run(async () => {
    state.theme = await call<Theme>("applyTheme", state.theme);
    state.themeState = "已应用到点歌台";
  }, "已应用主题。重新打开点歌台即可看到；Bot 固定回复重启后生效。");
}
export async function deleteTheme() {
  if (!state.themeId) return;
  await run(async () => {
    await call("deleteTheme", state.themeId);
    state.themeId = "";
    await loadLibrary();
  }, "主题已删除。");
}
export async function importTheme() {
  await run(async () => {
    const theme = await call<Theme | null>("importTheme");
    if (theme) {
      state.theme = theme;
      state.themeId = "";
      state.themeState = "已导入，尚未应用";
    }
  });
}
export async function exportTheme() {
  await run(async () => {
    if (await call("exportTheme", state.theme)) toast("主题已导出。");
  });
}
export async function pickImage(key: string) {
  await run(async () => {
    const image = await call<string | null>("pickImage");
    if (image) state.theme.images[key] = image;
  });
}
let previewSequence = 0;
export async function refreshPreview() {
  if (!state.ready || state.page !== "theme") return;
  const sequence = ++previewSequence;
  try {
    const url = await call<string>("previewTheme", state.theme);
    if (sequence !== previewSequence) return;
    state.previewUrl = url;
    state.previewSrc = `${url}/?preview=${Date.now()}`;
    state.previewError = "";
  } catch (error) {
    if (sequence === previewSequence)
      state.previewError = (error as Error).message;
  }
}
export const colorEntries = computed(() =>
  Object.entries(state.catalog.colors),
);
export const primaryEntries = computed(() =>
  colorEntries.value.filter(([, item]) => item.primary),
);
export const detailEntries = computed(() =>
  colorEntries.value.filter(([, item]) => !item.primary),
);
export const groupNames: Record<string, string> = {
  all: "全部文案",
  page: "页面固定文字",
  activity: "交互与状态",
  room: "房间动态与校验",
  bot: "Bot 回复与指令",
};
export const copyEntries = computed(() =>
  Object.entries(state.catalog.texts).filter(
    ([key, item]) =>
      (state.copyGroup === "all" || item.group === state.copyGroup) &&
      (!state.copySearch ||
        `${key} ${item.default} ${state.theme.texts[key] ?? ""}`
          .toLowerCase()
          .includes(state.copySearch.toLowerCase())),
  ),
);
export const copyPages = computed(() =>
  Math.max(1, Math.ceil(copyEntries.value.length / 20)),
);
export const visibleCopy = computed(() =>
  copyEntries.value.slice(state.copyPage * 20, state.copyPage * 20 + 20),
);
export function editCopy(key: string, value: string, reset = false) {
  const canonical = (text: string) => text.trim().replace(/\s*[＋⌕]\s*$/, "");
  const original = state.catalog.texts[key];
  for (const [alias, item] of Object.entries(state.catalog.texts)) {
    if (canonical(item.default) !== canonical(original.default)) continue;
    const replacement =
      alias === key || item.default === original.default
        ? value
        : canonical(value) + (item.default.match(/\s*[＋⌕]\s*$/)?.[0] || "");
    if (reset || replacement === item.default) delete state.theme.texts[alias];
    else state.theme.texts[alias] = replacement;
  }
}
export function copyVariables(text: string, max: number) {
  const tokens = [...new Set(text.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) || [])];
  return tokens.length
    ? t("保留变量：{tokens}", { tokens: tokens.join("  ") })
    : t("最多 {max} 字", { max });
}
function hsl(rgb: string) {
  const r = parseInt(rgb.slice(1, 3), 16) / 255,
    g = parseInt(rgb.slice(3, 5), 16) / 255,
    b = parseInt(rgb.slice(5, 7), 16) / 255,
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}
function rgb(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l),
    f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
        .toString(16)
        .padStart(2, "0");
    };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export function preset(name: string) {
  state.theme.colors = {};
  state.themeId = "";
  if (name !== "moon")
    for (const [key, item] of Object.entries(state.catalog.colors)) {
      const [h, s, l] = hsl(item.default);
      if (h >= 215 && h <= 325 && s > 0.08)
        state.theme.colors[key] = rgb(
          name === "forest" ? 155 : 335,
          s * 0.8,
          l,
        );
    }
  state.theme.name = (
    {
      moon: "月夜 · Yachiyo",
      forest: "森绿 · Yachiyo",
      rose: "暮色 · Yachiyo",
    } as Record<string, string>
  )[name];
}
function draft(): Draft {
  return clone({
    config: state.config,
    secrets: state.secrets,
    theme: state.theme,
    themeId: state.themeId,
    page: state.page,
    copySearch: state.copySearch,
    copyGroup: state.copyGroup,
    copyPage: state.copyPage,
    pending: state.pending,
    themeState: state.themeState,
  });
}
const systemColors = window.matchMedia("(prefers-color-scheme: dark)");
function appearance() {
  document.documentElement.dataset.appTheme =
    state.preferences.appTheme === "system"
      ? systemColors.matches
        ? "forest"
        : "daylight"
      : state.preferences.appTheme;
  document.documentElement.lang = state.preferences.language;
}
systemColors.addEventListener("change", appearance);
watch(() => state.preferences, appearance, { deep: true, immediate: true });
watch(
  () => [state.copySearch, state.copyGroup],
  () => (state.copyPage = 0),
  { flush: "sync" },
);
watch(copyPages, (count) => {
  state.copyPage = Math.min(state.copyPage, count - 1);
});
watch(
  () => state.theme,
  () => {
    if (!state.ready) return;
    state.themeState = "未保存的更改";
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void refreshPreview(), 500);
  },
  { deep: true, flush: "sync" },
);
watch(
  draft,
  () => {
    if (!state.ready) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(
      () => void call("setDraft", draft()).catch(() => {}),
      400,
    );
  },
  { deep: true },
);
export async function initialize() {
  try {
    await listen<Status>(
      "service-status",
      (event) => (state.status = event.payload),
    );
    const data = await call<Snapshot>("snapshot");
    state.preferences = data.preferences;
    state.catalog = data.catalog;
    state.theme = clone(data.theme);
    state.config = clone(data.config);
    state.saved = data.saved;
    state.status = data.status;
    state.version = data.version;
    if (data.draft) {
      const d = data.draft;
      Object.assign(state, {
        config: d.config,
        secrets: d.secrets,
        theme: d.theme,
        themeId: d.themeId,
        page: pages[d.page] ? d.page : "overview",
        copySearch: d.copySearch,
        copyGroup: d.copyGroup,
        copyPage: d.copyPage,
        pending: d.pending,
        themeState: d.themeState,
      });
    }
    await loadLibrary();
    await getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      clearTimeout(draftTimer);
      try {
        await call("setDraft", draft());
        await invoke("close_control_window");
      } catch (error) {
        toast((error as Error).message, true);
      }
    });
    state.ready = true;
    document.documentElement.dataset.ready = "true";
    if (state.page === "theme") void refreshPreview();
  } catch (error) {
    state.fatal = (error as Error).message;
    toast(state.fatal, true);
  }
}
