import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JukeboxRoom } from '../src/jukebox-room.mjs';
import { validateActivityInstance } from '../src/activity-auth.mjs';
import { createRoomActionHandler } from '../src/jukebox-actions.mjs';

class Audio extends EventEmitter {
  at = 0; starts = [];
  async start(track, options) { this.at = options.position; this.starts.push({ id: track.id, ...options }); }
  stop() { this.at = 0; }
  pause() { return true; }
  resume() { return true; }
  position() { return this.at; }
}
function room(channelId = 'a', options = {}) {
  return new JukeboxRoom({ channelId, channelName: 'Test room', audio: new Audio(), inspectTrack: async track => ({ ...track, title: 'Song', duration: 300 }), random: () => 0, ...options });
}
async function songs(r, count = 3) { for (let i = 0; i < count; i++) await r.add(`https://youtu.be/video${i}`); }
const tick = () => new Promise(resolve => setImmediate(resolve));

async function finishPlaylist(r) {
  await r.play();
  for (let i = 0; i < r.tracks.length; i++) { r.audio.emit('end'); await tick(); }
  assert.equal(r.status, 'idle'); assert.equal(r.currentId, null);
}
const addAction = createRoomActionHandler({ ensureVoice: async () => {} });

test('after sequence finishes, command, search and confirmed single additions start the new song', async () => {
  for (const source of ['command', 'search', 'confirmed']) {
    const r = room(); await songs(r, 2); await finishPlaylist(r);
    const previousIds = r.tracks.map(track => track.id), url = 'https://youtu.be/new-song';
    const actor = { room: r, userId: 'one' }, data = { type: 'add', url };
    if (source === 'search') data.single = true;
    if (source === 'confirmed') {
      actor.pendingAdd = { id: 'choice', input: url, result: await r.prepareAdd(url), expires: Date.now() + 300000 };
      Object.assign(data, { previewId: 'choice', single: true });
    }
    const added = await addAction(actor, data); await tick();
    assert.equal(r.currentId, added.id); assert.equal(r.audio.starts.at(-1).id, added.id);
    assert.equal(r.status, 'playing'); assert.deepEqual(r.tracks.slice(0, 2).map(track => track.id), previousIds);
    r.audio.emit('end'); await tick(); assert.equal(r.status, 'idle');
  }
});

test('after sequence finishes, a confirmed collection starts at its own first song and follows its order', async () => {
  const r = room('a', { expandCollection: async () => ({ title: '新合集', skipped: 0, tracks: [
    { url: 'https://youtu.be/new-first', title: '新第一首', duration: 200, platform: 'YOUTUBE' },
    { url: 'https://youtu.be/new-second', title: '新第二首', duration: 210, platform: 'YOUTUBE' },
  ] }) });
  await songs(r, 2); await finishPlaylist(r);
  const url = 'https://www.youtube.com/playlist?list=PLnewcollection';
  const actor = { room: r, userId: 'one', pendingAdd: { id: 'choice', input: url, result: await r.prepareAdd(url), expires: Date.now() + 300000 } };
  await addAction(actor, { type: 'add', url, previewId: 'choice' }); await tick();
  assert.equal(r.tracks.length, 4); assert.equal(r.currentId, r.tracks[2].id);
  r.audio.emit('end'); await tick(); assert.equal(r.currentId, r.tracks[3].id);
  r.audio.emit('end'); await tick(); assert.equal(r.status, 'idle');
  assert.deepEqual(r.audio.starts.map(start => start.id), r.tracks.map(track => track.id));
});

test('finishing the last song during new-song inspection still starts the newly added song', async () => {
  const r = room(); await songs(r, 1); await r.play();
  let finish;
  r.inspectTrack = parsed => new Promise(resolve => { finish = () => resolve({ ...parsed, title: '新歌曲', duration: 200 }); });
  const adding = addAction({ room: r, userId: 'one' }, { type: 'add', url: 'https://youtu.be/new-song' });
  await tick(); r.audio.emit('end'); await tick(); assert.equal(r.currentId, null);
  finish(); const added = await adding; await tick();
  assert.equal(r.currentId, added.id); assert.equal(r.audio.starts.length, 2);
});

test('adding songs never replaces a playing, paused or still-loading song', async () => {
  for (const status of ['playing', 'paused', 'loading']) {
    const r = room(); await songs(r, 1); let complete;
    if (status === 'loading') r.audio.start = () => new Promise(resolve => { complete = resolve; });
    const playing = r.play(); if (status !== 'loading') await playing;
    if (status === 'paused') r.pause();
    const id = r.currentId, generation = r.generation;
    await addAction({ room: r, userId: 'one' }, { type: 'add', url: 'https://youtu.be/new-song' });
    assert.equal(r.currentId, id); assert.equal(r.status, status); assert.equal(r.generation, generation);
    if (complete) { complete(); await playing; }
  }
});

