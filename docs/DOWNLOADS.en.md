# Downloads and installation

[简体中文](DOWNLOADS.md) · **English** · [Documentation](README.en.md)

## Yachiyo

Installers and release notes are published at **[Neon-Soda/Yachiyo-Jukebox Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases)**.

| File | Purpose |
| --- | --- |
| `Yachiyo-<version>-Windows-x64.exe` | Windows 10 / 11 x64 installer; check the actual attachments for that release |
| Matching `.exe.sha256` | SHA-256 checksum for the installer |
| Source code attached to a release | Source at that tag, not an executable installer |
| [main branch ZIP](https://github.com/Neon-Soda/Yachiyo-Jukebox/archive/refs/heads/main.zip) | Current development source, which may differ from a released version |

If no installer has been published, [build from source](DEVELOPMENT.en.md). There are currently no macOS, Linux, Windows ARM64, or x86 installers.

After downloading, calculate the checksum in PowerShell using the actual file path and compare it with the checksum from the same release:

```powershell
Get-FileHash -LiteralPath '.\Yachiyo-1.1.0-Windows-x64.exe' -Algorithm SHA256
```

The version in this filename is an example. A matching checksum checks consistency with the published attachment; it is not a publisher signature or a guarantee of safety.

## Playback tools

Node.js is bundled. On first launch, the application guides you through setting up media tools: **open the upstream page → download and extract → select the file in the tool library → wait for validation**.

| Tool | Upstream source and file | Requirements |
| --- | --- | --- |
| FFmpeg + FFprobe | [Gyan release builds](https://www.gyan.dev/ffmpeg/builds/#release-builds): choose **release essentials ZIP**, extract, and select `bin/ffmpeg.exe` | Windows x64 release ≥ 6.0; `ffprobe.exe` in the same directory must have the same release version |
| yt-dlp | [yt-dlp Releases](https://github.com/yt-dlp/yt-dlp/releases/latest): choose **`yt-dlp.exe`** | Windows x64, a stable release from 2025 or later with working `--js-runtimes` support |
| WebView2 | [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/): Evergreen Runtime x64 | If missing, the Yachiyo installer can download its bootstrapper; manual installation from Microsoft is also available |
| OpenSSH Client (SSH mode only) | [Microsoft Windows OpenSSH installation](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse) | Windows OpenSSH client; other connection modes do not require it |

Keep media tools in a stable local directory. Yachiyo saves an association; it does not copy your selected executables into installer resources or download and update them for you. Revalidate after moving or upgrading files, then restart the bot.

Validation executes the selected programs to check format, version, and actual audio capabilities. Download from trusted sources and follow upstream checksum instructions. See the [tool guide](../tools/README.en.md). FFmpeg build-specific GPL / LGPL terms and other tool licenses still apply; see [licensing](LICENSES.en.md).

## Development downloads

Installer users do not need these compilation tools.

| Dependency | Download and notes |
| --- | --- |
| Node.js 24+ and npm | [Node.js downloads](https://nodejs.org/en/download); the bundled runtime must match the project's manifest |
| Rust / Cargo | [rustup](https://rustup.rs/), Windows x64 MSVC toolchain |
| C++ tools and Windows SDK | [Visual Studio downloads](https://visualstudio.microsoft.com/downloads/): install Desktop development with C++ and the Windows SDK |
| System prerequisites | [Tauri's Windows guide](https://v2.tauri.app/start/prerequisites/) |

See the [tool guide](../tools/README.en.md) and [third-party notices](../licenses/THIRD-PARTY-NOTICES.txt) for the bundled runtime version and source. Follow [development](DEVELOPMENT.en.md) for build instructions.

## Updating and removal

The About page opens this project's Releases. Automatic application update download and installation are not implemented. Back up `user-data/`, quit from the tray, and install the new version.

Upgrades and uninstallation retain `user-data/`. To remove personal data, quit the application and delete the corresponding `user-data/` directory in your own installation. Remove manually downloaded media tools, backups, and exported diagnostics separately. See the [privacy policy](PRIVACY.en.md).
