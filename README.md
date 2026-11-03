<div align="center">
  <img src="assets/app.png" width="112" height="112" alt="Yachiyo Jukebox 图标" />
  <h1>Yachiyo Jukebox</h1>
  <p>在 Discord 语音频道里，和朋友一起点歌。</p>
  <p>Windows 桌面管理 · 共享 Activity 点歌台 · 自托管</p>
</div>

<p align="center">
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/Neon-Soda/Yachiyo-Jukebox/releases">下载与更新日志</a> ·
  <a href="docs/README.md">使用文档</a> ·
  <a href="https://github.com/Neon-Soda/Yachiyo-Jukebox/issues">问题反馈</a> ·
  <a href="LICENSE">MIT License</a>
</p>

Yachiyo Jukebox 把 Discord 音乐 Bot 和可交互的 Activity 点歌台放在一起：用按钮点歌、暂停、切歌和管理歌单，由 Bot 在语音频道播放音频。只想听歌的朋友无需打开 Activity。

桌面应用使用 **Tauri 2 + Vue 3 + TypeScript + Rust**，音乐后端使用 **Node.js**。每位部署者使用自己的 Discord 应用、Bot 和网络服务；项目不提供公共 Bot、音乐资源库或代管服务。

## 支持平台

| 部分 | 支持范围 |
| --- | --- |
| 桌面管理应用 | Windows 10 / 11，x64 |
| 点歌台 | Discord 服务器内的普通语音频道 Activity |
| macOS / Linux 桌面版 | 暂不提供；当前本机实现依赖 Windows API |

## 功能

- **一起控制播放**：曲名、封面、暂停 / 继续、可拖动进度条、上一首 / 下一首，以及可选曲的歌单面板。
- **四种播放模式**：顺序播放、列表循环、单曲循环、随机播放。
- **搜索与链接点歌**：Bilibili、YouTube、网易云音乐搜索；结果显示封面、标题和时长，选择后加入歌单。
- **合集确认**：Bilibili 多 P、视频合集和 YouTube 播放列表可选择加入当前单首或整个集合。暂不支持网易云整张歌单导入。
- **频道独立**：房间和歌单按语音频道隔离；同一个 Bot 在同一服务器内同时服务一个语音频道。
- **共享房间动态**：操作提示同步给参与者，保留最近 5 条动态；Activity 激活时减少重复聊天反馈。
- **后台常驻**：托盘状态、登录自启、Bot 恢复、可选 SSH 隧道及断线重连。关闭窗口会释放界面，托盘和服务继续运行。
- **个性化**：中文 / English、独立的桌面外观，以及 Activity 文案、颜色、Logo、默认封面与可导入导出的主题库。
- **本机管理**：按需音频缓存、工具版本与能力检查、连接状态和手动诊断导出。

平台内容是否可播放取决于来源、登录状态、账号权限和地区。浏览器登录不会自动同步给 Bot。

## 下载

**[前往 Yachiyo Jukebox Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases)** 获取已发布的 Windows 安装包、校验文件和更新说明。若尚无发布条目或安装包附件，请按 [开发指南](docs/DEVELOPMENT.md) 从源码构建。

