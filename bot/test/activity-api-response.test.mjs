import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../activity/api-response.mjs';
import { createRoomSession } from '../activity/room-session.mjs';

test('proxy HTML, empty bodies and malformed successful JSON return a safe service message', async () => {
  for (const response of [
    new Response('<!DOCTYPE html><p>private proxy response</p>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    new Response('<!DOCTYPE html><p>private proxy response</p>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('', { status: 503 }), new Response('{private malformed', { headers: { 'Content-Type': 'application/json' } }),
    Response.json(null), Response.json([]),
  ]) {
    await assert.rejects(readApiResponse(response), error => error.message === '点歌台服务暂时不可用，请稍后重新打开。');
  }
  assert.deepEqual(await readApiResponse(Response.json({ closed: false })), { closed: false });
  await assert.rejects(readApiResponse(Response.json({ error: '请从对应语音频道打开。' }, { status: 400 })), /请从对应语音频道打开/);
  await assert.rejects(readApiResponse(new Response('<html>expired</html>', { status: 401 })), /登录已过期/);
});

test('an HTML proxy outage does not close the room or render HTML and polling can recover', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let offline = true;
  const notices = [], states = [], closes = [];
  const service = createRoomSession({ login: { session: 'test', state: { closed: false, revision: 1 } },
    notice: text => notices.push(text), close: () => closes.push(true),
    fetchImpl: async () => offline ? new Response('<!DOCTYPE html>private upstream', { status: 502 }) : Response.json({ closed: false, revision: 2 }),
  });
  t.after(() => service.leave());
  service.subscribe(state => states.push(state));
  t.mock.timers.tick(1500); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.length, 1); assert.equal(closes.length, 0); assert.match(notices.at(-1), /服务暂时不可用/);
  await assert.rejects(service.action('pause'), /服务暂时不可用/);
  offline = false;
  t.mock.timers.tick(1500); await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).revision, 2); assert.equal(closes.length, 0);
});
