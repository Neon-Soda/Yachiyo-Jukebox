import { copy as uiCopy } from '../../shared/customization.mjs';
import { applyTheme, defaultCover } from './theme.js';
import { createNotificationFeed } from './notifications.js?v=operation-notices-1';
import { SEARCH_PLATFORMS, searchSelection, toggleSearchPlatform } from './search-options.js';

const $ = id => document.getElementById(id);
const modeLabels = () => ({ sequence: ['⇢', uiCopy("activity.5bbcac595bc6", "顺序播放")], 'repeat-all': ['↻', uiCopy("activity.2fe0943eacb3", "列表循环")], 'repeat-one': ['↺₁', uiCopy("activity.8cde791504d2", "单曲循环")], shuffle: ['⤨', uiCopy("activity.f34b7ce61098", "随机播放")] });
const platformLabels = () => ({ BILIBILI: uiCopy('activity.platform_bilibili', 'BILIBILI'), YOUTUBE: uiCopy('activity.platform_youtube', 'YOUTUBE'), NETEASE: uiCopy("activity.4a366fb92e53", "网易云音乐") });
const time = value => { const n = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
let service, state, receivedAt = performance.now(), seeking = false, lastPlaylist = '', confirmAction, playlistPage = 0, currentArtwork = '';
const searchState = { results: [], platforms: [...SEARCH_PLATFORMS], query: '', generation: 0, busy: false, request: null, adding: null, added: new Set() };
const linkState = { checking: false, adding: false, pending: null };
const notifications = createNotificationFeed({
  list: $('operation-history'), empty: $('operation-empty'),
  toastHost: () => document.querySelector('dialog[open] .toast-region') ?? $('toast-region'),
});
const connectAsset = typeof ACTIVITY_CONNECT_ASSET === 'string' ? ACTIVITY_CONNECT_ASSET : './connect.js?v=startup-fix-1';

function startupFailure(message = uiCopy("activity.ea6bce19dfee", "界面初始化失败，请关闭后重新打开点歌台。")) {
  if ($('room-name')) $('room-name').textContent = uiCopy("activity.89c4766afc85", "连接失败");
  if ($('track-subtitle')) $('track-subtitle').textContent = message;
  if ($('notice')) $('notice').textContent = message;
}
window.addEventListener('error', () => { if (!state) startupFailure(); });
window.addEventListener('unhandledrejection', () => { if (!state) startupFailure(); });

function notice(message = '') { $('notice').textContent = message; }
async function action(type, data = {}) {
  if (!service) { notice(uiCopy("activity.e6f03404ead9", "尚未连接成功，请先完成 Discord 登录。")); return false; }
  try { notice(); const next = await service.action(type, data); if (next) render(next); return true; }
  catch (error) { notice(error.message || uiCopy("activity.d2b818113a29", "这次操作没有完成，请稍后再试。")); return false; }
}
function render(next) {
  if (state?.id === next.id && next.revision < state.revision) return;
  state = next; receivedAt = performance.now();
  notifications.render(state);
  const track = state.tracks.find(t => t.id === state.currentId);
  const artwork = track?.thumbnail || defaultCover();
  if (artwork !== currentArtwork) {
    currentArtwork = artwork;
    $('track-cover').hidden = !artwork; $('artwork-stage').classList.toggle('has-cover', Boolean(artwork));
    if (artwork) $('track-cover').src = artwork; else $('track-cover').removeAttribute('src');
  }
  const playing = state.status === 'playing';
  $('room-name').textContent = state.channelName;
  $('track-title').textContent = state.closed ? uiCopy("activity.dd166b36884f", "这一场，先轻轻谢幕。") : track?.title ?? uiCopy("activity.40d19cd46c26", "今晚，想听哪一首？");
  $('platform').textContent = track ? platformLabels()[track.platform] ?? uiCopy("activity.08d5f92ca9e9", "MUSIC") : uiCopy("activity.a68a0e327568", "YOUR LITTLE MUSIC ROOM");
  $('track-subtitle').textContent = state.closed ? uiCopy("activity.dd29e49d530a", "重新打开点歌台，就能开始一份新歌单。") : state.status === 'loading' ? uiCopy("activity.16e945e90af3", "正在准备这一曲，马上就好。") : track ? uiCopy("activity.f6cc4ac99ee4", "让旋律陪我们待一会儿。♪") : uiCopy("activity.c9aa5cfc59b4", "把喜欢的旋律交给我吧。♪");
  $('playback-status').textContent = state.closed ? uiCopy("activity.d79b1d0e5c61", "已结束") : ({ playing: uiCopy("activity.e6666b2eb332", "正在播放"), paused: uiCopy("activity.eb0c326b60ae", "已暂停"), loading: uiCopy("activity.b53be09930f4", "准备中"), idle: uiCopy("activity.aa156aa67a6d", "等待点歌") })[state.status];
  $('record').classList.toggle('playing', playing);
  $('play-icon').toggleAttribute('hidden', playing); $('pause-icon').toggleAttribute('hidden', !playing);
  $('play-pause').ariaLabel = playing ? uiCopy("activity.8d12fc0d4eb2", "暂停") : uiCopy("activity.c3396195e91c", "播放"); $('play-pause').title = playing ? uiCopy("activity.8d12fc0d4eb2", "暂停") : uiCopy("activity.c3396195e91c", "播放");
  $('play-pause').disabled = state.closed || state.status === 'loading' || !state.tracks.length;
  $('previous').disabled = $('next').disabled = state.closed || !state.tracks.length;
  $('mode').disabled = state.closed;
  $('progress').disabled = state.closed || !track?.duration || state.status === 'loading';
  $('progress').max = track?.duration || 100;
  $('duration').textContent = time(track?.duration);
  const [icon, label] = modeLabels()[state.mode];
  $('mode-icon').textContent = icon; $('mode-label').textContent = label; $('mode').title = label;
  $('mode').classList.toggle('active', state.mode !== 'sequence');
  $('track-count').textContent = $('sheet-count').textContent = state.tracks.length;
  $('member-count').textContent = state.closed ? uiCopy("activity.f55ff7e7510c", "房间会话已结束") : uiCopy("activity.20473bc27a72", "{participants} 人正在使用", { participants: state.participants });
  updateLinkControls();
  $('end-room').disabled = state.closed;
  $('clear-playlist').disabled = state.closed || !state.tracks.length;
  updateSearchControls();
  if (state.closed && $('search-dialog').open) $('search-dialog').close();
  if (state.closed && $('collection-dialog').open) $('collection-dialog').close();
  if (state.error) notice(state.error);
  const playlistKey = JSON.stringify([state.tracks, state.currentId]);
  if (playlistKey !== lastPlaylist) { lastPlaylist = playlistKey; renderPlaylist(); }
  renderProgress();
}
function renderProgress() {
  if (!state || seeking) return;
  const duration = state.tracks.find(t => t.id === state.currentId)?.duration ?? 0;
  const elapsed = state.position + (state.status === 'playing' ? (performance.now() - receivedAt) / 1000 : 0);
  $('progress').value = Math.min(duration, elapsed);
  $('progress').style.setProperty('--progress', `${duration ? Math.min(100, elapsed / duration * 100) : 0}%`);
  $('elapsed').textContent = time(elapsed);
}
function button(label, text, run, className = 'icon-button') {
  const button = document.createElement('button'); button.type = 'button'; button.className = className;
  button.ariaLabel = button.title = label; button.textContent = text; button.onclick = run; return button;
}
function renderPlaylist() {
  $('playlist').replaceChildren(); $('playlist-empty').hidden = state.tracks.length > 0;
  const pages = Math.max(1, Math.ceil(state.tracks.length / 50));
  playlistPage = Math.min(playlistPage, pages - 1);
  $('playlist-pagination').hidden = pages === 1;
  $('playlist-page-label').textContent = uiCopy("activity.f338a7ebf6a4", "第 {value1} / {pages} 页 · 每页 50 首", { value1: playlistPage + 1, pages: pages });
  $('playlist-prev-page').disabled = playlistPage === 0; $('playlist-next-page').disabled = playlistPage >= pages - 1;
  state.tracks.slice(playlistPage * 50, playlistPage * 50 + 50).forEach((track, offset) => {
    const index = playlistPage * 50 + offset;
    const row = document.createElement('div'); row.className = `playlist-row${track.id === state.currentId ? ' current' : ''}`;
    const select = button(uiCopy("activity.b15227b1c946", "播放 {title}", { title: track.title }), '', () => action('play', { id: track.id }), 'song-select');
    const number = document.createElement('span'); number.className = 'song-number'; number.textContent = track.id === state.currentId ? '♫' : String(index + 1).padStart(2, '0');
    const details = document.createElement('span'); details.className = 'song-details';
    const title = document.createElement('strong'); title.textContent = track.title;
    const meta = document.createElement('small'); meta.textContent = `${platformLabels()[track.platform] ?? uiCopy("activity.db9514212493", "音乐")} · ${time(track.duration)}`;
    details.append(title, meta); select.append(number);
    if (track.thumbnail || defaultCover()) {
      const image = document.createElement('img'); image.className = 'playlist-cover'; image.src = track.thumbnail || defaultCover(); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.onerror = () => image.remove(); select.append(image);
    }
    select.append(details);
    const moves = document.createElement('span'); moves.className = 'song-actions';
    const up = button(uiCopy("activity.23b39424a795", "向前移动"), '↑', () => action('move', { id: track.id, direction: -1 })); up.disabled = index === 0;
    const down = button(uiCopy("activity.9f3d235d58da", "向后移动"), '↓', () => action('move', { id: track.id, direction: 1 })); down.disabled = index === state.tracks.length - 1;
    moves.append(up, down);
    row.append(select, moves, button(uiCopy("activity.f24f7e5e2fbc", "移除 {title}", { title: track.title }), '×', () => action('remove', { id: track.id }), 'icon-button remove-song'));
    $('playlist').append(row);
  });
}
$('track-cover').onerror = () => { const fallback = defaultCover(); if (fallback && $('track-cover').src !== fallback) { $('track-cover').src = fallback; return; } $('track-cover').hidden = true; $('artwork-stage').classList.remove('has-cover'); };
$('playlist-prev-page').onclick = () => { if (playlistPage > 0) { playlistPage--; renderPlaylist(); $('playlist').scrollTop = 0; } };
$('playlist-next-page').onclick = () => { if ((playlistPage + 1) * 50 < state.tracks.length) { playlistPage++; renderPlaylist(); $('playlist').scrollTop = 0; } };
function confirm(title, text, run, clearing = false) {
  $('confirm-title').textContent = title; $('confirm-text').textContent = text;
  $('confirm-yes').textContent = clearing ? uiCopy("activity.3c7a4fb3566d", "确认清空") : uiCopy("activity.65a1e36a1baf", "确认结束");
  confirmAction = run; $('confirm-dialog').showModal();
}
function updateLinkControls() {
  const disabled = !service || !state || state.closed || state.busy || linkState.checking || linkState.adding || Boolean(linkState.pending);
  $('song-link').disabled = $('add-button').disabled = disabled;
  $('add-button').textContent = linkState.adding ? uiCopy("activity.56d3b7cbe694", "正在加入…") : linkState.checking ? uiCopy("activity.dd44ca603959", "正在识别链接…") : state?.busy ? uiCopy("activity.b2e9f0ccbdcb", "正在找歌…") : uiCopy("activity.194475ac14b0", "加入歌单 ＋");
}
async function commitLink(pending, single) {
  if (!pending || linkState.adding || state?.closed) return;
  linkState.pending = null;
  if ($('collection-dialog').open) $('collection-dialog').close();
  linkState.adding = true; updateLinkControls();
  try {
    if (await action('add', { url: pending.url, previewId: pending.previewId, single })) {
      if ($('song-link').value.trim() === pending.url) $('song-link').value = '';
    }
  } finally { linkState.adding = false; updateLinkControls(); }
}
async function submitLink() {
  const url = $('song-link').value.trim();
  if (!url || !service || !state || state.closed || state.busy || linkState.checking || linkState.adding || linkState.pending) return;
  linkState.checking = true; updateLinkControls(); notice();
  try {
    const result = await service.prepareAdd(url);
    if (state.closed) return;
    const pending = { url, previewId: result.previewId };
    if (!result.collection) { await commitLink(pending, true); return; }
    linkState.pending = pending;
    const collection = result.collection;
    $('collection-title').textContent = collection.singleOnly ? uiCopy("activity.d8ed4ca5cf23", "先听这一首？") : collection.kind === 'bilibili-season' ? uiCopy("activity.d98788d8cd93", "发现一个 UP 主合集") : collection.kind === 'bilibili-parts' ? uiCopy("activity.af71bdb5bc52", "发现一个分 P 合集") : uiCopy("activity.4cf86e0dc04c", "发现一个合集");
    $('collection-name').textContent = collection.title;
    $('collection-summary').textContent = collection.singleOnly ? uiCopy("activity.05e72e38cdc1", "暂时无法确认完整合集信息，你仍可单独加入这个视频。") : collection.kind === 'bilibili-season' ? uiCopy("activity.8c7ccb1df815", "UP 主合集当前可加入 {count} 个视频。选择链接中的这一首，或按合集顺序全部加入。", { count: collection.count }) : uiCopy("activity.e5d9d6520c0e", "这个链接属于一个合集，可加入 {count} 首。你想听哪一部分？", { count: collection.count });
    $('collection-all').hidden = collection.singleOnly === true;
    $('collection-single-label').textContent = collection.singleIsFirst ? uiCopy("activity.1cdbb9b3ffda", "只加入第一首") : uiCopy("activity.4ef2dbac0613", "只加入这一首");
    $('collection-single-title').textContent = collection.singleTitle;
    $('collection-all-summary').textContent = uiCopy("activity.61fc4654e1fe", "{count} 首，按原顺序加入{value2}", { count: collection.count, value2: collection.skipped ? uiCopy("activity.83f4dab2e86f", " · 已略过 {skipped} 个不可用或超长条目", { skipped: collection.skipped }) : '' });
    $('collection-dialog').showModal();
  } catch (error) { notice(error.message || uiCopy("activity.0ee946ea5f9f", "这次没能识别链接，请稍后再试。")); }
  finally { linkState.checking = false; updateLinkControls(); }
}
$('collection-single').onclick = () => commitLink(linkState.pending, true);
$('collection-all').onclick = () => commitLink(linkState.pending, false);
$('close-collection').onclick = $('collection-cancel').onclick = () => $('collection-dialog').close();
$('collection-dialog').addEventListener('close', () => { linkState.pending = null; updateLinkControls(); });
function updateSearchControls() {
  const unavailable = !service || !state || state.closed;
  $('search-query').disabled = unavailable || searchState.busy;
  $('search-button').disabled = unavailable || searchState.busy;
  $('search-button').textContent = searchState.busy ? uiCopy("activity.c37059a3d9df", "正在搜索…") : uiCopy("activity.c01a4d18b45e", "搜索歌曲 ⌕");
  for (const control of $('search-filters').querySelectorAll('button')) control.disabled = unavailable || Boolean(searchState.adding);
  for (const control of $('search-results').querySelectorAll('.search-add')) {
    const added = searchState.added.has(control.dataset.resultId);
    control.disabled = unavailable || state.busy || Boolean(searchState.adding) || added;
    control.textContent = added ? uiCopy("activity.8f40c463c20b", "已加入 ✓") : searchState.adding === control.dataset.resultId ? uiCopy("activity.b1d87f6c28cc", "加入中…") : uiCopy("activity.f362cfc20fdb", "＋ 加入");
  }
}
async function addSearchResult(result) {
  if (searchState.adding || searchState.added.has(result.id) || state?.busy || state?.closed) return;
  searchState.adding = result.id; updateSearchControls();
  $('search-status').textContent = uiCopy("activity.2e9764abbf75", "正在把《{title}》加入歌单…", { title: result.title });
  const ok = await action('add', { url: result.url, single: true });
  searchState.adding = null;
  if (ok) { searchState.added.add(result.id); $('search-status').textContent = uiCopy("activity.8f8575f6623b", "已加入歌单，可以继续选歌。"); }
  else $('search-status').textContent = $('notice').textContent || uiCopy("activity.87d66ad239bb", "这首暂时没能加入，请再试一次。");
  updateSearchControls();
}
function renderSearchResults() {
  $('search-results').replaceChildren();
  const all = searchState.platforms.length === 3;
  for (const control of $('search-filters').querySelectorAll('button')) control.setAttribute('aria-pressed', String(control.dataset.platform === 'all' ? all : !all && searchState.platforms.includes(control.dataset.platform)));
  const results = searchState.results;
  if (!results.length && !searchState.busy) {
    const empty = document.createElement('p'); empty.className = 'search-empty';
    empty.textContent = uiCopy("activity.cd45813af643", "这次还没找到合适的版本，换个歌名或加上歌手再试试。");
    $('search-results').append(empty);
  }
  for (const result of results) {
    const row = document.createElement('div'); row.className = 'search-result';
    const artwork = document.createElement('div'); artwork.className = 'search-cover'; artwork.textContent = '♫';
    if (result.thumbnail || defaultCover()) {
      const image = document.createElement('img'); image.src = result.thumbnail || defaultCover(); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => image.remove(); artwork.append(image);
    }
    const length = document.createElement('span'); length.className = 'search-duration'; length.textContent = result.duration == null ? uiCopy("activity.68d816633537", "时长未知") : time(result.duration); artwork.append(length);
    const details = document.createElement('div'); details.className = 'search-details';
    const title = document.createElement('strong'); title.textContent = result.title;
    const meta = document.createElement('small'); meta.textContent = `${platformLabels()[result.platform] ?? uiCopy("activity.db9514212493", "音乐")}${result.uploader ? ` · ${result.uploader}` : ''}`;
    details.append(title, meta);
    const add = button(uiCopy("activity.f76fb7c2ec9a", "加入 {title}", { title: result.title }), uiCopy("activity.f362cfc20fdb", "＋ 加入"), () => addSearchResult(result), 'search-add'); add.dataset.resultId = result.id;
    row.append(artwork, details, add); $('search-results').append(row);
  }
  updateSearchControls();
}
async function performSearch(query, newQuery = false) {
  if (!query || !service || !state || state.closed || searchState.adding) return;
  const generation = ++searchState.generation;
  const { platforms, perPlatform, total } = searchSelection(searchState.platforms);
  searchState.query = query; searchState.busy = true; searchState.results = [];
  if (newQuery) searchState.added.clear();
  const names = platforms.map(platform => platformLabels()[platform]).join('、');
  $('search-summary').textContent = `「${query}」· ${platforms.length === 1 ? uiCopy("activity.a483e6303ea2", "单平台 {perPlatform} 首", { perPlatform: perPlatform }) : uiCopy("activity.7451ccc32695", "{length} 个平台各 {perPlatform} 首，共 {total} 首", { length: platforms.length, perPlatform: perPlatform, total: total })}`;
  $('search-status').textContent = uiCopy("activity.daec3bcce471", "正在 {names} 寻找旋律…", { names: names });
  $('search-results').setAttribute('aria-busy', 'true'); renderSearchResults();
  if (!$('search-dialog').open) $('search-dialog').showModal();
  // Rapid platform changes wait for the current lookup, then only the latest
  // selection runs. Older responses cannot overwrite the selected platforms.
  if (searchState.request) await searchState.request.catch(() => {});
  if (generation !== searchState.generation || state.closed) return;
  const request = service.search(query, platforms);
  searchState.request = request;
  try {
    const result = await request;
    if (generation !== searchState.generation || state.closed) return;
    searchState.results = result.results;
    $('search-status').textContent = result.warnings?.join(' ') || (result.results.length ? uiCopy("activity.650f29544d73", "找到 {length} 个版本，选择喜欢的加入歌单。", { length: result.results.length }) : uiCopy("activity.e99811a69d56", "没有找到结果。"));
  } catch (error) {
    if (generation === searchState.generation) $('search-status').textContent = error.message || uiCopy("activity.4780fe445bc4", "搜索暂时没有完成，请稍后重试。");
  } finally {
    if (searchState.request === request) searchState.request = null;
    if (generation === searchState.generation) { searchState.busy = false; $('search-results').setAttribute('aria-busy', 'false'); renderSearchResults(); }
  }
}
$('search-form').onsubmit = event => {
  event.preventDefault();
  if (!searchState.busy) void performSearch($('search-query').value.trim(), true);
};
$('close-search').onclick = () => $('search-dialog').close();
for (const control of $('search-filters').querySelectorAll('button')) control.onclick = () => {
  const next = toggleSearchPlatform(searchState.platforms, control.dataset.platform);
  if (JSON.stringify(next) === JSON.stringify(searchState.platforms)) return;
  searchState.platforms = next; void performSearch(searchState.query);
};
$('open-playlist').onclick = () => $('playlist-dialog').showModal();
$('close-playlist').onclick = () => $('playlist-dialog').close();
$('play-pause').onclick = () => action(state?.status === 'playing' ? 'pause' : 'resume');
$('next').onclick = () => action('next'); $('previous').onclick = () => action('previous');
$('mode').onclick = () => { const modes = Object.keys(modeLabels()); action('mode', { mode: modes[(modes.indexOf(state.mode) + 1) % modes.length] }); };
$('progress').addEventListener('input', () => {
  seeking = true; $('elapsed').textContent = time($('progress').value);
  $('progress').style.setProperty('--progress', `${Number($('progress').value) / Number($('progress').max) * 100}%`);
});
$('progress').addEventListener('change', async () => { const position = Number($('progress').value); await action('seek', { position }); seeking = false; renderProgress(); });
$('add-form').onsubmit = event => { event.preventDefault(); void submitLink(); };
$('end-room').onclick = () => confirm(uiCopy("activity.99b164abab32", "结束这场听歌？"), uiCopy("activity.0f09d74afd6f", "将停止本频道的音乐、清空歌单，并让房间里的伙伴退出 Activity。"), () => action('end'));
$('clear-playlist').onclick = () => confirm(uiCopy("activity.5e6c5ef8abeb", "清空今夜的歌单？"), uiCopy("activity.307a263cc325", "会停止当前歌曲并移除本频道的所有歌曲，点歌台仍然保持打开。"), () => action('clear'), true);
$('confirm-cancel').onclick = () => $('confirm-dialog').close();
$('confirm-yes').onclick = () => { $('confirm-dialog').close(); confirmAction?.(); };
for (const dialog of [$('playlist-dialog'), $('confirm-dialog'), $('search-dialog'), $('collection-dialog')]) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
setInterval(renderProgress, 250);
window.addEventListener('pagehide', () => service?.leave());

async function start() {
  const controls = ['song-link', 'add-button', 'search-query', 'search-button', 'mode', 'previous', 'next', 'play-pause', 'end-room', 'clear-playlist'];
  const connectionNotice = message => {
    $('room-name').textContent = message || uiCopy("activity.07c8df243c3d", "正在同步频道");
    notice(message);
  };
  try {
    controls.forEach(id => { const control = $(id); if (control) control.disabled = true; });
    connectionNotice(uiCopy("activity.1450ce36107f", "正在连接服务"));
    const response = await fetch('./api/config', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(uiCopy("activity.ceb8f61823b7", "点歌台服务暂时不可用，请稍后重新打开。"));
    let config;
    try { config = await response.json(); }
    catch { throw new Error(uiCopy("activity.ceb8f61823b7", "点歌台服务暂时不可用，请稍后重新打开。")); }
    applyTheme(config.theme);
    if (config.preview) {
      $('preview-banner').hidden = false;
      service = (await import('./preview.js')).createPreview();
    } else {
      service = await (await import(connectAsset)).connect(config, connectionNotice);
    }
    notice('');
    service.subscribe(render);
  } catch (error) {
    startupFailure(error.message || uiCopy("activity.87937bfbd49f", "请从 Discord 语音频道打开点歌台。"));
  }
}
start();
