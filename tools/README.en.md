# Windows runtime tools

[简体中文](README.md) · **English** · [Documentation](../docs/README.en.md)

The installer supplies only the Node.js runtime. Users download FFmpeg, FFprobe, and yt-dlp from upstream; these downloads are neither bundled nor proxied through a project download server.

Before building, place Windows x64 `node.exe` in `tools/win32-x64`. Its version must match `licenses/Node-LICENSE.txt`, `licenses/THIRD-PARTY-NOTICES.txt`, and `runtime-tools.json`. Source: [Node.js downloads](https://nodejs.org/en/download). Then follow the project README to install dependencies and build.

## Setting up media tools

First launch shows guidance when tools are missing. You can also open the tool library at any time.

1. Open [Gyan's FFmpeg release builds](https://www.gyan.dev/ffmpeg/builds/#release-builds), download the Windows x64 release essentials ZIP, and extract it to a stable folder.
2. Select `bin/ffmpeg.exe` in Yachiyo. It automatically checks `ffprobe.exe` in the same directory. Both need the same stable release version, at least 6.0.
3. Download `yt-dlp.exe` from [yt-dlp Releases](https://github.com/yt-dlp/yt-dlp/releases/latest), save it to a stable folder, and select it. It must be a stable release from 2025 or later and actually support `--js-runtimes`.
4. Validation checks x64 executable format, versions, AAC/Opus/MP3 decoding, libmp3lame encoding, seeking, and JSON duration output. New associations are saved only on success.

Files remain where you selected them. Settings, file hashes, and validation records are saved to `media-tools.json` in your profile. Revalidate moved or updated files, and restart a running bot to use changed paths. Removing an association keeps the original file. Every bot start also revalidates tools instead of relying on same-named programs on the global PATH. Standalone Node bot use can still use PATH or explicit `YACHIYO_FFMPEG_PATH`, `YACHIYO_FFPROBE_PATH`, and `YACHIYO_YT_DLP_PATH` variables.

Validation executes selected files, so obtain them from trusted sources. File hashes record identity; they are not publisher signature verification. External tools retain their licenses. If you repackage them, address the applicable redistribution obligations separately.

## Development validation

Node unit tests and basic Rust tests do not require downloaded media tools. Rust also has an ignored-by-default real-tool test: set `YACHIYO_TOOL_TEST_DIR` to a directory containing the three executables, then run `cargo test --manifest-path src-tauri/Cargo.toml -- --include-ignored`. Prepare the MSVC environment first on Windows.

Staging copies only `node.exe`. Release audits reject installer resources containing `ffmpeg.exe`, `ffprobe.exe`, `yt-dlp.exe`, or personal tool settings to prevent accidental bundling.

## Bundled Node source

The current runtime manifest describes **Node.js 24.19.0 for Windows x64**. Builders can obtain the matching Windows x64 ZIP or `win-x64/node.exe` from the [Node.js 24.19.0 download directory](https://nodejs.org/dist/v24.19.0/) and verify it against upstream `SHASUMS256.txt`. See [runtime-tools.json](runtime-tools.json) for the manifest and [third-party licensing](../docs/LICENSES.en.md) for the license and corresponding source. Installer users do not need to download Node separately.

See [downloads](../docs/DOWNLOADS.en.md) for other software downloads, updates, and checksum instructions.
