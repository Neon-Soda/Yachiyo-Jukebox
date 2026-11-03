import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';

// Windows ignores POSIX mode=0600 for ACL inheritance. A profile created on a
// shared drive must explicitly protect its runtime Cookie and SSH key files.
export function securePrivateDirectory(directory) {
  if (process.platform !== 'win32') return;
  const target = resolve(directory);
  if ([dirname(target), resolve(homedir()), resolve(tmpdir()), resolve(process.env.SystemRoot || 'C:\\Windows')].includes(target)) throw new Error('运行目录校验失败。');
  const script = `$ErrorActionPreference='Stop'
$profileDirectory=[IO.Path]::GetFullPath($env:YACHIYO_PRIVATE_DIRECTORY)
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=Get-Acl -LiteralPath $profileDirectory
$acl.SetAccessRuleProtection($true,$false)
foreach($existing in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($existing) }
$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
foreach($sid in @($identity,(New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'),(New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544'))) {
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl',$inherit,'None','Allow')
  $acl.AddAccessRule($rule)
}
# Persist only the modified DACL. Set-Acl requests SeSecurityPrivilege even
# for this operation on some Windows profiles; ordinary login lacks it.
[IO.Directory]::SetAccessControl($profileDirectory,$acl)
`;
  const env = { YACHIYO_PRIVATE_DIRECTORY: target };
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  try { execFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { env, windowsHide: true, stdio: 'pipe', timeout: 15000 }); }
  catch { throw new Error('无法设置本机数据的访问权限，请使用 NTFS 上当前用户可写入的安装目录。'); }
}
