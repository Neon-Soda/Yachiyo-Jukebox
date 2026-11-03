import { generateKeyPairSync } from 'node:crypto';
export function sshFixture() {
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const field = value => { const data = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([size, data]); };
  const encoded = Buffer.concat([field('ssh-ed25519'), field(raw)]).toString('base64');
  return { privateKey, knownHosts: `example.test ssh-ed25519 ${encoded}\n`, pair, field };
}
