import { createPrivateKey } from 'node:crypto';

function sshString(bytes, offset) {
  if (offset + 4 > bytes.length) throw new Error('invalid');
  const length = bytes.readUInt32BE(offset), end = offset + 4 + length;
  if (end > bytes.length) throw new Error('invalid');
  return { value: bytes.subarray(offset + 4, end), next: end };
}
function decode(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1) throw new Error('invalid');
  return Buffer.from(value, 'base64');
}
export function normalizeSshCredential(key, input) {
  if (!['sshKey', 'knownHosts'].includes(key) || typeof input !== 'string' || Buffer.byteLength(input) > 2_000_000) throw new Error('SSH 凭据格式无效。');
  const value = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!value || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('请粘贴完整的 SSH 凭据内容。');
  if (key === 'sshKey') {
    const block = value.match(/^-----BEGIN (OPENSSH |RSA |EC |ENCRYPTED )?PRIVATE KEY-----\n([\s\S]+)\n-----END \1PRIVATE KEY-----$/);
    if (!block) throw new Error('请输入完整的 OpenSSH 或 PEM 私钥，包含 BEGIN 和 END 行。');
    if (block[1] === 'ENCRYPTED ' || /Proc-Type:\s*4,ENCRYPTED/.test(block[2])) throw new Error('当前自动隧道不支持带口令的私钥，请使用专用的免口令密钥。');
    if (block[1] === 'OPENSSH ') {
      try {
        const bytes = decode(block[2].replace(/\s/g, '')), magic = Buffer.from('openssh-key-v1\0');
        if (!bytes.subarray(0, magic.length).equals(magic)) throw new Error('invalid');
        const cipher = sshString(bytes, magic.length), kdf = sshString(bytes, cipher.next), options = sshString(bytes, kdf.next);
        if (cipher.value.toString() !== 'none' || kdf.value.toString() !== 'none') throw new Error('encrypted');
        if (options.value.length || options.next + 4 > bytes.length || bytes.readUInt32BE(options.next) !== 1) throw new Error('invalid');
        const publicKey = sshString(bytes, options.next + 4), privateKey = sshString(bytes, publicKey.next);
        if (privateKey.next !== bytes.length || publicKey.value.length < 16 || privateKey.value.length < 32 || privateKey.value.readUInt32BE(0) !== privateKey.value.readUInt32BE(4)) throw new Error('invalid');
      } catch (error) {
        if (error.message === 'encrypted') throw new Error('当前自动隧道不支持带口令的私钥，请使用专用的免口令密钥。');
        throw new Error('私钥内容无法解析，请检查是否完整复制。');
      }
    } else {
      try { createPrivateKey({ key: value, passphrase: '' }); }
      catch { throw new Error('私钥内容无法解析，请检查是否完整复制。'); }
    }
  } else {
    const lines = value.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    if (!lines.length) throw new Error('known_hosts 至少需要一条服务器主机密钥记录。');
    for (const line of lines) {
      try {
        const parts = line.split(/\s+/);
        if (parts[0].startsWith('@')) { if (!['@cert-authority', '@revoked'].includes(parts.shift())) throw new Error('invalid'); }
        const [host, algorithm, encoded] = parts;
        if (!host || !/^(?:ssh-|ecdsa-|sk-)[A-Za-z0-9@._+-]+$/.test(algorithm || '')) throw new Error('invalid');
        const bytes = decode(encoded || ''), type = sshString(bytes, 0);
        if (type.value.toString() !== algorithm || bytes.length < type.next + 8) throw new Error('invalid');
      } catch { throw new Error('known_hosts 格式无效，请粘贴包含主机名、密钥类型和公钥的完整记录。'); }
    }
  }
  return `${value}\n`;
}

export function sshTextUpdates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['sshKey', 'knownHosts'].includes(key))) throw new Error('SSH 凭据格式无效。');
  const updates = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string') throw new Error('SSH 凭据格式无效。');
    if (value.trim()) updates[key] = normalizeSshCredential(key, value);
  }
  if (!Object.keys(updates).length) throw new Error('请先粘贴私钥或 known_hosts 内容。');
  return updates;
}
