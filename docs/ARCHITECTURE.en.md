# Architecture

[简体中文](ARCHITECTURE.md) · **English** · [Documentation](README.en.md)

## Components

```text
Vue / TypeScript desktop UI
          | restricted Tauri commands / status events
          v
Rust desktop manager ---- SSH reverse tunnel (optional)
          | private named pipe
          v
Node Bot / Activity HTTP service
          +-- Discord voice connection
          +-- Search, link, and collection parsing
          +-- yt-dlp / FFmpeg / FFprobe / audio cache
```

## Desktop layer

Vue handles forms, theme editing, and status presentation. Rust manages windows, the tray, launch at login, files, credentials, and background processes. The frontend calls explicit native commands rather than having general Node or filesystem access.

Status events update the UI. Closing the control window destroys WebView2 and temporarily keeps unsaved forms in process memory. Reopening recreates the interface. A full exit discards unsaved drafts.

Theme previews use an on-demand loopback HTTP server released on window close. The preview displays Activity content without desktop native-interface privileges.

## Processes and connections

Rust launches one Node bot and, in SSH mode, manages a dedicated SSH process. A Windows Job Object tracks owned child processes and media-tool descendants, and cleans them up when their manager exits.

The bot reports readiness and heartbeats through a private named pipe with process-identity checks. Unexpected bot exits use retry backoff; disconnected SSH sessions reconnect. Status combines heartbeats, actual processes, and application identity in HTTP responses.

## Media tools

Installer resources include only Node.js as a bundled runtime tool. Users download and select FFmpeg, FFprobe, and yt-dlp. Rust validates Windows x64 format, release versions, and actual audio capabilities, then saves associations atomically. Each bot start revalidates the files and supplies explicit paths through dedicated environment variables. Node's media entry points use these paths to avoid another executable with the same name on PATH. Standalone Node bot use retains PATH compatibility.

Validation runs with a credential-free environment, timeouts, and separate temporary audio. SHA-256 records file identity; it is not publisher authentication. Tool settings are personal data, and release audits reject media executables and personal associations in the installer.

## Music and Activity

The Node backend handles Discord authentication, voice playback, track parsing, search, room state, caching, and the Activity API. The Activity frontend lives in `bot/activity/` and is built separately from the desktop UI.

Rooms are isolated by voice channel, while one bot serves one voice channel at a time within a server. The bot sends audio to voice; the Activity supplies shared controls.

## Configuration and credentials

General settings, desktop preferences, and themes are stored separately. Credentials use DPAPI encryption for the current Windows account and are decrypted in the backend. The interface receives configured flags, not saved secret contents.

Runtime files needed by media tools and SSH live in restricted `private-runtime/` and are removed on a normal stop. Existing-project import, encrypted-credential upgrades, and their compatibility tests remain current application functionality. New installations do not require existing settings; compatibility paths run only through their relevant entry points or upgrade conditions.

## Build boundaries

`scripts/stage.mjs` prepares the bot, Activity, dependencies, and runtime tools from an explicit allowlist. Personal directories, environment files, logs, and archives are excluded. Release audits check resource scope, module dependencies, and installer checksums.

Windows paths, IPC, DPAPI, and process lifetime handling remain in Rust. Media business logic continues to use the Node backend.

See the [privacy policy](PRIVACY.en.md) for retention and external requests, and [development](DEVELOPMENT.en.md) for build commands.
