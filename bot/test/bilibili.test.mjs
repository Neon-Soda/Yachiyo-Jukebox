import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { inspect, parseLink, prepareDownload, prepareDownloadAlternatives } from '../src/media.mjs';
import { publicBilibiliInfo } from '../src/bilibili.mjs';

const link = () => parseLink('https://www.bilibili.com/video/BV1vb4y1b7RU/');
const metadata = JSON.stringify({ title: 'Test', duration: 292.687, formats: [{ url: 'https://media.example/audio?signature=private', format_id: '30280' }] });
function extractor(responses) {
  let calls = 0;
  return {
    get calls() { return calls; },
    spawnProcess() {
      const result = responses[calls++];
      assert.ok(result, 'unexpected extraction attempt');
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => {};
      process.nextTick(() => {
        child.stdout.end(result.out ?? ''); child.stderr.end(result.err ?? '');
        child.emit('close', result.code ?? 0);
      });
      return child;
    },
  };
}
const empty = { code: 1, err: 'ERROR: [BiliBili] No video formats found!' };

test('Bilibili retries transient empty formats and reuses metadata privately for download', async () => {
  const mock = extractor([empty, { out: metadata }]);
  const track = await inspect(link(), { spawnProcess: mock.spawnProcess, retryDelayMs: 0 });
  assert.equal(mock.calls, 2);
  const prepared = await prepareDownload(track, { inspectTrack: () => assert.fail('fresh metadata must not be extracted again') });
  assert.equal(prepared.input, metadata);
  assert.deepEqual(prepared.args.slice(-2), ['--load-info-json', '-']);
  assert.ok(!prepared.args.includes(track.url));
  assert.ok(!JSON.stringify(track).includes('signature'));
  assert.ok(!prepared.args.join(' ').includes('signature'));
});

test('Bilibili empty-format retries stop after three attempts without exposing stderr', async () => {
  const mock = extractor([empty, empty, empty]);
  await assert.rejects(inspect(link(), { spawnProcess: mock.spawnProcess, retryDelayMs: 0, fallback: async () => { const e = new Error('Unavailable'); e.key = 'extractFailed'; throw e; } }), e => e.key === 'extractFailed' && !e.message.includes('ERROR:'));
  assert.equal(mock.calls, 3);
});

test('Bilibili falls back only after bounded empty-format attempts and caches the result', async () => {
  const mock = extractor([empty, empty, empty]);
  let fallbacks = 0;
  const track = await inspect(link(), { spawnProcess: mock.spawnProcess, retryDelayMs: 0, fallback: async () => { fallbacks++; return JSON.parse(metadata); } });
  assert.equal(mock.calls, 3);
  assert.equal(fallbacks, 1);
  assert.equal((await prepareDownload(track)).input, metadata);
});

test('public Bilibili fallback preserves the selected part and refuses denied/partial audio', async () => {
  const video = { bvid: 'BV1vb4y1b7RU', title: 'Test', pages: [{ page: 1, cid: 111, duration: 292 }, { page: 2, cid: 222, duration: 100 }] };
  const play = { timelength: 100000, dash: { audio: [{ baseUrl: 'https://media.example/audio', id: 30280, mimeType: 'audio/mp4', codecs: 'mp4a.40.2', bandwidth: 192000 }] } };
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    return new Response(url.includes('/video/') ? `window.__INITIAL_STATE__=${JSON.stringify({ videoData: video })};(function(){})` : JSON.stringify({ code: 0, data: play }));
  };
  const info = await publicBilibiliInfo(parseLink(link().url + '?p=2'), { fetchImpl });
  assert.equal(info.duration, 100);
  assert.ok(requests[1].includes('cid=222'));
  assert.equal(info.formats[0].vcodec, 'none');
  await assert.rejects(publicBilibiliInfo(link(), { fetchImpl }), e => e.key === 'extractFailed');
  await assert.rejects(publicBilibiliInfo(link(), { fetchImpl: async () => new Response(JSON.stringify({ code: -403 })) }), e => e.key === 'extractFailed');
});

test('permission failures and other platforms are not retried as empty-format failures', async () => {
  for (const [track, response] of [[link(), { code: 1, err: 'HTTP Error 403: Forbidden' }], [parseLink('https://youtu.be/test'), empty]]) {
    const mock = extractor([response]);
    await assert.rejects(inspect(track, { spawnProcess: mock.spawnProcess, retryDelayMs: 0 }));
    assert.equal(mock.calls, 1);
  }
});

test('Bilibili initial-state extraction failures use the public metadata fallback once and preserve the private download cache', async () => {
  const mock = extractor([{ code: 1, err: 'ERROR: [BiliBili] Unable to extract initial state; private diagnostic' }]);
  let fallbacks = 0;
  const track = await inspect(link(), { spawnProcess: mock.spawnProcess, fallback: async () => { fallbacks++; return JSON.parse(metadata); } });
  assert.equal(mock.calls, 1); assert.equal(fallbacks, 1);
  assert.equal((await prepareDownload(track)).input, metadata);
  assert.equal(JSON.stringify(track).includes('private'), false);
});

