# 配置指南

**简体中文** · [English](CONFIGURATION.en.md) · [文档目录](README.md)

## 播放工具

首次打开应用会提示补全工具。进入「工具库」，打开 FFmpeg 下载页，下载 Windows x64 正式版 release essentials ZIP 并解压；选择 `bin/ffmpeg.exe` 后会自动配对同目录的 `ffprobe.exe`。再从 yt-dlp 发布页下载并选择 `yt-dlp.exe`。已有工具可以直接选择。

应用会检查文件格式、版本、音频编解码、时长读取和进度定位。只有成功才保存新关联，失败保留原配置。工具留在所选位置，移动或更新后须重新检查；运行中的 Bot 在重启后使用新配置。取消关联不会删除工具文件。缺少工具时仍可设置账户和主题，但不能启动 Bot。详细版本要求见 [工具说明](../tools/README.md)。

## Discord 应用

在 [Discord Developer Portal](https://discord.com/developers/applications) 中创建或选择自己的应用与 Bot。在 Yachiyo 的「连接与账户」中填写：

| 设置 | 用途 |
| --- | --- |
| Application ID | 标识 Discord 应用 |
| 服务器 ID | Bot 使用的 Discord 服务器 |
| Bot Token | Bot 登录凭据 |
| Client Secret | Activity 的 OAuth 登录校验 |

通过「邀请 Bot」完成服务器邀请，并确保 Bot 在目标语音频道有连接和发言权限。仅使用聊天指令时，可以关闭「启用 Discord Activity 点歌台」。

## Activity 与 HTTPS

Activity 需要能被 Discord 访问的 HTTPS 服务。公网 IP、域名或 SSH 登录本身不等于已经具备 HTTPS。

1. 在 Developer Portal 启用 Activities。
2. 在应用中填写自己的公网 HTTPS 根地址，例如 `https://music.example.com`。
3. 按应用页面显示的值填写 URL Mapping：Prefix 为 `/`，Target 为该 HTTPS 地址的主机名。
4. 按应用页面提供的 OAuth2 Redirect URI 完成后台配置；当前占位地址为 `https://127.0.0.1`，实际授权回跳由 Discord Activity SDK 处理。
5. 保存并启动 Bot，检查 Discord、本地网页及公网 HTTPS 的状态。

Activity 的测试访问和分发权限也需要在 Discord 后台配置。流程说明见 [Discord 官方 Activity 指南](https://docs.discord.com/developers/activities/building-an-activity)。

## 连接方式

| 模式 | 适用情况 | 应用管理的内容 |
| --- | --- | --- |
| 公网直连 | 已有公网 HTTPS 或自行配置反向代理 | Bot 和网页服务 |
| SSH 反向隧道 | 通过自己的服务器转发桌面端 HTTP 服务 | Bot、专用 SSH 进程和重连 |
| 已有隧道 / 代理 | 自行运行 frp 或其他代理 | Bot 和最终 HTTPS 连通性检查 |

默认 HTTP 服务监听 `127.0.0.1:3178`。只有反向代理位于其他设备时才需要改为监听所有网卡。外部证书、DNS、防火墙和反向代理由部署者配置，应用不会自动安装服务器软件。

SSH 模式中填写主机、用户名、SSH 端口和远端回环端口，并粘贴私钥及已经核对的 `known_hosts`；也可以从文件导入。自动连接使用免口令专用私钥，不保存服务器密码。空白输入保留已有凭据，移除通过单独按钮完成。运行配置变更后重启 Bot 生效。

## 平台登录与缓存

在相应设置中导入需要的平台 Netscape 格式 Cookie 文件。Cookie 通过应用的凭据存储保存，浏览器网页登录不会自动同步。导入登录状态也不能替代内容所需的账号或地区权限。

音频在播放时按需准备和缓存，不预先下载整个歌单。默认缓存上限为 1024 MiB，可在「播放与启动」调整；淘汰遵循最近使用情况，正在使用的缓存受保护。停止 Bot 后可在「缓存与诊断」清理缓存。

## 语言、外观与主题

桌面界面支持中文和 English。「应用外观」控制桌面配色及跟随系统模式；「点歌台主题」控制 Discord Activity 的配色、文字、Logo 和默认封面，两者独立。

主题可以保存到本地主题库，也可以导入、导出和应用。编辑文案时保留 `{title}` 等占位符。应用主题后重新打开 Activity；Bot 在启动时读取的固定回复和指令描述需要重启后生效。

## 关于 / Info

「关于」显示当前应用版本，并提供 GitHub 源码、发行版本、问题反馈与使用文档入口。MIT 许可全文和第三方组件说明内置于应用，无需联网即可查看；网页入口会在系统浏览器打开。信息页跟随桌面语言和配色设置。

## 个人资料

- 安装版：安装目录下的 `user-data/`。
- 开发版：仓库根目录下的 `user-data/`。
- `preferences.json` 保存桌面语言和外观，`settings.json` 保存普通配置。
- `media-tools.json` 保存所选工具的路径、版本、文件摘要和检查记录，不应随源码分发。
- `credentials.dpapi` 保存当前 Windows 账户加密的凭据；更换电脑或 Windows 账户后需重新填写。
- `private-runtime/` 是运行期间需要的受限文件副本，正常停止时删除。

升级和卸载会保留 `user-data/`。备份个人资料时保留整个目录；分享主题时使用主题导出功能。

更多说明：[下载与工具](DOWNLOADS.md) · [常见问题](FAQ.md) · [隐私政策](PRIVACY.md)。
