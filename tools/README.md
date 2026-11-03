# Windows 运行工具

下载的可执行文件不提交到源码仓库。构建安装包前，将以下 Windows x64 文件放入 `tools/win32-x64/`：

| 文件 | 获取方式 |
| --- | --- |
| `node.exe` | [Node.js 官方下载](https://nodejs.org/en/download)，Windows x64，Node 24 或兼容版本 |
| `yt-dlp.exe` | [yt-dlp 官方发布页](https://github.com/yt-dlp/yt-dlp/releases) |
| `ffmpeg.exe` | [FFmpeg 下载页](https://ffmpeg.org/download.html)所列的 Windows 构建 |
| `ffprobe.exe` | 与 `ffmpeg.exe` 来自同一构建 |

随版本记录的工具校验值见 [runtime-tools.json](runtime-tools.json)。版本、来源和第三方许可说明位于 [licenses](../licenses/THIRD-PARTY-NOTICES.txt)；使用新的工具版本时同步更新这些记录。

文件就绪后，从仓库根目录执行：

```powershell
npm ci
npm run setup
npm run stage
npm run dist
```

`npm run setup` 安装 JavaScript 依赖，不会下载这四个外部工具。完整环境要求见 [开发指南](../docs/DEVELOPMENT.md)。
