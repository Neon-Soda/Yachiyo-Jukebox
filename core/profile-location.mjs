import { mkdir, lstat, readdir, copyFile, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { normalizeSettings } from './settings.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export function profileLocation({ packaged, executable, sourceDirectory, override }) {
  return override ? resolve(override) : join(packaged ? dirname(executable) : sourceDirectory, 'user-data');
}
async function exists(file) { try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }

// Chromium keeps the DPAPI-wrapped encryption key in Local State. Preserve
// that metadata BEFORE Electron initializes its local preferences, otherwise
// copied credentials would be encrypted with a different profile key.
export function prepareLegacyEncryption(source, target) {
  if (resolve(source) === resolve(target) || !existsSync(join(source, 'settings.json')) || !existsSync(join(source, 'credentials.bin'))) return false;
  if (!existsSync(join(target, '.profile-migration-pending')) && (existsSync(join(target, 'settings.json')) || existsSync(join(target, 'credentials.bin')))) return false;
  const file = [join(source, 'chromium/Local State'), join(source, 'Local State')].find(existsSync);
  if (!file) throw new Error('迁移所需的加密信息缺失，原有数据已保留。');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof state.os_crypt?.encrypted_key !== 'string' || !state.os_crypt.encrypted_key) throw new Error('迁移所需的加密信息缺失，原有数据已保留。');
  mkdirSync(join(target, 'chromium'), { recursive: true });
  writeFileSync(join(target, 'chromium/Local State'), JSON.stringify({ os_crypt: state.os_crypt }), { mode: 0o600 });
  return true;
}

// Copy only durable user content. Never copy unlocked runtime secrets, browser
// locks or caches from another running process. The old profile stays as backup.
export async function migrateLegacyProfile(source, target) {
  if (resolve(source) === resolve(target) || !(await exists(join(source, 'settings.json')))) return false;
  const marker = join(target, '.profile-migration-pending');
  if (!(await exists(marker)) && (await exists(join(target, 'settings.json')) || await exists(join(target, 'credentials.bin')))) return false;
  normalizeSettings(JSON.parse(await readFile(join(source, 'settings.json'), 'utf8')));
  await mkdir(target, { recursive: true });
  await writeFile(marker, 'legacy-profile-v1\n', { mode: 0o600 });
  async function copyTree(relative) {
    const from = join(source, relative), to = join(target, relative), entry = await exists(from);
    if (!entry || entry.isSymbolicLink()) return;
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      for (const name of await readdir(from)) await copyTree(join(relative, name));
    } else if (entry.isFile()) { await mkdir(dirname(to), { recursive: true }); await copyFile(from, to); }
  }
  for (const path of ['credentials.bin', 'preferences.json', 'customization.json', 'themes', 'data/audio-cache', 'settings.json']) await copyTree(path);
  await unlink(marker);
  return true;
}
