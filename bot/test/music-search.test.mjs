import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createMusicSearch, searchQuery, coverUrl, normalizeSearchResults } from '../src/music-search.mjs';
import { userError } from '../src/messages.mjs';
import { SEARCH_PLATFORMS, searchSelection, toggleSearchPlatform } from '../activity/web/search-options.js';

const bili = { bvid: 'BV1vb4y1b7RU', title: '歌名 <em class="keyword">歌手</em> &amp; &#x266b;', duration: '4:53', author: '上传者', pic: '//i0.hdslb.com/bfs/archive/cover.jpg' };
const youtube = { id: 'DYptgVvkVLQ', title: '歌曲', duration: 319, channel: '音乐频道' };
const netease = { id: 1399788807, name: '秒針を噛む', dt: 260800, ar: [{ name: 'ずっと真夜中でいいのに。' }], al: { picUrl: 'http://p2.music.126.net/album/cover.jpg' } };

test('search inputs are bounded keywords and cover URLs only allow known public image hosts', () => {
  assert.equal(searchQuery('  晴天   周杰伦  '), '晴天 周杰伦');
  for (const input of ['', ' ', null, [], 'a'.repeat(101), 'x\ny', 'https://example.com']) assert.throws(() => searchQuery(input), /歌名/);
  assert.equal(coverUrl('//i0.hdslb.com/bfs/archive/a.jpg'), 'https://i0.hdslb.com/bfs/archive/a.jpg');
  assert.equal(coverUrl('http://p2.music.126.net/cover.jpg'), 'https://p2.music.126.net/cover.jpg');
  for (const input of ['https://localhost/a', 'https://i0.hdslb.com.evil.test/a', 'https://i.ytimg.com@127.0.0.1/a', 'https://i.ytimg.com:123/a', 'file:///a', 'data:image/svg+xml,evil', 'https://p2.music.126.net.evil.test/cover.jpg']) assert.equal(coverUrl(input), null);
});

test('search metadata is normalized without trusting upstream HTML, video URLs, live or long entries', () => {
  const results = normalizeSearchResults('BILIBILI', [bili, bili, { ...bili, bvid: 'https://evil.test/' }, { ...bili, bvid: 'BV1Ggr9B6EDN', duration: '2:00:01' }]);
  assert.equal(results.length, 1); assert.equal(results[0].title, '歌名 歌手 & ♫'); assert.equal(results[0].duration, 293);
  assert.equal(results[0].url, 'https://www.bilibili.com/video/BV1vb4y1b7RU/');
  const yt = normalizeSearchResults('YOUTUBE', [{ ...youtube, is_live: true }, { ...youtube, live_status: 'is_upcoming' }, youtube]);
  assert.equal(yt.length, 1); assert.equal(yt[0].uploader, '音乐频道');
  assert.equal(yt[0].url, 'https://www.youtube.com/watch?v=DYptgVvkVLQ');
  assert.equal(normalizeSearchResults('YOUTUBE', [{ ...youtube, duration: undefined }])[0].duration, null);
  assert.equal(normalizeSearchResults('YOUTUBE', Array.from({ length: 10 }, (_, i) => ({ ...youtube, id: `video${String(i).padStart(6, '0')}` }))).length, 5);
});

test('three sources are searched, simultaneous keywords deduplicate, and cached results cannot be mutated by a client', async () => {
  let calls = 0, clock = 0;
  const service = createMusicSearch({ now: () => clock, providers: { BILIBILI: async () => { calls++; return [bili]; }, YOUTUBE: async () => { calls++; return [youtube]; }, NETEASE: async () => { calls++; return [netease]; } } });
  const [one, two] = await Promise.all([service.search('晴天'), service.search('晴天')]);
  assert.equal(calls, 3); assert.equal(one.results.length, 3); assert.deepEqual(one, two);
  assert.match(one.results[0].thumbnail, /^\.\/covers\/[a-f0-9]{24}$/);
  one.results[0].title = 'client edit';
  assert.notEqual((await service.search('晴天')).results[0].title, 'client edit');
  clock = 120001; await service.search('晴天'); assert.equal(calls, 6);
});

