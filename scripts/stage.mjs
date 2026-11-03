import { mkdir, cp, readFile, writeFile, readdir, stat, rm, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const desktop = resolve(import.meta.dirname, '..'), root = join(desktop, 'bot'), stage = join(desktop, 'stage');
// Stage from an explicit allowlist. Never package the working tree, .env,
// cookies, data, logs, backups, SSH keys or a user's profile.
if (dirname(stage) !== desktop) throw new Error('Invalid stage directory');
await rm(stage, { recursive: true, force: true }); await mkdir(join(stage, 'tools'), { recursive: true });
for (const dir of ['src', 'shared', 'node_modules', 'activity/dist']) await cp(join(root, dir), join(stage, dir), { recursive: true, filter: src => !src.endsWith('.log') && !src.includes(`${join('node_modules', '.cache')}`) });
await copyFile(join(root, 'package.json'), join(stage, 'package.json'));
await mkdir(join(stage, 'desktop'), { recursive: true });
await copyFile(join(desktop, 'core/ssh-credentials.mjs'), join(stage, 'desktop/ssh-credentials.mjs'));
await mkdir(join(stage, 'activity/web'), { recursive: true });
// Backend music-search and the browser use the same platform quota rules.
await copyFile(join(root, 'activity/web/search-options.js'), join(stage, 'activity/web/search-options.js'));
const files = [];
for (const name of ['node.exe']) {
  const location = join(desktop, 'tools', 'win32-x64', name);
  await copyFile(location, join(stage, 'tools', name));
  files.push({ name, sha256: createHash('sha256').update(await readFile(join(stage, 'tools', name))).digest('hex'), bytes: (await stat(join(stage, 'tools', name))).size });
}
await writeFile(join(stage, 'runtime-manifest.json'), JSON.stringify({ version: 1, platform: 'win32-x64', tools: files }, null, 2));
await mkdir(join(stage, 'licenses'), { recursive: true });
for (const name of ['Node-LICENSE.txt', 'THIRD-PARTY-NOTICES.txt']) {
  await copyFile(join(desktop, 'licenses', name), join(stage, 'licenses', name));
}
await copyFile(join(desktop, 'LICENSE'), join(stage, 'licenses', 'Yachiyo-LICENSE.txt'));
const forbidden = /^(?:\.env(?:\..*)?|\.local|user-data|private-runtime|cookies|data|logs|backups|id_ed25519|known_hosts|credentials\.bin|settings\.json|media-tools\.json|preferences\.json)$/i;
async function audit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (forbidden.test(entry.name)) throw new Error(`Unexpected private artifact in stage: ${entry.name}`);
    if (entry.isDirectory()) await audit(join(directory, entry.name));
  }
}
// Dependencies may legitimately contain directories called data. Audit the
// application payload and the staging root; dependency install is lockfile based.
for (const name of await readdir(stage)) if (forbidden.test(name)) throw new Error('Private root artifact');
await audit(join(stage, 'src')); await audit(join(stage, 'shared')); await audit(join(stage, 'activity'));
console.log(`Clean runtime staged: ${files.length} tools; no profile or credentials included.`);
