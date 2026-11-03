import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
await mkdir('dist', { recursive: true });
// Keep previous versions available: a Discord iframe may still have an older
// document in memory. Publish the new document only after every asset exists.
const version = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
for (const file of ['style.css', 'preview.js', 'search-options.js']) await copyFile(`web/${file}`, `dist/${file}`);
await build({ entryPoints: ['web/notifications.js'], outfile: 'dist/notifications.js', bundle: true, format: 'esm', platform: 'browser', minify: true, target: ['es2022'] });
await build({ entryPoints: ['connect.mjs'], outfile: 'dist/connect.js', bundle: true, format: 'esm', platform: 'browser', minify: true, target: ['es2022'] });
const connectBytes = await readFile('dist/connect.js');
const connectName = `connect.${version(connectBytes)}.js`;
await writeFile(`dist/${connectName}`, connectBytes);
await build({ entryPoints: ['web/app.js'], outfile: 'dist/app.js', bundle: true, format: 'iife', platform: 'browser', minify: true, target: ['es2022'], external: ['./preview.js', './connect.*.js'], define: { ACTIVITY_CONNECT_ASSET: JSON.stringify(`./${connectName}`) } });
const appBytes = await readFile('dist/app.js'), styleBytes = await readFile('dist/style.css');
const appName = `app.${version(appBytes)}.js`, styleName = `style.${version(styleBytes)}.css`;
await writeFile(`dist/${appName}`, appBytes); await writeFile(`dist/${styleName}`, styleBytes);
let html = await readFile('web/index.html', 'utf8');
html = html.replace(/<script type="module" src="\.\/app\.js(?:\?[^"]*)?"><\/script>/, `<script defer src="./${appName}"></script>`)
  .replace(/href="\.\/style\.css(?:\?[^"]*)?"/, `href="./${styleName}"`);
if (!html.includes(`src="./${appName}"`) || !html.includes(`href="./${styleName}"`)) throw new Error('Activity entry template did not match. Previous document retained.');
await writeFile('dist/index.html.next', html); await rename('dist/index.html.next', 'dist/index.html');
console.log('Activity frontend built. No environment secrets are bundled.');
