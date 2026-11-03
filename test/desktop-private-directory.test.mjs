import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { securePrivateDirectory } from '../core/private-directory.mjs';
test('Windows profile protection removes broad inherited access from existing runtime files', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'yachiyo-private-'));
  const shell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = { YACHIYO_TEST_DIRECTORY: root };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC']) if (process.env[key]) env[key] = process.env[key];
  const run = command => execFileSync(shell, ['-NoProfile', '-NonInteractive', '-Command', command], { env, windowsHide: true, encoding: 'utf8' }).trim();
  try {
    await mkdir(join(root, 'private-runtime')); await writeFile(join(root, 'private-runtime/key'), 'EXAMPLE_ONLY');
    run(`$ErrorActionPreference='Stop';$acl=Get-Acl -LiteralPath $env:YACHIYO_TEST_DIRECTORY;$sid=New-Object Security.Principal.SecurityIdentifier 'S-1-1-0';$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);[IO.Directory]::SetAccessControl($env:YACHIYO_TEST_DIRECTORY,$acl)`);
    securePrivateDirectory(root);
    const ids = JSON.parse(run(`$acl=Get-Acl -LiteralPath (Join-Path $env:YACHIYO_TEST_DIRECTORY 'private-runtime/key');@($acl.Access|ForEach-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value})|ConvertTo-Json -Compress`));
    assert.ok(!ids.some(id => ['S-1-1-0', 'S-1-5-11', 'S-1-5-32-545'].includes(id)));
    assert.ok(ids.includes('S-1-5-18'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