test('one source failure preserves the other source, is retryable, and does not expose upstream errors', async () => {
  let fail = true;
  const service = createMusicSearch({ providers: { BILIBILI: async () => { if (fail) throw new Error('private upstream credential'); return [bili]; }, YOUTUBE: async () => [youtube] } });
  const partial = await service.search('旋律');
  assert.equal(partial.results.length, 1); assert.match(partial.warnings[0], /Bilibili/);
  assert.ok(!JSON.stringify(partial).includes('private upstream'));
  fail = false; assert.equal((await service.search('旋律')).results.length, 2);
  const broken = createMusicSearch({ providers: { BILIBILI: async () => { throw new Error('secret'); }, YOUTUBE: async () => { throw new Error('secret'); } } });
  await assert.rejects(broken.search('歌'), error => !userError(error).includes('secret') && /所选平台/.test(userError(error)));
});

test('global in-flight searches are bounded while identical queries share the existing request', async () => {
  const releases = [];
  const provider = () => new Promise(resolve => releases.push(resolve));
  const service = createMusicSearch({ providers: { BILIBILI: provider, YOUTUBE: provider } });
  const one = service.search('一'), duplicate = service.search('一'), two = service.search('二');
  await assert.rejects(service.search('三'), /找歌的人/);
  releases.forEach(resolve => resolve([]));
  assert.deepEqual(await one, await duplicate); await two;
});

test('Bilibili uses a metadata lookup and cover bytes are fetched once through registered IDs', async () => {
  const requests = [];
  const service = createMusicSearch({
    spawnProcess: () => { throw new Error('YouTube unavailable'); },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/search/type')) return Response.json({ code: 0, data: { result: [bili] } });
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } });
    },
  });
  const result = await service.search('歌名', ['BILIBILI']);
  const id = result.results[0].thumbnail.split('/').at(-1);
  assert.equal((await service.cover(id)).type, 'image/jpeg');
  assert.equal((await service.cover(id)).bytes.length, 4);
  assert.equal(requests.length, 2); assert.equal(requests[1].options.redirect, 'error');
  assert.equal(await service.cover('https://127.0.0.1/private'), null);
  assert.equal(requests.length, 2);
});

test('YouTube search requests only flat metadata with a bounded result count and safe argument separation', async () => {
  let seen;
  const service = createMusicSearch({ fetchImpl: async () => { throw new Error('Bilibili unavailable'); }, spawnProcess: (command, args, options) => {
    seen = { command, args, options };
    const child = new EventEmitter(); child.stdout = new PassThrough();
    queueMicrotask(() => { child.stdout.end(JSON.stringify({ entries: [youtube] })); child.emit('close', 0); });
    return child;
  } });
  const result = await service.search('--exec 测试', ['YOUTUBE']);
  assert.equal(result.results.length, 1); assert.ok(seen.args.includes('--flat-playlist')); assert.ok(seen.args.includes('--skip-download'));
  assert.deepEqual(seen.args.slice(-2), ['--', 'ytsearch10:--exec 测试']);
  assert.equal(seen.options.windowsHide, true); assert.equal(seen.options.shell, undefined);
});

test('a hanging YouTube helper is terminated, with no unbounded background search', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let killed = false;
  const service = createMusicSearch({ fetchImpl: async () => { throw new Error('unavailable'); }, spawnProcess: () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => { killed = true; };
    return child;
  } });
  const pending = assert.rejects(service.search('歌名', ['YOUTUBE']), /所选平台/);
  await Promise.resolve();
  t.mock.timers.tick(25000); await pending;
  assert.equal(killed, true);
});

test('NetEase metadata preserves song identity, artist and full duration, with a bounded same-origin cover', () => {
  const results = normalizeSearchResults('NETEASE', [netease, netease, { ...netease, id: 'https://evil.test/' }, { ...netease, id: 123, dt: 7201000 }], 10);
  assert.equal(results.length, 1); assert.equal(results[0].duration, 260.8);
  assert.equal(results[0].title, '秒針を噛む'); assert.equal(results[0].uploader, 'ずっと真夜中でいいのに。');
  assert.equal(results[0].url, 'https://music.163.com/song?id=1399788807');
  assert.equal(results[0].thumbnail, 'https://p2.music.126.net/album/cover.jpg?param=160y160');
});

