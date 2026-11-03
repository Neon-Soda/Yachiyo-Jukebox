import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { argsFor, inspect, parseLink, prepareDownload } from './media.mjs';
import { publicBilibiliInfo } from './bilibili.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (existsSync('.env')) process.loadEnvFile('.env');
const lines = [];
const report = text => { lines.push(text); console.log(text); };
try {
  report(`Bilibili diagnostic: ${new Date().toISOString()}`);
  const link = parseLink(process.argv[2]);
  if (link.platform !== 'BILIBILI') throw new Error('wrongPlatform');
  const publicOnly = process.argv.includes('--public-api');
  const track = publicOnly ? { ...link, ...await publicBilibiliInfo(link) } : await inspect(link);
  report(`Extraction mode: ${publicOnly ? 'public API fallback' : 'Bot production path'}`);
  report(`Metadata: OK; duration=${track.duration ?? 'unknown'} seconds`);
  const prepared = publicOnly
    ? { args: [...argsFor(track), '--no-progress', '-o', '-', '--load-info-json', '-'], input: JSON.stringify(track) }
    : await prepareDownload(track);
  const result = await new Promise(resolve => {
    const download = spawn('yt-dlp', prepared.args, { windowsHide: true });
    const decoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-t', '7200', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1'], { windowsHide: true });
    let pcmBytes = 0, downloadCode, decoderCode, closed = 0, timedOut = false, failedToStart = false;
    const timer = setTimeout(() => { timedOut = true; download.kill(); decoder.kill(); }, 120000);
    const finish = () => {
      if (++closed !== 2) return;
      clearTimeout(timer);
      resolve({ pcmBytes, downloadCode, decoderCode, timedOut, failedToStart });
    };
    download.on('error', () => { failedToStart = true; });
    decoder.on('error', () => { failedToStart = true; download.kill(); });
    download.stderr.resume(); decoder.stderr.resume();
    download.stdin.on('error', () => {});
    download.stdout.on('error', () => { download.kill(); decoder.kill(); });
    decoder.stdin.on('error', () => {});
    decoder.stdout.on('data', b => { pcmBytes += b.length; });
    download.on('close', code => { downloadCode = code; finish(); });
    decoder.on('close', code => { decoderCode = code; if (code !== 0) download.kill(); finish(); });
    download.stdout.pipe(decoder.stdin);
    download.stdin.end(prepared.input);
  });
  const actual = result.pcmBytes / 192000;
  report(`Streaming decode: ${JSON.stringify({ ...result, decodedSeconds: actual })}`);
  const complete = result.downloadCode === 0 && result.decoderCode === 0 && !result.timedOut && !result.failedToStart && actual > 0 && (!track.duration || Math.abs(actual - track.duration) < Math.max(5, track.duration * 0.01));
  report(`Full audio validation: ${complete ? 'PASS' : 'FAIL'}`);
  if (!complete) process.exitCode = 1;
} catch (error) {
  // Only fixed codes are emitted. Never print upstream errors or media metadata.
  report(`Diagnostic failed: ${error.key ?? 'checkFailed'}; stage=${error.diagnosticStage ?? 'extractor'}`);
  process.exitCode = 1;
} finally {
  await mkdir('logs', { recursive: true });
  await writeFile('logs/bilibili-check.txt', lines.join('\n') + '\n');
}
