import { copy as uiCopy } from './customization.mjs';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { parseLink, inspect } from './media.mjs';
import { UserFacingError } from './messages.mjs';
import { expandMediaCollection, MAX_QUEUE_TRACKS } from './media-collections.mjs';
import { collectionSingleChoice } from './collection-choice.mjs';

export const playModes = ['sequence', 'repeat-all', 'repeat-one', 'shuffle'];
const playbackStages = {
  'cache-timeout': uiCopy("room.186cae5cd6f9", "音频准备超过等待时间，请重试"),
  'cache-download': uiCopy("room.f0f12b34054a", "音频下载失败，请重试"),
  'cache-transcode': uiCopy("room.23786c31a37a", "缓存转码失败"),
  'audio-tool': uiCopy("room.2351f9be79e6", "音频工具未能启动"),
  'audio-decode': uiCopy("room.009d6fce816d", "缓存音频解码失败"),
  'audio-encode': uiCopy("room.927e5a42e200", "Discord 音频编码失败"),
  'voice-subscriber': uiCopy("room.4f11d871d38b", "语音连接已中断，请重新加入语音频道后重试"),
  'audio-start': uiCopy("room.f3c6bded063a", "Discord 播放器启动超时，请重试"),
};

export class JukeboxRoom extends EventEmitter {
  constructor({ channelId, channelName, audio, inspectTrack = inspect, expandCollection = expandMediaCollection, coverFor = () => null, random = Math.random }) {
    super();
    Object.assign(this, { channelId, channelName, audio, inspectTrack, expandCollection, coverFor, random });
    this.id = randomUUID(); this.tracks = []; this.currentId = null;
    this.mode = 'sequence'; this.status = 'idle'; this.error = null;
    this.history = []; this.shuffleBag = []; this.failed = new Set();
    this.generation = 0; this.addGeneration = 0; this.revision = 0;
    this.busy = false; this.closed = false; this.participants = 0;
    this.events = []; this.eventSequence = 0;
    audio.on('end', () => { if (!this.closed && this.status === 'playing') this.next(true); });
    audio.on('failure', error => this.playbackFailed(this.generation, error));
  }
  get current() { return this.tracks.find(t => t.id === this.currentId); }
  changed() { this.revision++; this.emit('change', this.snapshot()); }
  snapshot() {
    return {
      id: this.id, channelId: this.channelId, channelName: this.channelName,
      tracks: this.tracks.map(({ id, title, duration, platform, thumbnail }) => ({ id, title, duration, platform, thumbnail: this.coverFor(thumbnail) })),
      currentId: this.currentId, status: this.status, mode: this.mode,
      position: this.current ? this.audio.position() : 0, serverTime: Date.now(),
      revision: this.revision, busy: this.busy, closed: this.closed,
      participants: this.participants, error: this.error,
      events: this.events.map(event => ({ ...event })),
    };
  }
  recordOperation(message, actorName = uiCopy("room.2e6b61bd2efe", "点歌台"), kind = 'success') {
    const actor = String(actorName || uiCopy("room.c87feea9ea18", "一位伙伴")).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 50);
    this.events.push({ id: ++this.eventSequence, at: Date.now(), actor, message: String(message).slice(0, 240), kind: ['success', 'error', 'info'].includes(kind) ? kind : 'info' });
    this.events = this.events.slice(-5);
    this.changed();
  }
  async prepareAdd(url) {
    this.assertOpen();
    if (this.busy) throw new UserFacingError('busy');
    if (typeof url !== 'string' || url.length > 4096) throw new UserFacingError('invalidLink');
    const version = this.addGeneration;
    this.busy = true; this.changed();
    try {
      const parsed = parseLink(url);
      const mayHaveCollection = parsed.platform === 'BILIBILI' || (parsed.platform === 'YOUTUBE' && new URL(parsed.url).searchParams.has('list'));
      const collection = mayHaveCollection ? await this.expandCollection(parsed) : null;
      if (this.closed || version !== this.addGeneration) throw new UserFacingError('cancelled');
      return { parsed, collection, version, single: collection ? collectionSingleChoice(parsed, collection) : null };
    } finally { this.busy = false; this.changed(); }
  }
  async add(url, { single = false, prepared = null } = {}) {
    this.assertOpen();
    if (prepared && prepared.version !== this.addGeneration) throw new UserFacingError('cancelled');
    if (this.busy) throw new UserFacingError('busy');
    if (this.tracks.length >= MAX_QUEUE_TRACKS) throw new UserFacingError('queueFull');
    const version = this.addGeneration;
    this.busy = true; this.changed();
    try {
      const parsed = parseLink(url);
      const mayHaveCollection = parsed.platform === 'BILIBILI' || (parsed.platform === 'YOUTUBE' && new URL(parsed.url).searchParams.has('list'));
      const collection = single || !mayHaveCollection ? null : prepared ? prepared.collection : await this.expandCollection(parsed);
      if (this.closed || version !== this.addGeneration) throw new UserFacingError('cancelled');
      if (collection) {
        if (collection.singleOnly) throw new UserFacingError('collectionReadFailed');
        if (this.tracks.length + collection.tracks.length > MAX_QUEUE_TRACKS) throw new UserFacingError('collectionQueueFull');
        let firstTrackId;
        for (const item of collection.tracks) {
          const track = { ...item, id: randomUUID() };
          firstTrackId ??= track.id;
          this.tracks.push(track); this.shuffleBag.push(track.id);
        }
        this.changed();
        return { kind: 'collection', title: collection.title, count: collection.tracks.length, skipped: collection.skipped, firstTrackId };
      }
      const track = await this.inspectTrack(parsed);
      if (this.closed || version !== this.addGeneration) throw new UserFacingError('cancelled');
      if (this.tracks.length >= MAX_QUEUE_TRACKS) throw new UserFacingError('queueFull');
      track.id = randomUUID(); // Preserve the private metadata cache's object identity.
      this.tracks.push(track); this.shuffleBag.push(track.id); this.changed();
      return track;
    } finally { this.busy = false; this.changed(); }
  }
  async play(id = this.currentId ?? this.tracks[0]?.id, position = 0, paused = false, remember = true) {
    this.assertOpen();
    const track = this.tracks.find(t => t.id === id);
    if (!track) throw new UserFacingError('nothingPlaying');
    if (!Number.isFinite(position) || position < 0 || position > (track.duration ?? 7200)) throw new UserFacingError('invalidSeek');
    if (remember && this.currentId && this.currentId !== id) this.history.push(this.currentId);
    this.history = this.history.slice(-100);
    const version = ++this.generation;
    this.abort?.abort(); this.abort = new AbortController();
    this.audio.stop(); this.currentId = id; this.status = 'loading'; this.error = null;
    this.changed();
    try {
      await this.audio.start(track, { position, paused, signal: this.abort.signal });
      if (this.closed || version !== this.generation) return;
      this.status = paused ? 'paused' : 'playing'; this.failed.clear(); this.changed();
      this.recordOperation(`${paused ? uiCopy("room.999d9b5dffda", "已定位并保持暂停") : uiCopy("room.803a3019e28a", "已开始播放")}《${track.title}》`);
      this.emit('playing', track);
    } catch (error) {
      if (!this.closed && version === this.generation) this.playbackFailed(version, error);
    }
  }
  playbackFailed(version, error) {
    if (this.closed || version !== this.generation || !this.current || this.status === 'idle') return;
    this.failed.add(this.currentId);
    const stage = Object.hasOwn(playbackStages, error?.diagnosticStage) ? error.diagnosticStage : 'playback';
    console.warn(`[Activity playback] ${stage}`);
    this.error = stage === 'playback'
      ? uiCopy("room.b9a623837b9d", "这一曲没能顺利播放，请重新选择歌曲后重试。")
      : uiCopy("room.11cd38a52110", "这一曲没能顺利播放：{value1}（{stage}）。", { value1: playbackStages[stage], stage: stage });
    this.audio.stop(); this.status = 'idle'; this.changed();
    this.recordOperation(uiCopy("room.f883bee2818e", "《{title}》播放失败，请查看错误提示", { title: this.current.title }), uiCopy("room.2e6b61bd2efe", "点歌台"), 'error');
    this.emit('playbackFailure');
    const available = this.tracks.filter(t => !this.failed.has(t.id));
    if (!available.length) return;
    const next = this.tracks.slice(this.tracks.indexOf(this.current) + 1).find(t => !this.failed.has(t.id));
    if (next) void this.play(next.id);
  }
  async next(automatic = false) {
    this.assertOpen();
    if (!this.tracks.length) return;
    const index = this.tracks.findIndex(t => t.id === this.currentId);
    let next;
    if (automatic && this.mode === 'repeat-one' && index >= 0) next = this.currentId;
    else if (this.mode === 'shuffle') {
      this.shuffleBag = this.shuffleBag.filter(id => id !== this.currentId && this.tracks.some(t => t.id === id));
      if (!this.shuffleBag.length) this.shuffleBag = this.tracks.map(t => t.id).filter(id => id !== this.currentId);
      if (!this.shuffleBag.length) next = this.currentId ?? this.tracks[0].id;
      else next = this.shuffleBag.splice(Math.floor(this.random() * this.shuffleBag.length), 1)[0];
    } else if (index + 1 < this.tracks.length) next = this.tracks[index + 1].id;
    else if (this.mode === 'repeat-all' || (!automatic && this.mode === 'repeat-one')) next = this.tracks[0].id;
    if (next) await this.play(next);
    else this.stop();
  }
  async previous() {
    this.assertOpen();
    let id;
    while (this.history.length && !id) {
      const candidate = this.history.pop();
      if (this.tracks.some(t => t.id === candidate)) id = candidate;
    }
    id ??= this.tracks[Math.max(0, this.tracks.findIndex(t => t.id === this.currentId) - 1)]?.id;
    if (id) await this.play(id, 0, false, false);
  }
  pause() {
    this.assertOpen();
    if (this.status !== 'playing') return;
    if (this.audio.pause()) { this.status = 'paused'; this.changed(); }
  }
  async resume() {
    this.assertOpen();
    if (this.status === 'paused') {
      if (this.audio.resume()) { this.status = 'playing'; this.changed(); }
    } else if (this.status === 'idle') await this.play();
  }
  async seek(position) {
    this.assertOpen();
    if (!this.current || !Number.isFinite(this.current.duration) || !Number.isFinite(position) || position < 0) throw new UserFacingError('invalidSeek');
    await this.play(this.currentId, Math.min(position, Math.max(0, this.current.duration - 0.1)), this.status === 'paused', false);
  }
  setMode(mode) {
    this.assertOpen();
    if (!playModes.includes(mode)) throw new UserFacingError('invalidMode');
    this.mode = mode; this.shuffleBag = []; this.changed();
  }
  async remove(id) {
    this.assertOpen();
    const index = this.tracks.findIndex(t => t.id === id);
    if (index < 0) return;
    const wasCurrent = id === this.currentId;
    const wasActive = this.status !== 'idle';
    const wasPaused = this.status === 'paused';
    if (wasCurrent) this.stop();
    this.tracks.splice(index, 1); this.history = this.history.filter(x => x !== id);
    this.shuffleBag = this.shuffleBag.filter(x => x !== id);
    this.changed();
    if (wasCurrent && wasActive && this.tracks.length) await this.play(this.tracks[Math.min(index, this.tracks.length - 1)].id, 0, wasPaused);
  }
  move(id, direction) {
    this.assertOpen();
    if (![1, -1].includes(direction)) return;
    const from = this.tracks.findIndex(t => t.id === id), to = from + direction;
    if (from < 0 || to < 0 || to >= this.tracks.length) return;
    [this.tracks[from], this.tracks[to]] = [this.tracks[to], this.tracks[from]];
    this.changed();
  }
  stop() {
    this.generation++; this.abort?.abort(); this.audio.stop();
    this.currentId = null; this.status = 'idle'; this.changed();
  }
  clear() {
    this.addGeneration++; this.stop(); this.tracks = [];
    this.history = []; this.shuffleBag = []; this.failed.clear(); this.error = null;
    this.changed();
  }
  close() { if (this.closed) return; this.clear(); this.closed = true; this.changed(); this.emit('closed'); }
  assertOpen() { if (this.closed) throw new UserFacingError('roomClosed'); }
}
