import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JukeboxAudio } from '../src/jukebox-audio.mjs';
import { AudioCache, NextTrackPreload } from '../src/audio-cache.mjs';
import { createChannelRooms, JukeboxRoom } from '../src/jukebox-room.mjs';
import { createDiscordAuth, validateActivityInstance } from '../src/activity-auth.mjs';
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

test('selecting a track bounds the whole foreground wait even if an earlier preload never settles', async () => {
  const cache = new AudioCache({ timeoutMs: 80 });
  const audio = new JukeboxAudio(cache);
  const r = room('deadline', { audio });
  await songs(r, 2);
  const [stuck, next] = r.tracks;
  let resolveOld, foregroundSignal, successorSignal, released = 0;
  cache.get = (_track, signal) => {
    foregroundSignal = signal;
    return new Promise(resolve => { resolveOld = resolve; });
  };
  audio.preload(stuck);
  const original = audio.startBeforeDeadline.bind(audio);
  audio.startBeforeDeadline = (track, options, signal, deadline) => {
    if (track.id === next.id) { successorSignal = signal; return; }
    return original(track, options, signal, deadline);
  };
  try {
    await r.play(stuck.id); await tick();
    assert.equal(r.currentId, next.id); assert.equal(r.status, 'playing');
    assert.ok(foregroundSignal.aborted);
    assert.ok(r.snapshot().events.some(event => event.kind === 'error' && event.message.includes('超时')));
    resolveOld({ file: 'late', release: () => { released++; } }); await tick();
    assert.equal(released, 1); assert.equal(r.currentId, next.id);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(successorSignal.aborted, false);
  } finally { r.close(); }
});

test('relaunching before the last participant check reattaches to the playing room', async () => {
  const channel = { id: '123456789012345678' }, guildId = 'guild';
  let voiceChannel = channel;
  const instances = new Map();
  const { rooms, roomFor } = createChannelRooms(channel => room(channel.id));
  const auth = createDiscordAuth({ applicationId: 'app', guildId, roomFor, channelForUser: async () => voiceChannel,
    fetchImpl: async url => {
      if (url.endsWith('oauth2/token')) return Response.json({ access_token: 'test', expires_in: 7200 });
      if (url.endsWith('users/@me')) return Response.json({ id: 'listener' });
      const id = url.split('/').at(-1), users = instances.get(id);
      return users ? Response.json({ application_id: 'app', instance_id: id, users, location: { guild_id: guildId, channel_id: channel.id } })
        : new Response(null, { status: 404 });
    },
  });
  const login = (instanceId, resumeRoomId) => auth.authenticate({ guildId, channelId: channel.id, instanceId, code: 'test', resumeRoomId });
  instances.set('old', ['listener']);
  const first = await login('old'), original = first.room;
  await songs(original); await original.play(); original.audio.at = 47;
  original.setMode('repeat-all'); const before = original.snapshot();
  instances.clear();
  instances.set('new', ['listener']);
  const reopened = await login('new');
  await original.refreshParticipants(auth.getInstance);
  assert.equal(original.participants, 1); assert.equal(original.closed, false);
  await assert.rejects(auth.authorize(first), e => e.key === 'activityRequired');
  assert.equal(reopened.room, original); assert.equal((await login('new', original.id)).room, original);
  const after = reopened.room.snapshot();
  for (const key of ['id', 'currentId', 'position', 'tracks', 'mode', 'status']) assert.deepEqual(after[key], before[key]);
  assert.equal(original.audio.starts.length, 1);
  voiceChannel = { id: '987654321098765432' };
  await assert.rejects(auth.authorize(reopened), e => e.key === 'differentVoice');
  await assert.rejects(login('new'), e => e.key === 'differentVoice');
  assert.notEqual(roomFor(voiceChannel), original);
  voiceChannel = channel; original.close();
  await assert.rejects(login('new', original.id), e => e.key === 'roomClosed');
  assert.equal(rooms.has(channel.id), false);
  const replacement = (await login('new')).room;
  await assert.rejects(login('new', original.id), e => e.key === 'roomClosed');
  assert.notEqual(replacement.id, original.id);
});

