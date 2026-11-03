# Yachiyo

面向 Discord 音乐 Bot 与 Activity 点歌台的 Windows 桌面应用。

Yachiyo 使用 Tauri 2、Vue 3、TypeScript 和 Rust 提供桌面控制界面，使用 Node.js 运行音乐 Bot。音频从 Bot 所在的语音频道播放，听众无需打开 Activity。

## 功能

- **共享点歌台**：在 Discord Activity 中查看当前曲目，暂停、拖动进度、切歌，以及管理歌单和播放模式。
- **搜索与链接播放**：支持 Bilibili、YouTube 和网易云音乐搜索；支持单曲链接，以及 Bilibili 多 P、视频合集和 YouTube 播放列表的选择性导入。
- **频道独立**：各语音频道的房间状态独立；同一个 Bot 在同一服务器内同时服务一个语音频道。
- **桌面管理**：连接状态、托盘、自启、进程恢复、缓存管理和诊断导出。
- **连接方式**：公网 HTTPS、应用管理的 SSH 反向隧道，或自行运行的代理/隧道。
- **个性化**：中文与 English、独立的应用外观，以及 Activity 的文案、配色、Logo、默认封面和主题库。

关闭控制窗口后，界面进程会释放，托盘和后台服务继续运行。重新打开窗口可恢复仍保存在内存中的草稿；从托盘退出应用会停止其管理的 Bot 和 SSH 隧道。

## 开始使用

1. 获取 Windows x64 安装包并完成安装，或按下方说明从源码构建。
2. 在 Discord Developer Portal 创建自己的应用和 Bot，并将 Bot 邀请到服务器。
3. 打开 Yachiyo，在「连接与账户」填写自己的 Discord 配置。
4. 使用 Activity 时，配置可被 Discord 访问的 HTTPS 地址，以及相应的 URL Mapping 和 OAuth 设置。
5. 保存设置并启动 Bot。进入语音频道后，使用 `/jukebox` 打开点歌台。

每位部署者使用自己的 Discord 应用、账号配置和网络服务。详细步骤见 [配置指南](docs/CONFIGURATION.md)，音乐功能见 [Activity 使用说明](docs/ACTIVITY.md)。

## 从源码构建

当前桌面实现面向 **Windows 10/11 x64**。需要 Node.js 24+、npm、Rust MSVC 工具链、Visual Studio C++ 构建工具与 Windows SDK。界面使用系统 WebView2；环境准备可参考 [Tauri 官方指南](https://v2.tauri.app/start/prerequisites/)。

在仓库根目录执行：

```powershell
npm ci
npm run setup
```

按 [运行工具说明](tools/README.md) 将 Node、yt-dlp、FFmpeg 和 FFprobe 放入 `tools/win32-x64`，然后执行：

```powershell
npm run stage
npm start
```

构建安装包：

```powershell
npm run dist
```

最终安装包默认输出到 `releases/`，并附有 SHA-256 校验文件。源码构建过程、测试和可选路径配置见 [开发指南](docs/DEVELOPMENT.md)。

## 源码结构

| 路径 | 内容 |
| --- | --- |
| `src/` | Vue / TypeScript 桌面界面 |
| `src-tauri/src/` | Rust 窗口、托盘、进程管理、凭据和本机接口 |
| `bot/src/` | Node Bot、媒体解析、搜索、缓存和 Activity 后端 |
| `bot/activity/` | Discord Activity 前端 |
| `bot/shared/` | 共享主题及文案定义 |
| `core/` | SSH 解析与兼容性校验模块 |
| `test/`、`bot/test/` | Node 测试；Rust 测试位于对应模块中 |
| `scripts/`、`windows/` | 构建和测试脚本 |
| `assets/`、`licenses/` | 图标、第三方许可和来源说明 |

## 数据与运行环境

已安装应用将个人数据保存到安装目录下的 `user-data/`；开发运行使用项目下独立的 `user-data/`。凭据由 Windows DPAPI 加密，设置页面只显示是否已配置。运行期间供媒体工具和 SSH 使用的文件位于受限目录，正常停止时清理。

源码仓库不包含个人资料、账号凭据、音频缓存、下载的工具二进制或安装包。平台内容的可播放性取决于链接、登录状态、账号权限和地区等条件；浏览器登录状态不会自动同步给 Bot。

## 文档与许可

- [文档目录](docs/README.md)
- [架构说明](docs/ARCHITECTURE.md)
- [第三方许可与来源](licenses/THIRD-PARTY-NOTICES.txt)

项目本身暂未指定许可证；第三方组件继续适用各自的许可证。
