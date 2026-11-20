import { mediaTool, stopExtractor, downloadTimeoutMs } from './media-tools.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, rename, utimes, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { prepareDownload, prepareDownloadAlternatives, lowerAudioDownload } from './media.mjs';
import { UserFacingError } from './messages.mjs';

// Both stages are measured from selection. A foreground claim re-arms the
// existing download with the foreground clock without discarding its bytes.
export class PlaybackWait extends EventTarget {
  constructor(ms, foreground = false) { super(); this.select(ms, foreground); }
  select(ms, foreground) {
    this.ms = ms; this.foreground = foreground; this.first = Date.now() + ms;
    this.claimedLower = Boolean(this.lowerStarted);
    this.dispatchEvent(new Event('change'));
  }
  allowLower(available) {
    this.hasLower = available; this.dispatchEvent(new Event('change'));
  }
  get end() { return this.first + (this.hasLower && !this.claimedLower ? this.ms : 0); }
  watch(limit, expire) {
    let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(expire, Math.max(0, limit() - Date.now())); };
    this.addEventListener('change', arm); arm();
    return () => { clearTimeout(timer); this.removeEventListener('change', arm); };
  }
}

// A preload holds one cache lease until playback claims it or the queue changes.
export class NextTrackPreload {
  constructor(cache, notify = () => {}) { this.cache = cache; this.notify = notify; }
  set(track) {
    if (this.track?.url === track?.url) return;
    this.controller?.abort();
    this.lease?.release();
    this.track = track; this.lease = null; this.controller = null; this.failure = null;
    if (!track) return;
    const controller = new AbortController();
    this.controller = controller;
    const wait = new PlaybackWait(this.cache.preloadTimeoutMs ?? 60000);
    this.cache.get(track, controller.signal, wait).then(lease => {
      if (controller.signal.aborted) lease.release();
      else { this.lease = lease; this.notify(track, true); }
    }).catch(error => {
      if (this.controller === controller) { this.failure = error; this.notify(track, false); }
    });
  }
  claim(track, signal, deadline) {
    let result = null;
    if (this.track?.url === track.url && this.controller && !signal?.aborted) {
      // Transfer a ready pin, or join the download before releasing its initial consumer.
      // A timeout entirely before selection does not consume the new foreground wait.
      if (this.failure?.diagnosticStage === 'cache-timeout') result = null;
      else if (this.failure) result = Promise.reject(this.failure);
      else result = this.lease ?? this.cache.get(track, signal, deadline);
      this.lease = null;
    }
    this.set(null);
    return result;
  }
}

const configuredMb = Number(process.env.AUDIO_CACHE_MB ?? 1024);
const configuredBytes = (Number.isFinite(configuredMb) && configuredMb >= 256 && configuredMb <= 10240 ? configuredMb : 1024) * 1024 ** 2;