test('a late participant check cannot remove a reattached instance or double count overlapping users', async () => {
  const r = room();
  r.attachActivity({ instance_id: 'one', users: ['a'] });
  let finishCheck;
  const checking = r.refreshParticipants(() => new Promise(resolve => { finishCheck = resolve; }));
  r.attachActivity({ instance_id: 'one', users: ['a', 'b'] });
  r.attachActivity({ instance_id: 'two', users: ['b', 'c'] });
  finishCheck(null); await checking;
  assert.equal(r.participants, 3); assert.equal(r.closed, false);
});

test('the last Activity participant leaving ends playback, clears the queue and releases the channel', async () => {
  for (const lastInstance of [null, { users: [] }]) {
    const channel = { id: 'voice' };
    const { rooms, roomFor } = createChannelRooms(channel => room(channel.id));
    const r = roomFor(channel);
    await songs(r); await r.play(); r.audio.at = 37;
    r.attachActivity({ instance_id: 'first', users: ['a'] });
    r.attachActivity({ instance_id: 'second', users: ['b', 'c'] });
    await r.refreshParticipants(async id => id === 'first' ? null : { users: ['c'] });
    assert.equal(r.participants, 1); assert.equal(r.status, 'playing'); assert.equal(r.audio.at, 37);
    await r.refreshParticipants(async () => lastInstance);
    assert.equal(r.closed, true); assert.equal(r.tracks.length, 0); assert.equal(r.currentId, null);
    assert.equal(r.audio.at, 0); assert.equal(rooms.has(channel.id), false);
    assert.notEqual(roomFor(channel).id, r.id);
  }
});

test('unknown Discord participation keeps the room until the next confirmed empty result', async () => {
  const r = room();
  let response;
  const auth = createDiscordAuth({ applicationId: 'app', fetchImpl: async () => response });
  r.attachActivity({ instance_id: 'one', users: ['a'] });
  for (response of [new Response(null, { status: 503 }), Response.json(null),
    Response.json({ application_id: 'app', instance_id: 'one' }),
    Response.json({ application_id: 'app', instance_id: 'other', users: [] })]) {
    await assert.rejects(r.refreshParticipants(auth.getInstance));
    assert.equal(r.closed, false); assert.equal(r.participants, 1);
  }
  response = new Response(null, { status: 404 });
  await r.refreshParticipants(auth.getInstance);
  assert.equal(r.closed, true);
});

test('participant checks leave a command-only room running', async () => {
  const r = room(); await songs(r, 1); await r.play();
  await r.refreshParticipants(() => assert.fail('No Activity instance to check'));
  assert.equal(r.closed, false); assert.equal(r.status, 'playing');
});

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
test('preload follows exactly the next queued track through additions, edits, pause, wrap and close', async () => {
  const r = room(), audio = r.audio;
  audio.preload = track => { audio.upcoming = track; };
  await songs(r, 1); await r.play(); assert.equal(audio.upcoming, null);
  const second = await r.add('https://youtu.be/two'), third = await r.add('https://youtu.be/three');
  assert.equal(audio.upcoming, second);
  r.move(third.id, -1); assert.equal(audio.upcoming, third);
  await r.remove(third.id); assert.equal(audio.upcoming, second);
  r.pause(); assert.equal(audio.upcoming, null);
  await r.resume(); assert.equal(audio.upcoming, second);
  await r.next(true); assert.equal(r.currentId, second.id); assert.equal(audio.upcoming, null);
  r.setMode('repeat-all'); assert.equal(audio.upcoming, r.tracks[0]);
  r.setMode('repeat-one'); assert.equal(audio.upcoming, null);
  r.setMode('repeat-all'); r.close(); assert.equal(audio.upcoming, null);
});

