// Validate imported settings and SSH credentials in a short-lived process.
// Input/output use anonymous pipes, never logs or command-line arguments.
import { sshTextUpdates } from '../desktop/ssh-credentials.mjs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseEnv as parse } from 'node:util';
async function read(file, limit = 2_000_000) { if ((await stat(file)).size > limit) throw new Error('文件超过允许的大小。'); return readFile(file, 'utf8'); }
async function importProject(project) {
  try {
    const env = parse(await read(join(project, '.env'), 64000));
    const config = { guildId: env.GUILD_ID || '', clientId: env.DISCORD_CLIENT_ID || '', activityEnabled: env.ACTIVITY_ENABLED === '1', publicOrigin: env.ACTIVITY_PUBLIC_ORIGIN || '', port: Number(env.ACTIVITY_PORT || 3178), cacheMb: Number(env.AUDIO_CACHE_MB || 1024), idleMinutes: Number(env.IDLE_TIMEOUT_MINUTES || 5) };
    const secrets = { botToken: env.DISCORD_TOKEN || '', clientSecret: env.DISCORD_CLIENT_SECRET || '' };
    for (const platform of ['youtube', 'bilibili', 'netease']) if (env[`${platform.toUpperCase()}_COOKIES`]) secrets[`${platform}Cookies`] = await read(resolve(project, env[`${platform.toUpperCase()}_COOKIES`]));
    try {
      const script = await read(join(project, 'windows/tunnel-run.ps1'), 64000);
      const host = script.match(/'([A-Za-z0-9_.-]+)@([A-Za-z0-9.-]+)'/), port = script.match(/127\.0\.0\.1:(\d+):127\.0\.0\.1:\d+/);
      if (host && port) {
        const sshKey = await read(join(project, 'data/tunnel/id_ed25519'), 64000), knownHosts = await read(join(project, 'data/tunnel/known_hosts'), 1_000_000);
        Object.assign(secrets, sshTextUpdates({ sshKey, knownHosts }));
        Object.assign(config, { connectionMode: 'ssh', sshHost: host[2], sshUser: host[1], remotePort: Number(port[1]) });
      }
    } catch { /* Legacy SSH configuration is optional. */ }
    return { config, secrets };
  } catch { throw new Error('文件无法读取。'); }
}
let input = '';
for await (const chunk of process.stdin) { input += chunk.toString('utf8'); if (input.length > 4_100_000) process.exit(2); }
try { const request = JSON.parse(input); const value = request.operation === 'project' ? await importProject(request.path) : sshTextUpdates(request.input); process.stdout.write(JSON.stringify({ ok: true, value })); }
catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error instanceof SyntaxError ? '文件格式无效。' : error.message })); }