test('platform selection supports all, single and pair quotas and never becomes empty', () => {
  assert.deepEqual(searchSelection().platforms, SEARCH_PLATFORMS); assert.equal(searchSelection().total, 12);
  assert.equal(searchSelection(['NETEASE']).perPlatform, 10);
  assert.equal(searchSelection(['NETEASE', 'YOUTUBE']).perPlatform, 5);
  const single = toggleSearchPlatform(SEARCH_PLATFORMS, 'BILIBILI'); assert.deepEqual(single, ['BILIBILI']);
  const pair = toggleSearchPlatform(single, 'NETEASE'); assert.deepEqual(pair, ['BILIBILI', 'NETEASE']);
  assert.deepEqual(toggleSearchPlatform(pair, 'BILIBILI'), ['NETEASE']);
  assert.deepEqual(toggleSearchPlatform(['NETEASE'], 'NETEASE'), SEARCH_PLATFORMS);
  assert.deepEqual(toggleSearchPlatform(pair, 'all'), SEARCH_PLATFORMS);
  for (const input of [[], ['OTHER'], ['NETEASE', 'NETEASE'], 'NETEASE', null]) assert.throws(() => searchSelection(input));
});

test('all shows 12 results in rank order; singles search only that source for 10; pairs return 5 from each', async () => {
  const entries = {
    BILIBILI: Array.from({ length: 10 }, (_, i) => ({ ...bili, bvid: `BV${String(i).padStart(10, '0')}` })),
    YOUTUBE: Array.from({ length: 10 }, (_, i) => ({ ...youtube, id: `video${String(i).padStart(6, '0')}` })),
    NETEASE: Array.from({ length: 10 }, (_, i) => ({ ...netease, id: 2000000000 + i })),
  };
  for (const selected of [SEARCH_PLATFORMS, ['BILIBILI'], ['YOUTUBE'], ['NETEASE'], ['BILIBILI', 'YOUTUBE'], ['BILIBILI', 'NETEASE'], ['YOUTUBE', 'NETEASE']]) {
    const calls = [];
    const providers = Object.fromEntries(SEARCH_PLATFORMS.map(platform => [platform, async (_query, limit) => { calls.push({ platform, limit }); return entries[platform].slice(0, limit); }]));
    const result = await createMusicSearch({ providers }).search('歌名', selected);
    const expected = searchSelection(selected);
    assert.equal(result.results.length, expected.total); assert.equal(calls.length, selected.length);
    assert.deepEqual(calls.map(call => call.platform), expected.platforms);
    for (const platform of expected.platforms) assert.equal(result.results.filter(entry => entry.platform === platform).length, expected.perPlatform);
    assert.ok(calls.every(call => call.limit === expected.perPlatform));
    assert.deepEqual(result.results.slice(0, selected.length).map(entry => entry.platform), expected.platforms);
  }
});

test('selection changes reuse sufficient source metadata and keep results isolated by selected platforms', async () => {
  const calls = [];
  const entries = Array.from({ length: 10 }, (_, i) => ({ ...netease, id: 2000000000 + i }));
  const service = createMusicSearch({ providers: { BILIBILI: async () => [], YOUTUBE: async () => [], NETEASE: async (_query, limit) => { calls.push(limit); return entries.slice(0, limit); } } });
  assert.equal((await service.search('歌名', ['NETEASE'])).results.length, 10);
  const all = await service.search('歌名'); assert.equal(all.results.length, 4);
  assert.equal((await service.search('歌名', ['YOUTUBE', 'NETEASE'])).results.length, 5);
  assert.deepEqual(calls, [10]);
  await assert.rejects(service.search('歌名', ['EVIL']), error => error.key === 'invalidRequest');
});

test('NetEase searches public metadata without credentials and proxies its registered cover', async () => {
  const requests = [];
  const service = createMusicSearch({ fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/api/cloudsearch/pc')) return Response.json({ code: 200, result: { songs: [netease] } });
    return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpg' } });
  } });
  const result = await service.search('秒針', ['NETEASE']);
  assert.equal(requests[0].options.body.get('limit'), '10'); assert.equal(requests[0].options.headers.Cookie, undefined);
  assert.equal(requests[0].options.body.get('type'), '1');
  const image = await service.cover(result.results[0].thumbnail.split('/').at(-1));
  assert.equal(image.type, 'image/jpeg'); assert.equal(requests[1].options.headers.Referer, 'https://music.163.com/');
  assert.equal(requests[1].options.redirect, 'error');
});
