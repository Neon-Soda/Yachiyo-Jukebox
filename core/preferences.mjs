export const languages = ['zh-CN', 'en'];
export const appThemes = ['forest', 'midnight', 'ocean', 'daylight', 'system'];
export const defaultPreferences = () => ({ language: 'zh-CN', appTheme: 'forest' });

export function normalizePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['language', 'appTheme'].includes(key))) throw new Error('应用偏好格式无效。');
  if (!languages.includes(input.language)) throw new Error('请选择中文或英文。');
  if (!appThemes.includes(input.appTheme)) throw new Error('请选择支持的应用主题。');
  return { language: input.language, appTheme: input.appTheme };
}

export function resolvedTheme(theme, dark) { return theme === 'system' ? dark ? 'forest' : 'daylight' : theme; }
export function nativeThemeSource(theme) { return theme === 'system' ? 'system' : theme === 'daylight' ? 'light' : 'dark'; }
