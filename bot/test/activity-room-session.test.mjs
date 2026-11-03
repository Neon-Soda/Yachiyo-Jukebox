import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomSession } from '../activity/room-session.mjs';

function fixture(t, respond) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const requests = [], notices = [], closes = [];
  const service = createRoomSession({
    login: { session: 'fake-session', state: { closed: false } },
    notice: text => notices.push(text), close: () => closes.push('closed'),
    fetchImpl: async (path, options) => {
      requests.push({ path, options });
      const result = path === './api/leave' ? { ok: true } : await respond(path, options);
      return { ok: true, status: 200, json: async () => result };
    },
  });
  t.after(() => service.leave());
  return { service, requests, notices, closes };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('search returns private results without rendering them as a room snapshot or closing the Activity', async t => {
  const result = { results: [{ title: '歌曲' }], warnings: [] };
  const { service, requests, closes } = fixture(t, () => result);
  const states = []; service.subscribe(state => states.push(state));
  assert.deepEqual(await service.search('歌名', ['NETEASE']), result);
  assert.equal(states.length, 1); assert.equal(closes.length, 0);
  assert.equal(requests[0].path, './api/search');
  assert.equal(JSON.parse(requests[0].options.body).query, '歌名');
  assert.deepEqual(JSON.parse(requests[0].options.body).platforms, ['NETEASE']);
});

test('a search response confirming the room ended triggers the normal Activity exit', async t => {
  const { service, closes } = fixture(t, () => ({ closed: true }));
  service.subscribe(() => {});
  await assert.rejects(service.search('歌曲'), /已结束/);
  t.mock.timers.tick(900); assert.equal(closes.length, 1);
});

test('link preparation returns a private prompt and never renders it as a room snapshot', async t => {
  const result = { previewId: 'choice', collection: { title: '合集', count: 51 } };
  const { service, requests, closes } = fixture(t, () => result);
  const states = []; service.subscribe(state => states.push(state));
  assert.deepEqual(await service.prepareAdd('https://www.bilibili.com/video/BV1BE411u7dT/'), result);
  assert.equal(states.length, 1); assert.equal(closes.length, 0);
  assert.equal(requests[0].path, './api/prepare-add');
  assert.equal(JSON.parse(requests[0].options.body).url, 'https://www.bilibili.com/video/BV1BE411u7dT/');
});

test('a room ended during link preparation exits normally and cannot show a stale prompt', async t => {
  const { service, closes } = fixture(t, () => ({ closed: true }));
  service.subscribe(() => {});
  await assert.rejects(service.prepareAdd('https://www.bilibili.com/video/BV1BE411u7dT/'), /已结束/);
  t.mock.timers.tick(900); assert.equal(closes.length, 1);
  await assert.rejects(service.prepareAdd('https://www.bilibili.com/video/BV1BE411u7dT/'), /已结束/);
});

test('successful end exits once after rendering time and releases its session', async t => {
  const { service, requests, notices, closes } = fixture(t, () => ({ closed: true }));
  service.subscribe(() => {});
  assert.equal((await service.action('end')).closed, true);
  assert.match(notices.at(-1), /正在退出 Activity/);
  assert.equal(closes.length, 0);
  t.mock.timers.tick(900);
  assert.equal(closes.length, 1);
  assert.equal(requests.filter(r => r.path === './api/leave').length, 1);
  assert.equal(requests.at(-1).options.keepalive, true);
  service.leave();
  t.mock.timers.tick(10000);
  assert.equal(closes.length, 1);
  assert.equal(requests.filter(r => r.path === './api/leave').length, 1);
  await assert.rejects(service.action('resume'), /已结束/);
});

test('other participants exit when polling confirms the shared room has ended', async t => {
  const { service, requests, closes } = fixture(t, () => ({ closed: true }));
  const states = [];
  service.subscribe(state => states.push(state));
  t.mock.timers.tick(1500); await settle();
  assert.equal(states.at(-1).closed, true);
  assert.equal(closes.length, 0);
  t.mock.timers.tick(900);
  assert.equal(closes.length, 1);
  assert.equal(requests.filter(r => r.path === './api/state').length, 1);
});

test('a failed end request and temporary polling failure never close the Activity', async t => {
  let failing = true;
  const { service, closes, notices } = fixture(t, () => {
    if (failing) throw new Error('暂时无法连接');
    return { closed: false, status: 'paused' };
  });
  service.subscribe(() => {});
  await assert.rejects(service.action('end'), /暂时无法连接/);
  t.mock.timers.tick(1500); await settle();
  assert.match(notices.at(-1), /暂时无法连接/);
  failing = false;
  assert.equal((await service.action('pause')).status, 'paused');
  t.mock.timers.tick(10000); await settle();
  assert.equal(closes.length, 0);
});

test('leaving the page cancels pending auto-exit and ignores an in-flight poll', async t => {
  let resolvePoll;
  const { service, closes } = fixture(t, path => path === './api/state'
    ? new Promise(resolve => { resolvePoll = resolve; }) : { closed: true });
  const states = [];
  service.subscribe(state => states.push(state));
  t.mock.timers.tick(1500);
  await service.action('end');
  service.leave();
  resolvePoll({ closed: true }); await settle();
  t.mock.timers.tick(10000);
  assert.equal(closes.length, 0);
  assert.equal(states.length, 1);
});

test('an SDK close failure preserves the ended screen with a manual exit message', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const notices = [];
  const service = createRoomSession({
    login: { session: 'fake-session', state: { closed: true } },
    notice: text => notices.push(text), close: () => { throw new Error('unsupported client'); },
    fetchImpl: async () => ({ ok: true }),
  });
  t.after(() => service.leave());
  service.subscribe(() => {});
  t.mock.timers.tick(900);
  assert.match(notices.at(-1), /请手动关闭 Activity/);
});
