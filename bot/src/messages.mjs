import { copy as uiCopy } from './customization.mjs';
// Yachiyo-inspired original Chinese copy: gentle, playful, and a little theatrical.
// All Discord copy is collected here. Keep ${...} placeholders in functions.
export const messages = {
  command: {
    play: uiCopy("bot.af02a8c4b73b", "把想听的歌交给我吧 ♪ 播放或加入歌单"),
    link: uiCopy("bot.1100a24ef8ba", "YouTube 视频/播放列表、B站单集/合集或网易云单曲 HTTPS 链接"),
    queue: uiCopy("bot.3b1a399f5457", "翻开今夜的歌单，看看接下来有哪些旋律"),
    skip: uiCopy("bot.e315846d3dd3", "为这一曲谢幕，切到下一首"),
    pause: uiCopy("bot.5fadf2cbf258", "让旋律稍稍休息，暂停播放"),
    resume: uiCopy("bot.fc9d9ee90714", "接上刚才的旋律，继续播放"),
    stop: uiCopy("bot.b8c201ae9424", "结束这一场听歌，清空歌单并退出语音频道"),
  },
  nowPlaying: title => uiCopy("bot.ea3931a680e1", "🌙 接下来，把舞台交给《{title}》。准备好了吗？一起听吧。♪", { title: title }),
  added: title => uiCopy("bot.be0878cfe66b", "愿望收到。《{title}》已经加入歌单啦，等它的旋律来到你身边。♪", { title: title }),
  collectionAdded: (title, count, skipped) => uiCopy("bot.ba8f8295ba1a", "《{title}》已按顺序加入 {count} 首。{value3}让旋律一首一首登场吧。♪", { title: title, count: count, value3: skipped ? uiCopy("bot.428ef48c13e6", "另有 {skipped} 个不可用或超长条目已跳过。", { skipped: skipped }) : '' }),
  skipped: (title, hasNext) => uiCopy("bot.49ec19409ecc", "《{title}》先在这里谢幕吧。{value2}", { title: title, value2: hasNext ? uiCopy("bot.34f7c97e0ff0", "下一首马上登场。♪") : uiCopy("bot.de942efaf14e", "歌单暂时空了，再点一首你想听的歌吧。") }),
  paused: uiCopy("bot.fb70bda70377", "旋律暂停了。去忙你的事吧，想继续听时，用 /resume 叫我就好。"),
  resumed: uiCopy("bot.50df835a6f65", "回来了？那就接上刚才的旋律，继续一起听吧。♪"),
  alreadyPaused: uiCopy("bot.53a3e7b0cfed", "音乐已经暂停啦。不用着急，我在这里等你回来。"),
  alreadyPlaying: uiCopy("bot.441681589224", "旋律正好好地流淌着呢，已经在播放啦。♪"),
  pauseNotReady: uiCopy("bot.4a9dd32e37c6", "这一曲还在准备上场，暂时不能暂停。等音乐响起来，再叫我吧。"),
  resumeNotReady: uiCopy("bot.01ea6346078c", "这一曲还没有准备好继续播放。稍等一下；若一直没有声音，可以 /skip 换一首。"),
  stopped: uiCopy("bot.7fdd6126849a", "今夜的歌单已经清空，我也先离开语音频道啦。下次想听歌，记得再叫我。🌙"),
  stopEmpty: uiCopy("bot.45dc3caf0800", "这里已经安静下来啦，歌单也是空的。想开场时，交给我一首歌就好。♪"),
  idleLeave: minutes => uiCopy("bot.3cb252d2c39d", "歌单已经安静了 {minutes} 分钟，我先轻轻谢幕，离开语音频道啦。想再听歌时，用 /play 叫我回来就好。🌙", { minutes: minutes }),
  queue: (current, tracks, paused = false) => {
    const lines = [uiCopy("bot.42a732ec18cf", "🌙 今夜的歌单")];
    lines.push(current ? `${paused ? uiCopy("bot.af3f329789cd", "暂停中的旋律") : uiCopy("bot.8e09315dd4ec", "此刻的旋律")}：《${current.title}》` : uiCopy("bot.7f13c0f2ddb5", "舞台暂时安静着，来点一首你喜欢的歌吧。"));
    if (!tracks.length) lines.push(uiCopy("bot.80b3d4e93a33", "接下来还没有安排。下一首，由你来选。♪"));
    else {
      lines.push(uiCopy("bot.9fea6875a92a", "等待登场 · {length} 首", { length: tracks.length }));
      lines.push(...tracks.slice(0, 10).map((track, index) => `${index + 1}. ${track.title}`));
      if (tracks.length > 10) lines.push(uiCopy("bot.bb7c527bb61b", "还有 {value1} 首在后台等候。", { value1: tracks.length - 10 }));
    }
    return lines.join('\n');
  },
  playbackFailed: (title, hasNext) => uiCopy("bot.ab1656302d05", "哎呀，《{title}》这次没能顺利唱完。可能是登录权限、地区限制或音频下载出了问题。{value2}", { title: title, value2: hasNext ? uiCopy("bot.6054d70a6e02", "先让下一首登场吧。") : uiCopy("bot.8834540a04f1", "这首已从队列移出；检查链接或登录状态后，可以再点一次。") }),
  playbackInterrupted: hasNext => uiCopy("bot.d7f508deb6f3", "旋律突然中断了呢。{value1}", { value1: hasNext ? uiCopy("bot.aa21e9569878", "别急，我试试下一首。") : uiCopy("bot.257ebf24143c", "歌单暂时没有下一首，请重新点歌；若反复中断，再检查主机的播放日志。") }),
  voiceFailed: uiCopy("bot.8c08cf2a9a39", "通往语音舞台的连接断开了呢。这次歌单会先清空，网络恢复后，再用 /play 叫我回来吧。"),
  unnamed: uiCopy("bot.54d07d35c5c7", "还没有名字的旋律"),
  errors: {
    collectionReadFailed: uiCopy("bot.c70b30ef8b4f", "这次没能读全合集，请检查链接和访问权限后重试。为了避免漏歌，我没有只加入第一首。"),
    collectionTooLarge: uiCopy("bot.90c3889e9900", "这个合集超过了单次 500 首的上限，请使用较小的播放列表，或选一首单独加入。"),
    collectionEmpty: uiCopy("bot.e15a5520e238", "这个合集没有找到可加入的条目，可能包含直播、私密视频或超过两小时的内容。"),
    collectionQueueFull: uiCopy("bot.d6253df669db", "当前歌单剩余空间不足以完整加入这个合集。每个房间最多 500 首，请先整理歌单后再试。"),
    invalidSearch: uiCopy("bot.1a9ea74dea7d", "请输入 1～100 字的歌名，或歌名加歌手。完整链接可以粘贴到下方加入歌单。"),
    searchBusy: uiCopy("bot.08800e2fac44", "现在找歌的人有点多，稍等片刻再搜索吧。"),
    searchUnavailable: uiCopy("bot.889622411066", "所选平台暂时没能完成搜索，请稍后再试或换个平台；也可以直接粘贴歌曲链接。"),
    invalidSeek: uiCopy("bot.472e2fe1d941", "这个进度暂时跳不过去。请等歌曲准备好，再选择歌曲时长范围内的位置。"),
    invalidMode: uiCopy("bot.ebd6fc6ac127", "这种播放方式还没有准备好，请从点歌台里的选项中选择。"),
    roomClosed: uiCopy("bot.50e90580f472", "这一场听歌已经结束，歌单也已清空。重新打开点歌台，就能开始新的旋律。"),
    roomOccupied: uiCopy("bot.32ed17b8a51b", "我正在另一个语音频道演出。请等那边结束后再开始，本频道的歌单不会混过去。"),
    activityRequired: uiCopy("bot.7dc1c34bc1c7", "请从你所在的普通语音频道打开 Yachiyo 点歌台，再来一起听歌吧。"),
    invalidRequest: uiCopy("bot.62bcd2db4c93", "这次操作没能读懂，请刷新点歌台后再试一次。"),
    cacheFull: uiCopy("bot.3e84ed3c15ac", "音频缓存暂时没有空位了，等当前歌曲结束后再试一次吧。"),
    cacheDownloadFailed: uiCopy("bot.c45d7a48e7fd", "这一曲的音频没有完整准备好。请检查链接或登录状态，再点一次试试。"),
    wrongGuild: uiCopy("bot.2fc09f193a12", "呵呵，我的舞台在另一边呢。请到为我配置的 Discord 服务器来找我吧。"),
    joinVoice: uiCopy("bot.a6e15de35420", "想一起听歌吗？先加入一个普通语音频道，我就来。Stage 舞台频道暂时还不支持哦。♪"),
    differentVoice: uiCopy("bot.920911d58822", "我正在另一个语音频道陪大家听歌呢。先加入我所在的频道，再把想听的歌告诉我吧。"),
    busy: uiCopy("bot.62d306bf6bc9", "稍等一下，我还在寻找上一位点的旋律。等这次解析结束，再把你的那首交给我吧。"),
    queueFull: uiCopy("bot.f38ac4dbb437", "呵呵，今夜的节目很热闹呢。歌单已经满啦，先整理一下歌单再来点歌吧。"),
    cancelled: uiCopy("bot.34948ef458ab", "这次点歌已经取消啦。改变主意也没关系，想听的时候再来找我。"),
    leftVoice: uiCopy("bot.c587f63d2710", "咦，你已经离开刚才的语音频道了呢。先加入想听歌的频道，再点一次吧。"),
    voicePermissions: uiCopy("bot.2d6cb4d3eb62", "想把旋律送到大家耳边，还需要「查看频道」「连接」和「说话」权限。请让管理员为我打开这些权限吧。"),
    voiceTimeout: uiCopy("bot.c28be5dbdaa3", "让你久等了，语音频道还是没连上。请检查运行我的主机网络和出站 UDP，再点一次歌吧。"),
    nothingPlaying: uiCopy("bot.13ba20b705ee", "现在还没有音乐在播放呢。用 /play 点一首喜欢的歌，让舞台亮起来吧。♪"),
    invalidLink: uiCopy("bot.2c4e1a86742d", "这份邀请还缺一点线索呢。请给我完整的音乐或视频网页链接，比如 https://music.163.com/song?id=歌曲ID。"),
    insecureLink: uiCopy("bot.535a0fc59ed3", "想找到这首旋律，请发来以 https:// 开头的普通平台链接，不要附上账号密码或自定义端口哦。"),
    unsupportedPlatform: uiCopy("bot.d375de637701", "这条路我暂时还不认识呢。目前能接住的愿望来自 YouTube、B站和网易云音乐，请换一个这些平台的链接吧。"),
    extractTimeout: uiCopy("bot.cade805c64c3", "找这首歌花的时间有点久，这次解析已经超时了。稍后再点一次吧；若总是这样，请检查主机网络。"),
    responseTooLarge: uiCopy("bot.9c60a9fc1b2f", "平台一下送来了太多信息，这次解析只好先停下。试试单首歌曲或单个视频的链接吧。"),
    extractorMissing: uiCopy("bot.1beb96f965d9", "找歌的小帮手 yt-dlp 没能启动。请在运行我的主机上执行 1-install.cmd，再来试一次。"),
    extractFailed: uiCopy("bot.f41917667b3d", "这次还没能找到可播放的音频。请先确认链接有效，再检查登录 Cookie、账号权限和地区限制；网页登录不会自动同步给我哦。"),
    invalidMetadata: uiCopy("bot.1a26f760f730", "平台送来的歌曲信息没能读懂。请重试；若仍失败，更新 yt-dlp 后再把链接交给我吧。"),
    unsupportedCollection: uiCopy("bot.261747fc40ed", "这类内容暂时还不能直接播放。请换成普通单曲或视频链接；直播和互动视频暂不支持。"),
    tooLong: uiCopy("bot.847a0db6e0f2", "这场演出有点太长啦。单次播放最多两小时，请换一个更短的音乐或视频链接吧。"),
    discordPermissions: uiCopy("bot.c5893eb01801", "我听见你的请求了，但 Discord 的频道权限挡住了我。请让管理员检查查看频道、发消息、连接和说话权限。"),
    channelMissing: uiCopy("bot.73ec674890af", "刚才的频道好像不见了呢。请回到一个仍然可用的频道，再试一次吧。"),
    unknown: uiCopy("bot.f9f266d5ce21", "哎呀，这次请求没能顺利完成。稍后再试一次吧；若还是不行，请查看 Bot 日志，我们一起找出原因。"),
    unsupportedCommand: uiCopy("bot.22f049eeb440", "这个愿望我还没学会呢。请从当前的 /play、/queue、/skip、/pause、/resume、/stop 里选一个吧。"),
  },
  runtime: {
    invalidConfig: uiCopy("bot.49c5bb5d1a21", "🌙 开场前还差一步：请在 .env 中填写 DISCORD_TOKEN 和正确的 GUILD_ID。"),
    ready: tag => uiCopy("bot.c1d767c6b30d", "Bot ready: {tag} · 🌙 Yachiyo 的舞台准备好了，等你来点歌。", { tag: tag }),
    registerFailed: uiCopy("bot.6a96ecea4802", "🌙 指令还没能登上舞台：请检查服务器 ID、Bot 邀请权限和网络连接。"),
    loginFailed: uiCopy("bot.f5e553417450", "🌙 今夜暂时没能上线：请检查 Bot Token 和主机网络连接。"),
    unexpected: code => uiCopy("bot.dad9dfb84fac", "[Yachiyo] 请求处理失败，错误类型/代码：{code}", { code: code }),
  },
};

export class UserFacingError extends Error {
  constructor(key) {
    super(messages.errors[key] ?? messages.errors.unknown);
    this.name = 'UserFacingError';
    this.key = key;
  }
}

export function userError(error) {
  if (error instanceof UserFacingError) return error.message;
  if (Number(error?.code) === 50013 || Number(error?.code) === 50001) return messages.errors.discordPermissions;
  if (Number(error?.code) === 10003) return messages.errors.channelMissing;
  return messages.errors.unknown;
}
