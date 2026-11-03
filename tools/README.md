# Windows 运行工具

**简体中文** · [English](README.en.md) · [文档目录](../docs/README.md)

安装包内仅提供 Node.js 运行时。FFmpeg、FFprobe 和 yt-dlp 由用户从上游下载，下载的文件不放入安装包，也不通过项目服务器转发。

构建前将 Windows x64 的 `node.exe` 放入 `tools/win32-x64`，版本与 `licenses/Node-LICENSE.txt`、`licenses/THIRD-PARTY-NOTICES.txt` 及 `runtime-tools.json` 对应。来源：[Node.js 下载页](https://nodejs.org/en/download)。随后按项目 README 执行依赖安装和构建。

## 用户补全媒体工具

首次打开应用时，缺少工具会显示引导；也可以随时打开「工具库」。

1. 打开 [Gyan 的 FFmpeg 下载页](https://www.gyan.dev/ffmpeg/builds/#release-builds)，获取 Windows x64 正式版 release essentials ZIP，解压到固定文件夹。
2. 在应用中选择 `bin/ffmpeg.exe`；应用自动检查同目录的 `ffprobe.exe`。两个工具须使用同一正式版本，至少为 6.0。
3. 从 [yt-dlp 发布页](https://github.com/yt-dlp/yt-dlp/releases/latest) 下载 `yt-dlp.exe`，保存在固定文件夹并在应用中选择。要求 2025 年或更新的正式版，并实际支持 `--js-runtimes`。
4. 应用检查 x64 可执行格式、版本、AAC/Opus/MP3 解码、libmp3lame 转码、进度定位和 JSON 时长读取。只有检查通过才保存新关联。

工具保持在用户所选位置；配置、文件摘要和检查记录写入用户数据目录的 `media-tools.json`。文件移动或更新后重新检查；运行中的 Bot 在重启后使用新路径。取消关联保留原文件。每次启动 Bot 时也会重新检查，不依赖全局 PATH 中的同名程序。源码方式直接运行 Node Bot 时仍可使用 PATH，或显式设置 `YACHIYO_FFMPEG_PATH`、`YACHIYO_FFPROBE_PATH` 和 `YACHIYO_YT_DLP_PATH`。

检查会执行用户选择的文件，因此应使用可信来源。文件摘要用来记录文件身份，不等同于发布者签名认证。各外部工具继续适用其自己的许可证；重新打包这些工具时需单独处理相应分发义务。

## 开发验证

Node 单元测试和基础 Rust 测试不要求下载媒体工具。Rust 另有一个默认忽略的真实工具测试：设置 `YACHIYO_TOOL_TEST_DIR` 指向包含上述三个文件的目录，再运行 `cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored`。Windows 下须先准备 MSVC 构建环境。

构建脚本仅复制 `node.exe`。发行审计拒绝含 `ffmpeg.exe`、`ffprobe.exe`、`yt-dlp.exe` 或个人工具设置的安装资源，防止误将本机工具再次打包。

## 内置 Node 的来源

当前运行时清单对应 Node.js **24.19.0 Windows x64**。构建者可从 [Node.js 24.19.0 下载目录](https://nodejs.org/dist/v24.19.0/) 获取该版本 Windows x64 ZIP 或 `win-x64/node.exe`，并按上游 `SHASUMS256.txt` 校验。清单记录见 [runtime-tools.json](runtime-tools.json)，许可及对应源码见 [第三方说明](../docs/LICENSES.md)。这不是要求安装用户另行下载 Node。

其他软件下载、更新和校验说明见 [下载指南](../docs/DOWNLOADS.md)。
