import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLink } from '../src/media.mjs';
test('platform links and NetEase fragment normalization', () => {
  assert.equal(parseLink('https://youtu.be/abc').platform, 'YOUTUBE');
  assert.equal(parseLink('https://www.bilibili.com/video/BV123').platform, 'BILIBILI');
  assert.equal(parseLink('https://music.163.com/#/song?id=123').url, 'https://music.163.com/song?id=123');
});
test('reject non-platform and unsafe inputs', () => {
  for (const url of ['file:///etc/passwd', 'http://youtu.be/a', 'https://youtube.com.evil.test/a', 'https://localhost/', 'https://user:pass@youtube.com/a', 'https://youtube.com:8443/a', '-o /tmp/x']) assert.throws(() => parseLink(url));
});
