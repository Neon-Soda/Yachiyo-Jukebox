import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaTool, ffmpegLocationArgs } from '../src/media-tools.mjs';
test('desktop tool paths with spaces remain a single spawn argument and standalone falls back to PATH', () => {
  const environment = { YACHIYO_FFMPEG_PATH: 'D:\\Audio Tools\\ffmpeg.exe', YACHIYO_FFPROBE_PATH: 'D:\\Audio Tools\\ffprobe.exe', YACHIYO_YT_DLP_PATH: 'D:\\Download Tools\\yt-dlp.exe' };
  assert.equal(mediaTool('ffmpeg', environment), environment.YACHIYO_FFMPEG_PATH);
  assert.equal(mediaTool('ffprobe', environment), environment.YACHIYO_FFPROBE_PATH);
  assert.equal(mediaTool('yt-dlp', environment), environment.YACHIYO_YT_DLP_PATH);
  assert.deepEqual(ffmpegLocationArgs(environment), ['--ffmpeg-location', environment.YACHIYO_FFMPEG_PATH]);
  assert.equal(mediaTool('ffmpeg', {}), 'ffmpeg');
  assert.deepEqual(ffmpegLocationArgs({}), []);
});
