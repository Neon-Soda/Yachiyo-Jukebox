import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityServer } from '../src/activity-http.mjs';
import { UserFacingError } from '../src/messages.mjs';

test('search is authenticated, membership checked and rate limited without changing the playlist; selected URLs use the existing add action', async t => {
  let allowed = true, searches = 0, adds = 0;
  const tracks = [], room = { closed: false, snapshot: () => ({ tracks, closed: room.closed }) };
  const url = 'https://www.bilibili.com/video/BV1vb4y1b7RU/';
  const { server } = createActivityServer({ clientId: '123', directory: '.',
    authenticate: async () => ({ userId: 'one', instanceId: 'instance', room, accessToken: 'fake-oauth' }),
    authorize: async () => { if (!allowed) throw new UserFacingError('differentVoice'); },
    search: async (query, platforms) => { searches++; if (platforms) assert.deepEqual(platforms, ['BILIBILI', 'NETEASE']); return { query, results: [{ title: '歌曲', url, platform: 'BILIBILI', duration: 293 }], warnings: [] }; },
    action: async (_session, body) => { assert.equal(body.type, 'add'); assert.equal(body.url, url); adds++; tracks.push({ title: '歌曲' }); },
    cover: async id => id === 'a'.repeat(24) ? { type: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) } : null,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, data, session, origin = 'https://123.discordsays.com') => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify(data) });
  assert.equal((await request('/api/search', { query: '歌曲' })).status, 401);
  const { session } = await (await request('/api/auth', {})).json();
  allowed = false;
  assert.equal((await request('/api/search', { query: '歌曲' }, session)).status, 400); assert.equal(searches, 0);
  allowed = true;
  assert.equal((await request('/api/search', { query: '歌曲' }, session, 'https://evil.test')).status, 403);
  const result = await (await request('/api/search', { query: '歌曲', platforms: ['BILIBILI', 'NETEASE'] }, session)).json();
  assert.equal(result.results[0].duration, 293); assert.equal(adds, 0); assert.deepEqual(tracks, []);
  await request('/api/action', { type: 'add', url: result.results[0].url }, session);
  assert.equal(adds, 1); assert.equal(tracks.length, 1);
  for (let i = 0; i < 23; i++) assert.equal((await request('/api/search', { query: '歌曲' }, session)).status, 200);
  assert.equal((await request('/api/search', { query: '歌曲' }, session)).status, 429); assert.equal(searches, 24);
  const image = await fetch(base + '/.proxy/covers/' + 'a'.repeat(24));
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(base + '/covers/' + 'b'.repeat(24))).status, 404);
  room.closed = true;
  assert.equal((await (await request('/api/search', { query: '歌曲' }, session)).json()).closed, true);
  assert.equal(searches, 24);
});
