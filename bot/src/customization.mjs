import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { setCustomization, getCustomization, copy } from '../shared/customization.mjs';
const file = resolve(process.env.YACHIYO_CUSTOMIZATION_PATH || 'data/customization.json');
let modified = -1;
function refresh() {
  try {
    const mtime = statSync(file).mtimeMs;
    if (mtime !== modified) { setCustomization(JSON.parse(readFileSync(file, 'utf8'))); modified = mtime; }
  } catch { /* Retain the last valid theme while another process saves. */ }
}
refresh(); setInterval(refresh, 2000).unref();
export { copy, getCustomization };
