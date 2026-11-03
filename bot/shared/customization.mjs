// Shared by the Activity, the desktop editor and the Bot. No executable theme data.
const state = Symbol.for('yachiyo.customization');
export const defaultTheme = () => ({ version: 1, name: '月夜 · Yachiyo', colors: {}, texts: {}, images: {} });
export function placeholders(text) { return [...new Set(String(text).match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? [])].sort(); }
export function normalizeTheme(input, catalog = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) throw new Error('主题格式不受支持。');
  const theme = defaultTheme();
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new Error('主题名称须为 1～80 字。');
  theme.name = input.name.trim();
  for (const [key, value] of Object.entries(input.colors ?? {})) {
    if (!/^c[0-9a-f]{6}$/.test(key) || !/^#[0-9a-f]{6}$/i.test(value) || (catalog && !catalog.colors[key])) throw new Error('主题配色无效。');
    theme.colors[key] = value.toLowerCase();
  }
  for (const [key, value] of Object.entries(input.texts ?? {})) {
    if (!/^[a-z][a-z0-9_.-]{0,100}$/.test(key) || typeof value !== 'string' || value.length > 1800 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('自定义文案格式无效。');
    if (catalog) {
      const item = catalog.texts[key];
      if (!item) throw new Error('主题包含当前版本不支持的文案。');
      if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(item.default))) throw new Error('请保留文案中的全部变量，例如 {title}。');
      if (value.length > (item.max ?? 1800) || (!value.trim() && item.required)) throw new Error('文案长度不符合要求。');
    }
    theme.texts[key] = value;
  }
  for (const [key, value] of Object.entries(input.images ?? {})) {
    if (!['logo', 'defaultCover'].includes(key) || typeof value !== 'string' || value.length > 2_800_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('主题图片须为 2 MB 内的 PNG、JPEG 或 WebP。');
    theme.images[key] = value;
  }
  if (JSON.stringify(theme).length > 6_000_000) throw new Error('主题文件过大。');
  return theme;
}
export function setCustomization(theme) { globalThis[state] = normalizeTheme(theme); }
export function getCustomization() { return globalThis[state] ?? defaultTheme(); }
export function copy(key, fallback, values = {}) {
  const template = getCustomization().texts[key] ?? fallback;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name] ?? '') : match);
}
