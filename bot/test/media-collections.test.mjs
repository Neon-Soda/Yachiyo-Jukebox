import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expandMediaCollection, bilibiliCollection, youtubeCollection, MAX_QUEUE_TRACKS } from '../src/media-collections.mjs';
import { parseLink } from '../src/media.mjs';
import { JukeboxRoom } from '../src/jukebox-room.mjs';
import { createRoomActionHandler } from '../src/jukebox-actions.mjs';
import { createMusicSearch } from '../src/music-search.mjs';

const video = (count = 51) => ({ bvid: 'BV1BE411u7dT', title: '分P合集', pic: '//i0.hdslb.com/bfs/archive/test.jpg', pages: Array.from({ length: count }, (_, i) => ({ page: i + 1, part: `曲目 ${i + 1}`, duration: 200 + i })) });
const yt = (count = 63) => ({ title: 'YouTube playlist', entries: Array.from({ length: count }, (_, i) => ({ id: `video${String(i).padStart(6, '0')}`, title: `歌曲 ${i + 1}`, duration: 240 })) });
const bilibiliUrl = 'https://www.bilibili.com/video/BV1BE411u7dT/';
const youtubeUrl = 'https://www.youtube.com/watch?v=IFHlJUVo3gk&list=PLi8S45DX8W1K2sQtG-kn-n_ekKzuE9BjW';

function seasonVideo(count = 23, embeddedCount = count) {
  const episodes = Array.from({ length: count }, (_, i) => ({ bvid: `BV${String(i).padStart(10, '0')}`, title: `合集视频 ${i + 1}`, arc: { duration: 200, pic: '//i0.hdslb.com/bfs/archive/test.jpg' } }));
  episodes[19] = { ...episodes[19], bvid: 'BV1CLHQ6zEss', title: '《怪物之歌》｜司凤版' };
  return { bvid: 'BV1CLHQ6zEss', title: episodes[19].title, owner: { mid: 387326694 }, season_id: 7827948, pages: [{ page: 1, part: '怪物之歌', duration: 228 }],
    ugc_season: { id: 7827948, title: 'UP 主合集', ep_count: count, sections: [{ episodes: episodes.slice(0, embeddedCount) }] } };
}
const seasonUrl = 'https://www.bilibili.com/video/BV1CLHQ6zEss/';

test('one-P videos in an UP collection use WBI metadata and recheck new uploads on the next preparation', async () => {
  let count = 23, lookups = 0;
  const r = room({ expandCollection: parsed => expandMediaCollection(parsed, { fetchImpl: async input => {
    assert.equal(new URL(input).pathname, '/x/web-interface/wbi/view'); lookups++;
    return Response.json({ code: 0, data: seasonVideo(count) });
  } }) });
  const prepared = await r.prepareAdd(seasonUrl);
  assert.equal(prepared.collection.kind, 'bilibili-season'); assert.equal(prepared.collection.tracks.length, 23);
  assert.equal(new Set(prepared.collection.tracks.map(track => new URL(track.url).pathname)).size, 23);
  assert.equal(prepared.single.title, '《怪物之歌》｜司凤版'); assert.equal(prepared.single.url, seasonUrl + '?p=1');
  assert.equal(prepared.collection.tracks[19].url, prepared.single.url); assert.equal(r.tracks.length, 0);
  count = 24;
  assert.equal((await r.prepareAdd(seasonUrl)).collection.tracks.length, 24); assert.equal(lookups, 2);
  await r.add(seasonUrl, { prepared }); assert.equal(r.tracks.length, 23); assert.equal(lookups, 2);
});

test('Bilibili legacy view still works when WBI metadata is unavailable', async () => {
  const calls = [];
  const collection = await expandMediaCollection(parseLink(bilibiliUrl), { fetchImpl: async input => {
    calls.push(new URL(input).pathname);
    return input.includes('/wbi/') ? new Response('Unavailable', { status: 412 }) : Response.json({ code: 0, data: video() });
  } });
  assert.deepEqual(calls, ['/x/web-interface/wbi/view', '/x/web-interface/view']);
  assert.equal(collection.kind, 'bilibili-parts'); assert.equal(collection.tracks.length, 51);
});

