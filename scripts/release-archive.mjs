import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path';

async function digestFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Completed version folders are immutable. A retry may reuse an identical,
// verified archive; a different build must use a different version number.
export async function archiveVersionedInstaller({ releaseRoot, version, installerPath }) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(version)) {
    throw new Error('Invalid release version.');
  }
  if (typeof releaseRoot !== 'string' || !isAbsolute(releaseRoot) || resolve(releaseRoot) === parse(resolve(releaseRoot)).root) {
    throw new Error('Release root must be an absolute non-root directory.');
  }
  const source = resolve(installerPath);
  if (!(await lstat(source)).isFile()) throw new Error('Installer must be a regular file.');
  const sha256 = await digestFile(source), bytes = (await stat(source)).size;
  await mkdir(releaseRoot, { recursive: true });
  const root = await realpath(releaseRoot);
  if (root === parse(root).root) throw new Error('Release root cannot resolve to a filesystem root.');
  const directory = join(root, version), fileName = `Yachiyo-${version}-Windows-x64.exe`;
  const output = join(directory, fileName), checksum = `${sha256}  ${fileName}\n`;
  const result = reused => ({ directory, installerPath: output, installerSha256: sha256, installerBytes: bytes, reused });

  async function existing() {
    let entry;
    try { entry = await lstat(directory); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Release destination is not a regular directory.');
    try {
      for (const file of [output, output + '.sha256', join(directory, 'release.json')]) {
        if (!(await lstat(file)).isFile()) throw new Error('Invalid archive entry.');
      }
      const record = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
      if (record.version !== version || record.installer.file !== fileName || record.installer.sha256 !== sha256 || record.installer.bytes !== bytes ||
          await digestFile(output) !== sha256 || await readFile(output + '.sha256', 'utf8') !== checksum) {
        throw new Error('Archive mismatch.');
      }
    } catch {
      throw new Error(`Release ${version} already exists with different or incomplete contents; it was not overwritten. Use a new version or inspect the archive.`);
    }
    return result(true);
  }

  const prior = await existing();
  if (prior) return prior;
  const pending = await mkdtemp(join(root, '.pending-'));
  try {
    const staged = join(pending, fileName);
    await copyFile(source, staged);
    if (await digestFile(staged) !== sha256) throw new Error('Installer changed while being archived.');
    await writeFile(staged + '.sha256', checksum, { flag: 'wx' });
    await writeFile(join(pending, 'release.json'), JSON.stringify({
      format: 1, version, archivedAt: new Date().toISOString(), platform: 'windows-x64',
      installer: { file: fileName, sha256, bytes },
    }, null, 2) + '\n', { flag: 'wx' });
    try { await rename(pending, directory); }
    catch (error) {
      // Another concurrent build may have completed this version first.
      const completed = await existing();
      if (completed) return completed;
      throw error;
    }
    return result(false);
  } finally {
    // The only recursive cleanup target is the temporary child we created.
    if (dirname(pending) !== root || !basename(pending).startsWith('.pending-')) throw new Error('Invalid archive cleanup path.');
    await rm(pending, { recursive: true, force: true });
  }
}
