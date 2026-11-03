import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaults, normalizeSettings, secretKeys } from './settings.mjs';
import { defaultPreferences, normalizePreferences } from './preferences.mjs';
import { normalizeSshCredential } from './ssh-credentials.mjs';
export async function atomicJson(file, data) { return atomicBytes(file, JSON.stringify(data, null, 2)); }
export async function atomicBytes(file, bytes) { const temp = `${file}.${randomUUID()}.next`; await writeFile(temp, bytes, { mode: 0o600 }); await rename(temp, file); }
export async function limitedRead(file, limit = 6_000_000) { if ((await stat(file)).size > limit) throw new Error('文件超过允许的大小。'); return readFile(file); }
export class ProfileStore {
  constructor(directory, safeStorage) { this.directory = directory; this.crypto = safeStorage; this.config = defaults(); this.secrets = {}; this.preferences = defaultPreferences(); this.preferenceQueue = Promise.resolve(); this.saveQueue = Promise.resolve(); }
  async load() {
    await mkdir(this.directory, { recursive: true });
    // Appearance is independent of Bot configuration and credentials. An old
    // profile or a damaged preference file must not prevent the Bot starting.
    try { this.preferences = normalizePreferences(JSON.parse(await readFile(join(this.directory, 'preferences.json'), 'utf8'))); }
    catch { this.preferences = defaultPreferences(); }
    try { this.config = normalizeSettings(JSON.parse(await readFile(join(this.directory, 'settings.json'), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('设置文件无法读取。请从数据文件夹恢复 settings.json 的备份。'); }
    try {
      const encrypted = await readFile(join(this.directory, 'credentials.bin'));
      const decrypted = await this.crypto.decryptStringAsync(encrypted);
      const secrets = JSON.parse(decrypted.result);
      this.secrets = Object.fromEntries(secretKeys.filter(key => typeof secrets[key] === 'string').map(key => [key, secrets[key]]));
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('本机凭据无法解密。更换电脑后请重新填写凭据。'); }
  }
  savePreferences(patch) {
    const save = this.preferenceQueue.then(async () => {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('应用偏好格式无效。');
      const next = normalizePreferences({ ...this.preferences, ...patch });
      await atomicJson(join(this.directory, 'preferences.json'), next);
      this.preferences = next;
      return next;
    });
    this.preferenceQueue = save.catch(() => {});
    return save;
  }
  save(config, updates = {}) {
    const pending = this.saveQueue.then(() => this.saveInner(config, updates));
    this.saveQueue = pending.catch(() => {});
    return pending;
  }
  async saveInner(config, updates) {
    const next = normalizeSettings(config || this.config), secrets = { ...this.secrets };
    for (const [key, value] of Object.entries(updates)) {
      if (!secretKeys.includes(key) || typeof value !== 'string' || value.length > 2_000_000) throw new Error('凭据格式无效。');
      if (['botToken', 'clientSecret'].includes(key) && (value.length > 512 || /[\s\u0000]/.test(value))) throw new Error('凭据不能包含空格或换行。');
      if (value) secrets[key] = ['sshKey', 'knownHosts'].includes(key) ? normalizeSshCredential(key, value) : value; else delete secrets[key];
    }
    const encrypted = await this.crypto.encryptStringAsync(JSON.stringify(secrets));
    await atomicBytes(join(this.directory, 'credentials.bin'), encrypted);
    await atomicJson(join(this.directory, 'settings.json'), next);
    this.config = next; this.secrets = secrets;
  }
}