function paginatedSeasonFetch(mode = 'complete') {
  const data = seasonVideo(35, 2), episodes = seasonVideo(35).ugc_season.sections[0].episodes;
  return async input => {
    const url = new URL(input);
    if (url.pathname === '/x/web-interface/wbi/view') return Response.json({ code: 0, data });
    assert.equal(url.pathname, '/x/polymer/web-space/seasons_archives_list');
    assert.equal(url.searchParams.get('mid'), '387326694'); assert.equal(url.searchParams.get('season_id'), '7827948');
    assert.equal(url.searchParams.get('sort_reverse'), 'false');
    const page = Number(url.searchParams.get('page_num'));
    if (mode === 'unavailable' && page === 2) return new Response('Unavailable', { status: 412 });
    const members = mode === 'repeat-page' && page === 2 ? episodes.slice(0, 5) : episodes.slice((page - 1) * 30, page * 30);
    return Response.json({ code: 0, data: { page: { page_num: page, total: mode === 'too-large' ? 501 : mode === 'changed-total' && page === 2 ? 36 : 35 },
      archives: members.map(episode => ({ bvid: episode.bvid, title: episode.title, duration: episode.arc.duration, pic: episode.arc.pic })) } });
  };
}

test('incomplete embedded UP collections fetch all pages in source order instead of only the current P', async () => {
  const collection = await expandMediaCollection(parseLink(seasonUrl), { fetchImpl: paginatedSeasonFetch() });
  assert.equal(collection.tracks.length, 35); assert.equal(collection.kind, 'bilibili-season');
  assert.equal(collection.tracks[19].url, seasonUrl + '?p=1');
  assert.equal(collection.tracks[34].url, 'https://www.bilibili.com/video/BV0000000034/?p=1');
  assert.equal(collection.tracks[34].title, '合集视频 35');
});

test('failed, duplicated or changing pages never import a partial UP collection', async () => {
  for (const mode of ['unavailable', 'repeat-page', 'changed-total', 'too-large']) {
    const r = room({ expandCollection: parsed => expandMediaCollection(parsed, { fetchImpl: paginatedSeasonFetch(mode) }) });
    await assert.rejects(r.add(seasonUrl), error => error.key === (mode === 'too-large' ? 'collectionTooLarge' : 'collectionReadFailed'));
    assert.equal(r.tracks.length, 0); assert.equal(r.audio.starts.length, 0);
  }
});

test('Bilibili exposes all 51 parts in source order with distinct URLs, titles and durations', () => {
  const collection = bilibiliCollection(video());
  assert.equal(collection.tracks.length, 51); assert.equal(collection.skipped, 0);
  assert.equal(collection.tracks[0].url, bilibiliUrl + '?p=1');
  assert.equal(collection.tracks[50].url, bilibiliUrl + '?p=51');
  assert.match(collection.tracks[1].title, /^P2/); assert.equal(collection.tracks[1].duration, 201);
  assert.match(collection.tracks[0].thumbnail, /^https:\/\/i0\.hdslb\.com\//);
});

test('Bilibili UGC sections become individual videos and unavailable entries are reported', () => {
  const data = video(1); data.ugc_season = { title: '合集', sections: [{ episodes: [{ bvid: 'BV1BE411u7dT', title: '一', arc: { duration: 200 } }, { bvid: 'BV1vb4y1b7RU', title: '二', arc: { duration: 250 } }, { bvid: 'invalid' }] }] };
  const collection = bilibiliCollection(data);
  assert.equal(collection.tracks.length, 2); assert.equal(collection.skipped, 1);
  assert.equal(collection.tracks[1].url, 'https://www.bilibili.com/video/BV1vb4y1b7RU/?p=1');
});

test('collection lookup falls back to the webpage and never silently adds only P1 after failure', async () => {
  let calls = 0;
  const collection = await expandMediaCollection(parseLink(bilibiliUrl), { fetchImpl: async () => {
    calls++; return calls === 1 ? new Response('<html>unavailable</html>', { status: 412 }) : new Response(`window.__INITIAL_STATE__=${JSON.stringify({ videoData: video() })};(function(){})`);
  } });
  assert.equal(collection.tracks.length, 51); assert.equal(calls, 3);
  await assert.rejects(expandMediaCollection(parseLink(bilibiliUrl), { fetchImpl: async () => { throw new Error('private upstream value'); } }), error => error.key === 'collectionReadFailed' && !error.message.includes('private upstream'));
});

test('an explicit Bilibili part remains a single song and short-link redirects cannot reach another site', async () => {
  assert.equal(await expandMediaCollection(parseLink(bilibiliUrl + '?p=2'), { fetchImpl: () => assert.fail('selected part needs no collection lookup') }), null);
  let calls = 0;
  await assert.rejects(expandMediaCollection(parseLink('https://b23.tv/example'), { fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }); } }));
  assert.equal(calls, 1);
});

