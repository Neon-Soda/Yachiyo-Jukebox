import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { profileLocation, migrateLegacyProfile, prepareLegacyEncryption } from '../core/profile-location.mjs';
import { defaults } from '../core/settings.mjs';
test('profiles stay beside the installed app, with explicit test overrides', () => {
  const base = join(tmpdir(), 'example-yachiyo');
  assert.equal(profileLocation({ packaged: true, executable: join(base, 'Yachiyo.exe') }), join(base, 'user-data'));
  assert.equal(profileLocation({ packaged: false, sourceDirectory: base }), join(base, 'user-data'));
  assert.equal(profileLocation({ override: join(base, 'qa') }), join(base, 'qa'));
});
test('legacy migration preserves durable data, skips runtime secrets, and never overwrites an existing profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yachiyo-migrate-')), source = join(root, 'old'), target = join(root, 'new');
  try {
    for (const dir of ['themes', 'data/audio-cache', 'private-runtime', 'chromium']) await mkdir(join(source, dir), { recursive: true });
    const settings = JSON.stringify(defaults());
    await writeFile(join(source, 'settings.json'), settings); await writeFile(join(source, 'credentials.bin'), 'EXAMPLE_ENCRYPTED_BYTES');
    await writeFile(join(source, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: 'EXAMPLE_ENCRYPTED_KEY' }, unrelated_browser_state: 'DO_NOT_COPY' }));
    await writeFile(join(source, 'preferences.json'), '{"language":"en","appTheme":"ocean"}');
    await writeFile(join(source, 'themes/theme.json'), '{"name":"My theme"}');
    await writeFile(join(source, 'data/audio-cache/audio.mp3'), 'AUDIO');
    await writeFile(join(source, 'private-runtime/ssh_key'), 'DO_NOT_COPY');
    await writeFile(join(source, 'chromium/lock'), 'DO_NOT_COPY');
    assert.equal(prepareLegacyEncryption(source, target), true);
    const encryptionState = JSON.parse(await readFile(join(target, 'chromium/Local State'), 'utf8'));
    assert.equal(encryptionState.os_crypt.encrypted_key, 'EXAMPLE_ENCRYPTED_KEY'); assert.equal(encryptionState.unrelated_browser_state, undefined);
    assert.equal(await migrateLegacyProfile(source, target), true);
    assert.equal(await readFile(join(target, 'settings.json'), 'utf8'), settings);
    assert.equal(await readFile(join(target, 'credentials.bin'), 'utf8'), 'EXAMPLE_ENCRYPTED_BYTES');
    await access(join(target, 'themes/theme.json')); await access(join(target, 'data/audio-cache/audio.mp3'));
    await assert.rejects(access(join(target, 'private-runtime'))); await assert.rejects(access(join(target, 'chromium/lock')));
    await access(join(source, 'credentials.bin'));
    await writeFile(join(target, 'preferences.json'), '{"language":"zh-CN","appTheme":"daylight"}');
    assert.equal(await migrateLegacyProfile(source, target), false);
    assert.equal(prepareLegacyEncryption(source, target), false);
    assert.ok((await readFile(join(target, 'preferences.json'), 'utf8')).includes('daylight'));
    const resume = join(root, 'resume'); await mkdir(resume); await writeFile(join(resume, '.profile-migration-pending'), 'legacy-profile-v1');
    await writeFile(join(resume, 'credentials.bin'), 'PARTIAL'); assert.equal(await migrateLegacyProfile(source, resume), true);
    assert.equal(await readFile(join(resume, 'credentials.bin'), 'utf8'), 'EXAMPLE_ENCRYPTED_BYTES');
    await assert.rejects(access(join(resume, '.profile-migration-pending')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
