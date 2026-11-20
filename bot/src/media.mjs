import { mediaTool, ffmpegLocationArgs, downloadTimeoutMs, stopExtractor } from './media-tools.mjs';
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

function preferredFormat(track) {
  if (track.platform !== 'NETEASE') return 'bestaudio/best';
  switch (process.env.NETEASE_QUALITY) {
    case 'best': return 'bestaudio/best';
    case 'exhigh': return 'exhigh/higher/standard';
    case 'higher': return 'higher/standard';
    default: return 'standard';
  }
}

export function argsFor(track, format = preferredFormat(track)) {
  const args = [...ffmpegLocationArgs(), '--ignore-config', '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--retries', '2', '--js-runtimes', 'node', '-f', format];
  // Some Bilibili DASH servers serve audio in byte ranges and reject full-file requests.
  if (track.platform === 'BILIBILI') args.push('--http-chunk-size', '4M');
  const cookie = process.env[`${track.platform}_COOKIES`];
  if (cookie) args.push('--cookies', cookie);
  return args;
}

export async function inspect(track, { spawnProcess = spawn, retryDelayMs = 750, timeoutMs = downloadTimeoutMs(), fallback = publicBilibiliInfo, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 1; ; attempt++) {
    try {
      signal?.throwIfAborted();
      return await inspectOnce(track, spawnProcess, Math.max(1, deadline - Date.now()), signal);
    } catch (error) {
      signal?.throwIfAborted();
      // Bilibili sometimes returns a successful API response with zero formats.
      // Retry empty formats within one budget; an unreadable initial-state
      // webpage goes straight to the public metadata fallback.
      if (!error.retryEmptyFormats && !error.fallbackPublicMetadata) throw error;
      if (attempt >= 3 || error.fallbackPublicMetadata) {
        if (Date.now() >= deadline) throw new UserFacingError('extractTimeout');
        const data = await fallback(track, { timeoutMs: Math.min(20000, deadline - Date.now()), signal });
        const result = { ...track, title: String(data.title || messages.unnamed).slice(0, 150), duration: data.duration, thumbnail: mediaArtwork(data.thumbnail) };
        mediaCache.set(result, { json: JSON.stringify(data), at: Date.now() });
        return result;
      }
      if (Date.now() + retryDelayMs >= deadline) throw new UserFacingError('extractTimeout');
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}

function inspectOnce(track, spawnProcess, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(mediaTool('yt-dlp'), [...argsFor(track), '--dump-single-json', '--skip-download', '--', track.url], { windowsHide: true });
    let out = '', stderr = ''; let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      err ? reject(err) : resolve(value);
    };
    const interrupt = error => {
      if (settled) return;
      stopExtractor(child);
      child.stdout.destroy(); child.stderr.destroy();
      finish(error);
    };
    const cancel = () => interrupt(new UserFacingError('cancelled'));
    const timer = setTimeout(() => interrupt(new UserFacingError('extractTimeout')), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', b => {
      out += b;
      if (out.length > 8 * 1024 * 1024) interrupt(new UserFacingError('responseTooLarge'));
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
        if (track.platform === 'YOUTUBE') {
          // Keep only what is needed to choose a lower audio bitrate. YouTube
          // still resolves its own streaming URLs and headers when downloading.
          const { format_id, abr, tbr, duration } = data;
          const formats = (data.formats ?? []).filter(f => f.vcodec === 'none').map(
            ({ format_id, abr, tbr, filesize, filesize_approx, vcodec, has_drm }) =>
              ({ format_id, abr, tbr, filesize, filesize_approx, vcodec, has_drm }));
          out = JSON.stringify({ format_id, abr, tbr, duration, formats });
        }
        mediaCache.set(result, { json: out, at: Date.now() });
        finish(null, result);
      } catch (e) { finish(e); }
    });
  });
}

function preparedMetadata(track, input, format) {
  return { args: [...argsFor(track, format), '--no-progress', '-o', '-', '--load-info-json', '-'], input };
}

// Use the actual formats returned for this song and account. Choose the smallest
// lower bitrate once, so a list of similar formats cannot multiply the timeout.
export function lowerAudioDownload(track, prepared) {
  const info = prepared.formatInfo ?? (prepared.input && JSON.parse(prepared.input));
  if (!info) return null;
  const audio = (info.formats ?? []).filter(f => !f.has_drm && f.vcodec === 'none' && /^[\w.-]+$/.test(f.format_id ?? ''));
  const rate = f => Number(f.abr || f.tbr || ((f.filesize || f.filesize_approx) * 8 / (info.duration || track.duration) / 1000));
  const ranked = audio.filter(f => rate(f) > 0).sort((a, b) => rate(a) - rate(b));
  const current = info.format_id ? (audio.find(f => f.format_id === info.format_id) ?? info) : ranked.at(-1);
  const lowest = ranked[0];
  if (!lowest || !current || lowest.format_id === current.format_id || !(rate(lowest) < rate(current))) return null;
  if (!prepared.input) return { args: [...argsFor(track, lowest.format_id), '-o', '-', '--', track.url] };
  return preparedMetadata(track, prepared.input, lowest.format_id);
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

export async function prepareDownloadAlternatives(track, prepared, { fallback = publicBilibiliInfo, timeoutMs = 20000, signal } = {}) {
  if (track.platform !== 'BILIBILI') return [];
  const info = JSON.parse(prepared.input);
  const versions = backupVersions(info);
  if (versions.length) return versions.map(data => preparedMetadata(track, JSON.stringify(data)));
  // yt-dlp metadata may omit CDN backups. Only after a failed download, ask
  // the public playback API for fresh authorized URLs (including its backups).
  const fresh = await fallback(track, { timeoutMs, signal });
  return [fresh, ...backupVersions(fresh)].slice(0, 2).map(data => preparedMetadata(track, JSON.stringify(data)));
}

export async function prepareDownload(track, { inspectTrack = inspect, now = Date.now(), signal, timeoutMs = downloadTimeoutMs() } = {}) {
  if (!['NETEASE', 'BILIBILI', 'YOUTUBE'].includes(track.platform)) return { args: [...argsFor(track), '-o', '-', '--', track.url] };
  let cached = mediaCache.get(track);
  if (!cached || now - cached.at >= mediaCacheMaxAge) {
    const refreshed = await inspectTrack(track, { signal, timeoutMs });
    cached = mediaCache.get(refreshed);
    if (!cached) throw new UserFacingError('invalidMetadata');
    mediaCache.set(track, cached);
  }
  // yt-dlp accepts an info JSON document on stdin. This skips a second,
  // independently fallible extraction and retains the required media headers.
  if (track.platform === 'YOUTUBE') {
    return { args: [...argsFor(track), '-o', '-', '--', track.url], formatInfo: JSON.parse(cached.json) };
  }
  return preparedMetadata(track, cached.json);
}
