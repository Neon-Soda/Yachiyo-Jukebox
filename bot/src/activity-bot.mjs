import { copy as uiCopy } from './customization.mjs';
import { attachDesktopStatus } from './desktop-status.mjs';
import { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { AudioCache } from './audio-cache.mjs';
import { JukeboxAudio } from './jukebox-audio.mjs';
import { JukeboxRoom } from './jukebox-room.mjs';
import { createActivityServer } from './activity-http.mjs';
import { createDiscordAuth } from './activity-auth.mjs';
import { messages, userError, UserFacingError } from './messages.mjs';
import { idleMinutes } from './idle-timeout.mjs';
import { createRoomLifecycle } from './jukebox-lifecycle.mjs';
import { createRoomActionHandler } from './jukebox-actions.mjs';
import { sendPlaybackChat, finishCommandReply } from './jukebox-feedback.mjs';
import { createMusicSearch } from './music-search.mjs';

const { DISCORD_TOKEN, GUILD_ID, DISCORD_CLIENT_SECRET } = process.env;
const dist = fileURLToPath(new URL('../activity/dist/', import.meta.url));
if (!DISCORD_TOKEN || !/^\d{17,20}$/.test(GUILD_ID ?? '') || !DISCORD_CLIENT_SECRET || !existsSync(fileURLToPath(new URL('../activity/dist/connect.js', import.meta.url)))) throw new Error(uiCopy("room.d1bd19acc78d", "Activity 配置不完整，请阅读 ACTIVITY.md。"));
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const configuredMb = Number(process.env.AUDIO_CACHE_MB ?? 1024);
const cache = new AudioCache({ maxBytes: (Number.isFinite(configuredMb) && configuredMb >= 256 && configuredMb <= 10240 ? configuredMb : 1024) * 1024 ** 2 });
const rooms = new Map();
attachDesktopStatus(client, () => ({ rooms: rooms.size, localReady: Boolean(serverHandle?.server.listening) }));
const musicSearch = createMusicSearch();
let connection, activeRoom, serverHandle, auth, checking = false;

async function channelForUser(userId) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(userId);
  const channel = member.voice.channel;
  if (!channel || channel.type !== 2) throw new UserFacingError('joinVoice');
  return channel;
}
function roomFor(channel, instanceId = null) {
  let room = rooms.get(channel.id);
  if (room?.instanceId && instanceId && room.instanceId !== instanceId) throw new UserFacingError('roomOccupied');
  if (!room) {
    room = new JukeboxRoom({ channelId: channel.id, channelName: channel.name, audio: new JukeboxAudio(cache), coverFor: musicSearch.registerCover });
    room.lifecycle = createRoomLifecycle({ idleMinutes: idleMinutes(process.env.IDLE_TIMEOUT_MINUTES) });
    room.on('closed', () => {
      if (activeRoom === room) { const old = connection; connection = null; activeRoom = null; old?.destroy(); }
      if (rooms.get(channel.id) === room) rooms.delete(channel.id);
    });
    room.on('playing', track => sendPlaybackChat(room, messages.nowPlaying(track.title)));
    room.on('playbackFailure', () => sendPlaybackChat(room, messages.playbackInterrupted(room.tracks.length > 1)));
    rooms.set(channel.id, room);
  }
  if (instanceId) room.instanceId = instanceId;
  return room;
}
async function ensureVoice(room, userId) {
  const channel = await channelForUser(userId);
  if (channel.id !== room.channelId) throw new UserFacingError('differentVoice');
  if (activeRoom && activeRoom !== room) throw new UserFacingError('roomOccupied');
  const permissions = channel.permissionsFor(channel.guild.members.me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) throw new UserFacingError('voicePermissions');
  if (!connection) {
    activeRoom = room;
    const voice = joinVoiceChannel({ guildId: GUILD_ID, channelId: channel.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: true });
    connection = voice; voice.subscribe(room.audio.player);
    voice.on('error', () => { if (connection === voice) room.close(); });
    voice.on(VoiceConnectionStatus.Disconnected, async () => {
      try { await Promise.race([entersState(voice, VoiceConnectionStatus.Signalling, 5000), entersState(voice, VoiceConnectionStatus.Connecting, 5000)]); }
      catch { if (connection === voice) room.close(); }
    });
  }
  const voice = connection;
  try { await entersState(voice, VoiceConnectionStatus.Ready, 20000); }
  catch { if (connection === voice) room.close(); throw new UserFacingError('voiceTimeout'); }
  room.assertOpen(); room.lifecycle.reset();
}
const action = createRoomActionHandler({ ensureVoice });
const commands = [
  new SlashCommandBuilder().setName('jukebox').setDescription(uiCopy("room.555234e4997d", "打开月夜点歌台，用按钮一起管理歌单")),
  new SlashCommandBuilder().setName('play').setDescription(messages.command.play).addStringOption(o => o.setName('link').setDescription(messages.command.link).setRequired(true)),
  ...['queue', 'skip', 'pause', 'resume', 'stop'].map(name => new SlashCommandBuilder().setName(name).setDescription(messages.command[name])),
].map(c => c.setDMPermission(false).toJSON());

