# Using the jukebox

[简体中文](ACTIVITY.md) · **English** · [Documentation](README.en.md)

## Joining a room

Join a regular server voice channel and use `/jukebox`, or open the configured Yachiyo Jukebox Activity through Discord's application launcher. The bot plays audio in the voice channel; listeners do not need to open the Activity. Adding a song establishes the required voice connection, so you do not need to summon the bot beforehand.

Rooms and playlists are isolated by voice channel. One bot can serve only one voice channel at a time within a server; another channel cannot take over an occupied connection. Control requests verify that the user is still in the corresponding voice channel.

## Search and links

Search by song title or “title + artist,” or paste a supported music / video link. The results dialog shows available artwork, titles, and durations. Select a result to add it to the playlist.

| Selected platforms | Maximum results |
| --- | --- |
| Bilibili, YouTube, and NetEase Cloud Music together | 12 total |
| One platform | 10 |
| Two platforms | 5 per platform |

Actual counts depend on source responses, connectivity, and access. Missing artwork uses the default image. A search result does not guarantee that your account can play the full content.

## One track or a collection

When the Activity detects a collection, it asks whether to add the current item or the whole collection. Canceling adds nothing.

| Type | Behavior |
| --- | --- |
| Bilibili multipart video | Adds parts in order; the single-item choice uses the link's `?p=` value, or the default part when omitted |
| Bilibili video collection | Reads each member's own video link rather than treating the collection as parts of one video |
| YouTube playlist | Choose the current video or the full playlist; a playlist-only link uses the first available item for the single-item choice |
| NetEase Cloud Music playlist | Bulk import is not supported; use individual track links or search |

Only items discovered during that import are added. The playlist does not subscribe to future additions at the source. Platform access limits can affect the count and completeness. Adding a collection adds track records; audio is prepared when each track is played.

## Playback controls

The player shows the current title, artwork, duration, and position. Pause / resume, seek, or move to the previous / next track. The playlist button opens the full list, where selecting an item switches playback to it.

| Mode | Behavior |
| --- | --- |
| Sequential | Plays in order and stops at the end |
| Repeat all | Loops the playlist after the last track |
| Repeat one | Repeats the current track when it ends |
| Shuffle | Chooses subsequent tracks at random |

The playlist remains after sequential playback finishes. Adding a new song then starts that new track; adding a collection starts the first track of that import. During playback or pause, new tracks are appended.

## Shared activity feed

Participants in the same room share playback state. Successful actions produce a notice that slowly rises and fades. The bottom of the page keeps the latest five room events, including the actor's display name and action. While the Activity is active, relevant feedback is primarily shown there to avoid duplicate chat messages.

Other room members can also add, pause, and switch tracks. The feed helps people coordinate; it does not grant one person exclusive control.

## When a room ends

- A room does not end merely because playback is idle while someone continues using the Activity.
- Once the last participant is confirmed to have left, the room cleanup flow releases the playlist. A temporary network lookup failure does not prove everyone has left.
- End jukebox closes the whole shared room and attempts to close the Activity through the Discord SDK. Close it manually if the client stays open.
- If the voice channel is empty for 60 seconds, the room ends and the bot leaves voice.
- With `/play` only, the bot leaves after the configured idle timeout, which defaults to five minutes.

Ending a room clears its playlist but **does not automatically delete disk audio caches**. Caches follow size and recent-use rules; stop the bot to clear them manually.

## Chat commands

Commands also work without an Activity. Use them in the configured server while connected to the corresponding voice channel.

| Command | Purpose |
| --- | --- |
| `/jukebox` | Opens the Activity; requires Activity configuration and enablement |
| `/play link:<URL>` | Adds and plays a supported link |
| `/queue` | Shows the queue |
| `/pause` | Pauses playback |
| `/resume` | Resumes playback |
| `/skip` | Skips the current track |
| `/stop` | Stops playback and ends the current session |

The collection choice dialog belongs to the Activity interface; chat commands do not display that dialog. See the [FAQ](FAQ.en.md) for playback and connection problems.
