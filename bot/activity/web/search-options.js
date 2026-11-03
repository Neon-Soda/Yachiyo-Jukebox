export const SEARCH_PLATFORMS = ['BILIBILI', 'YOUTUBE', 'NETEASE'];

export function searchSelection(input = SEARCH_PLATFORMS) {
  if (!Array.isArray(input) || !input.length || input.length > 3 || input.some(platform => !SEARCH_PLATFORMS.includes(platform)) || new Set(input).size !== input.length) throw new RangeError('Invalid search platforms');
  const platforms = SEARCH_PLATFORMS.filter(platform => input.includes(platform));
  const perPlatform = platforms.length === 1 ? 10 : platforms.length === 2 ? 5 : 4;
  return { platforms, perPlatform, total: platforms.length * perPlatform };
}

export function toggleSearchPlatform(selected, platform) {
  const { platforms } = searchSelection(selected);
  if (platform === 'all') return [...SEARCH_PLATFORMS];
  if (!SEARCH_PLATFORMS.includes(platform)) throw new RangeError('Invalid search platform');
  if (platforms.length === 3) return [platform];
  const next = platforms.includes(platform) ? platforms.filter(item => item !== platform) : [...platforms, platform];
  return next.length ? searchSelection(next).platforms : [...SEARCH_PLATFORMS];
}
