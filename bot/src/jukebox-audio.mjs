import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, NoSubscriberBehavior, entersState } from '@discordjs/voice';
import { UserFacingError } from './messages.mjs';

export class JukeboxAudio extends EventEmitter {
  constructor(cache) {
    super(); this.cache = cache; this.serial = 0; this.offset = 0; this.active = false;
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    this.player.on(AudioPlayerStatus.Idle, () => {
      if (!this.active) return;
      this.active = false; this.lease?.release(); this.lease = null;
      this.emit('end');
    });
    this.player.on('error', () => { if (this.active) { this.stop(); this.emit('failure', { diagnosticStage: 'audio-encode' }); } });
  }
  async start(track, { position = 0, paused = false, signal }) {
    const version = ++this.serial;
    const lease = await this.cache.get(track, signal);
    if (signal.aborted || this.serial !== version) { lease.release(); throw new UserFacingError('cancelled'); }
    this.lease = lease; this.offset = position;
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(position), '-i', lease.file, '-vn', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1'], { windowsHide: true });
    this.child = child; child.stderr.resume(); child.stdin.end();
    let failed = false;
    const fail = () => {
      if (failed || this.serial !== version) return;
      failed = true; this.stop(); this.emit('failure', { diagnosticStage: 'audio-decode' });
    };
    child.on('error', fail); child.stdout.on('error', fail);
    child.on('close', code => { if (code !== 0 && code !== null) fail(); });
    try { this.resource = createAudioResource(child.stdout, { inputType: StreamType.Raw }); }
    catch {
      this.stop();
      const error = new UserFacingError('cacheDownloadFailed'); error.diagnosticStage = 'audio-encode'; throw error;
    }
    this.active = true;
    this.player.play(this.resource);
    try { await entersState(this.player, AudioPlayerStatus.Playing, 20000); }
    catch {
      const error = new UserFacingError('cacheDownloadFailed');
      error.diagnosticStage = this.player.state.status === AudioPlayerStatus.AutoPaused ? 'voice-subscriber' : 'audio-start';
      throw error;
    }
    if (signal.aborted || this.serial !== version) throw new UserFacingError('cancelled');
    if (paused) this.player.pause();
  }
  pause() { return this.player.pause(); }
  resume() { return this.player.unpause(); }
  position() { return this.offset + (this.resource?.playbackDuration ?? 0) / 1000; }
  stop() {
    this.serial++; this.active = false; this.player.stop(true);
    this.child?.kill(); this.child = null;
    this.lease?.release(); this.lease = null; this.resource = null; this.offset = 0;
  }
}
