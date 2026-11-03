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
