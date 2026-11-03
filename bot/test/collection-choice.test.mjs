import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JukeboxRoom } from '../src/jukebox-room.mjs';
import { createRoomActionHandler } from '../src/jukebox-actions.mjs';
import { createActivityServer } from '../src/activity-http.mjs';
import { collectionSingleChoice } from '../src/collection-choice.mjs';
import { parseLink } from '../src/media.mjs';
import { UserFacingError } from '../src/messages.mjs';
import { expandMediaCollection } from '../src/media-collections.mjs';

const bili = 'https://www.bilibili.com/video/BV1BE411u7dT/';
const yt = 'https://www.youtube.com/watch?v=IFHlJUVo3gk&list=PLi8S45DX8W1K2sQtG-kn-n_ekKzuE9BjW';
const list = { title: '音乐合集', kind: 'bilibili-parts', tracks: Array.from({ length: 51 }, (_, i) => ({ platform: 'BILIBILI', url: `${bili}?p=${i + 1}`, title: `P${i + 1}`, duration: 200 })), skipped: 0 };
class Audio extends EventEmitter {
  async start() {} stop() {} position() { return 0; }
}
function makeRoom(options = {}) {
  return new JukeboxRoom({ channelId: 'voice', channelName: 'Test', audio: new Audio(), expandCollection: async () => structuredClone(list), inspectTrack: async parsed => ({ ...parsed, title: '单曲', duration: 200 }), ...options });
}
async function pending(room, url = bili) {
  return { room, userId: 'one', displayName: '测试用户', pendingAdd: { id: 'choice', input: url, result: await room.prepareAdd(url), expires: Date.now() + 300000 } };
}

test('preparing a collection leaves the playlist, audio and operation feed unchanged', async () => {
  const room = makeRoom();
  const result = await room.prepareAdd(bili);
  assert.equal(result.collection.tracks.length, 51);
  assert.equal(result.single.url, bili + '?p=1');
  assert.equal(result.single.title, 'P1');
  assert.equal(room.tracks.length, 0); assert.equal(room.currentId, null);
  assert.equal(room.events.length, 0); assert.equal(room.busy, false);
});

test('Bilibili can confirm a public multi-P list when view metadata is unavailable, without silently treating one unknown part as a single', async () => {
  const fetchFor = count => async url => {
    if (url.includes('/pagelist?')) return Response.json({ code: 0, data: Array.from({ length: count }, (_, i) => ({ page: i + 1, part: `歌曲${i + 1}`, duration: 200 })) });
    return url.includes('api.bilibili') ? new Response('Unavailable', { status: 412 }) : new Response('<html>verification screen</html>');
  };
  const collection = await expandMediaCollection(parseLink(bili), { fetchImpl: fetchFor(51) });
  assert.equal(collection.tracks.length, 51); assert.equal(collection.tracks[0].url, bili + '?p=1');
  assert.equal(collection.tracks[0].title, 'P1 · 歌曲1');
  const uncertain = await expandMediaCollection(parseLink(bili), { fetchImpl: fetchFor(1) });
  assert.equal(uncertain.singleOnly, true); assert.equal(uncertain.tracks.length, 1);
  const room = makeRoom({ expandCollection: async () => uncertain });
  await assert.rejects(room.add(bili), error => error.key === 'collectionReadFailed');
  assert.equal(room.tracks.length, 0);
  const actor = await pending(room);
  await createRoomActionHandler({ ensureVoice: async () => {} })(actor, { type: 'add', url: bili, previewId: 'choice', single: true });
  assert.equal(room.tracks.length, 1); assert.equal(room.tracks[0].url, bili + '?p=1');
});

test('single confirmation inspects only the selected part, while entire confirmation reuses metadata', async () => {
  let lookups = 0, inspected = [];
  const options = { expandCollection: async () => { lookups++; return structuredClone(list); }, inspectTrack: async parsed => { inspected.push(parsed.url); return { ...parsed, title: '单曲', duration: 200 }; } };
  const action = createRoomActionHandler({ ensureVoice: async () => {} });
  const singleRoom = makeRoom(options), singleActor = await pending(singleRoom);
  await action(singleActor, { type: 'add', url: bili, previewId: 'choice', single: true });
  assert.deepEqual(inspected, [bili + '?p=1']); assert.equal(singleRoom.tracks.length, 1);
  const allRoom = makeRoom(options), allActor = await pending(allRoom);
  await action(allActor, { type: 'add', url: bili, previewId: 'choice', single: false });
  assert.equal(allRoom.tracks.length, 51); assert.equal(lookups, 2); assert.equal(inspected.length, 1);
});

test('YouTube chooses the linked video, and a playlist-only URL chooses its first available item', () => {
  const collection = { tracks: [{ url: 'https://www.youtube.com/watch?v=MzdkCFG-cbM', title: '第一首' }, { url: 'https://www.youtube.com/watch?v=IFHlJUVo3gk', title: '链接歌曲' }] };
  assert.deepEqual(collectionSingleChoice(parseLink(yt), collection), { url: collection.tracks[1].url, title: '链接歌曲', first: false });
  assert.deepEqual(collectionSingleChoice(parseLink('https://www.youtube.com/playlist?list=PLi8S45DX8W1K2sQtG-kn-n_ekKzuE9BjW'), collection), { url: collection.tracks[0].url, title: '第一首', first: true });
  assert.equal(collectionSingleChoice(parseLink('https://youtu.be/IFHlJUVo3gk?list=PLi8S45DX8W1K2sQtG-kn-n_ekKzuE9BjW'), collection).url, collection.tracks[1].url);
});

