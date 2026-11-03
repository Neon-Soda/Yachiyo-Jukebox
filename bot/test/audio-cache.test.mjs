import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioCache } from '../src/audio-cache.mjs';
import { UserFacingError } from '../src/messages.mjs';

const track = { platform: 'BILIBILI', url: 'https://www.bilibili.com/video/BV1URHG6zEWq/' };
const prepared = { input: JSON.stringify({ title: 'Test', duration: 235.333, http_headers: { Referer: 'https://www.bilibili.com/' },
  formats: [{ url: 'https://primary.example/audio', vcodec: 'none', _bilibili_backup_urls: ['https://backup.example/audio', 'https://third.example/audio'] }] }) };
function failure(stage) { const error = new UserFacingError('cacheDownloadFailed'); error.diagnosticStage = stage; return error; }

test('a failed Bilibili download discards partial output and switches to the official backup with preserved metadata', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yachiyo-cache-test-')), file = join(directory, 'audio.part');
  t.after(async () => { await unlink(file).catch(() => {}); await rmdir(directory); });
  const cache = new AudioCache({ directory }); const inputs = [];
  cache.download = async (candidate, path) => {
    const info = JSON.parse(candidate.input); inputs.push(info);
    if (inputs.length === 1) { await writeFile(path, 'partial'); throw failure('cache-download'); }
    await assert.rejects(stat(path), error => error.code === 'ENOENT');
    await writeFile(path, 'complete');
  };
  await cache.downloadWithFallback(track, prepared, file);
  assert.equal(inputs.length, 2); assert.equal(inputs[1].formats[0].url, 'https://backup.example/audio');
  assert.deepEqual(inputs[1].http_headers, inputs[0].http_headers); assert.equal(inputs[1].duration, 235.333);
  assert.equal(await readFile(file, 'utf8'), 'complete');
});

test('Bilibili CDN retries are bounded to three attempts within one shared download budget', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yachiyo-cache-test-')), file = join(directory, 'missing.part');
  t.after(() => rmdir(directory));
  const cache = new AudioCache({ directory }), budgets = [];
  let now = 1000; t.mock.method(Date, 'now', () => now);
  cache.download = async (_prepared, _path, timeoutMs) => { budgets.push(timeoutMs); now += 50000; throw failure('cache-download'); };
  await assert.rejects(cache.downloadWithFallback(track, prepared, file), error => error.diagnosticStage === 'cache-download');
  assert.deepEqual(budgets, [180000, 130000, 80000]);
  budgets.length = 0;
  cache.download = async () => { budgets.push(1); now += 180001; throw failure('cache-download'); };
  await assert.rejects(cache.downloadWithFallback(track, prepared, file)); assert.equal(budgets.length, 1);
});

test('successful downloads, other platforms and non-download failures never trigger CDN retries', async () => {
  const cache = new AudioCache(); let attempts = 0;
  cache.download = async () => { attempts++; };
  await cache.downloadWithFallback(track, prepared, 'unused'); assert.equal(attempts, 1);
  for (const [platform, stage] of [['YOUTUBE', 'cache-download'], ['NETEASE', 'cache-download'], ['BILIBILI', 'cache-transcode'], ['BILIBILI', 'cache-timeout'], ['BILIBILI', 'audio-tool']]) {
    attempts = 0; const original = failure(stage);
    cache.download = async () => { attempts++; throw original; };
    await assert.rejects(cache.downloadWithFallback({ ...track, platform }, prepared, 'unused'), error => error === original);
    assert.equal(attempts, 1);
  }
});
