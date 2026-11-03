import { spawn } from 'node:child_process';
import { parseLink } from './media.mjs';
import { mediaArtwork } from './media-artwork.mjs';
import { UserFacingError } from './messages.mjs';

export const MAX_QUEUE_TRACKS = 500;
const text = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 150);
const bv = /^BV[\da-zA-Z]{10}$/;
const youtubeId = /^[\w-]{11}$/;
const headers = { Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' };
async function readText(response) {
  if (!response.ok) throw new Error('Unavailable');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8 * 1024 ** 2) throw new Error('Response too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function result(title, candidates, rawCount, kind = null) {
  if (rawCount > MAX_QUEUE_TRACKS) throw new UserFacingError('collectionTooLarge');
  const tracks = candidates.filter(track => track && !(track.duration > 7200));
  if (!tracks.length) throw new UserFacingError('collectionEmpty');
  return { title: text(title) || '未命名合集', tracks, skipped: rawCount - tracks.length, kind };
}
export function bilibiliCollection(video) {
  if (!video || !bv.test(video.bvid ?? '')) throw new UserFacingError('collectionReadFailed');
  if (video.rights?.is_stein_gate) throw new UserFacingError('unsupportedCollection');
  if (video.pages?.length > 1) return result(video.title, video.pages.map(part => {
    if (!Number.isSafeInteger(part.page) || part.page < 1) return null;
    return { platform: 'BILIBILI', url: `https://www.bilibili.com/video/${video.bvid}/?p=${part.page}`, title: text(`P${part.page} · ${part.part || video.title}`),
      duration: Number.isFinite(part.duration) ? part.duration : null, thumbnail: mediaArtwork(video.pic) };
  }), video.pages.length, 'bilibili-parts');
  const episodes = video.ugc_season?.sections?.flatMap(section => section.episodes ?? []) ?? [];
  if (episodes.length < 2) return null;
  return result(video.ugc_season.title ?? video.title, episodes.map(episode => {
    if (!bv.test(episode.bvid ?? '')) return null;
    return { platform: 'BILIBILI', url: `https://www.bilibili.com/video/${episode.bvid}/?p=1`, title: text(episode.title ?? episode.arc?.title),
      duration: Number.isFinite(episode.arc?.duration) ? episode.arc.duration : null, thumbnail: mediaArtwork(episode.arc?.pic ?? video.pic) };
  }), episodes.length, 'bilibili-season');
}

async function completeBilibiliSeason(video, fetchImpl, options) {
  const season = video.ugc_season;
  if (!season || video.pages?.length > 1) return video;
  const embedded = season.sections?.flatMap(section => section.episodes ?? []) ?? [];
  const expected = Number.isSafeInteger(season.ep_count) ? season.ep_count : null;
  if (expected > MAX_QUEUE_TRACKS) throw new UserFacingError('collectionTooLarge');
  if (embedded.length && (expected === null || embedded.length === expected)) return video;
  const mid = season.mid ?? video.owner?.mid, seasonId = season.id ?? video.season_id;
  if (!Number.isSafeInteger(mid) || mid < 1 || !Number.isSafeInteger(seasonId) || seasonId < 1) throw new UserFacingError('collectionReadFailed');
  const episodes = [], seen = new Set();
  let total;
  // Fetch missing members using the uploader's season, not the current video's P list.
  for (let page = 1; page <= Math.ceil(MAX_QUEUE_TRACKS / 30); page++) {
    const query = new URLSearchParams({ mid: String(mid), season_id: String(seasonId), sort_reverse: 'false', page_num: String(page), page_size: '30' });
    let data;
    try {
      const response = await fetchImpl(`https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?${query}`, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) });
      const payload = JSON.parse(await readText(response));
      if (payload.code === 0) data = payload.data;
    } catch {}
    const count = data?.page?.total;
    if (!Number.isSafeInteger(count) || count < 1 || !Array.isArray(data.archives) || !data.archives.length || (data.page.page_num != null && data.page.page_num !== page)) throw new UserFacingError('collectionReadFailed');
    if (count > MAX_QUEUE_TRACKS) throw new UserFacingError('collectionTooLarge');
    if (total !== undefined && count !== total) throw new UserFacingError('collectionReadFailed');
    total = count;
    for (const item of data.archives) {
      if (bv.test(item?.bvid ?? '')) {
        if (seen.has(item.bvid)) throw new UserFacingError('collectionReadFailed');
        seen.add(item.bvid);
      }
      episodes.push(item ? { bvid: item.bvid, title: item.title, arc: { duration: item.duration, pic: item.pic } } : {});
    }
    if (episodes.length > total) throw new UserFacingError('collectionReadFailed');
    if (episodes.length === total) return { ...video, ugc_season: { ...season, ep_count: total, sections: [{ episodes }] } };
  }
  throw new UserFacingError('collectionReadFailed');
}
export function youtubeCollection(data) {
  if (!Array.isArray(data.entries)) throw new UserFacingError('collectionReadFailed');
  return result(data.title, data.entries.map(entry => {
    if (!entry || !youtubeId.test(entry.id ?? '') || entry.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(entry.live_status) || entry.availability === 'private' || /^\[(?:private|deleted) video\]$/i.test(entry.title ?? '')) return null;
    return { platform: 'YOUTUBE', url: `https://www.youtube.com/watch?v=${entry.id}`, title: text(entry.title) || '未命名视频',
      duration: Number.isFinite(entry.duration) ? entry.duration : null, thumbnail: mediaArtwork(`https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`) };
  }), data.entries.length);
}
export async function expandMediaCollection(track, { fetchImpl = fetch, spawnProcess = spawn } = {}) {
  let url = new URL(track.url);
  if (track.platform === 'BILIBILI') {
    if (url.hostname === 'b23.tv') {
      for (let redirects = 0; redirects < 4 && url.hostname === 'b23.tv'; redirects++) {
        const response = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', headers, signal: AbortSignal.timeout(10000) });
        const location = response.headers.get('location');
        if (!location || response.status < 300 || response.status >= 400) throw new UserFacingError('collectionReadFailed');
        const next = parseLink(new URL(location, url).href);
        if (next.platform !== 'BILIBILI') throw new UserFacingError('collectionReadFailed');
        url = new URL(next.url);
      }
      if (url.hostname === 'b23.tv') throw new UserFacingError('collectionReadFailed');
      // Resolve short links even when they point to a selected part.
      track.url = url.href;
    }
    if (url.searchParams.has('p')) return null;
    const match = /^\/video\/(BV[\da-zA-Z]{10}|av\d+)\/?$/.exec(url.pathname);
    if (!match) return null;
    const options = { redirect: 'error', headers, signal: AbortSignal.timeout(60000) };
    const boundedOptions = () => ({ ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) });
    let video;
    const query = new URLSearchParams(match[1].startsWith('BV') ? { bvid: match[1] } : { aid: match[1].slice(2) });
    for (const endpoint of ['wbi/view', 'view']) {
      try {
        const data = JSON.parse(await readText(await fetchImpl(`https://api.bilibili.com/x/web-interface/${endpoint}?${query}`, boundedOptions())));
        if (data.code === 0 && bv.test(data.data?.bvid ?? '') && (!bv.test(match[1]) || data.data.bvid === match[1])) { video = data.data; break; }
      } catch {}
    }
    if (!video) {
      try {
        const webpage = await readText(await fetchImpl(`https://www.bilibili.com/video/${match[1]}/`, boundedOptions()));
        const state = /window\.__INITIAL_STATE__\s*=\s*(.*?);\s*\(function/s.exec(webpage);
        video = state && JSON.parse(state[1]).videoData;
      } catch {}
    }
    if (!video && bv.test(match[1])) {
      // The view endpoint/page can temporarily return a verification screen
      // while the public part list remains available. One part cannot rule out
      // an unreadable UGC collection: offer an explicit single-only choice.
      try {
        const data = JSON.parse(await readText(await fetchImpl(`https://api.bilibili.com/x/player/pagelist?bvid=${match[1]}&jsonp=jsonp`, boundedOptions())));
        if (data.code === 0 && Array.isArray(data.data) && data.data.length > 1) video = { bvid: match[1], title: 'Bilibili 分 P 合集', pages: data.data };
        else if (data.code === 0 && Array.isArray(data.data) && data.data.length === 1 && data.data[0].page === 1 && Number.isFinite(data.data[0].duration) && data.data[0].duration > 0) {
          const part = data.data[0];
          if (part.duration > 7200) throw new UserFacingError('tooLong');
          return { title: text(part.part) || '链接中的视频', singleOnly: true, skipped: 0, tracks: [{ platform: 'BILIBILI', url: `https://www.bilibili.com/video/${match[1]}/?p=1`, title: text(part.part) || '链接中的视频', duration: part.duration, thumbnail: null }] };
        }
      } catch (error) { if (error instanceof UserFacingError) throw error; }
    }
    if (!video) throw new UserFacingError('collectionReadFailed');
    return bilibiliCollection(await completeBilibiliSeason(video, fetchImpl, options));
  }
  if (track.platform !== 'YOUTUBE' || !url.searchParams.has('list')) return null;
  const list = url.searchParams.get('list');
  if (!/^[\w-]{10,100}$/.test(list ?? '')) throw new UserFacingError('invalidLink');
  return new Promise((resolve, reject) => {
    const args = ['--ignore-config', '--yes-playlist', '--flat-playlist', '--skip-download', '--dump-single-json', '--no-warnings', '--socket-timeout', '12', '--retries', '0', '--playlist-end', String(MAX_QUEUE_TRACKS + 1)];
    if (process.env.YOUTUBE_COOKIES) args.push('--cookies', process.env.YOUTUBE_COOKIES);
    const child = spawnProcess('yt-dlp', [...args, '--', `https://www.youtube.com/playlist?list=${list}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.setEncoding('utf8');
    let output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new UserFacingError('collectionReadFailed')); }, 45000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 8 * 1024 ** 2) { child.kill('SIGKILL'); finish(new UserFacingError('responseTooLarge')); } });
    child.on('error', () => finish(new UserFacingError('extractorMissing')));
    child.on('close', code => {
      if (settled) return;
      try { if (code !== 0) throw new UserFacingError('collectionReadFailed'); finish(null, youtubeCollection(JSON.parse(output))); }
      catch (error) { finish(error instanceof UserFacingError ? error : new UserFacingError('collectionReadFailed')); }
    });
  });
}