test('YouTube single confirmation strips list and preserves the linked video rather than the first item', async () => {
  let inspected;
  const collection = { title: '测试列表', tracks: [{ platform: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=MzdkCFG-cbM', title: '第一首' }, { platform: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=IFHlJUVo3gk', title: '链接歌曲' }], skipped: 0 };
  const room = makeRoom({ expandCollection: async () => collection, inspectTrack: async parsed => { inspected = parsed; return { ...parsed, title: '链接歌曲' }; } });
  const actor = await pending(room, yt);
  await createRoomActionHandler({ ensureVoice: async () => {} })(actor, { type: 'add', url: yt, previewId: 'choice', single: true });
  assert.equal(room.tracks.length, 1); assert.equal(inspected.url, collection.tracks[1].url);
});

test('ordinary singles are checked once and then directly committed without a collection', async () => {
  let lookups = 0;
  const room = makeRoom({ expandCollection: async () => { lookups++; return null; } });
  const actor = await pending(room);
  assert.equal(actor.pendingAdd.result.collection, null);
  await createRoomActionHandler({ ensureVoice: async () => {} })(actor, { type: 'add', url: bili, previewId: 'choice', single: true });
  assert.equal(lookups, 1); assert.equal(room.tracks.length, 1);
});

test('duplicate, mismatched, expired and cleared choices cannot add songs or join voice', async () => {
  let joins = 0;
  const action = createRoomActionHandler({ ensureVoice: async () => { joins++; } });
  const room = makeRoom(), actor = await pending(room);
  for (const data of [{ previewId: 'forged', url: bili }, { previewId: 'choice', url: yt }]) {
    await assert.rejects(action(actor, { type: 'add', ...data }), error => error.key === 'cancelled');
  }
  const otherActor = { room, userId: 'other' };
  await assert.rejects(action(otherActor, { type: 'add', url: bili, previewId: 'choice' }), error => error.key === 'cancelled');
  actor.pendingAdd.expires = Date.now() - 1;
  await assert.rejects(action(actor, { type: 'add', url: bili, previewId: 'choice' }), error => error.key === 'cancelled');
  const clearedActor = await pending(room); room.clear();
  await assert.rejects(action(clearedActor, { type: 'add', url: bili, previewId: 'choice' }), error => error.key === 'cancelled');
  assert.equal(joins, 0); assert.equal(room.tracks.length, 0);
  const accepted = await pending(room);
  await action(accepted, { type: 'add', url: bili, previewId: 'choice', single: true });
  const after = joins;
  await assert.rejects(action(accepted, { type: 'add', url: bili, previewId: 'choice', single: true }), error => error.key === 'cancelled');
  assert.equal(room.tracks.length, 1); assert.equal(joins, after);
});

test('clear/end during inspection cancel the prompt, and capacity is checked again at confirmation', async () => {
  for (const method of ['clear', 'close']) {
    let finish;
    const room = makeRoom({ expandCollection: () => new Promise(resolve => { finish = resolve; }) });
    const prepare = room.prepareAdd(bili); room[method](); finish(structuredClone(list));
    await assert.rejects(prepare, error => error.key === 'cancelled'); assert.equal(room.tracks.length, 0);
  }
  const room = makeRoom(), actor = await pending(room);
  room.tracks = Array.from({ length: 470 }, (_, i) => ({ id: String(i) }));
  await assert.rejects(createRoomActionHandler({ ensureVoice: async () => {} })(actor, { type: 'add', url: bili, previewId: 'choice' }), error => error.key === 'collectionQueueFull');
  assert.equal(room.tracks.length, 470);
});

test('collection preparation API checks authentication/membership/rate and exposes only the prompt summary', async t => {
  let allowed = true, joins = 0;
  const room = makeRoom();
  const { server } = createActivityServer({ clientId: '123', directory: '.',
    authenticate: async () => ({ room, userId: 'one' }),
    authorize: async () => { if (!allowed) throw new UserFacingError('differentVoice'); },
    action: createRoomActionHandler({ ensureVoice: async () => { joins++; } }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, session) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://123.discordsays.com', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/prepare-add', { url: bili })).status, 401);
  const login = await (await post('/api/auth', {})).json();
  allowed = false;
  assert.equal((await post('/api/prepare-add', { url: bili }, login.session)).status, 400);
  allowed = true;
  assert.equal((await post('/api/prepare-add', { url: 'https://127.0.0.1/private' }, login.session)).status, 400);
  const response = await post('/api/prepare-add', { url: bili }, login.session);
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.collection.kind, 'bilibili-parts');
  assert.equal(preview.collection.count, 51); assert.equal(preview.collection.singleTitle, 'P1');
  assert.equal(JSON.stringify(preview).includes('https://'), false); assert.equal('tracks' in preview.collection, false);
  assert.equal(room.tracks.length, 0); assert.equal(joins, 0);
  const added = await post('/api/action', { type: 'add', url: bili, previewId: preview.previewId, single: true }, login.session);
  assert.equal(added.status, 200); assert.equal(room.tracks.length, 1);
  for (let i = 0; i < 10; i++) await post('/api/prepare-add', { url: bili }, login.session);
  assert.equal((await post('/api/prepare-add', { url: bili }, login.session)).status, 429);
});
