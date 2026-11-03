# Licensing and third-party components

[简体中文](LICENSES.md) · **English** · [Documentation](README.en.md)

## Yachiyo: MIT

Copyright © 2026 **Neon-Soda**.

Yachiyo's own source and documentation use the [MIT License](../LICENSE). It permits use, copying, modification, and distribution, including commercial use, subject to conditions such as preserving copyright and license notices. The software is provided as is; the root license file contains the full terms. It is also available offline in the application's About page.

This summary does not replace the [full MIT License](../LICENSE). The [Open Source Initiative MIT page](https://opensource.org/license/mit) provides the standard text. Chinese explanations are supplied for convenience; third-party license files retain their upstream text.

## Components and notices

| Component | License / notes | Location |
| --- | --- | --- |
| Yachiyo | MIT | [LICENSE](../LICENSE) |
| Tauri 2 | Apache-2.0 OR MIT | [Upstream repository](https://github.com/tauri-apps/tauri) |
| Vue 3 | MIT | [Upstream repository](https://github.com/vuejs/core) |
| Bundled Node.js 24.19.0 runtime | MIT and bundled component terms | [Full Node notices](../licenses/Node-LICENSE.txt) · [Corresponding source](https://nodejs.org/dist/v24.19.0/node-v24.19.0.tar.xz) |
| JavaScript / Rust dependencies | Their own licenses; lockfiles record versions | `package-lock.json`, `bot/package-lock.json`, `bot/activity/package-lock.json`, `src-tauri/Cargo.lock` |
| WebView2 / Windows OpenSSH | System or separately installed components with their own terms | [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) · [OpenSSH guide](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) |

Read the [third-party overview](../licenses/THIRD-PARTY-NOTICES.txt). Packaged JavaScript dependencies retain their supplied LICENSE files. The overview is a starting point, not a replacement for every transitive dependency's license. Installer resources retain Node notices and `Yachiyo-LICENSE.txt`.

## User-selected media tools

The current installer does not contain FFmpeg, FFprobe, or yt-dlp executables. The application opens upstream download pages; users download and select local files, which are invoked as separate processes.

- **FFmpeg / FFprobe:** a particular build may use LGPL or GPL terms. Do not infer its license from the program name alone; inspect the download's notices and build configuration. See [FFmpeg's official licensing notes](https://ffmpeg.org/legal.html) and [Gyan builds](https://www.gyan.dev/ffmpeg/builds/).
- **yt-dlp:** the project uses the Unlicense. Upstream Windows executables also include components under other licenses; read the full notices for the downloaded version. See [yt-dlp upstream](https://github.com/yt-dlp/yt-dlp).

Manual download and local selection do not change these licenses. If you bundle tools into your own installer, image, or download attachment, separately meet the applicable notice, corresponding-source, and other redistribution obligations. Yachiyo's MIT License does not replace them.

## Media and artwork

Audio, videos, artwork, and marks from source platforms, and user-imported theme images, are not automatically licensed under this repository's MIT License. Verify the relevant rights before using or sharing them. The acknowledgment of [Kazumi](https://github.com/Predidit/Kazumi) concerns inspiration for the documentation structure; it does not relicense its code, artwork, or GPL terms under this project's MIT License.

Related: [Downloads](DOWNLOADS.en.md) · [Disclaimer](DISCLAIMER.en.md).