test('rooms have independent playlists, positions and lifecycle', async () => {
  const a = room('a'), b = room('b');
  await songs(a); await songs(b, 1);
  await a.play(); await b.play(); await a.seek(75); a.pause();
  assert.equal(a.status, 'paused'); assert.equal(a.snapshot().position, 75);
  assert.equal(b.status, 'playing'); assert.equal(b.snapshot().position, 0);
  a.close(); assert.equal(a.tracks.length, 0); assert.equal(b.tracks.length, 1); assert.equal(b.closed, false);
  assert.ok(!JSON.stringify(b.snapshot()).includes('https://'));
});
test('sequence stops at the end, list loop wraps, single loop does not block manual next', async () => {
  const r = room(); await songs(r, 2); await r.play();
  const [first, second] = r.tracks;
  await r.next(true); assert.equal(r.currentId, second.id);
  await r.next(true); assert.equal(r.status, 'idle'); assert.equal(r.currentId, null);
  r.setMode('repeat-all'); await r.play(second.id); await r.next(true); assert.equal(r.currentId, first.id);
  r.setMode('repeat-one'); await r.next(true); assert.equal(r.currentId, first.id);
  await r.next(false); assert.equal(r.currentId, second.id);
});
test('shuffle visits all songs before repeating and previous follows real history', async () => {
  const r = room(); await songs(r, 4); r.setMode('shuffle'); await r.play();
  const ids = [r.currentId];
  for (let i = 0; i < 3; i++) { await r.next(); ids.push(r.currentId); }
  assert.equal(new Set(ids).size, 4);
  await r.previous(); assert.equal(r.currentId, ids[2]);
});
test('seek preserves pause, rejects invalid positions and does not change playlist', async () => {
  const r = room(); await songs(r); await r.play(); r.pause(); await r.seek(120);
  assert.equal(r.status, 'paused'); assert.equal(r.audio.starts.at(-1).paused, true); assert.equal(r.tracks.length, 3);
  for (const value of [-1, NaN, Infinity]) await assert.rejects(r.seek(value), e => e.key === 'invalidSeek');
});
test('clear or close prevents a late link extraction from repopulating the room', async () => {
  for (const method of ['clear', 'close']) {
    let finish;
    const r = room('a', { inspectTrack: () => new Promise(resolve => { finish = resolve; }) });
    const adding = r.add('https://youtu.be/test'); r[method]();
    finish({ url: 'https://youtu.be/test', platform: 'YOUTUBE', title: 'late', duration: 100 });
    await assert.rejects(adding, e => e.key === 'cancelled'); assert.equal(r.tracks.length, 0);
  }
});
test('late preparation after skip or close cannot restore the old playing state', async () => {
  const audio = new Audio(), pending = [];
  audio.start = (track, options) => new Promise(resolve => pending.push({ track, options, resolve }));
  const r = room('a', { audio }); await songs(r, 2);
  const first = r.play(); const next = r.next();
  assert.equal(pending[0].options.signal.aborted, true);
  pending[0].resolve(); await first; assert.equal(r.status, 'loading'); assert.equal(r.currentId, r.tracks[1].id);
  r.close(); pending[1].resolve(); await next;
  assert.equal(r.status, 'idle'); assert.equal(r.currentId, null); assert.equal(r.closed, true);
});
test('all failing songs stop without an infinite loop, even in repeat mode', async () => {
  const audio = new Audio(); let starts = 0;
  audio.start = async () => { starts++; throw new Error('private upstream diagnostic'); };
  const r = room('a', { audio }); await songs(r, 3); r.setMode('repeat-all'); await r.play(); await tick();
  assert.equal(starts, 3); assert.equal(r.status, 'idle'); assert.ok(!JSON.stringify(r.snapshot()).includes('private upstream'));
});

test('playback failures expose only fixed diagnostic stages, never upstream error text', async () => {
  for (const stage of ['cache-timeout', 'private-upstream-value']) {
    const audio = new Audio();
    audio.start = async () => { const error = new Error('private upstream text'); error.diagnosticStage = stage; throw error; };
    const r = room('a', { audio }); await songs(r, 1); await r.play();
    assert.equal(r.status, 'idle');
    const snapshot = JSON.stringify(r.snapshot());
    assert.ok(!snapshot.includes('private'));
    assert.equal(snapshot.includes('cache-timeout'), stage === 'cache-timeout');
  }
});
test('removing current song selects a remaining song and moving songs preserves current identity', async () => {
  const r = room(); await songs(r); await r.play(); const id = r.currentId;
  r.move(id, 1); assert.equal(r.currentId, id); assert.equal(r.tracks[1].id, id);
  await r.remove(id); assert.equal(r.tracks.length, 2); assert.notEqual(r.currentId, id);
});
test('Discord activity session rejects another application, channel, guild, instance or participant', () => {
  const expected = { applicationId: 'app', guildId: 'guild', channelId: 'voice', instanceId: 'instance', userId: 'user' };
  const valid = { application_id: 'app', instance_id: 'instance', location: { guild_id: 'guild', channel_id: 'voice' }, users: ['user'] };
  assert.equal(validateActivityInstance(valid, expected), valid);
  for (const key of Object.keys(expected)) assert.throws(() => validateActivityInstance(valid, { ...expected, [key]: 'other' }), e => e.key === 'activityRequired');
  assert.throws(() => validateActivityInstance(null, expected));
});
