# Configuration

[简体中文](CONFIGURATION.md) · **English** · [Documentation](README.en.md)

## Playback tools

First launch prompts you to set up missing tools. In the tool library, open the FFmpeg download page, download the Windows x64 release essentials ZIP, and extract it. Selecting `bin/ffmpeg.exe` automatically pairs `ffprobe.exe` from the same directory. Download and select `yt-dlp.exe` from its release page. You can also select tools you already have.

The application checks executable format, versions, audio codecs, duration reading, and seeking. It saves a new association only after validation succeeds; failures preserve the previous configuration. Files stay where you selected them. Revalidate moved or updated files, and restart a running bot to use new settings. Removing an association does not delete the executable. You can configure accounts and themes without tools, but cannot start the bot. See the [tool guide](../tools/README.en.md) for requirements.

## Discord application

Create or select your own application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Enter the following in Yachiyo's connection settings:

| Setting | Purpose |
| --- | --- |
| Application ID | Identifies the Discord application |
| Server ID | The Discord server the bot will use |
| Bot Token | Bot authentication credential |
| Client Secret | Activity OAuth verification |

Use the application's bot invitation action, and ensure the bot can view, connect to, and speak in the target voice channel. For chat-command-only use, disable the Discord Activity option.

## Activity and HTTPS

Activities need an HTTPS endpoint reachable by Discord. Having a public IP address, domain, or SSH login does not by itself provide HTTPS.

1. Enable Activities in the Developer Portal.
2. Enter your public HTTPS root URL in Yachiyo, such as `https://music.example.com`.
3. Use the values shown in the application for URL Mapping: Prefix `/`, Target the hostname of your HTTPS address.
4. Register the OAuth2 Redirect URI shown in the application. The current placeholder is `https://127.0.0.1`; the Discord Activity SDK handles the actual authorization return.
5. Save and start the bot. Check Discord, local web service, and public HTTPS status.

Activity testing access and distribution permissions must also be configured in Discord. See the [official Activity guide](https://docs.discord.com/developers/activities/building-an-activity).

## Connection modes

| Mode | When to use it | What Yachiyo manages |
| --- | --- | --- |
| Direct public connection | You already have public HTTPS or your own reverse proxy | Bot and web service |
| SSH reverse tunnel | Your server forwards requests to the desktop HTTP service | Bot, a dedicated SSH process, and reconnection |
| Existing tunnel / proxy | You independently run frp or another proxy | Bot and final HTTPS connectivity checks |

The HTTP service defaults to `127.0.0.1:3178`. Listening on all interfaces is needed only when the reverse proxy must reach this machine over the network. The operator configures certificates, DNS, firewall rules, and the reverse proxy. Yachiyo does not install server software automatically.

For SSH mode, enter the host, user, SSH port, and remote loopback port. Paste a private key and verified `known_hosts`, or import them from files. Unattended connection requires a dedicated key without a passphrase; the application does not save a server password. Empty secret inputs preserve saved credentials; use the separate removal buttons to clear them. Restart the bot after changing runtime settings.

## Platform login and cache

Import platform login files in Netscape cookie format through the corresponding settings. Cookies are saved through the application's credential store; browser login sessions are not automatically synchronized. Importing login information does not replace the account permissions or regional access required for content.

Audio is prepared and cached on demand, not downloaded for the entire playlist in advance. The default cache limit is 1024 MiB and can be changed in playback settings. Eviction follows recent use and protects files currently in use. Stop the bot before clearing the cache from cache and diagnostics settings.

## Language, appearance, and themes

The desktop supports Chinese and English. Application appearance controls desktop colors and system-following mode. Activity themes control the Discord jukebox's colors, text, logo, and default artwork. These settings are independent.

Save themes to the local library, import, export, or apply them. Keep placeholders such as `{title}` when editing text. Reopen the Activity after applying a theme. Fixed bot replies and command descriptions read at startup require a bot restart.

## About / Info

The About page displays the application version and links to source, releases, issue reporting, and documentation. The full MIT License and third-party overview are available offline within the application; web links open in the system browser. The page follows the desktop language and appearance.

## Personal data

- Installed application: `user-data/` beneath the installation directory.
- Development: `user-data/` beneath the repository root.
- `preferences.json` stores desktop language and appearance; `settings.json` stores ordinary settings.
- `media-tools.json` stores selected paths, versions, file hashes, and validation records. Do not distribute it with source.
- `credentials.dpapi` stores credentials encrypted for the current Windows account. Re-enter credentials after changing computers or Windows accounts.
- `private-runtime/` holds restricted runtime copies and is removed on a normal stop.

Upgrades and uninstallation retain `user-data/`. Back up the complete directory for personal recovery; use theme export to share a theme.

More: [Downloads and tools](DOWNLOADS.en.md) · [FAQ](FAQ.en.md) · [Privacy policy](PRIVACY.en.md).
