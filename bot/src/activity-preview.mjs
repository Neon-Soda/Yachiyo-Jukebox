import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { serveActivityAsset, json } from './activity-http.mjs';
import { getCustomization } from './customization.mjs';
const directory = fileURLToPath(new URL('../activity/dist/', import.meta.url));
const port = Number(process.env.PREVIEW_PORT || 4173);
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/api/config') return json(response, 200, { preview: true, theme: getCustomization() });
  if (path.startsWith('/api/')) return json(response, 404, { error: '本地预览不连接真实 Bot。' });
  serveActivityAsset(path, response, directory, true);
});
server.listen(port, '127.0.0.1', () => console.log(`Activity preview: http://127.0.0.1:${port}`));
