import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JukeboxRoom } from '../src/jukebox-room.mjs';
import { createRoomActionHandler } from '../src/jukebox-actions.mjs';
import { createActivityServer } from '../src/activity-http.mjs';
import { createEventCursor, createNotificationFeed } from '../activity/web/notifications.js';

function makeRoom(channelId = 'a', inspectTrack = async link => ({ ...link, title: '测试歌曲', duration: 300 })) {
  const audio = new EventEmitter();
  Object.assign(audio, { start: async () => {}, stop() {}, pause: () => true, resume: () => true, position: () => 0 });
  return new JukeboxRoom({ channelId, channelName: channelId, audio, inspectTrack });
}
const action = createRoomActionHandler({ ensureVoice: async () => {} });
const session = room => ({ room, userId: 'trusted-user', displayName: '小月' });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('successful operations keep the latest five attributed events per room and skip no-ops', async () => {
  const room = makeRoom(), other = makeRoom('b'), actor = session(room);
  await action(actor, { type: 'add', url: 'https://youtu.be/test' }); await tick();
  assert.ok(room.events.some(e => e.actor === '小月' && e.message.startsWith('加入了')));
  await action(actor, { type: 'pause' });
  const pausedCount = room.eventSequence;
  await action(actor, { type: 'pause' }); assert.equal(room.eventSequence, pausedCount);
  await action(actor, { type: 'resume' });
  for (const mode of ['repeat-all', 'shuffle', 'repeat-one', 'sequence', 'shuffle']) await action(actor, { type: 'mode', mode });
  assert.equal(room.events.length, 5);
  assert.deepEqual(room.events.map(e => e.id), [room.eventSequence - 4, room.eventSequence - 3, room.eventSequence - 2, room.eventSequence - 1, room.eventSequence]);
  assert.equal(other.events.length, 0);
  const snapshot = room.snapshot(); snapshot.events[0].actor = 'modified'; assert.equal(room.events[0].actor, '小月');
  await action(actor, { type: 'end' });
  assert.equal(room.closed, true); assert.match(room.snapshot().events.at(-1).message, /结束/);
  assert.equal(makeRoom().events.length, 0);
});

test('failed requests do not create success events, and preparation is not advertised as playback', async () => {
  const invalid = makeRoom('a', async () => { throw new Error('private upstream text'); });
  await assert.rejects(action(session(invalid), { type: 'add', url: 'https://youtu.be/test' })); assert.equal(invalid.events.length, 0);
  const room = makeRoom();
  const track = await room.add('https://youtu.be/test');
  let rejectStart;
  room.audio.start = () => new Promise((_, reject) => { rejectStart = reject; });
  await action(session(room), { type: 'play', id: track.id });
  assert.equal(room.status, 'loading'); assert.match(room.events.at(-1).message, /正在准备/);
  assert.ok(!room.events.some(e => e.message.includes('已开始播放')));
  rejectStart(new Error('private upstream text')); await tick();
  assert.match(room.events.at(-1).message, /播放失败/);
  assert.ok(!JSON.stringify(room.snapshot()).includes('private'));
  const count = room.eventSequence;
  await assert.rejects(action(session(room), { type: 'mode', mode: 'invalid' }));
  await assert.rejects(action(session(room), { type: 'seek', position: NaN }));
  assert.equal(room.eventSequence, count);
});

test('playlist reorder, removal and clearing report the affected title and count', async () => {
  const room = makeRoom(), actor = session(room);
  const first = await room.add('https://youtu.be/one'); await room.add('https://youtu.be/two');
  await action(actor, { type: 'move', id: first.id, direction: -1 }); assert.equal(room.events.length, 0);
  await action(actor, { type: 'move', id: first.id, direction: 1 }); assert.match(room.events.at(-1).message, /第 2 位/);
  await action(actor, { type: 'remove', id: first.id }); assert.match(room.events.at(-1).message, /移除了《测试歌曲》/);
  await action(actor, { type: 'clear' }); assert.match(room.events.at(-1).message, /共 1 首/);
});

test('toast cursor does not replay initial history, duplicate snapshots, or another room history', () => {
  const cursor = createEventCursor(), event = id => ({ id, actor: 'User', message: 'Action', at: id });
  assert.deepEqual(cursor.take('a', [event(1), event(2)]), []);
  assert.deepEqual(cursor.take('a', [event(1), event(2), event(3)]).map(e => e.id), [3]);
  assert.deepEqual(cursor.take('a', [event(1), event(2), event(3)]), []);
  assert.deepEqual(cursor.take('a', [event(1)]), []);
  assert.deepEqual(cursor.take('a', [event(3), event(4), event(5)]).map(e => e.id), [4, 5]);
  assert.deepEqual(cursor.take('b', [event(1), event(2)]), []);
  assert.deepEqual(cursor.take('b', [event(3)]).map(e => e.id), [3]);
});

test('a cached document without the new history elements cannot break playback initialization', () => {
  const feed = createNotificationFeed({ list: null, empty: null, toastHost: () => assert.fail('No toast host in an older document') });
  assert.doesNotThrow(() => feed.render({ id: 'old-document', events: [{ id: 1 }] }));
});

test('two authenticated users receive the same history and cannot spoof the operator name or another channel', async t => {
  const rooms = { a: makeRoom('a'), b: makeRoom('b') };
  const users = { alpha: { name: '甲', channel: 'a' }, beta: { name: '乙', channel: 'a' }, gamma: { name: '丙', channel: 'b' } };
  const { server } = createActivityServer({ clientId: '123', directory: '.',
    authenticate: async body => { const user = users[body.user]; return { userId: body.user, displayName: user.name, room: rooms[user.channel], accessToken: 'fake-test-access' }; },
    authorize: async () => {}, action,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, token) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Origin: 'https://123.discordsays.com', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 200); return response.json();
  };
  const alpha = await request('/api/auth', { user: 'alpha' }), beta = await request('/api/auth', { user: 'beta' }), gamma = await request('/api/auth', { user: 'gamma' });
  const change = await request('/api/action', { type: 'mode', mode: 'shuffle', displayName: 'spoofed' }, alpha.session);
  assert.equal(change.events.at(-1).actor, '甲');
  const observer = await request('/api/state', null, beta.session);
  assert.deepEqual(change.events, observer.events);
  assert.equal((await request('/api/state', null, gamma.session)).events.length, 0);
});
