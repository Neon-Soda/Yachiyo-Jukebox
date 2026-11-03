import { copy as uiCopy } from './customization.mjs';
import { getCustomization } from './customization.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { userError, UserFacingError } from './messages.mjs';

const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/notifications.js': ['notifications.js', 'text/javascript'], '/connect.js': ['connect.js', 'text/javascript'], '/preview.js': ['preview.js', 'text/javascript'], '/search-options.js': ['search-options.js', 'text/javascript'] };
export function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
export async function serveActivityAsset(path, response, directory, preview = false) {
  const versioned = /^\/(app|connect)\.[a-f0-9]{12}\.js$/.test(path) || /^\/style\.[a-f0-9]{12}\.css$/.test(path);
  const file = files[path] ?? (versioned ? [path.slice(1), path.endsWith('.js') ? 'text/javascript' : 'text/css'] : null);
  if (!file || (!preview && ['/preview.js', '/search-options.js'].includes(path))) return json(response, 404, { error: uiCopy("room.7172ba77f214", "页面不存在。") });
  try {
    const bytes = await readFile(join(directory, file[0]));
    response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors ${preview ? "file: http://127.0.0.1:*" : "https://discord.com https://*.discord.com https://*.discordsays.com"}` });
    response.end(bytes);
  } catch { json(response, 503, { error: uiCopy("room.ca63201ad8f2", "点歌台界面尚未构建，请运行 npm run activity:build。") }); }
}
async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new UserFacingError('invalidRequest');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) throw new UserFacingError('invalidRequest');
  }
  try { const data = JSON.parse(body); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; }
  catch { throw new UserFacingError('invalidRequest'); }
}

export function createActivityServer({ clientId, directory, publicOrigin, authenticate, authorize, action, search, cover }) {
  const sessions = new Map(), authAttempts = new Map();
  const origins = new Set([`https://${clientId}.discordsays.com`, ...(publicOrigin ? [new URL(publicOrigin).origin] : [])]);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname.replace(/^\/\.proxy(?=\/)/, '');
      if (request.method === 'GET' && path === '/api/config') return json(response, 200, { clientId, preview: false, theme: getCustomization() });
      if (request.method === 'GET' && /^\/covers\/[a-f0-9]{24}$/.test(path)) {
        const image = await cover?.(path.slice('/covers/'.length));
        if (!image) return json(response, 404, { error: uiCopy("room.5c882a51906f", "封面暂不可用。") });
        response.writeHead(200, { 'Content-Type': image.type, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        return response.end(image.bytes);
      }
      if (!path.startsWith('/api/')) {
        if (request.method !== 'GET') return json(response, 405, { error: uiCopy("room.ecce0fb9d916", "不支持此请求。") });
        return await serveActivityAsset(path, response, directory);
      }
      if (request.headers.origin && !origins.has(request.headers.origin)) return json(response, 403, { error: uiCopy("room.04ea79c8c1c8", "请从 Discord 中打开点歌台。") });
      if (request.method === 'POST' && path === '/api/auth') {
        if (!request.headers.origin || !origins.has(request.headers.origin)) return json(response, 403, { error: uiCopy("room.04ea79c8c1c8", "请从 Discord 中打开点歌台。") });
        const address = request.socket.remoteAddress;
        const attempts = authAttempts.get(address) ?? { count: 0, until: Date.now() + 60000 };
        if (attempts.until < Date.now()) { attempts.count = 0; attempts.until = Date.now() + 60000; }
        authAttempts.set(address, attempts);
        if (++attempts.count > 30 || sessions.size >= 500) return json(response, 429, { error: uiCopy("room.167b0d7caba3", "请求有些频繁，请稍后再试。") });
        const result = await authenticate(await readBody(request));
        const session = randomBytes(32).toString('base64url');
        sessions.set(session, { ...result, accessToken: undefined, lastSeen: Date.now(), expires: Date.now() + Math.min(result.expiresIn ?? 3600, 3600) * 1000, actions: [] });
        return json(response, 200, { session, accessToken: result.accessToken, state: result.room.snapshot() });
      }
      const key = request.headers.authorization?.replace(/^Bearer /, '');
      const session = key && sessions.get(key);
      if (!session || session.expires <= Date.now()) return json(response, 401, { error: uiCopy("room.271e65699350", "会话已过期，请重新打开点歌台。") });
      if (request.method === 'POST' && path === '/api/leave') { sessions.delete(key); return json(response, 200, { ok: true }); }
      if (session.room.closed) return json(response, 200, session.room.snapshot());
      await authorize(session);
      session.lastSeen = Date.now();
      if (request.method === 'GET' && path === '/api/state') return json(response, 200, session.room.snapshot());
      if (request.method === 'POST' && path === '/api/prepare-add') {
        session.linkChecks = (session.linkChecks ?? []).filter(time => time > Date.now() - 60000);
        if (session.linkChecks.length >= 12) return json(response, 429, { error: uiCopy("room.cb07fdb7d445", "链接识别有些频繁，稍等一下再试。") });
        session.linkChecks.push(Date.now());
        const body = await readBody(request);
        const result = await session.room.prepareAdd(body.url);
        session.pendingAdd = { id: randomBytes(16).toString('hex'), input: body.url.trim(), result, expires: Date.now() + 5 * 60000 };
        // Keep metadata private and return just enough to choose; preparation never queues or joins voice.
        const collection = result.collection;
        return json(response, 200, { previewId: session.pendingAdd.id, collection: collection ? {
          title: collection.title, count: collection.tracks.length, skipped: collection.skipped,
          singleTitle: result.single.title, singleIsFirst: result.single.first,
          singleOnly: collection.singleOnly === true,
          kind: collection.kind ?? null,
        } : null });
      }
      if (request.method === 'POST' && path === '/api/search') {
        if (!search) return json(response, 503, { error: uiCopy("room.cdad15b6b629", "搜索暂不可用，请稍后重试。") });
        session.searches = (session.searches ?? []).filter(time => time > Date.now() - 60000);
        if (session.searches.length >= 24) return json(response, 429, { error: uiCopy("room.fd51151abcd0", "搜索有些频繁，稍等一下再试。") });
        session.searches.push(Date.now());
        const body = await readBody(request);
        const result = await search(body.query, body.platforms);
        // Do not return late results to a room that was ended during the lookup.
        if (session.room.closed) return json(response, 200, session.room.snapshot());
        return json(response, 200, result);
      }
      if (request.method === 'POST' && path === '/api/action') {
        session.actions = session.actions.filter(time => time > Date.now() - 60000);
        if (session.actions.length >= 60) return json(response, 429, { error: uiCopy("room.ce9d13d07fdf", "操作有些频繁，稍等一下再试。") });
        session.actions.push(Date.now());
        await action(session, await readBody(request));
        return json(response, 200, session.room.snapshot());
      }
      return json(response, 404, { error: uiCopy("room.fafdc4f42b6c", "操作不存在。") });
    } catch (error) {
      // Never expose upstream OAuth, Cookie, media URL or arbitrary error text.
      if (!response.headersSent) json(response, 400, { error: userError(error) });
      else response.end();
    }
  });
  server.requestTimeout = 75000;
  const cleanup = setInterval(() => {
    for (const [key, session] of sessions) {
      if (session.pendingAdd?.expires <= Date.now() || session.room.closed) session.pendingAdd = null;
      if (session.expires < Date.now() || (session.room.closed && session.lastSeen < Date.now() - 60000)) sessions.delete(key);
    }
    for (const [key, item] of authAttempts) if (item.until < Date.now()) authAttempts.delete(key);
  }, 30000).unref();
  server.on('close', () => clearInterval(cleanup));
  return { server, sessions };
}
