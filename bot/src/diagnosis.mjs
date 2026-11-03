// Pure classification helpers: no credentials or signed media URLs enter reports.
export function classifyDuration(expected, actual) {
  if (!(Number.isFinite(actual) && actual > 0)) return '无法获取下载音频的有效时长，需要检查提取器或文件格式。';
  if (!(Number.isFinite(expected) && expected > 0)) return `音频文件有 ${actual.toFixed(1)} 秒，但没有歌曲原始时长，暂不能判断是否完整。`;
  if (actual < expected - Math.max(5, expected * 0.1)) {
    return `下载得到的文件只有 ${actual.toFixed(1)} 秒，歌曲标注 ${expected.toFixed(1)} 秒。说明取得的音频本身不完整；试听限制、权限或提取器返回短片段是待查方向，不能仅凭这一项断定。`;
  }
  return `下载文件时长 ${actual.toFixed(1)} 秒，与歌曲标注 ${expected.toFixed(1)} 秒相符。如果 Bot 仍在20秒左右停止，应继续检查流式下载、FFmpeg 或语音播放链路。`;
}

export function errorCategory(stderr) {
  if (/sign in|login|log in|cookies|登录/i.test(stderr)) return '登录或 Cookie 相关错误';
  if (/geo.?restrict|not available in your country|地区/i.test(stderr)) return '地区限制';
  if (/403|forbidden/i.test(stderr)) return 'HTTP 403：媒体服务器拒绝访问';
  if (/429|too many requests/i.test(stderr)) return 'HTTP 429：请求频率受限';
  if (/timed? out|timeout/i.test(stderr)) return '网络请求超时';
  if (/not found|ENOENT/i.test(stderr)) return '工具或资源未找到';
  return '未分类错误（原始日志未写入报告，以免包含登录凭据或签名链接）';
}
