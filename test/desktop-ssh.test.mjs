import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeSshCredential, sshTextUpdates } from '../core/ssh-credentials.mjs';
import { ProfileStore } from '../core/storage.mjs';
import { publicSettings } from '../core/settings.mjs';
import { sshFixture } from './ssh-fixture.mjs';

test('pasted SSH data normalizes line endings and rejects public, truncated and encrypted keys', () => {
  const fixture = sshFixture();
  assert.ok(normalizeSshCredential('sshKey', '\uFEFF' + fixture.privateKey.replaceAll('\n', '\r\n')) === fixture.privateKey);
  assert.ok(normalizeSshCredential('knownHosts', `# verified\r\n${fixture.knownHosts}`) === `# verified\n${fixture.knownHosts}`);
  for (const value of [fixture.knownHosts, fixture.privateKey.replace('END PRIVATE KEY', 'END RSA PRIVATE KEY'), '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----']) assert.throws(() => normalizeSshCredential('sshKey', value));
  const encrypted = fixture.pair.privateKey.export({ format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase: 'EXAMPLE_TEST_ONLY' });
  assert.throws(() => normalizeSshCredential('sshKey', encrypted), /带口令/);
  for (const value of ['', '# no entries', fixture.privateKey, 'example.test ssh-ed25519 ZmFrZQ==', fixture.knownHosts.replace('ssh-ed25519 ', 'ssh-rsa ')]) assert.throws(() => normalizeSshCredential('knownHosts', value));
});

test('OpenSSH containers reject encrypted, mismatched and truncated sections', () => {
  const { field } = sshFixture();
  const count = Buffer.alloc(4); count.writeUInt32BE(1);
  const privatePart = Buffer.alloc(32); privatePart.writeUInt32BE(44, 0); privatePart.writeUInt32BE(44, 4);
  const container = cipher => Buffer.concat([Buffer.from('openssh-key-v1\0'), field(cipher), field('none'), field(''), count, field(Buffer.alloc(32)), field(privatePart)]);
  const wrap = bytes => `-----BEGIN OPENSSH PRIVATE KEY-----\n${bytes.toString('base64')}\n-----END OPENSSH PRIVATE KEY-----\n`;
  assert.ok(normalizeSshCredential('sshKey', wrap(container('none'))));
  assert.throws(() => normalizeSshCredential('sshKey', wrap(container('aes256-ctr'))), /带口令/);
  assert.throws(() => normalizeSshCredential('sshKey', wrap(container('none').subarray(0, -5))));
  privatePart.writeUInt32BE(45, 4);
  assert.throws(() => normalizeSshCredential('sshKey', wrap(container('none'))));
});

test('SSH text saves are atomic as a pair, serialized, masked and preserve blank values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yachiyo-ssh-'));
  const crypto = { encryptStringAsync: async value => Buffer.from(value.split('').reverse().join('')), decryptStringAsync: async bytes => ({ result: bytes.toString().split('').reverse().join('') }) };
  try {
    const store = new ProfileStore(directory, crypto); await store.load(); const fixture = sshFixture();
    await Promise.all([store.save(null, { botToken: 'EXAMPLE_TEST_BOT' }), store.save(null, sshTextUpdates({ sshKey: fixture.privateKey, knownHosts: fixture.knownHosts }))]);
    assert.equal(store.secrets.botToken, 'EXAMPLE_TEST_BOT'); assert.ok(store.secrets.sshKey === fixture.privateKey);
    const before = await readFile(join(directory, 'credentials.bin'));
    await assert.rejects(store.save(null, { sshKey: fixture.privateKey, knownHosts: 'invalid' }));
    assert.ok((await readFile(join(directory, 'credentials.bin'))).equals(before));
    assert.ok(!JSON.stringify(publicSettings(store.config, store.secrets)).includes('BEGIN PRIVATE KEY'));
    assert.ok(!before.includes(Buffer.from(fixture.privateKey)));
    assert.deepEqual(sshTextUpdates({ sshKey: '', knownHosts: fixture.knownHosts }), { knownHosts: fixture.knownHosts });
    for (const patch of [{ sshKey: '' }, { botToken: 'bad' }, null, []]) assert.throws(() => sshTextUpdates(patch));
    const loaded = new ProfileStore(directory, crypto); await loaded.load(); assert.ok(loaded.secrets.sshKey === fixture.privateKey);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
