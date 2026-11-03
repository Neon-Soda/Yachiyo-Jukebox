import { readFile, readdir, stat, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute, parse } from 'node:path';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const stage = join(root, 'stage');
let host = {};
try {
  host = JSON.parse(await readFile(join(root, '.local/host.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Unable to read build locations.');
}
function configuredDirectory(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) === parse(resolve(value)).root) {
    throw new Error('Build locations must be absolute non-root directories.');
  }
  return resolve(value);
}
const releaseDirectory = configuredDirectory(host.releaseDirectory, join(root, 'releases'));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const binary = join(root, '.local/target/release/Yachiyo.exe');
const forbidden = /^(?:\.env(?:\..*)?|user-data|private-runtime|\.local|credentials\.(?:bin|dpapi)|settings\.json|media-tools\.json|preferences\.json|known_hosts|id_ed25519|qa-dialog\.json)$/i;

// Inspect build-time credentials only in memory; none are written to reports.
const secrets = [];
for (const key of ['DISCORD_TOKEN', 'DISCORD_CLIENT_SECRET']) {
  const value = process.env[key];
  if (value?.length > 12) secrets.push(Buffer.from(value));
}
try {
  const environment = parseEnv(await readFile(join(root, '.env'), 'utf8'));
  for (const [key, value] of Object.entries(environment)) {
    if (/TOKEN|SECRET/.test(key) && value.length > 12) secrets.push(Buffer.from(value));
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw new Error('Unable to inspect the build environment file.');
}
for (const platform of ['youtube', 'bilibili', 'netease']) {
  try {
    const value = await readFile(join(root, 'cookies', platform + '.txt'), 'utf8');
    if (value.trim()) secrets.push(Buffer.from(value));
    for (const line of value.split(/\r?\n/)) {
      const cells = line.replace(/^#HttpOnly_/, '').split('\t');
      if (cells.length === 7 && cells[6].length >= 16) secrets.push(Buffer.from(cells[6]));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Unable to inspect a platform login file.');
  }
}

let checked = 0, hits = 0, totalBytes = 0;
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (forbidden.test(entry.name)) throw new Error('Private artifact found in release payload.');
    if (/^(?:ffmpeg|ffprobe|yt-dlp)\.exe$/i.test(entry.name)) throw new Error('Media tools must be selected by users and must not be bundled.');
    const file = join(folder, entry.name);
    if (entry.isDirectory()) await walk(file);
    else {
      totalBytes += (await stat(file)).size;
      if (/\.(mjs|cjs|js|json|html|css|txt|pem|key|ini|toml)$/i.test(file)) {
        const bytes = await readFile(file); checked++;
        if (secrets.some(secret => bytes.includes(secret))) hits++;
      }
    }
  }
}
await walk(stage);
const bytes = await readFile(binary);
if (secrets.some(secret => bytes.includes(secret))) hits++;
for (const dependency of ['discord.js', '@discordjs/voice', 'opusscript', '@snazzah/davey']) {
  await stat(join(stage, 'node_modules', dependency, 'package.json'));
}
for (const folder of ['src', 'shared', 'desktop']) {
  for (const name of await readdir(join(stage, folder))) {
    if (!name.endsWith('.mjs')) continue;
    const path = join(stage, folder, name);
    for (const [, dependency] of (await readFile(path, 'utf8')).matchAll(/\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g)) {
      await stat(resolve(dirname(path), dependency));
    }
  }
}
const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
if (JSON.stringify(config.bundle.resources) !== JSON.stringify({ '../stage/': 'runtime/' })) {
  throw new Error('Unexpected packaged resource scope.');
}
if (hits) throw new Error('Private credential matched in release payload.');

const nsis = join(root, '.local/target/release/bundle/nsis');
const setup = `${config.productName}_${version}_x64-setup.exe`;
await stat(join(nsis, setup));
await mkdir(releaseDirectory, { recursive: true });
const output = join(releaseDirectory, `Yachiyo-${version}-Windows-x64.exe`);
await copyFile(join(nsis, setup), output);

// NSIS embeds the NSS bundle marker; the loose executable is restored to UNK.
const packaged = Buffer.from(bytes), marker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK');
const offset = packaged.indexOf(marker);
if (offset < 0 || packaged.indexOf(marker, offset + 1) >= 0) throw new Error('Unexpected Tauri bundle marker.');
Buffer.from('__TAURI_BUNDLE_TYPE_VAR_NSS').copy(packaged, offset);
const digest = content => createHash('sha256').update(content).digest('hex');
const result = {
  version, passed: true, checkedTextFiles: checked, credentialPatternsChecked: secrets.length,
  personalCredentialMatches: hits, runtimeBytes: totalBytes, applicationBytes: bytes.length,
  applicationSha256: digest(bytes), nsisApplicationSha256: digest(packaged), installerPath: output,
  installerBytes: (await stat(output)).size, installerSha256: digest(await readFile(output)), browserBundled: false,
};
await writeFile(output + '.sha256', `${result.installerSha256}  ${output.slice(dirname(output).length + 1)}\n`);
const report = join(root, '.local/logs/tauri-release-audit.json');
await mkdir(dirname(report), { recursive: true });
await writeFile(report, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
