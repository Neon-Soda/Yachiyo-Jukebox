import { setCustomization, getCustomization, copy } from '../../shared/customization.mjs';
export function applyTheme(theme) {
  if (!theme) return;
  setCustomization(theme);
  for (const [key, color] of Object.entries(getCustomization().colors)) document.documentElement.style.setProperty(`--theme-${key}`, color);
  for (const element of document.querySelectorAll('[data-copy]')) element.textContent = copy(element.dataset.copy, element.textContent);
  for (const element of document.querySelectorAll('[data-copy-attrs]')) {
    const attrs = JSON.parse(element.dataset.copyAttrs);
    for (const [name, key] of Object.entries(attrs)) element.setAttribute(name, copy(key, element.getAttribute(name)));
  }
  const logo = getCustomization().images.logo;
  if (logo) for (const element of document.querySelectorAll('.brand-mark,.record-label>span,.app>footer>span:last-child')) {
    const image = document.createElement('img'); image.src = logo; image.alt = ''; image.className = 'theme-logo'; element.replaceChildren(image);
  }
}
export const defaultCover = () => getCustomization().images.defaultCover || '';
