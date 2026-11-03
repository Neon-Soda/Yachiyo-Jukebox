// Only canonical platform links leave this helper, never extracted media URLs.
export function collectionSingleChoice(parsed, collection) {
  const url = new URL(parsed.url);
  if (parsed.platform === 'BILIBILI') {
    url.searchParams.set('p', url.searchParams.get('p') || '1');
    const selected = collection.tracks.find(track => new URL(track.url).pathname.replace(/\/$/, '') === url.pathname.replace(/\/$/, '') && new URL(track.url).searchParams.get('p') === url.searchParams.get('p'));
    return { url: url.href, title: selected?.title ?? '链接对应的这一首', first: false };
  }
  const videoId = url.searchParams.get('v') || (url.hostname === 'youtu.be' ? url.pathname.slice(1) : /^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1]);
  if (/^[\w-]{11}$/.test(videoId ?? '')) {
    const selectedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return { url: selectedUrl, title: collection.tracks.find(track => track.url === selectedUrl)?.title ?? '链接对应的这一首', first: false };
  }
  return { url: collection.tracks[0].url, title: collection.tracks[0].title, first: true };
}
