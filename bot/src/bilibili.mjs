import { UserFacingError } from './messages.mjs';

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Public, anonymous playback fallback for unavailable page metadata/empty formats.
// It does not read browser credentials or bypass login/paid-content responses.
export async function publicBilibiliInfo(track, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const url = new URL(track.url);
  const match = /^\/video\/(BV[a-zA-Z0-9]{10}|av\d+)\/?$/.exec(url.pathname);
  if (!['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname) || !match) throw new UserFacingError('extractFailed');
  const page = Number(url.searchParams.get('p') || 1);
  if (!Number.isSafeInteger(page) || page < 1) throw new UserFacingError('extractFailed');
  const query = new URLSearchParams(match[1].startsWith('BV') ? { bvid: match[1] } : { aid: match[1].slice(2) });
  const headers = { 'User-Agent': userAgent, Referer: 'https://www.bilibili.com/' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let stage = 'webpage';
  const readText = async endpoint => {
    const response = await fetchImpl(endpoint, { headers, signal: controller.signal });
    if (!response.ok) throw new UserFacingError('extractFailed');
    let text = '';
    const decoder = new TextDecoder();
    for await (const bytes of response.body) {
      text += decoder.decode(bytes, { stream: true });
      if (text.length > 8 * 1024 * 1024) {
        controller.abort();
        throw new UserFacingError('responseTooLarge');
      }
    }
    text += decoder.decode();
    return text;
  };
  try {
    let video;
    try {
      const webpage = await readText(`https://www.bilibili.com/video/${match[1]}/?p=${page}`);
      const state = /window\.__INITIAL_STATE__\s*=\s*(.*?);\s*\(function/s.exec(webpage);
      video = state && JSON.parse(state[1]).videoData;
    } catch (error) {
      if (controller.signal.aborted) throw error;
    }
    if (!video) {
      stage = 'part-list';
      const parts = JSON.parse(await readText(`https://api.bilibili.com/x/player/pagelist?${query}`));
      if (parts.code === 0 && Array.isArray(parts.data)) {
        const selected = parts.data.find(item => item.page === page);
        if (selected) video = { title: parts.data.length === 1 ? selected.part || 'Bilibili 视频' : 'Bilibili 视频', pages: parts.data };
      }
    }
    if (!video) throw new UserFacingError('extractFailed');
    if (video.rights?.is_stein_gate) throw new UserFacingError('unsupportedCollection');
    const part = video.pages?.find(item => item.page === page);
    if (!part || !Number.isSafeInteger(part.cid) || part.cid < 1 || !Number.isFinite(part.duration) || part.duration <= 0) throw new UserFacingError('extractFailed');
    if (part.duration > 7200) throw new UserFacingError('tooLong');
    query.set('cid', String(part.cid));
    query.set('fnval', '4048');
    stage = 'playback-api';
    const json = JSON.parse(await readText(`https://api.bilibili.com/x/player/playurl?${query}`));
    if (json.code !== 0 || !json.data) throw new UserFacingError('extractFailed');
    const play = json.data;
    stage = 'audio-formats';
    const formats = (play.dash?.audio ?? []).flatMap(audio => {
      const mediaUrl = audio.baseUrl ?? audio.base_url;
      if (!mediaUrl?.startsWith('https://') || (audio.mimeType ?? audio.mime_type) !== 'audio/mp4') return [];
      const backups = audio.backupUrl ?? audio.backup_url;
      const backupUrls = [...new Set((Array.isArray(backups) ? backups : []).filter(value => {
        try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && value !== mediaUrl; }
        catch { return false; }
      }))].slice(0, 2);
      return [{ url: mediaUrl, format_id: String(audio.id), ext: 'm4a', acodec: audio.codecs || 'mp4a.40.2', vcodec: 'none', tbr: audio.bandwidth / 1000,
        // Private info JSON only: these signed URLs must never reach room snapshots.
        ...(backupUrls.length ? { _bilibili_backup_urls: backupUrls } : {}) }];
    });
    if (!formats.length) throw new UserFacingError('extractFailed');
    const duration = Number(play.timelength) / 1000;
    if (!Number.isFinite(duration) || duration <= 0) throw new UserFacingError('invalidMetadata');
    if (duration > 7200) throw new UserFacingError('tooLong');
    if (Number.isFinite(part.duration) && duration < part.duration - Math.max(5, part.duration * 0.1)) throw new UserFacingError('extractFailed');
    return { id: `${video.bvid ?? match[1]}_p${page}`, title: video.title + (video.pages.length > 1 ? ` p${page} ${part.part}` : ''), thumbnail: video.pic, duration, formats, http_headers: headers, extractor: 'BiliBili', extractor_key: 'BiliBili' };
  } catch (error) {
    const safeError = error instanceof UserFacingError ? error : new UserFacingError(controller.signal.aborted ? 'extractTimeout' : 'extractFailed');
    safeError.diagnosticStage = stage;
    throw safeError;
  } finally {
    clearTimeout(timer);
  }
}
