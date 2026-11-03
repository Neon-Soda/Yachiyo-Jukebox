import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { archiveVersionedInstaller } from '../scripts/release-archive.mjs';

async function fixture(t) {
  const parent = resolve(tmpdir()), root = await mkdtemp(join(parent, 'yachiyo-release-test-'));
  t.after(async () => {
    assert.equal(dirname(root), parent);
    await rm(root, { recursive: true, force: true });
  });
  const installerPath = join(root, 'build.exe'), releaseRoot = join(root, 'releases');
  await writeFile(installerPath, 'installer fixture A');
  return { installerPath, releaseRoot, version: '1.2.3' };
}

test('archives a version with its verified installer, checksum and manifest', async t => {
  const input = await fixture(t), output = await archiveVersionedInstaller(input);
  const content = await readFile(input.installerPath), expected = createHash('sha256').update(content).digest('hex');
  assert.deepEqual(await readFile(output.installerPath), content);
  assert.equal(output.installerSha256, expected);
  assert.equal(await readFile(output.installerPath + '.sha256', 'utf8'), `${expected}  Yachiyo-1.2.3-Windows-x64.exe\n`);
  const manifest = JSON.parse(await readFile(join(output.directory, 'release.json'), 'utf8'));
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.installer.bytes, content.length);
  assert.deepEqual(await readdir(input.releaseRoot), ['1.2.3']);
});

test('identical retries retain the original archive record', async t => {
  const input = await fixture(t), first = await archiveVersionedInstaller(input);
  const before = await readFile(join(first.directory, 'release.json'));
  const again = await archiveVersionedInstaller(input);
  assert.equal(again.reused, true);
  assert.deepEqual(await readFile(join(first.directory, 'release.json')), before);
});

test('different installers cannot overwrite an archived version', async t => {
  const input = await fixture(t), first = await archiveVersionedInstaller(input);
  const before = await readFile(first.installerPath);
  await writeFile(input.installerPath, 'installer fixture B');
  await assert.rejects(archiveVersionedInstaller(input), /not overwritten/);
  assert.deepEqual(await readFile(first.installerPath), before);
  const next = await archiveVersionedInstaller({ ...input, version: '1.2.4' });
  assert.notEqual(next.directory, first.directory);
  assert.deepEqual((await readdir(input.releaseRoot)).sort(), ['1.2.3', '1.2.4']);
});

test('concurrent identical builds publish one complete archive', async t => {
  const input = await fixture(t);
  const results = await Promise.all([archiveVersionedInstaller(input), archiveVersionedInstaller(input)]);
  assert.equal(results.filter(result => !result.reused).length, 1);
  assert.deepEqual(await readdir(input.releaseRoot), ['1.2.3']);
});

test('invalid versions and incomplete archives cannot be reused', async t => {
  const input = await fixture(t);
  await assert.rejects(archiveVersionedInstaller({ ...input, version: '../outside' }), /Invalid release version/);
  const first = await archiveVersionedInstaller(input);
  await writeFile(first.installerPath + '.sha256', 'corrupt checksum');
  await assert.rejects(archiveVersionedInstaller(input), /not overwritten/);
});