client.once('clientReady', async () => {
  try {
    const applicationId = client.application.id;
    if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_ID !== applicationId) throw new Error('application mismatch');
    auth = createDiscordAuth({ applicationId, clientSecret: DISCORD_CLIENT_SECRET, botToken: DISCORD_TOKEN, guildId: GUILD_ID, channelForUser, roomFor });
    serverHandle = createActivityServer({ clientId: applicationId, directory: dist, publicOrigin: process.env.ACTIVITY_PUBLIC_ORIGIN, authenticate: auth.authenticate, authorize: auth.authorize, action, search: musicSearch.search, cover: musicSearch.cover });
    const port = Number(process.env.ACTIVITY_PORT ?? 3178);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid port');
    const host = process.env.ACTIVITY_HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
    await new Promise((resolve, reject) => { serverHandle.server.once('error', reject); serverHandle.server.listen(port, host, resolve); });
    const guild = await client.guilds.fetch(GUILD_ID); await guild.commands.set(commands);
    console.log(messages.runtime.ready(client.user.tag));
    console.log(`Activity service ready on localhost:${port}`);
  } catch {
    console.error(uiCopy("room.eb8337a81e78", "Activity 启动失败，请核对配置、端口及 Discord 应用权限。"));
    serverHandle?.server.close(); client.destroy(); process.exit(1);
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  let commandRoom;
  try {
    if (interaction.guildId !== GUILD_ID) throw new UserFacingError('wrongGuild');
    if (interaction.commandName === 'jukebox') { await channelForUser(interaction.user.id); await interaction.launchActivity(); return; }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await channelForUser(interaction.user.id);
    const room = roomFor(channel); room.textChannel = interaction.channel;
    commandRoom = room;
    const name = interaction.commandName;
    const controlSession = { room, userId: interaction.user.id, displayName: interaction.member?.displayName || interaction.member?.nick || interaction.user.globalName || interaction.user.username };
    let content;
    if (name === 'queue') content = messages.queue(room.current, room.tracks.filter(t => t.id !== room.currentId), room.status === 'paused');
    else if (name === 'play') { room.startedByPlay = true; const added = await action(controlSession, { type: 'add', url: interaction.options.getString('link', true) }); content = added.kind === 'collection' ? messages.collectionAdded(added.title, added.count, added.skipped) : messages.added(added.title); }
    else if (name === 'stop') { await action(controlSession, { type: 'end' }); content = messages.stopped; }
    else if (name === 'skip') { const title = room.current?.title ?? messages.unnamed; await action(controlSession, { type: 'next' }); content = messages.skipped(title, room.tracks.length > 1); }
    else if (name === 'pause') { await action(controlSession, { type: 'pause' }); content = room.status === 'paused' ? messages.paused : messages.pauseNotReady; }
    else if (name === 'resume') { await action(controlSession, { type: 'resume' }); content = messages.resumed; }
    await finishCommandReply(interaction, room, content ?? messages.errors.unsupportedCommand);
  } catch (error) {
    const reply = { content: userError(error), allowedMentions: { parse: [] } };
    if (interaction.deferred) await finishCommandReply(interaction, commandRoom, reply.content, error).catch(() => {});
    else await interaction.reply({ ...reply, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

setInterval(async () => {
  if (!auth || checking) return;
  checking = true;
  try {
    for (const room of [...rooms.values()]) {
      if (!room.instanceId) continue;
      try {
        const instance = await auth.getInstance(room.instanceId, true);
        if (!instance || !instance.users?.length) { room.close(); continue; }
        room.participants = instance.users.length;
      } catch {
        // A failed API request cannot prove the last participant left.
        // Keep the room; explicit end and the empty voice channel timer remain.
      }
    }
  } finally { checking = false; }
}, 15000).unref();
setInterval(() => {
  if (!connection || !activeRoom) return;
  const channel = client.guilds.cache.get(GUILD_ID)?.channels.cache.get(activeRoom.channelId);
  const outcome = activeRoom.lifecycle.check(activeRoom, { connected: true, hasListeners: Boolean(channel?.members.some(member => !member.user.bot)) });
  if (outcome === 'end') activeRoom.close();
  else if (outcome === 'disconnect') {
    activeRoom.lifecycle.reset();
    const old = connection; connection = null; activeRoom = null; old.destroy();
  }
}, 1000).unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const room of [...rooms.values()]) room.close();
  serverHandle?.server.close(); client.destroy(); process.exit(0);
});
client.login(DISCORD_TOKEN).catch(() => { console.error(messages.runtime.loginFailed); process.exit(1); });
