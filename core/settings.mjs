export const defaults = () => ({ version: 1, guildId: '', clientId: '', activityEnabled: true, publicOrigin: '', port: 3178, bind: '127.0.0.1', connectionMode: 'direct', sshHost: '', sshUser: '', sshPort: 22, remotePort: 43178, cacheMb: 1024, idleMinutes: 5, autoStart: true, launchAtLogin: false });
export const secretKeys = ['botToken', 'clientSecret', 'youtubeCookies', 'bilibiliCookies', 'neteaseCookies', 'sshKey', 'knownHosts'];
const integer = (value, min, max, label) => { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}须为 ${min}～${max} 的整数。`); return value; };
export function normalizeSettings(input) {
  if (!input || typeof input !== 'object') throw new Error('配置格式无效。');
  const out = defaults();
  for (const key of ['guildId', 'clientId']) {
    if (typeof input[key] !== 'string' || (input[key] && !/^\d{17,20}$/.test(input[key]))) throw new Error('Discord ID 应为 17～20 位数字。');
    out[key] = input[key];
  }
  for (const key of ['activityEnabled', 'autoStart', 'launchAtLogin']) { if (typeof input[key] !== 'boolean') throw new Error('开关设置无效。'); out[key] = input[key]; }
  if (!['direct', 'ssh', 'external'].includes(input.connectionMode)) throw new Error('连接方式无效。');
  out.connectionMode = input.connectionMode;
  if (!['127.0.0.1', '0.0.0.0'].includes(input.bind)) throw new Error('监听地址无效。');
  out.bind = input.bind;
  out.port = integer(input.port, 1024, 65535, '本地端口'); out.remotePort = integer(input.remotePort, 1024, 65535, '远端端口');
  out.sshPort = integer(input.sshPort, 1, 65535, 'SSH 端口');
  out.cacheMb = integer(input.cacheMb, 256, 10240, '缓存容量'); out.idleMinutes = integer(input.idleMinutes, 0, 1440, '指令闲置分钟数');
  for (const key of ['sshHost', 'sshUser']) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > 253 || (value && !(key === 'sshUser' ? /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/ : /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/).test(value))) throw new Error('SSH 主机或用户名格式无效。');
    out[key] = value;
  }
  if (input.publicOrigin) {
    try { const url = new URL(input.publicOrigin); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw 0; out.publicOrigin = url.origin; }
    catch { throw new Error('公网地址须为 HTTPS 根地址，例如 https://music.example.com。'); }
  }
  return out;
}
export function readyToStart(config, secrets) {
  if (!config.guildId || !secrets.botToken) throw new Error('请先填写服务器 ID 和 Bot Token。');
  if (config.activityEnabled && (!config.clientId || !secrets.clientSecret)) throw new Error('使用点歌台还需要 Application ID 和 Client Secret。');
  if (config.activityEnabled && config.connectionMode === 'ssh' && (!config.sshHost || !config.sshUser || !secrets.sshKey || !secrets.knownHosts)) throw new Error('请补齐 SSH 主机、用户名、私钥和已验证的 known_hosts 文件。');
}
export function publicSettings(config, secrets) { return { config, saved: Object.fromEntries(secretKeys.map(key => [key, Boolean(secrets[key])])) }; }
export function childEnvironment(config, secrets, runtime, data, pathModule) {
  const { join, delimiter } = pathModule;
  // Explicit environment: never inherit an unrelated parent application's credentials.
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATHEXT', 'SystemDrive', 'NUMBER_OF_PROCESSORS', 'ProgramData', 'ALLUSERSPROFILE', 'USERNAME', 'USERDOMAIN', 'HOMEDRIVE', 'HOMEPATH', 'COMPUTERNAME', 'OS', 'PROCESSOR_ARCHITECTURE']) if (process.env[name]) env[name] = process.env[name];
  env.PATH = [join(runtime, 'tools'), join(process.env.SystemRoot || 'C:\\Windows', 'System32'), join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH')].join(delimiter);
  Object.assign(env, { DISCORD_TOKEN: secrets.botToken, GUILD_ID: config.guildId, DISCORD_CLIENT_ID: config.clientId, DISCORD_CLIENT_SECRET: secrets.clientSecret || '', ACTIVITY_ENABLED: config.activityEnabled ? '1' : '0', ACTIVITY_PORT: String(config.port), ACTIVITY_HOST: config.bind, ACTIVITY_PUBLIC_ORIGIN: config.publicOrigin, AUDIO_CACHE_MB: String(config.cacheMb), IDLE_TIMEOUT_MINUTES: String(config.idleMinutes), YACHIYO_CUSTOMIZATION_PATH: join(data, 'customization.json') });
  for (const platform of ['youtube', 'bilibili', 'netease']) if (secrets[`${platform}Cookies`]) env[`${platform.toUpperCase()}_COOKIES`] = join(data, 'private-runtime', `${platform}.txt`);
  return env;
}
