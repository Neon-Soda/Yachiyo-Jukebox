import { spawn } from 'node:child_process';
import { messages, UserFacingError } from './messages.mjs';
import { publicBilibiliInfo } from './bilibili.mjs';
import { mediaArtwork } from './media-artwork.mjs';

// Signed media URLs/headers stay in memory, never in logs or command arguments.
const mediaCache = new WeakMap();
const mediaCacheMaxAge = 5 * 60 * 1000;

export function parseLink(input) {
  let u;
  try { u = new URL(input); } catch { throw new UserFacingError('invalidLink'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new UserFacingError('insecureLink');
  const host = u.hostname.toLowerCase();
  const groups = {
    YOUTUBE: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
    BILIBILI: ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'b23.tv'],
    NETEASE: ['music.163.com', 'y.music.163.com'],
  };
  const platform = Object.keys(groups).find(k => groups[k].includes(host));
  if (!platform) throw new UserFacingError('unsupportedPlatform');
  if (platform === 'NETEASE' && u.hash.startsWith('#/')) {
    const canonical = new URL(u.hash.slice(1), 'https://music.163.com');
    u = canonical;
  }
  return { url: u.href, platform };
}

export function argsFor(track) {
  const args = ['--ignore-config', '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--retries', '2', '--js-runtimes', 'node', '-f', 'bestaudio/best'];
  const cookie = process.env[`${track.platform}_COOKIES`];
  if (cookie) args.push('--cookies', cookie);
  return args;
}

export async function inspect(track, { spawnProcess = spawn, retryDelayMs = 750, timeoutMs = 60000, fallback = publicBilibiliInfo } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await inspectOnce(track, spawnProcess, Math.max(1, deadline - Date.now()));
    } catch (error) {
      // Bilibili sometimes returns a successful API response with zero formats.
      // Retry empty formats within one budget; an unreadable initial-state
      // webpage goes straight to the public metadata fallback.
      if (!error.retryEmptyFormats && !error.fallbackPublicMetadata) throw error;
      if (attempt >= 3 || error.fallbackPublicMetadata) {
        if (Date.now() >= deadline) throw new UserFacingError('extractTimeout');
        const data = await fallback(track, { timeoutMs: Math.min(20000, deadline - Date.now()) });
        const result = { ...track, title: String(data.title || messages.unnamed).slice(0, 150), duration: data.duration, thumbnail: mediaArtwork(data.thumbnail) };
        mediaCache.set(result, { json: JSON.stringify(data), at: Date.now() });
        return result;
      }
      if (Date.now() + retryDelayMs >= deadline) throw new UserFacingError('extractTimeout');
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}

function inspectOnce(track, spawnProcess, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess('yt-dlp', [...argsFor(track), '--dump-single-json', '--skip-download', '--', track.url], { windowsHide: true });
    let out = '', stderr = ''; let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new UserFacingError('extractTimeout')); }, timeoutMs);
    child.stdout.on('data', b => {
      out += b;
      if (out.length > 8 * 1024 * 1024) { child.kill('SIGKILL'); finish(new UserFacingError('responseTooLarge')); }
    });
    child.stderr.on('data', b => { stderr = (stderr + b).slice(-64000); });
    child.on('error', () => finish(new UserFacingError('extractorMissing')));
    child.on('close', code => {
      if (settled) return;
      try {
        if (code !== 0) {
          const error = new UserFacingError('extractFailed');
          error.retryEmptyFormats = track.platform === 'BILIBILI' && /No video formats found/i.test(stderr);
          error.fallbackPublicMetadata = track.platform === 'BILIBILI' && /Unable to extract initial state/i.test(stderr);
          throw error;
        }
        let data;
        try { data = JSON.parse(out); } catch { throw new UserFacingError('invalidMetadata'); }
        if (data.is_live || data._type === 'playlist') throw new UserFacingError('unsupportedCollection');
        if (data.duration > 7200) throw new UserFacingError('tooLong');
        const result = { ...track, title: String(data.title || messages.unnamed).slice(0, 150), duration: Number.isFinite(data.duration) ? data.duration : null, thumbnail: mediaArtwork(data.thumbnail ?? data.thumbnails?.at(-1)?.url) };
        if (track.platform === 'BILIBILI') mediaCache.set(result, { json: out, at: Date.now() });
        finish(null, result);
      } catch (e) { finish(e); }
    });
  });
}

function preparedBilibili(track, input) {
  return { args: [...argsFor(track), '--no-progress', '-o', '-', '--load-info-json', '-'], input };
}

function backupVersions(info) {
  const versions = [];
  for (let index = 0; index < 2; index++) {
    const formats = (info.formats ?? []).flatMap(format => {
      const url = format._bilibili_backup_urls?.[index];
      if (!url || format.vcodec !== 'none') return [];
      return [{ ...format, url }];
    });
    if (formats.length) versions.push({ ...info, formats });
  }
  return versions;
}

export async function prepareDownloadAlternatives(track, prepared, { fallback = publicBilibiliInfo, timeoutMs = 20000 } = {}) {
  if (track.platform !== 'BILIBILI') return [];
  const info = JSON.parse(prepared.input);
  const versions = backupVersions(info);
  if (versions.length) return versions.map(data => preparedBilibili(track, JSON.stringify(data)));
  // yt-dlp metadata may omit CDN backups. Only after a failed download, ask
  // the public playback API for fresh authorized URLs (including its backups).
  const fresh = await fallback(track, { timeoutMs });
  return [fresh, ...backupVersions(fresh)].slice(0, 2).map(data => preparedBilibili(track, JSON.stringify(data)));
}

export async function prepareDownload(track, { inspectTrack = inspect, now = Date.now() } = {}) {
  if (track.platform !== 'BILIBILI') return { args: [...argsFor(track), '-o', '-', '--', track.url] };
  let cached = mediaCache.get(track);
  if (!cached || now - cached.at >= mediaCacheMaxAge) {
    const refreshed = await inspectTrack(track);
    cached = mediaCache.get(refreshed);
    if (!cached) throw new UserFacingError('invalidMetadata');
    mediaCache.set(track, cached);
  }
  // yt-dlp accepts an info JSON document on stdin. This skips a second,
  // independently fallible extraction and retains the required media headers.
  return preparedBilibili(track, cached.json);
}
