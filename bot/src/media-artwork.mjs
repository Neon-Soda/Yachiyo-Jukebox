export function coverUrl(input) {
  try {
    const url = new URL(input?.startsWith('//') ? `https:${input}` : input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!/^i\d+\.hdslb\.com$/.test(url.hostname) && url.hostname !== 'i.ytimg.com' && !/^p[1-4]\.music\.126\.net$/.test(url.hostname)) return null;
    url.protocol = 'https:'; url.hash = '';
    return url.href;
  } catch { return null; }
}

export function mediaArtwork(input) {
  const safe = coverUrl(input);
  if (!safe) return null;
  const url = new URL(safe);
  if (/^i\d+\.hdslb\.com$/.test(url.hostname)) url.pathname = `${url.pathname.split('@')[0]}@640w_640h_0e.webp`;
  if (url.hostname.endsWith('.music.126.net')) url.searchParams.set('param', '320y320');
  return url.href;
}
