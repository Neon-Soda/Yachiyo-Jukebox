import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileStore } from '../core/storage.mjs';
import { defaults } from '../core/settings.mjs';
import { defaultPreferences, normalizePreferences, resolvedTheme, nativeThemeSource } from '../core/preferences.mjs';
import { english, translate, hasTranslation } from '../core/i18n.mjs';

test('appearance preferences upgrade old profiles and never rewrite Bot configuration or credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yachiyo-preferences-'));
  const crypto = { encryptStringAsync: async text => Buffer.from(text), decryptStringAsync: async value => ({ result: value.toString() }) };
  try {
    const store = new ProfileStore(directory, crypto); await store.load();
    assert.deepEqual(store.preferences, defaultPreferences());
    await store.save(defaults(), { botToken: 'EXAMPLE_PRIVATE_BOT' });
    const beforeSettings = await readFile(join(directory, 'settings.json'));
    const beforeCredentials = await readFile(join(directory, 'credentials.bin'));
    await Promise.all([store.savePreferences({ language: 'en' }), store.savePreferences({ appTheme: 'daylight' })]);
    assert.deepEqual(await readFile(join(directory, 'settings.json')), beforeSettings);
    assert.deepEqual(await readFile(join(directory, 'credentials.bin')), beforeCredentials);
    const loaded = new ProfileStore(directory, crypto); await loaded.load();
    assert.deepEqual(loaded.preferences, { language: 'en', appTheme: 'daylight' });
    assert.equal(loaded.secrets.botToken, 'EXAMPLE_PRIVATE_BOT');
    assert.ok(!(await readFile(join(directory, 'preferences.json'), 'utf8')).includes('EXAMPLE'));
    for (const patch of [{ language: 'fr' }, { appTheme: 'url(https://example.com)' }, { botToken: 'no' }, null, []]) await assert.rejects(store.savePreferences(patch));
    assert.deepEqual(store.preferences, loaded.preferences);
    await writeFile(join(directory, 'preferences.json'), 'broken');
    await loaded.load(); assert.deepEqual(loaded.preferences, defaultPreferences()); assert.equal(loaded.secrets.botToken, 'EXAMPLE_PRIVATE_BOT');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('all app palettes and Windows color modes resolve deterministically', () => {
  assert.equal(resolvedTheme('system', true), 'forest'); assert.equal(resolvedTheme('system', false), 'daylight');
  for (const name of ['forest', 'midnight', 'ocean', 'daylight']) {
    assert.equal(resolvedTheme(name, false), name);
    assert.equal(nativeThemeSource(name), name === 'daylight' ? 'light' : 'dark');
  }
  assert.equal(nativeThemeSource('system'), 'system');
  assert.throws(() => normalizePreferences({ language: 'en', appTheme: 'invalid' }));
});

test('desktop translations preserve variables, translate safe status details and leave user content alone', () => {
  const variables = text => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort();
  for (const [source, target] of Object.entries(english)) {
    assert.ok(target.trim()); assert.deepEqual(variables(source), variables(target), source);
  }
  assert.equal(translate('延迟 {ping} ms · {rooms} 个房间', 'en', { ping: 20, rooms: 2 }), 'Latency 20 ms · Rooms: 2');
  assert.equal(translate('Bot 已退出（终止），即将自动重试', 'en'), 'Bot exited (terminated). Retrying automatically');
  assert.equal(translate('HTTP 502 / 非点歌台响应', 'en'), 'HTTP 502 / Not an Activity response');
  assert.equal(translate('本地端口须为 1024～65535 的整数。', 'en'), 'Local port must be an integer from 1024 to 65535.');
  assert.equal(translate('我自己的歌单 / My playlist', 'en'), '我自己的歌单 / My playlist');
  assert.equal(hasTranslation('本地端口须为 1024～65535 的整数。'), true);
  assert.equal(hasTranslation('Error with EXAMPLE_PRIVATE_BOT'), false);
});
