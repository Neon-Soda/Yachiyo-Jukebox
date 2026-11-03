import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createActivityServer } from '../src/activity-http.mjs';

test('versioned frontend assets load with correct types while the document is never cached', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yachiyo-assets-'));
  t.after(async () => {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('yachiyo-assets-')) throw new Error('Unexpected fixture directory');
    await rm(directory, { recursive: true, force: true });
  });
  for (const [name, body] of Object.entries({ 'index.html': '<script defer src="./app.123456abcdef.js"></script>', 'app.123456abcdef.js': 'void 0;', 'connect.abcdef123456.js': 'export const connect = () => {};', 'style.012345abcdef.css': 'body{}' })) await writeFile(join(directory, name), body);
  const { server } = createActivityServer({ clientId: '123', directory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const index = await fetch(base + '/'); assert.equal(index.status, 200); assert.equal(index.headers.get('cache-control'), 'no-store');
  for (const name of ['app.123456abcdef.js', 'connect.abcdef123456.js', 'style.012345abcdef.css']) {
    const response = await fetch(base + '/.proxy/' + name);
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /immutable/);
    assert.match(response.headers.get('content-type'), name.endsWith('.js') ? /text\/javascript/ : /text\/css/);
  }
  for (const name of ['app.123456abcdef.css', 'style.012345abcdef.js', 'foo.123456abcdef.js', 'app.notahash.js', '.env']) assert.equal((await fetch(base + '/' + name)).status, 404);
});
