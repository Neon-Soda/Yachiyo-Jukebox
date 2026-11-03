import { searchSelection } from './search-options.js';
const previewArt = (color = '#6b599b', square = false) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${square ? 320 : 180}" viewBox="0 0 320 180"><defs><linearGradient id="g"><stop stop-color="${color}"/><stop offset="1" stop-color="#201a30"/></linearGradient></defs><path fill="url(#g)" d="M0 0h320v180H0z"/><circle cx="160" cy="90" r="65" fill="#171420"/><circle cx="160" cy="90" r="30" fill="${color}"/><text x="160" y="100" text-anchor="middle" fill="#f4e8ff" font-size="24">♪</text></svg>`)}`;

export function createPreview() {
  const state = { id: 'preview-room', channelName: '月光休息室', participants: 3, mode: 'sequence', currentId: 'one', status: 'playing', position: 46, serverTime: Date.now(), revision: 1, busy: false, closed: false, tracks: [
    { id: 'one', title: '把月光装进口袋', platform: 'BILIBILI', duration: 293, thumbnail: previewArt() },
    { id: 'two', title: '晚风途经你的窗', platform: 'YOUTUBE', duration: 241, thumbnail: previewArt('#99566b') },
    { id: 'three', title: '今夜还很长', platform: 'NETEASE', duration: 206, thumbnail: previewArt('#557d79', true) },
  ], events: [
    { id: 1, at: Date.now() - 120000, actor: '小月（示例）', message: '加入了《把月光装进口袋》' },
    { id: 2, at: Date.now() - 90000, actor: '阿岚（示例）', message: '加入了《晚风途经你的窗》' },
    { id: 3, at: Date.now() - 46000, actor: '点歌台', message: '已开始播放《把月光装进口袋》' },
  ] };
  let eventSequence = 3;
  let searchResults = [], pendingAdd;
  const modeNames = { sequence: '顺序播放', 'repeat-all': '列表循环', 'repeat-one': '单曲循环', shuffle: '随机播放' };
  const record = message => {
    state.events.push({ id: ++eventSequence, at: Date.now(), actor: '你（预览）', message });
    state.events = state.events.slice(-5);
  };
  let listener, last = Date.now();
  const send = () => { const now = Date.now(); if (state.status === 'playing') state.position = Math.min(state.tracks.find(t => t.id === state.currentId)?.duration ?? 0, state.position + (now - last) / 1000); last = now; state.serverTime = now; listener?.(structuredClone(state)); };
  const timer = setInterval(send, 1000);
  return {
    subscribe(fn) { listener = fn; send(); },
    leave() { clearInterval(timer); },
    async prepareAdd(input) {
      const url = new URL(input);
      const bilibili = url.pathname.includes('BV1BE411u7dT') && !url.searchParams.has('p');
      const season = url.pathname.includes('BV1CLHQ6zEss') && !url.searchParams.has('p');
      const singleOnly = url.searchParams.has('previewFallback');
      const youtube = /youtube\.com$|youtu\.be$/.test(url.hostname) && url.searchParams.has('list');
      const collection = bilibili || youtube || season || singleOnly ? {
        title: singleOnly ? '暂不可确认的合集（预览示例）' : season ? '是好康的哦，是新视频哦（预览示例）' : bilibili ? '月光唱片架 · 51P 音乐合集（预览示例）' : '今夜一起听 · YouTube 播放列表（预览示例）',
        count: singleOnly ? 1 : season ? 23 : bilibili ? 51 : 63, skipped: 0, singleOnly,
        kind: season ? 'bilibili-season' : bilibili ? 'bilibili-parts' : null,
        singleTitle: season || singleOnly ? '《怪物之歌》｜司凤版（预览示例）' : bilibili ? 'P1 · あかねさす頃（预览示例）' : '链接对应的歌曲（预览示例）',
        singleIsFirst: youtube && !url.searchParams.has('v') && url.pathname === '/playlist',
      } : null;
      pendingAdd = { previewId: crypto.randomUUID(), url: input, collection };
      return structuredClone(pendingAdd);
    },
    async search(query, selection) {
      const { platforms, perPlatform, total } = searchSelection(selection);
      const cover = (color, text) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g"><stop stop-color="${color}"/><stop offset="1" stop-color="#201a30"/></linearGradient></defs><path fill="url(#g)" d="M0 0h320v180H0z"/><circle cx="160" cy="90" r="65" fill="#171420"/><circle cx="160" cy="90" r="30" fill="${color}"/><text x="160" y="100" text-anchor="middle" fill="#f4e8ff" font-size="24">${text}</text></svg>`)}`;
      const colors = { BILIBILI: '#6b599b', YOUTUBE: '#99566b', NETEASE: '#557d79' };
      const versions = ['官方音乐版', '现场演唱版', '歌词版', '钢琴演奏版', '翻唱版', '不插电版', '吉他版', '合唱版', '纯音乐版', '特别舞台版'];
      const groups = platforms.map(platform => Array.from({ length: perPlatform }, (_, i) => ({
        id: `${platform}:preview-${i}`, platform, title: `${query} · ${versions[i]}（预览示例）`,
        uploader: platform === 'NETEASE' ? '月光歌手' : '今夜的旋律', duration: 241 + i * 17,
        url: platform === 'BILIBILI' ? `https://www.bilibili.com/video/BV1vb4y1b7RU/?preview=${i}` : platform === 'YOUTUBE' ? `https://www.youtube.com/watch?v=DYptgVvkVLQ&preview=${i}` : `https://music.163.com/song?id=1399788807&preview=${i}`,
        thumbnail: cover(colors[platform], '♪'),
      })));
      searchResults = [];
      for (let i = 0; i < perPlatform; i++) for (const group of groups) searchResults.push(group[i]);
      return { query, platforms, perPlatform, limit: total, results: structuredClone(searchResults), warnings: [] };
    },
    async action(type, data = {}) {
      if (state.closed) throw new Error('房间已结束，刷新预览即可开始新的示例。');
      const index = state.tracks.findIndex(t => t.id === state.currentId);
      const title = state.tracks[index]?.title;
      switch (type) {
        case 'pause': if (state.status === 'playing') { state.status = 'paused'; record(`暂停了《${title}》`); } break;
        case 'resume': state.currentId ??= state.tracks[0]?.id; if (state.currentId) { state.status = 'playing'; record(`继续播放《${state.tracks.find(t => t.id === state.currentId).title}》`); } break;
        case 'play': state.currentId = data.id; state.position = 0; state.status = 'playing'; record(`点播《${state.tracks.find(t => t.id === data.id).title}》`); break;
        case 'next': case 'previous': if (state.tracks.length) { state.currentId = state.tracks[(index + (type === 'next' ? 1 : -1) + state.tracks.length) % state.tracks.length].id; state.position = 0; record(`切换到${type === 'next' ? '下一首' : '上一首'}《${state.tracks.find(t => t.id === state.currentId).title}》`); } break;
        case 'seek': state.position = data.position; record(`将《${title}》定位到 ${Math.floor(data.position / 60)}:${String(Math.floor(data.position % 60)).padStart(2, '0')}`); break;
        case 'mode': state.mode = data.mode; record(`将播放方式改为${modeNames[data.mode]}`); break;
        case 'add': {
          const prepared = data.previewId === pendingAdd?.previewId ? pendingAdd : null;
          pendingAdd = null;
          const url = new URL(data.url);
          const platform = /bilibili\.com$|b23\.tv$/.test(url.hostname) ? 'BILIBILI' : /youtube\.com$|youtu\.be$/.test(url.hostname) ? 'YOUTUBE' : /music\.163\.com$/.test(url.hostname) ? 'NETEASE' : null;
          if (!platform || url.protocol !== 'https:') throw new Error('预览支持 B站、YouTube 和网易云 HTTPS 链接。');
          if (!data.single && prepared?.collection && !prepared.collection.singleOnly) {
            const { count, title: collectionTitle, kind, singleTitle } = prepared.collection;
            state.tracks.push(...Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), title: kind === 'bilibili-season' && index === 19 ? singleTitle : `${kind === 'bilibili-parts' ? 'P' : kind === 'bilibili-season' ? '合集视频 ' : '播放列表 '}${index + 1} · 合集示例曲目`, platform, duration: 180 + index, thumbnail: previewArt(platform === 'BILIBILI' ? '#6b599b' : '#99566b') })));
            record(`加入了合集《${collectionTitle}》，共 ${count} 首`); break;
          }
          const selected = searchResults.find(result => result.url === data.url);
          const track = { id: crypto.randomUUID(), title: selected?.title ?? prepared?.collection?.singleTitle ?? `新加入的旋律 · ${url.pathname.split('/').filter(Boolean).pop() ?? '示例歌曲'}`, platform, duration: selected?.duration ?? 240, thumbnail: selected?.thumbnail ?? previewArt() };
          state.tracks.push(track); record(`加入了《${track.title}》`); break;
        }
        case 'remove': { const removed = state.tracks.find(t => t.id === data.id); state.tracks = state.tracks.filter(t => t.id !== data.id); if (data.id === state.currentId) { state.currentId = state.tracks[0]?.id ?? null; state.position = 0; if (!state.currentId) state.status = 'idle'; } if (removed) record(`移除了《${removed.title}》`); break; }
        case 'move': { const i = state.tracks.findIndex(t => t.id === data.id), j = i + data.direction; if (i >= 0 && j >= 0 && j < state.tracks.length) { const moved = state.tracks[i]; [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]]; record(`将《${moved.title}》移到歌单第 ${j + 1} 位`); } break; }
        case 'clear': case 'end': { const count = state.tracks.length; state.tracks = []; state.currentId = null; state.position = 0; state.status = 'idle'; if (type === 'end') { state.closed = true; record('结束了本频道的点歌台'); } else if (count) record(`清空了歌单，共 ${count} 首`); break; }
      }
      state.revision++; last = Date.now(); send(); return structuredClone(state);
    },
  };
}