test('shuffle preloads its actual next draw and redraws if the chosen track is removed', async () => {
  const r = room('voice', { random: Math.random });
  let upcoming;
  r.audio.preload = track => { upcoming = track; };
  await songs(r, 5); r.setMode('shuffle'); await r.play();
  assert.ok(upcoming); const chosen = upcoming;
  r.recordOperation('update'); assert.equal(upcoming, chosen);
  await r.remove(chosen.id); assert.ok(upcoming); assert.notEqual(upcoming, chosen);
  const seen = new Set([r.currentId]);
  for (let i = 1; i < r.tracks.length; i++) {
    const expected = upcoming.id;
    await r.next(true); assert.equal(r.currentId, expected);
    assert.ok(!seen.has(expected)); seen.add(expected);
  }
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

test('a timed-out last track in list repeat reports the error and starts the next playable track', async () => {
  const r = room(); await songs(r, 2);
  const [first, last] = r.tracks;
  const start = r.audio.start.bind(r.audio);
  r.audio.start = async (track, options) => {
    if (track.id === last.id) throw Object.assign(new Error(), { diagnosticStage: 'cache-timeout' });
    return start(track, options);
  };
  r.setMode('repeat-all'); await r.play(last.id); await tick();
  assert.equal(r.currentId, first.id); assert.equal(r.status, 'playing');
  assert.ok(r.snapshot().events.some(e => e.kind === 'error' && e.message.includes('超时')));
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
test('removing a loading track or a preload cancels its cache job, and removing current preserves the successor download', async () => {
  const cache = new AudioCache(), preload = new NextTrackPreload(cache), jobs = [];
  cache.obtain = (track, key, signal) => new Promise((resolve, reject) => {
    jobs.push({ track, signal, finish: () => resolve('cache.mp3') });
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const audio = new Audio();
  audio.preload = track => preload.set(track);
  audio.start = async (track, { signal }) => { audio.lease = await preload.claim(track, signal) ?? await cache.get(track, signal); };
  audio.stop = () => { audio.lease?.release(); audio.lease = null; };
  const r = room('voice', { audio }); await songs(r, 4);
  const [a, b, c, d] = r.tracks;
  const starting = r.play(a.id); await tick();
  const removing = r.remove(a.id); await tick();
  assert.equal(jobs[0].signal.aborted, true); assert.equal(jobs[1].track, b);
  jobs[1].finish(); await Promise.all([starting, removing]); await tick();
  assert.equal(r.status, 'playing'); assert.equal(jobs[2].track, c);
  await r.remove(c.id); await tick();
  assert.equal(jobs[2].signal.aborted, true); assert.equal(jobs[3].track, d);
  const advancing = r.remove(b.id); await tick();
  assert.equal(jobs[3].signal.aborted, false); assert.equal(jobs.length, 4);
  jobs[3].finish(); await advancing; assert.equal(r.currentId, d.id); assert.equal(r.status, 'playing');
  assert.ok(!r.history.includes(b.id)); r.close(); assert.equal(cache.pins.size, 0);
});

test('a switched download preloads before the normal successor without changing playback order', async () => {
  const audio = new Audio(), targets = [], releases = [];
  let firstAbort;
  audio.holdPartial = track => () => releases.push(track.id);
  audio.preload = track => targets.push(track?.id);
  const r = room('voice', { audio }); await songs(r, 5);
  const [a,b,c,d,e] = r.tracks;
  audio.start = async (track, {signal}) => {
    if (track === a) await new Promise(resolve => { firstAbort = signal; signal.addEventListener('abort', resolve, {once:true}); });
  };
  const pending = r.play(a.id); await r.play(b.id); await pending;
  assert.ok(firstAbort.aborted); assert.equal(targets.at(-1), a.id);
  assert.deepEqual(r.tracks, [a,b,c,d,e]);
  audio.emit('preloadResult', a, true); assert.equal(targets.at(-1), c.id);
  audio.emit('preloadResult', c, false); assert.equal(targets.at(-1), d.id);
  audio.emit('preloadResult', d, false); assert.equal(targets.at(-1), e.id);
  assert.deepEqual(releases, [a.id]); assert.equal(r.currentId, b.id);
  await r.next(true); assert.equal(r.currentId, c.id); r.close();
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
