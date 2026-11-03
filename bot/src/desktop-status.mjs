import net from 'node:net';
// The private control pipe is available only to the owning desktop process.
// Never publish identity, session, request or credential data through it.
export function attachDesktopStatus(client, extra = () => ({})) {
  const pipe = process.env.YACHIYO_CONTROL_PIPE, nonce = process.env.YACHIYO_CONTROL_NONCE;
  let transport, authenticated = false, pending = '';
  // Tauri owns the pipe and verifies the peer process ID. The random handshake
  // is never written to logs. Existing Electron IPC remains supported.
  if (pipe && nonce && /^\\\\\.\\pipe\\yachiyo-control-[a-f0-9-]+$/.test(pipe)) {
    transport = net.createConnection(pipe);
    transport.on('connect', () => transport.write(JSON.stringify({ type: 'hello', nonce }) + '\n'));
    transport.on('data', chunk => {
      pending += chunk.toString('utf8');
      if (pending.length > 8192) return transport.destroy();
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        try { const message = JSON.parse(line); if (message.type === 'ready') { authenticated = true; publish(); } else if (authenticated && message.type === 'shutdown') process.emit('SIGTERM'); } catch { transport.destroy(); }
      }
    });
    transport.on('error', () => {});
    transport.on('close', () => process.emit('SIGTERM'));
  } else if (!process.send) return;
  const publish = () => {
    const message = { type: 'status', ready: client.isReady(), ping: Math.max(0, client.ws.ping), ...extra() };
    try { if (transport && authenticated && !transport.destroyed) transport.write(JSON.stringify(message) + '\n'); else if (!transport && process.connected) process.send(message); } catch {}
  };
  const timer = setInterval(publish, 3000); timer.unref();
  for (const name of ['clientReady', 'shardDisconnect', 'shardReconnecting', 'shardResume']) client.on(name, publish);
  process.on('message', message => { if (message?.type === 'shutdown') process.emit('SIGTERM'); });
  // A crashed manager must not leave an orphan using the same Bot token.
  process.on('disconnect', () => process.emit('SIGTERM'));
}
