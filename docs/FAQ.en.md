# Frequently asked questions

[简体中文](FAQ.md) · **English** · [Documentation](README.en.md)

## Do I need to summon the bot first?

No. Join a regular voice channel and add a song through the Activity. The bot connects when playback needs it. It still needs permission to view, connect to, and speak in the channel. Listeners do not need to open the Activity.

## Can multiple channels play at once?

One bot serves one voice channel at a time within a server. Rooms and playlists are separate, and another channel cannot take over the current voice connection. The number of playlists does not remove this limit.

## The Activity stays on “connecting,” is black, or reports a JSON error

Check Discord, local web, and public HTTPS status in the desktop application. Then verify URL Mapping and OAuth settings using the [configuration guide](CONFIGURATION.en.md).

- Open the Activity from a regular voice channel in your server. Opening the page in a browser does not supply Discord channel context.
- Ensure the HTTPS endpoint forwards to the current bot's web port, rather than a default website, proxy error page, or disconnected tunnel.
- `Unexpected token '<'` often means an API request received HTML. Check reverse-proxy routing first.
- Review the domain, certificate, listening address, and server forwarding configuration, then reopen the Activity.

Passwordless SSH is not directly part of Activity authentication. Application-managed SSH needs a dedicated key. If the HTTPS tunnel works, continue checking Discord authorization settings.

## `oauth-exchange-401` or missing `redirect_uri`

Check that the Application ID, Bot Token, and Client Secret belong to the same Discord application. Replace an invalid Client Secret. Register the OAuth2 Redirect URI shown by the desktop application in the Developer Portal, and verify Activity enablement and testing access. Never paste credentials into an issue.

## A link plays in my browser but not through the bot

Browser cookies are not synchronized automatically. Import login files for the relevant platform when needed, and check account, subscription, or regional restrictions. Search visibility does not guarantee playback. Check tool validation status; revalidate and restart the bot after updating tools.

`cache-download` means audio preparation failed. Source requests, login, connectivity, tools, or disk access may be involved; the code alone does not prove a cookie problem. Include the platform link, application version, and displayed error when reporting it.

## A collection is incomplete or cannot be read

Source interfaces and access permissions affect available members. Try the current item first and confirm that the collection is accessible. Re-detecting it may return different results. Bilibili multipart videos and video collections are distinct structures, and both are recognized. NetEase playlist bulk import is not currently supported. Imported collections do not follow later source updates automatically.

## Why are audio files still present after closing a room?

Room playlists and disk caches are separate. Ending a room clears its state. Audio is retained for reuse according to size and recent-use rules, with a default limit of 1024 MiB and protection for files in use. Stop the bot to clear it in cache and diagnostics settings. It is not a permanent music library and has no fixed 24-hour deletion rule.

## Is it normal for the bot to stay online after closing the window?

Yes. Closing the window releases WebView2 and keeps the tray and services running. Quit through the tray to stop the managed bot and SSH process. Unsaved forms can be restored when reopening the window during the same application session; they are discarded on a full exit.

An Activity with participants does not end for playback inactivity. An empty voice channel still ends the room after 60 seconds. `/play`-only sessions use the configured idle timeout.

## What if I move the application or tools, or change computers?

Select and validate tools again after moving them. Back up the whole `user-data/` directory for personal recovery, but remember that credentials are bound to the Windows account. Copying them to another computer or account does not make them decryptable; reconfigure them there. Updating and uninstalling do not automatically delete personal data.

## How do I update or report a problem?

Check [this project's Releases](https://github.com/Neon-Soda/Yachiyo-Jukebox/releases) and follow [downloads](DOWNLOADS.en.md). There is currently no automatic updater.

When [opening an issue](https://github.com/Neon-Soda/Yachiyo-Jukebox/issues), include the application and Windows versions, steps, source link, and displayed error. Export diagnostics manually if useful, and review them before sharing. Do not upload tokens, cookies, SSH private keys, or your entire user directory.
