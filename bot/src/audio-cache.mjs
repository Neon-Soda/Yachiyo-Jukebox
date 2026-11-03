import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, rename, utimes } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { prepareDownload, prepareDownloadAlternatives } from './media.mjs';
import { UserFacingError } from './messages.mjs';

export class AudioCache {
  constructor({ directory = 'data/audio-cache', maxBytes = 1024 ** 3, maxFileBytes = 128 * 1024 ** 2 } = {}) {
    this.directory = resolve(directory); this.maxBytes = maxBytes; this.maxFileBytes = maxFileBytes;
    this.pending = new Map(); this.pins = new Map(); this.active = 0; this.waiters = [];
  }
  key(track) { return createHash('sha256').update(track.url).digest('hex'); }
  pin(key) { this.pins.set(key, (this.pins.get(key) ?? 0) + 1); }
  release(key) { const n = (this.pins.get(key) ?? 1) - 1; n ? this.pins.set(key, n) : this.pins.delete(key); }
  async get(track, signal) {
    const key = this.key(track);
    if (signal?.aborted) throw new UserFacingError('cancelled');
    this.pin(key);
    try {
      let pending = this.pending.get(key);
      if (!pending) {
        pending = this.obtain(track, key).finally(() => this.pending.delete(key));
        this.pending.set(key, pending);
      }
      const file = await pending;
      if (signal?.aborted) throw new UserFacingError('cancelled');
      return { file, release: () => this.release(key) };
    } catch (error) { this.release(key); throw error; }
  }
  async prune(reserve = 0) {
    await mkdir(this.directory, { recursive: true });
    const files = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9]{64}\.mp3$/.test(name)) continue;
      try { const info = await stat(join(this.directory, name)); files.push({ name, bytes: info.size, at: info.mtimeMs }); } catch {}
    }
    let size = files.reduce((n, file) => n + file.bytes, 0);
    for (const file of files.sort((a, b) => a.at - b.at)) {
      if (size + reserve <= this.maxBytes) break;
      if (this.pins.has(file.name.slice(0, 64))) continue;
      try { await unlink(join(this.directory, file.name)); size -= file.bytes; } catch {}
    }
    if (size + reserve > this.maxBytes) throw new UserFacingError('cacheFull');
  }
  async obtain(track, key) {
    await mkdir(this.directory, { recursive: true });
    const file = join(this.directory, `${key}.mp3`);
    try {
      if ((await stat(file)).size > 0) { await utimes(file, new Date(), new Date()); return file; }
    } catch {}
    // Only one cache writer reserves disk space at a time; other rooms can
    // continue playing their already cached files while it prepares a song.
    if (this.active) await new Promise(resolve => this.waiters.push(resolve));
    this.active++;
    const temporary = join(this.directory, `${key}-${randomUUID()}.part`);
    try {
      await this.prune(this.maxFileBytes);
      const prepared = await prepareDownload(track);
      await this.downloadWithFallback(track, prepared, temporary);
      const info = await stat(temporary);
      if (!info.size || info.size >= this.maxFileBytes) throw new UserFacingError('cacheDownloadFailed');
      const duration = await probeDuration(temporary);
      if (!(duration > 0) || (track.duration && duration < track.duration - Math.max(5, track.duration * 0.1))) throw new UserFacingError('cacheDownloadFailed');
      await rename(temporary, file);
      return file;
    } finally {
      await unlink(temporary).catch(() => {});
      this.active--; this.waiters.shift()?.();
    }
  }
  async downloadWithFallback(track, prepared, path) {
    const deadline = Date.now() + 180000;
    let candidates = [prepared], lastError;
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      if (Date.now() >= deadline) {
        const error = new UserFacingError('cacheDownloadFailed'); error.diagnosticStage = 'cache-timeout'; throw error;
      }
      if (attempt) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      try { await this.download(candidates[attempt], path, deadline - Date.now()); return; }
      catch (error) {
        if (track.platform !== 'BILIBILI' || error.diagnosticStage !== 'cache-download') throw error;
        lastError = error;
        if (attempt === 0) {
          const remaining = deadline - Date.now();
          if (remaining > 0) {
            // Never retry transcoding/tool/disk errors, and never expose an
            // upstream response. Both download attempts and metadata share one budget.
            try { candidates.push(...await prepareDownloadAlternatives(track, prepared, { timeoutMs: Math.min(20000, remaining) })); }
            catch { /* Preserve the original fixed download error. */ }
          }
        }
      }
    }
    throw lastError;
  }
  download(prepared, path, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      const download = spawn('yt-dlp', ['--max-filesize', '150M', ...prepared.args], { windowsHide: true });
      const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-t', '7200', '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '128k', '-fs', String(this.maxFileBytes), '-f', 'mp3', '-y', path], { windowsHide: true });
      let closed = 0, failureStage;
      const kill = stage => { failureStage ??= stage; download.kill(); ffmpeg.kill(); };
      const timer = setTimeout(() => kill('cache-timeout'), timeoutMs);
      const done = (code, stage) => {
        if (code !== 0) kill(stage);
        if (++closed !== 2) return;
        clearTimeout(timer);
        if (failureStage) {
          const error = new UserFacingError('cacheDownloadFailed');
          error.diagnosticStage = failureStage;
          reject(error);
        } else resolve();
      };
      for (const [p, stage] of [[download, 'cache-download'], [ffmpeg, 'cache-transcode']]) {
        p.stderr.resume(); p.on('error', () => kill('audio-tool')); p.on('close', code => done(code, stage));
      }
      download.stdout.on('error', () => kill('cache-download')); download.stdin.on('error', () => kill('cache-download'));
      ffmpeg.stdin.on('error', () => kill('cache-transcode')); ffmpeg.stdout.resume();
      download.stdout.pipe(ffmpeg.stdin); download.stdin.end(prepared.input);
    });
  }
}

function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { windowsHide: true });
    let out = '';
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', b => { out = (out + b).slice(-64000); }); child.stderr.resume();
    child.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      try { if (code !== 0) throw new Error(); resolve(Number(JSON.parse(out).format?.duration)); }
      catch { reject(new UserFacingError('cacheDownloadFailed')); }
    });
  });
}
