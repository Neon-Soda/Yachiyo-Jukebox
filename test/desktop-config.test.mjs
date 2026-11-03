import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import * as path from 'node:path';
import { defaults, normalizeSettings, readyToStart, publicSettings, childEnvironment } from '../core/settings.mjs';
import { ProfileStore } from '../core/storage.mjs';
import { defaultTheme, normalizeTheme, setCustomization, copy } from '../bot/shared/customization.mjs';
const catalog = JSON.parse(await readFile(new URL('../bot/shared/catalog.json', import.meta.url)));
test('desktop configurations keep direct public access independent of SSH and reject injected arguments', () => {
  const config = normalizeSettings({ ...defaults(), guildId: '12345678901234567', clientId: '12345678901234568', publicOrigin: 'https://music.example.com/' });
  assert.equal(config.publicOrigin, 'https://music.example.com');
  assert.doesNotThrow(() => readyToStart(config, { botToken: 'example', clientSecret: 'example' }));
  assert.throws(() => readyToStart({ ...config, connectionMode: 'ssh' }, { botToken: 'example', clientSecret: 'example' }));
  for (const patch of [{ publicOrigin: 'https://user:password@example.com' }, { publicOrigin: 'https://example.com/?token=secret' }, { publicOrigin: 'http://example.com' }, { sshUser: '-oProxyCommand=evil' }, { sshHost: 'vps & echo x' }, { port: 1 }, { port: 3178.2 }, { bind: 'evil' }]) assert.throws(() => normalizeSettings({ ...config, ...patch }));
});
test('public snapshots and child environments never expose or inherit unrelated credentials', () => {
  const config = defaults(), secrets = { botToken: 'EXAMPLE_PRIVATE_BOT', clientSecret: 'EXAMPLE_PRIVATE_CLIENT', bilibiliCookies: 'EXAMPLE_PRIVATE_COOKIE' };
  const serialized = JSON.stringify(publicSettings(config, secrets));
  assert.ok(!serialized.includes('EXAMPLE_PRIVATE')); assert.equal(JSON.parse(serialized).saved.botToken, true);
  const previous = process.env.UNRELATED_SECRET; process.env.UNRELATED_SECRET = 'EXAMPLE_OTHER';
  try { const env = childEnvironment(config, secrets, 'C:\\runtime', 'C:\\profile', path); assert.equal(env.UNRELATED_SECRET, undefined); assert.equal(env.DISCORD_TOKEN, secrets.botToken); assert.ok(!Object.values(env).includes(secrets.bilibiliCookies)); }
  finally { if (previous === undefined) delete process.env.UNRELATED_SECRET; else process.env.UNRELATED_SECRET = previous; }
});
test('Windows OpenSSH starts in the isolated child environment with ProgramData preserved', { skip: process.platform !== 'win32' }, () => {
  const executable = join(process.env.SystemRoot, 'System32/OpenSSH/ssh.exe');
  if (!existsSync(executable)) return;
  const env = childEnvironment(defaults(), {}, 'C:\\runtime', 'C:\\profile', path);
  assert.equal(env.ProgramData, process.env.ProgramData);
  const result = spawnSync(executable, ['-V'], { env, windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, 'SSH version probe must work without inheriting arbitrary secrets');
});
test('profile storage round-trips encrypted credentials and preserves blanks only through explicit update semantics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yachiyo-profile-'));
  const crypto = { encryptStringAsync: async text => Buffer.from(text.split('').reverse().join('')), decryptStringAsync: async value => ({ result: value.toString().split('').reverse().join(''), shouldReEncrypt: false }) };
  try {
    const store = new ProfileStore(directory, crypto); await store.load(); await store.save(defaults(), { botToken: 'EXAMPLE_PRIVATE_BOT' });
    assert.ok(!(await readFile(join(directory, 'credentials.bin'), 'utf8')).includes('EXAMPLE_PRIVATE_BOT'));
    await store.save(defaults(), {}); assert.equal(store.secrets.botToken, 'EXAMPLE_PRIVATE_BOT');
    const loaded = new ProfileStore(directory, crypto); await loaded.load(); assert.equal(loaded.secrets.botToken, 'EXAMPLE_PRIVATE_BOT');
    await loaded.save(defaults(), { botToken: '' }); assert.equal(loaded.secrets.botToken, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('theme import accepts only public data, known colors and preserved template variables', () => {
  const [key, item] = Object.entries(catalog.texts).find(([, item]) => item.default.includes('{title}'));
  const theme = { ...defaultTheme(), texts: { [key]: item.default.replace('《', '「').replace('》', '」') }, colors: { c101018: '#112233' }, botToken: 'EXAMPLE_PRIVATE_BOT' };
  const validated = normalizeTheme(theme, catalog); assert.equal(validated.botToken, undefined);
  assert.throws(() => normalizeTheme({ ...theme, texts: { [key]: '丢失变量' } }, catalog));
  assert.throws(() => normalizeTheme({ ...theme, colors: { c101018: 'url(https://evil)' } }, catalog));
  assert.throws(() => normalizeTheme({ ...theme, images: { logo: 'data:image/svg+xml,<svg onload="x"/>' } }, catalog));
  assert.throws(() => normalizeTheme({ ...theme, images: { logo: 'https://external.example/image.png' } }, catalog));
  setCustomization(validated); assert.equal(copy(key, 'fallback', { title: '<song>' }).includes('<song>'), true); setCustomization(defaultTheme());
});
