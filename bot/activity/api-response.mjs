import { copy as uiCopy } from '../shared/customization.mjs';
// A proxy's HTML error page is not an Activity response. Never surface its body
// or JSON parser diagnostics in the player, and never mistake it for room state.
export async function readApiResponse(response) {
  const unavailable = uiCopy("activity.ceb8f61823b7", "点歌台服务暂时不可用，请稍后重新打开。");
  const fallback = [401, 410].includes(response.status) ? uiCopy("activity.28c3a151672d", "点歌台登录已过期，请关闭后重新打开。") : unavailable;
  if (response.status >= 500) throw new Error(unavailable);
  const contentType = response.headers?.get('content-type');
  if (contentType && !/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) throw new Error(fallback);
  let data;
  try { data = await response.json(); } catch { throw new Error(fallback); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(fallback);
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error.slice(0, 300) : fallback);
  return data;
}