test('YouTube enumerates all 63 entries as flat metadata with no list parameter on each playable URL', async () => {
  let seen;
  const collection = await expandMediaCollection(parseLink(youtubeUrl), { spawnProcess: (_command, args, options) => {
    seen = { args, options };
    const child = new EventEmitter(); child.stdout = new PassThrough();
    queueMicrotask(() => { child.stdout.end(JSON.stringify(yt())); child.emit('close', 0); }); return child;
  } });
  assert.equal(collection.tracks.length, 63); assert.equal(collection.skipped, 0);
  assert.ok(collection.tracks.every(track => !new URL(track.url).searchParams.has('list')));
  assert.ok(seen.args.includes('--flat-playlist')); assert.ok(seen.args.includes('--skip-download'));
  assert.equal(seen.args[seen.args.indexOf('--playlist-end') + 1], String(MAX_QUEUE_TRACKS + 1));
  assert.equal(seen.options.windowsHide, true);
});

test('collection limits and skipped items are explicit, including repeated YouTube videos', () => {
  const entry = yt(1).entries[0];
  const collection = youtubeCollection({ title: 'mixed', entries: [entry, entry, { ...entry, is_live: true }, { ...entry, duration: 7201 }, { ...entry, title: '[Private video]' }] });
  assert.equal(collection.tracks.length, 2); assert.equal(collection.skipped, 3);
  assert.throws(() => bilibiliCollection(video(501)), error => error.key === 'collectionTooLarge');
  assert.throws(() => youtubeCollection(yt(501)), error => error.key === 'collectionTooLarge');
});

test('a hanging playlist helper is bounded and terminated', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let killed = false;
  const pending = assert.rejects(expandMediaCollection(parseLink(youtubeUrl), { spawnProcess: () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => { killed = true; }; return child;
  } }), error => error.key === 'collectionReadFailed');
  t.mock.timers.tick(45000); await pending; assert.equal(killed, true);
});

class Audio extends EventEmitter {
  starts = [];
  async start(track) { this.starts.push(track.url); }
  stop() {} position() { return 0; } pause() { return true; } resume() { return true; }
}
function room(options = {}) { return new JukeboxRoom({ channelId: 'a', channelName: 'Test', audio: new Audio(), expandCollection: async track => track.platform === 'BILIBILI' ? bilibiliCollection(video()) : youtubeCollection(yt()), inspectTrack: () => assert.fail('collection entries must not all be pre-extracted'), ...options }); }

test('both collections add all 114 items, start the first one, and remain independently playable', async () => {
  const r = room(), action = createRoomActionHandler({ ensureVoice: async () => {} }), actor = { room: r, userId: 'one', displayName: '测试用户' };
  const first = await action(actor, { type: 'add', url: bilibiliUrl });
  assert.equal(first.count, 51); assert.match(r.events.find(event => event.actor === '测试用户').message, /51 首/);
  await action(actor, { type: 'add', url: youtubeUrl }); assert.equal(r.tracks.length, 114);
  assert.equal(r.audio.starts[0], bilibiliUrl + '?p=1');
  await r.next(); assert.equal(r.audio.starts.at(-1), bilibiliUrl + '?p=2');
  await r.play(r.tracks[50].id); assert.equal(r.audio.starts.at(-1), bilibiliUrl + '?p=51');
  await r.next(); assert.match(r.audio.starts.at(-1), /youtube\.com\/watch\?v=video000000$/);
});

test('clear and end prevent a late collection response from restoring songs', async () => {
  for (const method of ['clear', 'close']) {
    let finish;
    const r = room({ expandCollection: () => new Promise(resolve => { finish = resolve; }) });
    const adding = r.add(bilibiliUrl); r[method](); finish(bilibiliCollection(video()));
    await assert.rejects(adding, error => error.key === 'cancelled'); assert.equal(r.tracks.length, 0);
  }
});

test('insufficient capacity rejects the entire collection and search adds stay single', async () => {
  const r = room(); r.tracks = Array.from({ length: 470 }, (_, i) => ({ id: String(i) }));
  await assert.rejects(r.add(bilibiliUrl), error => error.key === 'collectionQueueFull'); assert.equal(r.tracks.length, 470);
  const single = room({ expandCollection: () => assert.fail('search results remain single'), inspectTrack: async track => ({ ...track, title: 'single', duration: 200 }) });
  await single.add(bilibiliUrl, { single: true }); assert.equal(single.tracks.length, 1);
});

test('room snapshots expose only registered same-origin artwork, keeping private media information out', async () => {
  const covers = createMusicSearch();
  const r = room({ coverFor: covers.registerCover });
  await r.add(bilibiliUrl);
  const snapshot = r.snapshot(); assert.match(snapshot.tracks[0].thumbnail, /^\.\/covers\/[a-f0-9]{24}$/);
  assert.ok(!JSON.stringify(snapshot).includes('https://')); assert.ok(!JSON.stringify(snapshot).includes('bfs/archive'));
});
