# 下载与安装

**简体中文** · [English](DOWNLOADS.en.md) · [文档目录](README.md)

## Yachiyo Jukebox

安装包与更新说明统一发布在 **[Neon-Soda/Yachiyo-Jukebox Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases)**。

| 文件 | 用途 |
| --- | --- |
| `Yachiyo-<版本>-Windows-x64.exe` | Windows 10 / 11 x64 安装包；以相应 Release 的实际附件为准 |
| 同名 `.exe.sha256` | 对应安装包的 SHA-256 校验文件 |
| Release 的 Source code | 该标签对应的源码，不能直接当安装包运行 |
| [main 分支 ZIP](https://github.com/Neon-Soda/Yachiyo-Jukebox/archive/refs/heads/main.zip) | 当前开发源码，可能不同于已发布版本 |

若 Releases 尚未发布安装包，请使用 [源码构建](DEVELOPMENT.md)。本项目目前不提供 macOS、Linux、Windows ARM64 或 x86 安装包。

下载完成后，在 PowerShell 使用实际文件路径计算摘要，与同一 Release 的校验文件比较：

```powershell
Get-FileHash -LiteralPath '.\Yachiyo-1.1.0-Windows-x64.exe' -Algorithm SHA256
```

文件名中的版本仅为示例。摘要相同可用于检查文件是否与发布附件一致，不等于发布者数字签名或安全性保证。

## 播放所需工具

安装包已包含 Node.js。首次打开应用时会提示补全媒体工具：**打开上游页面 → 自行下载和解压 → 在「工具库」选择文件 → 等待检查通过**。

| 工具 | 上游入口与文件选择 | 要求 |
| --- | --- | --- |
| FFmpeg + FFprobe | [Gyan release builds](https://www.gyan.dev/ffmpeg/builds/#release-builds)，选择 **release essentials ZIP**，解压后选择 `bin/ffmpeg.exe` | Windows x64 正式版 ≥ 6.0；同目录 `ffprobe.exe` 与其正式版本一致 |
| yt-dlp | [yt-dlp Releases](https://github.com/yt-dlp/yt-dlp/releases/latest)，选择 **`yt-dlp.exe`** | Windows x64，2025 年或更新的正式版，并实际支持 `--js-runtimes` |
| WebView2 | [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)，Evergreen Runtime x64 | 系统缺少时，Yachiyo Jukebox 安装器可下载安装引导程序；也可从微软页面手动安装 |
| OpenSSH Client（仅 SSH 模式） | [Microsoft Windows OpenSSH 安装说明](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) | Windows 的 OpenSSH 客户端；其他连接模式不需要它 |

将媒体工具放在稳定的本地目录，之后不要随意移动。应用只保存关联，不会把所选文件复制进安装资源，也不会替你下载或更新媒体工具。文件移动或升级后需重新检查，再重启 Bot。

工具检查会运行所选程序，核对格式、版本和实际音频能力。请从可信来源下载，并按上游提供的校验方法核验文件。完整说明见 [工具库](../tools/README.md)。FFmpeg 构建的 GPL / LGPL 条款及其他工具许可仍适用，见 [许可说明](LICENSES.md)。

## 开发环境下载

普通安装用户无需自行安装下列编译工具。

| 依赖 | 下载与说明 |
| --- | --- |
| Node.js 24+ 与 npm | [Node.js 下载页](https://nodejs.org/en/download)；打包内置运行时使用清单所指定的版本 |
| Rust / Cargo | [rustup](https://rustup.rs/)，Windows x64 MSVC 工具链 |
| C++ 编译工具与 Windows SDK | [Visual Studio 下载](https://visualstudio.microsoft.com/downloads/)，安装「使用 C++ 的桌面开发」及 Windows SDK |
| 系统前置条件 | [Tauri 官方 Windows 指南](https://v2.tauri.app/start/prerequisites/) |

仓库中的运行时版本与来源见 [工具说明](../tools/README.md) 和 [第三方声明](../licenses/THIRD-PARTY-NOTICES.txt)。编译步骤见 [开发指南](DEVELOPMENT.md)。

## 更新与移除

应用「关于」页可打开本项目 Releases；当前未实现自动下载和安装应用更新。更新前备份 `user-data/`，从托盘退出应用后安装新版本。

升级和卸载保留 `user-data/`。若要移除个人资料，请先退出应用，再删除自己安装目录内对应的 `user-data/`；手动下载的媒体工具、备份和诊断导出文件需要单独处理。详见 [隐私政策](PRIVACY.md)。
