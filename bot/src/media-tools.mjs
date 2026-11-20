import { spawn } from 'node:child_process';
import { join } from 'node:path';

// The Windows yt-dlp launcher may have a child holding its output pipe.
export function stopExtractor(child) {
  if (!child.pid || process.platform !== 'win32') { child.kill('SIGKILL'); return; }
  if (child.exitCode !== null || child.signalCode !== null) return;
  const taskkill = join(process.env.SystemRoot || 'C:/Windows', 'System32', 'taskkill.exe');
  const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  killer.on('error', () => child.kill('SIGKILL'));
  killer.on('close', code => { if (code && child.exitCode === null) child.kill('SIGKILL'); });
}

export function downloadTimeoutMs(seconds = process.env.DOWNLOAD_TIMEOUT_SECONDS ?? 30) {
  const value = Number(seconds);
  return Number.isInteger(value) && value >= 5 && value <= 300 ? value * 1000 : 30000;
}

// Desktop launches use the exact executables selected and checked by the user.
// Standalone Node deployments can continue to resolve their tools through PATH.
const environmentKeys = {
  ffmpeg: 'YACHIYO_FFMPEG_PATH',
  ffprobe: 'YACHIYO_FFPROBE_PATH',
  'yt-dlp': 'YACHIYO_YT_DLP_PATH',
};
export function mediaTool(name, environment = process.env) {
  return environment[environmentKeys[name]] || name;
}
export function ffmpegLocationArgs(environment = process.env) {
  return environment.YACHIYO_FFMPEG_PATH ? ['--ffmpeg-location', environment.YACHIYO_FFMPEG_PATH] : [];
}
