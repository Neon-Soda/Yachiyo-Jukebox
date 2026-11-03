<script setup lang="ts">
import {
  state,
  t,
  run,
  call,
  pickTool,
  checkTools,
  removeTool,
  go,
} from "../state";
const names: Record<string, string> = {
  ffmpeg: "FFmpeg",
  ffprobe: "FFprobe",
  "yt-dlp": "yt-dlp",
};
const descriptions: Record<string, string> = {
  ffmpeg: "音频解码、MP3 缓存和进度定位",
  ffprobe: "读取歌曲时长，与 FFmpeg 配套使用",
  "yt-dlp": "解析和下载 Bilibili、YouTube 等平台的音频",
};
const states = {
  ready: "已通过检查",
  missing: "尚未选择",
  changed: "文件已移动或更新，请重新检查",
};
</script>
<template>
  <section class="page" id="page-tools">
    <article class="card">
      <div class="section-heading">
        <div>
          <h3>{{ t("补全播放工具") }}</h3>
          <p>
            {{ t("从提供者网站下载工具，在这里选择并检查。只需配置一次。") }}
          </p>
        </div>
        <span
          id="tools-ready"
          class="status-pill"
          :class="state.tools.ready ? 'online' : 'warning'"
          >{{ t(state.tools.ready ? "工具已就绪" : "待完成配置") }}</span
        >
      </div>
      <ol class="tool-steps">
        <li>
          <strong>{{ t("下载并解压 FFmpeg") }}</strong>
          <p>
            {{
              t(
                "选择 Windows x64 正式版的 release essentials ZIP，解压后选择 bin 文件夹内的 ffmpeg.exe。",
              )
            }}
          </p>
          <button
            id="download-ffmpeg"
            class="secondary"
            @click="run(() => call('openToolDownload', 'ffmpeg'))"
            :disabled="state.busy"
          >
            {{ t("打开 FFmpeg 下载页") }} ↗
          </button>
        </li>
        <li>
          <strong>{{ t("下载 yt-dlp") }}</strong>
          <p>
            {{
              t(
                "在发布页下载 yt-dlp.exe，保存到一个固定文件夹，再在下方选择它。",
              )
            }}
          </p>
          <button
            id="download-yt-dlp"
            class="secondary"
            @click="run(() => call('openToolDownload', 'yt-dlp'))"
            :disabled="state.busy"
          >
            {{ t("打开 yt-dlp 下载页") }} ↗
          </button>
        </li>
      </ol>
      <p class="hint">
        {{
          t(
            "FFprobe 会随 FFmpeg 一起下载，选择任意一个时会自动检查同目录的另一个。请保留完整的解压文件夹。",
          )
        }}
      </p>
    </article>
    <article
      v-for="tool in state.tools.items"
      :key="tool.id"
      class="card tool-card"
      :id="'tool-' + tool.id"
    >
      <div class="section-heading">
        <div>
          <h3>
            {{ names[tool.id] }}
            <span class="tool-version">{{ tool.version || "—" }}</span>
          </h3>
          <p>{{ t(descriptions[tool.id]) }}</p>
        </div>
        <span
          class="small-label"
          :class="{ 'tool-warning': tool.state !== 'ready' }"
          >{{ t(states[tool.state]) }}</span
        >
      </div>
      <div class="tool-file" :id="'tool-path-' + tool.id">
        {{ tool.path || t("选择已下载并解压的 EXE 文件") }}
      </div>
      <div class="save-row">
        <span>{{
          tool.id === "yt-dlp"
            ? t("2025 年及更新的正式版本，须支持 JavaScript 运行参数")
            : t("FFmpeg 6.0 或更新的正式版本；FFprobe 版本须一致")
        }}</span>
        <div class="actions">
          <button
            v-if="tool.path"
            :id="'remove-tool-' + tool.id"
            class="subtle"
            @click="removeTool(tool.id)"
            :disabled="state.busy"
          >
            {{ t("取消关联") }}</button
          ><button
            :id="'pick-tool-' + tool.id"
            class="secondary"
            @click="pickTool(tool.id)"
            :disabled="state.busy || !state.ready"
          >
            {{ t(tool.path ? "更换文件" : "选择文件") }}
          </button>
        </div>
      </div>
      <details v-if="tool.sha256" class="tool-details">
        <summary>{{ t("查看检查记录") }}</summary>
        <p>
          {{ t("检查时间") }} ·
          {{
            tool.checkedAt
              ? new Date(tool.checkedAt).toLocaleString(
                  state.preferences.language,
                )
              : "—"
          }}
        </p>
        <code>SHA-256 · {{ tool.sha256 }}</code>
        <p>{{ t("文件摘要用于识别文件变化，不代表对发布者身份的认证。") }}</p>
      </details>
    </article>
    <article class="card">
      <div class="section-heading">
        <div>
          <h3>{{ t("检查与使用") }}</h3>
          <p>
            {{
              t(
                "检查会运行所选文件，并用本地短音频验证解码、转码、定位和时长读取。",
              )
            }}
          </p>
        </div>
      </div>
      <p class="hint">
        {{
          t(
            "请选择可信来源的文件。工具留在你选择的位置，移动或更新文件后请重新检查。运行中的 Bot 在重启后使用新配置。",
          )
        }}
      </p>
      <div class="save-row">
        <span role="status" aria-live="polite">{{
          t(
            state.toolChecking
              ? "正在检查文件与播放能力…"
              : state.tools.ready
                ? "工具已就绪，可以继续配置账户或启动 Bot。"
                : "也可以稍后配置；账户、主题等设置仍可使用。",
          )
        }}</span>
        <div class="actions">
          <button
            id="check-tools"
            class="primary"
            @click="checkTools"
            :disabled="
              state.busy ||
              !state.ready ||
              state.tools.items.some((item) => !item.path)
            "
          >
            {{ t("重新检查工具") }}</button
          ><button
            v-if="state.tools.ready"
            class="secondary"
            @click="go('overview')"
          >
            {{ t("返回运行概览") }}
          </button>
        </div>
      </div>
    </article>
  </section>
</template>