| 需要什么 | 下载入口 |
| --- | --- |
| Yachiyo Jukebox Windows x64 安装包 | [本项目 Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases) |
| 当前源码 | [浏览仓库](https://github.com/Neon-Soda/Yachiyo-Jukebox) · [下载 main 分支 ZIP](https://github.com/Neon-Soda/Yachiyo-Jukebox/archive/refs/heads/main.zip) |
| FFmpeg / FFprobe | [Gyan Windows 构建页](https://www.gyan.dev/ffmpeg/builds/#release-builds) |
| yt-dlp | [上游 Releases](https://github.com/yt-dlp/yt-dlp/releases/latest) |
| WebView2 运行时 | [Microsoft 下载页](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

安装包包含 Node.js；**FFmpeg、FFprobe 和 yt-dlp 由用户自行下载，在应用「工具库」中选择并检查**。应用会打开上游页面，不会代为下载或安装这些媒体工具。下载选择、版本要求和 SHA-256 校验见 [下载指南](docs/DOWNLOADS.md)。

## 开始使用

1. 安装 Yachiyo Jukebox，在「工具库」关联 FFmpeg / FFprobe 和 yt-dlp。
2. 在 [Discord Developer Portal](https://discord.com/developers/applications) 创建自己的应用和 Bot，将 Bot 邀请到服务器。
3. 在「连接与账户」填写 Application ID、服务器 ID、Bot Token；使用 Activity 时填写 Client Secret。
4. 配置公网 HTTPS，并按应用显示的值设置 Discord Activity URL Mapping 和 OAuth2 Redirect URI。可以使用已有公网服务、应用管理的 SSH 反向隧道，或自行运行的代理。
5. 保存并启动 Bot。进入服务器的普通语音频道，使用 `/jukebox` 打开点歌台。

仅使用 `/play` 等聊天指令时，可以关闭 Activity，无需部署点歌台的公网 HTTPS 服务。详细配置见 [配置指南](docs/CONFIGURATION.md)。

## 文档

所有指南均提供中文和英文版本，可在每页顶部切换。

| 文档 | 内容 |
| --- | --- |
| [文档目录](docs/README.md) | 按使用场景查找指南 |
| [配置指南](docs/CONFIGURATION.md) | Discord、HTTPS、SSH、平台登录和主题 |
| [点歌台说明](docs/ACTIVITY.md) | 搜索、合集、播放、房间与聊天指令 |
| [常见问题](docs/FAQ.md) | 连接、登录、播放、缓存和后台运行 |
| [开发指南](docs/DEVELOPMENT.md) · [架构](docs/ARCHITECTURE.md) | 源码构建、测试与实现边界 |
| [隐私政策](docs/PRIVACY.md) | 本机数据、外部请求、保留和删除 |
| [免责声明](docs/DISCLAIMER.md) · [许可说明](docs/LICENSES.md) | 内容使用、服务限制与第三方许可 |

## 开发与贡献

欢迎提交可复现的问题、文档改进和 Pull Request。反馈中请写明版本、操作步骤和错误提示，不要附上凭据或整个用户数据目录。

准备 Windows x64、Node.js 24+、Rust MSVC、Visual Studio C++ 工具与 WebView2 后，在仓库根目录执行：

```powershell
npm ci
npm run setup
```

按 [工具说明](tools/README.md) 准备与清单对应的 `tools/win32-x64/node.exe`，然后运行：

```powershell
npm run stage
npm start
```

构建安装包使用 `npm run dist`，产物自动保存到 `releases/<版本>/`，已有版本不会被不同的安装包覆盖。测试、目录结构和贡献约定见 [开发指南](docs/DEVELOPMENT.md)。

## 隐私与使用说明

个人配置保存在本机 `user-data/`；凭据使用当前 Windows 账户的 DPAPI 加密。音乐搜索、Discord 登录、语音播放和可选隧道会连接相应第三方服务。房间参与者可以看到曲目及共享操作动态。

当前项目代码未加入作者运营的广告、遥测或自动诊断上传服务。这不表示没有网络请求，也不代表第三方服务不处理数据。完整说明见 [隐私政策](docs/PRIVACY.md)。

请仅播放你有权访问和使用的内容，并遵守适用法律及来源平台条款。项目与 Discord、Bilibili、YouTube、网易云音乐不存在官方隶属关系；不保证第三方接口、链接或内容始终可用。软件按许可中的「原样」条款提供，详见 [免责声明](docs/DISCLAIMER.md)。

## 许可与致谢

Yachiyo Jukebox 自有源码和文档采用 [MIT License](LICENSE)，Copyright © 2026 **Neon-Soda**。第三方组件、媒体内容和用户导入素材不因本项目的 MIT 许可而改变其权利归属或许可条件。

感谢 [Tauri](https://github.com/tauri-apps/tauri)、[Vue](https://github.com/vuejs/core)、[Node.js](https://nodejs.org/)、[discord.js](https://github.com/discordjs/discord.js)、[Discord Embedded App SDK](https://github.com/discord/embedded-app-sdk)、[yt-dlp](https://github.com/yt-dlp/yt-dlp) 和 [FFmpeg](https://ffmpeg.org/) 等项目。完整声明入口见 [第三方许可](docs/LICENSES.md)。
