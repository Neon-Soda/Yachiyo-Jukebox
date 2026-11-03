import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityServer } from '../src/activity-http.mjs';
import { UserFacingError } from '../src/messages.mjs';

test('Activity API authenticates, rechecks membership, rejects cross-origin writes and hides secrets', async t => {
  let allowed = true, acted = 0;
  const room = { closed: false, snapshot: () => ({ channelId: 'voice-a', tracks: [], closed: room.closed }) };
  const { server } = createActivityServer({ clientId: '123', directory: '.',
    authenticate: async () => ({ userId: 'user', instanceId: 'instance', accessToken: 'fake-oauth', room }),
    authorize: async () => { if (!allowed) throw new UserFacingError('differentVoice'); },
    action: async () => { acted++; },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/state')).status, 401);
  assert.equal((await fetch(base + '/.env')).status, 404);
  const request = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://123.discordsays.com', ...headers }, body: JSON.stringify(body) });
  assert.equal((await request('/api/auth', {}, { Origin: 'https://other.example' })).status, 403);
  const login = await (await request('/api/auth', {})).json();
  assert.ok(login.session); assert.equal(login.accessToken, 'fake-oauth');
  const headers = { Authorization: `Bearer ${login.session}` };
  assert.equal((await request('/api/action', { type: 'pause' }, headers)).status, 200); assert.equal(acted, 1);
  assert.equal((await request('/api/action', {}, { ...headers, Origin: 'https://other.example' })).status, 403);
  allowed = false;
  assert.equal((await request('/api/action', {}, headers)).status, 400); assert.equal(acted, 1);
  room.closed = true;
  assert.equal((await (await fetch(base + '/api/state', { headers })).json()).closed, true);
  await request('/api/leave', {}, headers);
  assert.equal((await fetch(base + '/api/state', { headers })).status, 401);
});