export class AudioCache {
  constructor({ directory = 'data/audio-cache', maxBytes = configuredBytes, maxFileBytes = 128 * 1024 ** 2, timeoutMs = downloadTimeoutMs(), preloadTimeoutMs = 60000 } = {}) {
    this.directory = resolve(directory); this.maxBytes = maxBytes; this.maxFileBytes = maxFileBytes;
    this.timeoutMs = timeoutMs; this.preloadTimeoutMs = preloadTimeoutMs;
    this.transfers = new Map();
    this.maxSourceBytes = 150 * 1024 ** 2;
    this.pending = new Map(); this.pins = new Map(); this.active = 0; this.waiters = [];
  }
  key(track) { return createHash('sha256').update(track.url).digest('hex'); }
  pin(key) { this.pins.set(key, (this.pins.get(key) ?? 0) + 1); }
  release(key) { const n = (this.pins.get(key) ?? 1) - 1; n ? this.pins.set(key, n) : this.pins.delete(key); }
  select(track) {
    const job = this.pending.get(this.key(track));
    if (!job || job.controller.signal.aborted) return new PlaybackWait(this.timeoutMs, true);
    if (!job.wait.foreground) {
      job.wait.select(this.timeoutMs, true);
      if (this.waiters.some(ready => ready.wait === job.wait) && this.writer && !this.writer.wait.foreground)
        this.writer.yieldWriter.abort();
    }
    return job.wait;
  }
  holdPartial(track) {
    const transfer = this.transfers.get(this.key(track));
    if (!transfer) return () => {};
    transfer.refs++;
    return () => this.releaseTransfer(transfer);
  }
  async releaseTransfer(transfer) {
    if (--transfer.refs > 0) return;
    if (this.transfers.get(transfer.key) === transfer) this.transfers.delete(transfer.key);
    if (transfer.created) await rm(transfer.dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(() => {});
  }
  async get(track, signal, wait = new PlaybackWait(this.timeoutMs, true)) {
    const key = this.key(track);
    if (signal?.aborted) throw new UserFacingError('cancelled');
    let job = this.pending.get(key);
    if (!job || job.controller.signal.aborted) {
      const controller = new AbortController();
      let transfer = this.transfers.get(key);
      if (!transfer) {
        transfer = { key, refs: 0, dir: join(this.directory, '.work-' + process.pid + '-' + randomUUID()) };
        this.transfers.set(key, transfer);
      }
      transfer.refs++;
      job = { controller, wait, consumers: 0 };
      job.ready = this.obtain(track, key, controller.signal, wait, transfer).finally(async () => {
        if (this.pending.get(key) === job) this.pending.delete(key);
        await this.releaseTransfer(transfer);
      });
      this.pending.set(key, job);
    }
    this.pin(key);
    job.consumers++;
    let cancel;
    try {
      const file = signal ? await new Promise((resolve, reject) => {
        cancel = () => {
          if (--job.consumers === 0) job.controller.abort();
          reject(new UserFacingError('cancelled'));
        };
        signal.addEventListener('abort', cancel, { once: true });
        job.ready.then(resolve, reject);
      }) : await job.ready;
      if (signal?.aborted) throw new UserFacingError('cancelled');
      return { file, release: () => this.release(key) };
    } catch (error) { this.release(key); throw error; }
    finally { if (cancel) signal.removeEventListener('abort', cancel); }
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
  async obtain(track, key, consumer, wait, transfer) {
    const timeout = new AbortController();
    const clear = wait.watch(() => wait.end, () => timeout.abort(downloadTimeoutError()));
    const signal = AbortSignal.any([consumer, timeout.signal]);
    try {
      while (true) {
        signal.throwIfAborted();
        const yieldWriter = new AbortController();
        try {
          return await this.obtainBeforeDeadline(track, key, AbortSignal.any([signal, yieldWriter.signal]), wait, transfer, yieldWriter);
        } catch (error) {
          if (!yieldWriter.signal.aborted || signal.aborted) throw error;
        }
      }
    } catch (error) {
      if (timeout.signal.aborted && !consumer.aborted) throw downloadTimeoutError();
      throw error;
    } finally { clear(); }
  }
  async obtainBeforeDeadline(track, key, signal, wait, transfer, yieldWriter) {
    await mkdir(this.directory, { recursive: true });
    const file = join(this.directory, `${key}.mp3`);
    try {
      if ((await stat(file)).size > 0) { await utimes(file, new Date(), new Date()); return file; }
    } catch {}
    // Only one cache writer reserves disk space at a time; other rooms can
    // continue playing their already cached files while it prepares a song.
    signal.throwIfAborted();
    if (this.active) await new Promise((resolve, reject) => {
      const ready = () => { signal.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => {
        this.waiters.splice(this.waiters.indexOf(ready), 1);
        reject(new UserFacingError('cancelled'));
      };
      ready.wait = wait;
      this.waiters.push(ready);
      signal.addEventListener('abort', cancel, { once: true });
      if (wait.foreground && this.writer && !this.writer.wait.foreground) this.writer.yieldWriter.abort();
    });
    this.active = 1;
    this.writer = { wait, yieldWriter };
    const temporary = join(this.directory, `${key}-${randomUUID()}.part`);
    try {
      signal.throwIfAborted();
      await this.reserveTransfer(transfer);
      signal.throwIfAborted();
      let prepared;
      try {
        prepared = await prepareDownload(track, { signal, timeoutMs: Math.max(1, wait.first - Date.now()) });
      } catch (error) {
        signal.throwIfAborted();
        if (error.key === 'extractTimeout') throw downloadTimeoutError();
        throw error;
      }
      await this.downloadWithFallback(track, prepared, temporary, signal, wait, transfer);
      const info = await stat(temporary);
      if (!info.size || info.size >= this.maxFileBytes) throw new UserFacingError('cacheDownloadFailed');
      signal.throwIfAborted();
      const duration = await probeDuration(temporary, signal);
      signal.throwIfAborted();
      if (!(duration > 0) || (track.duration && duration < track.duration - Math.max(5, track.duration * 0.1))) throw new UserFacingError('cacheDownloadFailed');
      await rename(temporary, file);
      return file;
    } finally {
      await unlink(temporary).catch(() => {});
      this.writer = null;
      const first = this.waiters.findIndex(ready => ready.wait.foreground);
      const ready = this.waiters.splice(Math.max(0, first), 1)[0];
      if (ready) ready(); else this.active = 0;
    }
  }
  async removeAbandonedTransfers() {
    for (const item of await readdir(this.directory, { withFileTypes: true })) {
      const match = /^\.work-(\d+)-[a-f0-9-]{36}$/.exec(item.name);
      if (!match || !item.isDirectory() || item.isSymbolicLink()) continue;
      try { process.kill(Number(match[1]), 0); }
      catch (error) {
        if (error.code === 'ESRCH') await rm(join(this.directory, item.name), { recursive: true, force: true }).catch(() => {});
      }
    }
  }
  async reserveTransfer(current) {
    this.sweep ??= this.removeAbandonedTransfers();
    await this.sweep;
    // Keep parked partials within the configured cache budget. Under pressure,
    // release older parked bytes first. The song can still be prepared later.
    // One active source file is temporary. Parked bytes and encoded audio count toward the cache limit.
    const reserve = this.maxFileBytes;
    let used = 0;
    const parked = [];
    for (const item of this.transfers.values()) {
      if (!item.created || item === current) continue;
      let bytes = 0;
      for (const name of await readdir(item.dir).catch(() => [])) {
        bytes += (await stat(join(item.dir, name)).catch(() => null))?.size ?? 0;
      }
      used += bytes; parked.push({ item, bytes });
    }
    for (const { item, bytes } of parked) {
      if (used + reserve <= this.maxBytes) break;
      await rm(item.dir, { recursive: true, force: true });
      used -= bytes; item.created = false; item.format = null; item.lower = false;
    }
    await this.prune(used + reserve);
  }
  async downloadWithFallback(track, prepared, path, signal, wait = new PlaybackWait(this.timeoutMs), transfer) {
    const lower = lowerAudioDownload(track, prepared);
    if (lower && transfer?.lower) {
      if (!wait.lowerStarted) { wait.claimedLower = true; wait.allowLower(false); }
      wait.lowerStarted = true;
      return this.download(lower, path, wait.end - Date.now(), signal, wait, transfer, true);
    }
    wait.allowLower(Boolean(lower));
    try {
      await this.downloadPrimary(track, prepared, path, signal, wait, transfer);
      wait.allowLower(false);
    } catch (error) {
      signal?.throwIfAborted();
      if (error.diagnosticStage !== 'cache-timeout' || !lower || Date.now() >= wait.end) throw error;
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      wait.lowerStarted = true;
      await this.download(lower, path, wait.end - Date.now(), signal, wait, transfer, true);
    }
  }
  async downloadPrimary(track, prepared, path, signal, wait, transfer) {
    let candidates = [prepared], lastError;
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      signal?.throwIfAborted();
      if (Date.now() >= wait.first) throw downloadTimeoutError();
      if (attempt) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      try { await this.download(candidates[attempt], path, wait.first - Date.now(), signal, wait, transfer); return; }
      catch (error) {
        signal?.throwIfAborted();
        if (track.platform !== 'BILIBILI' || error.diagnosticStage !== 'cache-download') throw error;
        lastError = error;
        if (attempt === 0) {
          const remaining = wait.first - Date.now();
          if (remaining > 0) {
            // Never retry transcoding/tool/disk errors, and never expose an
            // upstream response. Both download attempts and metadata share one budget.
            try { candidates.push(...await prepareDownloadAlternatives(track, prepared, { timeoutMs: Math.min(20000, remaining), signal })); }
            catch { /* Preserve the original fixed download error. */ }
          }
        }
      }
    }
    if (Date.now() >= wait.first) throw downloadTimeoutError();
    throw lastError;
  }
  async download(prepared, path, timeoutMs, signal, wait, transfer, lower = false) {
    signal?.throwIfAborted();
    if (timeoutMs <= 0) throw downloadTimeoutError();
    const attempt = new AbortController();
    const stopTimer = wait.watch(() => lower ? wait.end : wait.first, () => attempt.abort(downloadTimeoutError()));
    const combined = signal ? AbortSignal.any([signal, attempt.signal]) : attempt.signal;
    try {
      const args = [...prepared.args];
      const selector = args[args.indexOf('-f') + 1];
      const data = prepared.input && JSON.parse(prepared.input);
      const format = selector + '/' + (data?.format_id ?? '') + '/' + (data?.id ?? '');
      if (transfer.created && transfer.format !== format) {
        await rm(transfer.dir, { recursive: true, force: true });
        transfer.created = false;
      }
      await mkdir(transfer.dir, { recursive: true });
      transfer.created = true; transfer.format = format; transfer.lower = lower;
      const source = join(transfer.dir, 'source');
      args[args.indexOf('-o') + 1] = source;
      // yt-dlp resumes its own .part file, including HTTP Range handling.
      // Metadata, cookies and signed URLs are never written to this directory.
      await runMediaTool('yt-dlp', ['--continue', '--max-filesize', String(this.maxSourceBytes), ...args], prepared.input, combined, 'cache-download');
      const size = (await stat(source).catch(() => null))?.size;
      if (!size || size > this.maxSourceBytes) throw new UserFacingError('cacheDownloadFailed');
      await runMediaTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', source, '-vn', '-t', '7200', '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '128k', '-fs', String(this.maxFileBytes), '-f', 'mp3', '-y', path], null, combined, 'cache-transcode');
    } catch (error) {
      if (attempt.signal.aborted) throw downloadTimeoutError();
      throw error;
    } finally { stopTimer(); }
  }
}

function runMediaTool(name, args, input, signal, stage) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(mediaTool(name), args, { windowsHide: true });
    let watchdog, done = false;
    const finish = error => {
      if (done) return;
      done = true; clearTimeout(watchdog); signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve();
    };
    const cancel = () => {
      if (name === 'yt-dlp') stopExtractor(child); else child.kill('SIGKILL');
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      watchdog = setTimeout(() => finish(signal.reason), 1000);
    };
    signal.addEventListener('abort', cancel, { once: true });
    child.stdout.resume(); child.stderr.resume(); child.stdin.on('error', () => {});
    child.once('error', () => finish(Object.assign(new UserFacingError('cacheDownloadFailed'), { diagnosticStage: 'audio-tool' })));
    child.once('close', code => finish(signal.aborted ? signal.reason : code === 0 ? null :
      Object.assign(new UserFacingError('cacheDownloadFailed'), { diagnosticStage: stage })));
    child.stdin.end(input);
  });
}

export function downloadTimeoutError() {
  const error = new UserFacingError('cacheDownloadFailed');
  error.diagnosticStage = 'cache-timeout';
  return error;
}

function probeDuration(file, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(mediaTool('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { windowsHide: true, signal });
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
