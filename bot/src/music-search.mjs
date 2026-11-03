import { copy as uiCopy } from './customization.mjs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { UserFacingError } from './messages.mjs';
import { searchSelection } from '../activity/web/search-options.js';
import { coverUrl } from './media-artwork.mjs';
export { coverUrl } from './media-artwork.mjs';

const labels = { BILIBILI: 'Bilibili', YOUTUBE: 'YouTube', NETEASE: uiCopy("room.06afc99e7dcd", "网易云") };
const clean = (text, max = 180) => String(text ?? '').replace(/<[^>]*>/g, '').replace(/&(amp|quot|apos|lt|gt|#39|#\d+|#x[\da-f]+);/gi, (match, entity) => {
  const known = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" };
  if (known[entity.toLowerCase()]) return known[entity.toLowerCase()];
  const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function searchQuery(input) {
  if (typeof input !== 'string' || input.length > 150 || /[\u0000-\u001f\u007f]/.test(input)) throw new UserFacingError('invalidSearch');
  const query = input.trim().replace(/\s+/g, ' ');
  if (!query || query.length > 100 || /^https?:\/\//i.test(query)) throw new UserFacingError('invalidSearch');
  return query;
}
function duration(value) {
  if (typeof value === 'string' && /^\d+(?::\d{1,2}){1,2}$/.test(value)) return value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function normalizeSearchResults(platform, entries, limit = 5) {
  const seen = new Set(), results = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(entry.live_status)) continue;
    const id = String(platform === 'BILIBILI' ? entry.bvid ?? '' : entry.id ?? '');
    const valid = platform === 'BILIBILI' ? /^BV[\da-zA-Z]{10}$/.test(id) : platform === 'YOUTUBE' ? /^[\w-]{11}$/.test(id) : platform === 'NETEASE' && /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
    if (!valid) continue;
    const milliseconds = entry.dt ?? entry.duration;
    const seconds = platform === 'NETEASE' ? duration(typeof milliseconds === 'number' ? milliseconds / 1000 : null) : duration(entry.duration);
    if (seen.has(id) || seconds > 7200) continue;
    const title = clean(platform === 'NETEASE' ? entry.name : entry.title);
    if (!title) continue;
    seen.add(id);
    let thumbnail = coverUrl(platform === 'BILIBILI' ? entry.pic : platform === 'NETEASE' ? (entry.al ?? entry.album)?.picUrl : `https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
    if (thumbnail && platform === 'BILIBILI') {
      const image = new URL(thumbnail);
      image.pathname = `${image.pathname.split('@')[0]}@320w_180h_1c.webp`;
      thumbnail = image.href;
    }
    if (thumbnail && platform === 'NETEASE') {
      const image = new URL(thumbnail); image.searchParams.set('param', '160y160'); thumbnail = image.href;
    }
    const artists = platform === 'NETEASE' ? (entry.ar ?? entry.artists ?? []).map(artist => artist?.name).filter(Boolean).join(' / ') : null;
    results.push({ id: `${platform}:${id}`, platform, title, duration: seconds,
      uploader: clean(artists ?? entry.author ?? entry.uploader ?? entry.channel, 80),
      url: platform === 'BILIBILI' ? `https://www.bilibili.com/video/${id}/` : platform === 'NETEASE' ? `https://music.163.com/song?id=${id}` : `https://www.youtube.com/watch?v=${id}`,
      thumbnail,
    });
    if (results.length === limit) break;
  }
  return results;
}
async function readLimited(response, limit) {
  if (!response.ok || Number(response.headers.get('content-length')) > limit) throw new Error('Upstream unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Upstream response too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function createMusicSearch({ fetchImpl = fetch, spawnProcess = spawn, now = Date.now, providers } = {}) {
  const cache = new Map(), pending = new Map(), sourceCache = new Map(), sourcePending = new Map(), covers = new Map(), coverPending = new Map();
  let active = 0, imageBytes = 0;
  async function bilibili(query) {
    const url = new URL('https://api.bilibili.com/x/web-interface/search/type');
    url.search = new URLSearchParams({ search_type: 'video', page: '1', page_size: '20', keyword: query });
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
      'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/', Cookie: `buvid3=${randomUUID()}infoc`,
    } });
    const data = JSON.parse((await readLimited(response, 2 * 1024 ** 2)).toString());
    if (data.code !== 0 || !Array.isArray(data.data?.result)) throw new Error('Bilibili unavailable');
    return data.data.result;
  }
  async function netease(query, limit) {
    const response = await fetchImpl('https://music.163.com/api/cloudsearch/pc', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://music.163.com/', 'User-Agent': 'Mozilla/5.0' },
      body: new URLSearchParams({ s: query, type: '1', offset: '0', limit: String(limit) }),
    });
    const data = JSON.parse((await readLimited(response, 2 * 1024 ** 2)).toString());
    if (data.code !== 200 || (!Array.isArray(data.result?.songs) && data.result?.songCount !== 0)) throw new Error('NetEase unavailable');
    return data.result.songs ?? [];
  }
  function youtube(query, limit) {
    return new Promise((resolve, reject) => {
      const args = ['--ignore-config', '--flat-playlist', '--dump-single-json', '--skip-download', '--no-warnings', '--socket-timeout', '12', '--retries', '0', '--playlist-end', String(limit)];
      if (process.env.YOUTUBE_COOKIES) args.push('--cookies', process.env.YOUTUBE_COOKIES);
      const child = spawnProcess('yt-dlp', [...args, '--', `ytsearch${limit}:${query}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      child.stdout.setEncoding('utf8');
      let output = '', settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('Search timed out')); }, 25000);
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.length > 1024 ** 2) { child.kill('SIGKILL'); finish(new Error('Search response too large')); }
      });
      child.on('error', () => finish(new Error('Search unavailable')));
      child.on('close', code => {
        if (settled) return;
        try {
          if (code !== 0) throw new Error('Search unavailable');
          const data = JSON.parse(output);
          if (!Array.isArray(data.entries)) throw new Error('Invalid search response');
          finish(null, data.entries);
        } catch { finish(new Error('Search unavailable')); }
      });
    });
  }
  const sources = providers ?? { BILIBILI: bilibili, YOUTUBE: youtube, NETEASE: netease };
  async function querySource(platform, query, limit) {
    const key = JSON.stringify([query.toLowerCase(), platform]);
    const hit = sourceCache.get(key);
    if (hit && hit.until > now() && hit.limit >= limit) return hit.entries;
    const requestKey = `${key}:${limit}`;
    if (sourcePending.has(requestKey)) return sourcePending.get(requestKey);
    const task = Promise.resolve().then(() => sources[platform](query, limit)).then(entries => {
      if (!Array.isArray(entries)) throw new Error('Invalid search response');
      const cached = sourceCache.get(key), available = Math.max(limit, Math.min(20, entries.length));
      if (!cached || cached.until <= now() || cached.limit <= available) sourceCache.set(key, { entries: entries.slice(0, 20), limit: available, until: now() + 2 * 60000 });
      while (sourceCache.size > 90) sourceCache.delete(sourceCache.keys().next().value);
      return entries;
    });
    sourcePending.set(requestKey, task);
    try { return await task; } finally { sourcePending.delete(requestKey); }
  }
  function removeCover(id) { imageBytes -= covers.get(id)?.bytes?.length ?? 0; covers.delete(id); }
  function registerCover(url) {
    if (!url) return null;
    const id = createHash('sha256').update(url).digest('hex').slice(0, 24);
    const item = covers.get(id) ?? { url };
    item.until = now() + 10 * 60000;
    covers.delete(id); covers.set(id, item);
    while (covers.size > 1000) removeCover(covers.keys().next().value);
    return `./covers/${id}`;
  }
  return {
    registerCover: url => registerCover(coverUrl(url)),
    async search(input, selection) {
      let options;
      try { options = searchSelection(selection); } catch { throw new UserFacingError('invalidRequest'); }
      const { platforms, perPlatform, total } = options;
      const query = searchQuery(input), key = JSON.stringify([query.toLowerCase(), platforms]);
      for (const [id, item] of covers) if (item.until < now()) removeCover(id);
      for (const [id, item] of cache) if (item.until < now()) cache.delete(id);
      const hit = cache.get(key);
      if (hit) return structuredClone(hit.result);
      if (pending.has(key)) return structuredClone(await pending.get(key));
      if (active >= 2) throw new UserFacingError('searchBusy');
      active++;
      const task = (async () => {
        const responses = await Promise.allSettled(platforms.map(platform => querySource(platform, query, perPlatform)));
        if (responses.every(response => response.status === 'rejected')) throw new UserFacingError('searchUnavailable');
        const groups = [], warnings = [];
        responses.forEach((response, index) => {
          const platform = platforms[index];
          if (response.status === 'rejected') { warnings.push(uiCopy("room.d533c9350e1a", "{value1} 暂时无法搜索，仍可选择其他已选平台的结果，或稍后重试。", { value1: labels[platform] })); groups.push([]); return; }
          groups.push(normalizeSearchResults(platform, response.value, perPlatform).map(result => ({ ...result, thumbnail: registerCover(result.thumbnail) })));
        });
        const results = [];
        for (let rank = 0; rank < perPlatform; rank++) for (const group of groups) if (group[rank]) results.push(group[rank]);
        const result = { query, platforms, perPlatform, limit: total, results, warnings };
        // Retry transient provider errors on the next search instead of caching them.
        if (!warnings.length) {
          cache.set(key, { until: now() + 2 * 60000, result });
          while (cache.size > 30) cache.delete(cache.keys().next().value);
        }
        return result;
      })();
      pending.set(key, task);
      try { return structuredClone(await task); }
      finally { active--; pending.delete(key); }
    },
    async cover(id) {
      const item = covers.get(id);
      if (!item || item.until < now()) { if (item) removeCover(id); return null; }
      if (item.bytes) return { bytes: item.bytes, type: item.type };
      if (coverPending.has(id)) return coverPending.get(id);
      if (coverPending.size >= 12) return null;
      const task = (async () => {
        try {
          const referer = new URL(item.url).hostname.endsWith('.music.126.net') ? 'https://music.163.com/' : new URL(item.url).hostname === 'i.ytimg.com' ? 'https://www.youtube.com/' : 'https://www.bilibili.com/';
          const response = await fetchImpl(item.url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Referer: referer } });
          const declaredType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          const type = declaredType === 'image/jpg' ? 'image/jpeg' : declaredType;
          if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(type)) return null;
          const bytes = await readLimited(response, 1024 ** 2);
          if (covers.get(id) === item) {
            item.bytes = bytes; item.type = type; imageBytes += bytes.length;
            for (const cover of covers.values()) {
              if (imageBytes <= 8 * 1024 ** 2) break;
              if (cover.bytes) { imageBytes -= cover.bytes.length; delete cover.bytes; }
            }
          }
          return { bytes, type };
        } catch { return null; }
      })();
      coverPending.set(id, task);
      try { return await task; } finally { coverPending.delete(id); }
    },
  };
}
