# 许可与第三方组件

**简体中文** · [English](LICENSES.en.md) · [文档目录](README.md)

## Yachiyo：MIT

Copyright © 2026 **Neon-Soda**。

Yachiyo 自有源码与文档采用 [MIT License](../LICENSE)。在保留版权与许可声明等条件下，可以使用、复制、修改和分发，包括商业使用。软件按原样提供；完整条件以根目录许可原文为准。许可文本也可在应用「关于」页离线查看。

此摘要不替代 [MIT 许可原文](../LICENSE)。[Open Source Initiative 的 MIT 页面](https://opensource.org/license/mit) 提供标准许可文本。中文说明仅用于阅读便利；第三方许可文件保留上游原文。

## 组件与声明位置

| 组件 | 许可 / 说明 | 入口 |
| --- | --- | --- |
| Yachiyo | MIT | [LICENSE](../LICENSE) |
| Tauri 2 | Apache-2.0 OR MIT | [上游仓库](https://github.com/tauri-apps/tauri) |
| Vue 3 | MIT | [上游仓库](https://github.com/vuejs/core) |
| Node.js 24.19.0 内置运行时 | MIT 及其捆绑组件条款 | [完整 Node 声明](../licenses/Node-LICENSE.txt) · [对应源码](https://nodejs.org/dist/v24.19.0/node-v24.19.0.tar.xz) |
| JavaScript / Rust 依赖 | 各自的许可；锁文件记录版本 | `package-lock.json`、`bot/package-lock.json`、`bot/activity/package-lock.json`、`src-tauri/Cargo.lock` |
| WebView2 / Windows OpenSSH | 系统提供或单独安装组件，适用各自条款 | [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) · [OpenSSH 说明](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) |

总声明见 [THIRD-PARTY-NOTICES.txt](../licenses/THIRD-PARTY-NOTICES.txt)。打包的 JavaScript 依赖保留各自随附的 LICENSE；总声明是入口，不是所有传递依赖许可的替代品。安装资源中保留 Node 许可及 `Yachiyo-LICENSE.txt`。

## 用户自行选择的媒体工具

当前安装包不包含 FFmpeg、FFprobe 或 yt-dlp 可执行文件。应用打开上游下载页，由用户下载并选择本机文件，然后以独立进程调用。

- **FFmpeg / FFprobe**：具体构建可能适用 LGPL 或 GPL。不能仅凭程序名认定许可；应检查下载包随附文件与构建配置。见 [FFmpeg 官方许可说明](https://ffmpeg.org/legal.html) 和 [Gyan 构建页](https://www.gyan.dev/ffmpeg/builds/)。
- **yt-dlp**：项目本身采用 Unlicense；上游 Windows 可执行文件还包含适用其他许可的组件，应阅读该下载版本的完整声明。见 [yt-dlp 上游](https://github.com/yt-dlp/yt-dlp)。

手动下载和本地选择不会改变这些工具的许可证。如果你另行把它们装进自己的安装包、镜像或下载附件，再分发时需独立处理适用的声明、对应源码和其他义务；Yachiyo 的 MIT 不能替代这些要求。

## 媒体与素材

来源平台的音视频、封面、标识以及用户导入的主题图片不自动受本仓库 MIT 授权。使用与分享前应确认相应权利。README 对 [Kazumi](https://github.com/Predidit/Kazumi) 的致谢指文档结构启发，不表示将其代码、素材或 GPL 许可改为本项目的 MIT。

相关说明：[下载](DOWNLOADS.md) · [免责声明](DISCLAIMER.md)。
