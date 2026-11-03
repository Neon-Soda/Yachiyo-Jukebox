# Privacy policy

[简体中文](PRIVACY.md) · **English** · [Documentation](README.en.md)

Last updated: 2026-11-03. Covers the functionality described for public version 1.1.0 of this repository.

## Scope and operators

Yachiyo is self-hosted software. Each operator supplies their own Discord application, computer, account settings, and network services. Providing source code does not make the project author the operator of every deployment. This document describes the default project code; it does not replace the privacy notice for an operator's additional logs, proxies, or services.

If you use the jukebox in someone else's Discord server, ask the bot operator or server administrator about data handling, access, and deletion requests. Operators serving other people should identify themselves, provide a contact method, and explain their actual proxy logging and data processing arrangements.

## Data processed

| Data | Purpose and default location |
| --- | --- |
| Discord application / server IDs, network addresses, ports, and playback settings | Connection setup; local `user-data/settings.json` |
| Language, desktop appearance, Activity text, images, and themes | Display and personalization; local preference and theme files. Applied Activity content is served to participants |
| Bot Token, Client Secret, explicitly imported platform cookies, SSH private key, and host records | Authentication or tunneling; stored through Windows DPAPI in `credentials.dpapi` for the current account. The interface receives configured flags rather than saved plaintext |
| Tool paths, versions, SHA-256 hashes, and validation records | Locating and validating media tools; `media-tools.json` |
| Discord user ID / display name, server / channel / Activity instance IDs, and voice membership | OAuth identity checks, channel authorization, and shared events; processed in bot memory |
| OAuth code, access token, and jukebox session identifier | Discord login and API authentication; handled in memory during the session flow. Activity code does not persist login tokens in localStorage |
| Track titles, source links, durations, artwork, playback position, and action events | Search, queueing, playback, and room synchronization; room state is primarily in memory. Other participants can see tracks and the latest five events with display names |
| Search queries, media requests, and source responses | Finding tracks and retrieving artwork and audio; sent to the relevant platforms. Search and artwork caches are primarily in server memory |
| Audio files | Avoiding repeat downloads; local `user-data/data/audio-cache/` |
| Connection peer address, request frequency, and status summaries | Authentication rate limits, error display, and diagnostics; short-lived rate-limit state is in memory. Local status includes connection state, process information, and recent events |

Installed builds keep `user-data/` beneath the installation directory. Development uses a separate directory in the repository. User-selected media tools remain in their original locations.

## Network requests

- **Discord:** bot login, server and voice state, Activity OAuth, identity and channel checks, and voice audio transmission. Activity authorization uses the `identify` scope; the bot uses its own credentials for required APIs.
- **Music / video platforms and their CDNs:** your actions send search queries or media links to retrieve metadata, artwork, and audio. Where needed, requests use cookies you explicitly configured for that platform. These services receive the connection IP and request information.
- **Your network services:** Activity pages and API requests travel through the configured HTTPS endpoint and optional SSH tunnel / proxy. VPS, reverse proxy, DNS, and network providers may keep connection and access records according to their configuration.
- **External pages you open:** GitHub, upstream tool downloads, and help pages are opened in the system browser. If WebView2 is missing, the installer may contact Microsoft for its runtime bootstrapper.

The current project code has no author-operated advertising, behavioral telemetry, central user-registration, or automatic diagnostic upload service, and no feature for selling data through such services. Normal playback contacts third parties. This should not be read as “fully offline” or “third parties collect no data.” Third-party clients, runtimes, and websites have their own privacy rules.

## Credentials and temporary files

The application does not automatically read browser login sessions. Only login information you explicitly import is used for the corresponding playback flow. Desktop credentials use Windows account-bound encryption, and personal directories receive access restrictions.

The bot, media tools, and SSH still need plaintext credentials at runtime. These can exist in controlled child-process memory / environments or restricted `private-runtime/` files. A normal stop removes runtime copies; a crash or power loss can leave files behind. DPAPI does not prevent a program controlling the same Windows account or administrator privileges from accessing runtime data.

Theme exports exclude account credentials, but text and images you supply may contain personal information. Review them before sharing.

## Retention and deletion

- **Settings, themes, and credentials:** retained until changed or removed. Upgrades and uninstallation preserve `user-data/` by default.
- **Room playlists and events:** released when the room ends, rather than saved as persistent listening history. Stopping the bot releases process memory.
- **Sessions:** held in memory and released on leaving, expiry, or service shutdown. Expired sessions are periodically cleaned up.
- **Audio cache:** defaults to a 1024 MiB limit, evicts according to recent use, and protects files in use. Ending a room does not empty the cache. There is no rule deleting everything after 24 hours. Stop the bot to clear it in the application.
- **Diagnostic exports, exported themes, and backups:** remain where you saved them until you remove them.
- **Proxy, Discord, and source-platform records:** retention is not centrally controlled by this project; ask the respective operator.

To clear local personal data, stop the bot, quit from the tray, and delete the corresponding installation's `user-data/`. Separately review the media-tool directory, backups, exports, and browser / WebView2 data. Revoke platform authorization, rotate credentials, or request deletion of third-party records through the relevant service; local deletion does not perform these actions for you.

## Diagnostics and feedback

Diagnostics are exported locally only when you request them, not automatically sent to the author. They include version, platform, runtime state, connection mode, cache summaries, and flags indicating whether credentials are configured. Saved credential contents are not exported by default. Diagnostics can still contain paths, timestamps, or error context; review them before sharing.

[GitHub Issues](https://github.com/Neon-Soda/Yachiyo-Jukebox/issues) are public. Use them for privacy questions or feature suggestions without sensitive data. Do not upload tokens, cookies, SSH private keys, login files, or an entire `user-data/` directory. Direct data-access or deletion requests for a particular deployment to its operator.

## Changes

This notice changes with the implementation and records its revision date above. Operators modifying the code, adding logging, or connecting extra services should update their notice to participants accordingly.
