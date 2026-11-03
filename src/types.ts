export interface Config {
  version: number;
  guildId: string;
  clientId: string;
  activityEnabled: boolean;
  publicOrigin: string;
  port: number;
  bind: string;
  connectionMode: string;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  remotePort: number;
  cacheMb: number;
  idleMinutes: number;
  autoStart: boolean;
  launchAtLogin: boolean;
}
export interface Preferences {
  language: "zh-CN" | "en";
  appTheme: string;
}
export interface Theme {
  version: number;
  name: string;
  colors: Record<string, string>;
  texts: Record<string, string>;
  images: Record<string, string>;
}
export interface Catalog {
  colors: Record<string, { default: string; label: string; primary: boolean }>;
  texts: Record<
    string,
    { default: string; max: number; group: string; required?: boolean }
  >;
}
export interface Status {
  bot: string;
  local: string;
  public: string;
  tunnel: string;
  reason: string;
  publicReason?: string;
  rooms: number;
  ping: number | null;
  pid: number | null;
  tunnelPid: number | null;
  wanted: boolean;
  events: { at: number; message: string }[];
}
export interface CacheInfo {
  bytes: number;
  count: number;
  limitMb: number;
}
export interface ThemeEntry {
  id: string;
  theme: Theme;
}
export interface Settings {
  config: Config;
  saved: Record<string, boolean>;
}
export interface Draft {
  config: Config;
  secrets: Record<string, string>;
  theme: Theme;
  themeId: string;
  page: string;
  copySearch: string;
  copyGroup: string;
  copyPage: number;
  pending: boolean;
  themeState: string;
}
export interface Snapshot extends Settings {
  status: Status;
  preferences: Preferences;
  theme: Theme;
  catalog: Catalog;
  version: string;
  draft: Draft | null;
}
