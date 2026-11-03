import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { classifyDuration, errorCategory } from './diagnosis.mjs';

// Resolve the project root even if the script is launched from another directory.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (existsSync('.env')) process.loadEnvFile('.env');
const { parseLink, inspect, argsFor } = await import('./media.mjs');
const lines = [];
const report = text => { console.log(text); lines.push(text); };
let scratch;

async function run(executable, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill('SIGKILL'));
      } else child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', data => { out = (out + data).slice(-1024 * 1024); });
    child.stderr.on('data', data => { err = (err + data).slice(-64000); });
    child.on('error', () => { clearTimeout(timer); reject(new Error(`${executable} 无法启动，请先安装或检查 PATH。`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${executable} 运行超时。`));
      else if (code !== 0) reject(new Error(`${executable} 退出码 ${code}；${errorCategory(err)}`));
      else resolve(out.trim());
    });
  });
}

try {
  report(`网易云诊断时间：${new Date().toISOString()}`);
  let input = process.argv[2];
  if (!input) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { input = await rl.question('粘贴发生中断的网易云单曲 HTTPS 链接，然后回车：'); }
    finally { rl.close(); }
  }
  const link = parseLink(input.trim());
  if (link.platform !== 'NETEASE') throw new Error('此诊断只接受网易云音乐链接。');
  report(`yt-dlp 版本：${await run('yt-dlp', ['--version'], 15000)}`);
  report(`网易云 Cookie：${process.env.NETEASE_COOKIES ? '已配置（不会写入报告）' : '未配置，Bot 没有使用浏览器里的网易云登录状态'}`);
  console.log('正在读取歌曲信息……');
  const track = await inspect(link);
  report(`歌曲：${track.title}`);
  report(`标注时长：${track.duration ?? '未知'} 秒`);
  scratch = await mkdtemp(join(tmpdir(), 'discord-netease-check-'));
  console.log('正在将音频下载到临时目录，以检查文件实际时长（最多等待两分钟）……');
  await run('yt-dlp', [...argsFor(track), '--no-progress', '--max-filesize', '150M', '-o', join(scratch, 'audio.%(ext)s'), '--', track.url]);
  const files = (await readdir(scratch)).filter(name => name.startsWith('audio.') && !name.endsWith('.part') && !name.endsWith('.ytdl'));
  if (files.length !== 1) throw new Error('没有得到单个完整音频文件，可能超过150MB限制或下载未完成。');
  const file = join(scratch, files[0]);
  const info = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], 30000));
  const actual = Number(info.format?.duration);
  report(`文件时长：${Number.isFinite(actual) ? actual.toFixed(1) : '未知'} 秒`);
  report(classifyDuration(track.duration, actual));
  console.log('检查音频能否完整解码……');
  await run('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-vn', '-f', 'null', '-']);
  report('FFmpeg 完整解码检查：通过。');
  report('此检查使用同一套 yt-dlp 参数和 Cookie，不连接 Discord，也不会切换 Bot 队列。');
} catch (error) {
  report(`诊断未完成：${error.message}`);
  process.exitCode = 1;
} finally {
  if (scratch && dirname(resolve(scratch)) === resolve(tmpdir()) && basename(scratch).startsWith('discord-netease-check-')) {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
  await mkdir('logs', { recursive: true });
  await writeFile('logs/netease-check.txt', lines.join('\n') + '\n', 'utf8');
  console.log('报告已保存：logs/netease-check.txt。可以把这份报告发来继续排查。');
}
