<div align="center">
  <img src="assets/app.png" width="112" height="112" alt="Yachiyo Jukebox icon" />
  <h1>Yachiyo Jukebox</h1>
  <p>Pick a song. Share a voice channel. Listen together.</p>
  <p>Windows desktop manager · Shared Discord Activity · Self-hosted</p>
</div>

<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <a href="https://github.com/Neon-Soda/Yachiyo-Jukebox/releases">Downloads &amp; release notes</a> ·
  <a href="docs/README.en.md">Documentation</a> ·
  <a href="https://github.com/Neon-Soda/Yachiyo-Jukebox/issues">Report an issue</a> ·
  <a href="LICENSE">MIT License</a>
</p>

Yachiyo Jukebox combines a Discord music bot with an interactive Activity: add songs, pause, skip, and manage a shared playlist with buttons. The bot sends audio to the voice channel, so listeners do not need to open the Activity.

The desktop application uses **Tauri 2 + Vue 3 + TypeScript + Rust**, with a **Node.js** music backend. Each operator supplies their own Discord application, bot, and network services. This project does not provide a public bot, music catalog, or managed hosting.

## Supported platforms

| Component | Support |
| --- | --- |
| Desktop manager | Windows 10 / 11, x64 |
| Jukebox | Discord Activities in regular server voice channels |
| macOS / Linux desktop builds | Not currently provided; native components depend on Windows APIs |

## Features

- **Shared playback controls:** track title, artwork, pause / resume, seek bar, previous / next, and a playlist panel with track selection.
- **Four playback modes:** sequential, repeat all, repeat one, and shuffle.
- **Search and links:** search Bilibili, YouTube, and NetEase Cloud Music; choose from results with available artwork, titles, and durations.
- **Collection choices:** add the current item or a whole Bilibili multipart video, Bilibili collection, or YouTube playlist. NetEase playlist import is not supported.
- **Separate channels:** rooms and playlists are isolated by voice channel. One bot serves one voice channel at a time within a server.
- **Shared activity feed:** transient operation notices and the latest five room events keep participants informed; the Activity reduces duplicate chat feedback.
- **Background operation:** tray status, launch at login, bot recovery, optional SSH tunneling, and reconnection. Closing the window releases the interface while services keep running.
- **Customization:** Chinese / English, separate desktop themes, and Activity text, colors, logo, default artwork, and importable / exportable themes.
- **Local management:** on-demand audio caching, tool version and capability checks, connection status, and manual diagnostic export.

Playback depends on the source, login state, account permissions, and region. A browser login is not automatically shared with the bot.

## Downloads

**[Open Yachiyo Jukebox Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases)** for published Windows installers, checksums, and release notes. If there is no release or installer attachment yet, follow the [development guide](docs/DEVELOPMENT.en.md) to build from source.

| What you need | Download |
| --- | --- |
| Yachiyo Jukebox Windows x64 installer | [This project's Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases) |
| Current source | [Browse repository](https://github.com/Neon-Soda/Yachiyo-Jukebox) · [Download main ZIP](https://github.com/Neon-Soda/Yachiyo-Jukebox/archive/refs/heads/main.zip) |
| FFmpeg / FFprobe | [Gyan Windows builds](https://www.gyan.dev/ffmpeg/builds/#release-builds) |
| yt-dlp | [Upstream Releases](https://github.com/yt-dlp/yt-dlp/releases/latest) |
| WebView2 Runtime | [Microsoft downloads](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

Node.js is bundled. **Download FFmpeg, FFprobe, and yt-dlp yourself, then select and validate them in the application's tool library.** Yachiyo Jukebox opens upstream pages; it does not download or install these media tools for you. See [downloads](docs/DOWNLOADS.en.md) for file choices, version requirements, and SHA-256 verification.

## Getting started

1. Install Yachiyo Jukebox and associate FFmpeg / FFprobe and yt-dlp in the tool library.
2. Create your own application and bot in the [Discord Developer Portal](https://discord.com/developers/applications), then invite the bot to your server.
3. Enter the Application ID, server ID, and Bot Token in connection settings. Also provide the Client Secret when using Activities.
4. Set up public HTTPS, then configure the Discord Activity URL Mapping and OAuth2 Redirect URI shown by the application. Use an existing public service, an application-managed SSH reverse tunnel, or your own proxy.
5. Save and start the bot. Join a regular server voice channel and use `/jukebox` to open the Activity.

For chat commands such as `/play` only, disable Activities; a public HTTPS endpoint for the jukebox is then unnecessary. Follow the [configuration guide](docs/CONFIGURATION.en.md) for details.

## Documentation

Every guide has Chinese and English versions, with a language switch at the top.

| Guide | Contents |
| --- | --- |
| [Documentation index](docs/README.en.md) | Find a guide by task |
| [Configuration](docs/CONFIGURATION.en.md) | Discord, HTTPS, SSH, platform login, and themes |
| [Using the jukebox](docs/ACTIVITY.en.md) | Search, collections, playback, rooms, and chat commands |
| [FAQ](docs/FAQ.en.md) | Connection, authorization, playback, cache, and background operation |
| [Development](docs/DEVELOPMENT.en.md) · [Architecture](docs/ARCHITECTURE.en.md) | Building, testing, and component boundaries |
| [Privacy policy](docs/PRIVACY.en.md) | Local data, external requests, retention, and deletion |
| [Disclaimer](docs/DISCLAIMER.en.md) · [Licensing](docs/LICENSES.en.md) | Content use, service limits, and third-party licenses |

## Development and contributions

Reproducible bug reports, documentation improvements, and pull requests are welcome. Include the version, reproduction steps, and error message when reporting a problem. Do not attach credentials or an entire user-data directory.

Prepare Windows x64, Node.js 24+, Rust MSVC, Visual Studio C++ tools, and WebView2, then run from the repository root:

```powershell
npm ci
npm run setup
```

Provision `tools/win32-x64/node.exe` to match the runtime manifest as described in the [tool guide](tools/README.en.md), then run:

```powershell
npm run stage
npm start
```

Use `npm run dist` to build an installer and archive it under `releases/<version>/`. A different installer cannot overwrite an existing version. See [development](docs/DEVELOPMENT.en.md) for tests, source layout, and contribution conventions.

## Privacy and use

Personal settings are stored locally in `user-data/`. Credentials use Windows DPAPI encryption for the current Windows account. Music searches, Discord authorization, voice playback, and optional tunneling contact the respective third-party services. Room participants can see tracks and shared action events.

The current project code has no author-operated advertising, telemetry, or automatic diagnostic upload service. This does not mean that the application makes no network requests or that third-party services process no data. Read the [privacy policy](docs/PRIVACY.en.md).

Only play content you are entitled to access and use, and comply with applicable laws and source-platform terms. The project is not officially affiliated with Discord, Bilibili, YouTube, or NetEase Cloud Music. Third-party APIs, links, and content may become unavailable. The software is provided under the license's “as is” terms; see the [disclaimer](docs/DISCLAIMER.en.md).

## License and acknowledgments

Yachiyo Jukebox's own source and documentation are licensed under the [MIT License](LICENSE), Copyright © 2026 **Neon-Soda**. This license does not change the ownership or license terms of third-party components, media, or user-imported assets.

Thanks to [Tauri](https://github.com/tauri-apps/tauri), [Vue](https://github.com/vuejs/core), [Node.js](https://nodejs.org/), [discord.js](https://github.com/discordjs/discord.js), the [Discord Embedded App SDK](https://github.com/discord/embedded-app-sdk), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/), and their communities. See [third-party licensing](docs/LICENSES.en.md) for notice locations.