test('public Bilibili audio metadata can use pagelist after a verification page and still rejects denied or truncated audio', async () => {
  const parts = [{ page: 1, cid: 111, duration: 228, part: '单曲标题' }, { page: 2, cid: 222, duration: 100, part: '第二P' }];
  const play = { timelength: 100000, dash: { audio: [{ baseUrl: 'https://media.example/audio', id: 30280, mimeType: 'audio/mp4', codecs: 'mp4a.40.2', bandwidth: 192000 }] } };
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    return new Response(url.includes('/video/') ? '<html>verification screen</html>' : JSON.stringify({ code: 0, data: url.includes('/pagelist?') ? parts : play }));
  };
  const info = await publicBilibiliInfo(parseLink(link().url + '?p=2'), { fetchImpl });
  assert.equal(info.duration, 100); assert.equal(info.formats.length, 1);
  assert.ok(requests.at(-1).includes('cid=222')); assert.match(info.title, /第二P/);
  await assert.rejects(publicBilibiliInfo(link(), { fetchImpl }), error => error.key === 'extractFailed');
  await assert.rejects(publicBilibiliInfo(link(), { fetchImpl: async url => url.includes('playurl') ? Response.json({ code: -403 }) : fetchImpl(url) }), error => error.key === 'extractFailed');
  await assert.rejects(publicBilibiliInfo(parseLink(link().url + '?p=3'), { fetchImpl }), error => error.key === 'extractFailed');
});

test('queued Bilibili metadata is refreshed after five minutes', async () => {
  const mock = extractor([{ out: metadata }, { out: metadata.replace('signature=private', 'signature=refreshed') }]);
  const track = await inspect(link(), { spawnProcess: mock.spawnProcess });
  const prepared = await prepareDownload(track, {
    now: Date.now() + 5 * 60 * 1000,
    inspectTrack: t => inspect(t, { spawnProcess: mock.spawnProcess }),
  });
  assert.equal(mock.calls, 2);
  assert.ok(prepared.input.includes('signature=refreshed'));
});

test('YouTube and NetEase retain their URL-based download path', async () => {
  for (const track of [parseLink('https://youtu.be/test'), parseLink('https://music.163.com/song?id=123')]) {
    const prepared = await prepareDownload(track);
    assert.equal(prepared.input, undefined);
    assert.deepEqual(prepared.args.slice(-2), ['--', track.url]);
  }
});

test('public Bilibili metadata retains only valid, distinct and bounded CDN backups in private download input', async () => {
  for (const field of ['backupUrl', 'backup_url']) {
    const audio = { base_url: 'https://media.example/main?signature=private', id: 30280, mime_type: 'audio/mp4', bandwidth: 192000,
      [field]: ['https://media.example/main?signature=private', 'https://backup.example/one?signature=private', 'https://backup.example/one?signature=private', 'http://unsafe.example/audio', 'https://user:secret@unsafe.example/audio', 'https://backup.example/two', 'https://backup.example/three'] };
    const fetchImpl = async url => url.includes('/video/') ? new Response('<html>verification screen</html>') : Response.json({ code: 0,
      data: url.includes('/pagelist?') ? [{ page: 1, cid: 111, duration: 200, part: 'Song' }] : { timelength: 200000, dash: { audio: [audio] } } });
    const info = await publicBilibiliInfo(link(), { fetchImpl });
    assert.deepEqual(info.formats[0]._bilibili_backup_urls, ['https://backup.example/one?signature=private', 'https://backup.example/two']);
    const mock = extractor([{ code: 1, err: 'Unable to extract initial state' }]);
    const track = await inspect(link(), { spawnProcess: mock.spawnProcess, fallback: async () => info });
    const prepared = await prepareDownload(track);
    const alternatives = await prepareDownloadAlternatives(track, prepared, { fallback: () => assert.fail('known backups require no new extraction') });
    assert.equal(alternatives.length, 2); assert.equal(JSON.parse(alternatives[0].input).formats[0].url, audio[field][1]);
    assert.equal(JSON.parse(alternatives[0].input).duration, 200);
    assert.equal(JSON.stringify(track).includes('signature'), false);
    assert.equal(alternatives.some(item => item.args.join(' ').includes('signature')), false);
    assert.equal(JSON.parse(prepared.input).formats[0].url, audio.base_url);
  }
});

test('Bilibili metadata without backups can refresh once via the public API; other platforms and denied responses do not gain alternatives', async () => {
  let refreshes = 0;
  const alternatives = await prepareDownloadAlternatives(link(), { input: metadata }, { timeoutMs: 1234, fallback: async (_track, options) => {
    refreshes++; assert.equal(options.timeoutMs, 1234);
    return { title: 'Fresh', duration: 292, formats: [{ url: 'https://cdn.example/new', vcodec: 'none', _bilibili_backup_urls: ['https://backup.example/new'] }] };
  } });
  assert.equal(refreshes, 1); assert.equal(alternatives.length, 2);
  assert.equal(JSON.parse(alternatives[1].input).formats[0].url, 'https://backup.example/new');
  const denied = new Error('denied');
  await assert.rejects(prepareDownloadAlternatives(link(), { input: metadata }, { fallback: async () => { throw denied; } }), error => error === denied);
  assert.deepEqual(await prepareDownloadAlternatives(parseLink('https://youtu.be/test'), {}, { fallback: () => assert.fail('other platforms must not call Bilibili') }), []);
});
