import { attachDesktopStatus } from './desktop-status.mjs';
import { spawn } from 'node:child_process';
import { Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createAudioPlayer, createAudioResource, joinVoiceChannel, entersState, AudioPlayerStatus, VoiceConnectionStatus, StreamType, NoSubscriberBehavior } from '@discordjs/voice';
import { parseLink, inspect, prepareDownload } from './media.mjs';
import { messages, UserFacingError, userError } from './messages.mjs';
import { createIdleTimeout, idleMinutes } from './idle-timeout.mjs';

const { DISCORD_TOKEN, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !/^\d{17,20}$/.test(GUILD_ID || '')) throw new Error(messages.runtime.invalidConfig);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
attachDesktopStatus(client);
const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
let connection, current, processes = [], textChannel, busy = false, generation = 0, emptySince;
const queue = [];
const idleTimeoutMinutes = idleMinutes(process.env.IDLE_TIMEOUT_MINUTES);
const idleTimeout = createIdleTimeout(idleTimeoutMinutes);
const say = message => textChannel?.send({ content: message, allowedMentions: { parse: [] } }).catch(() => {});
function killProcesses() { for (const p of processes) p.kill('SIGKILL'); processes = []; }
function stop() {
  generation++; queue.length = 0; current = undefined;
  killProcesses(); player.stop(true);
  const old = connection; connection = undefined; old?.destroy();
  idleTimeout.reset(); emptySince = undefined;
}
function next() {
  killProcesses(); current = queue.shift();
  if (!current || !connection) return;
  idleTimeout.reset();
  const track = current;
  const version = generation;
  prepareDownload(track).then(prepared => {
    if (current !== track || generation !== version || !connection) return;
    startPlayback(track, prepared);
  }).catch(() => {
    if (current !== track || generation !== version) return;
    say(messages.playbackFailed(track.title, queue.length > 0));
    next();
  });
}
function startPlayback(track, prepared) {
  const download = spawn('yt-dlp', prepared.args, { windowsHide: true });
  const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-t', '7200', '-ac', '2', '-ar', '48000', '-f', 's16le', 'pipe:1'], { windowsHide: true });
  processes = [download, ffmpeg];
  let reported = false;
  const fail = () => {
    if (current !== track || reported) return;
    reported = true; say(messages.playbackFailed(track.title, queue.length > 0));
    if (!player.stop(true)) next();
  };
  for (const p of processes) {
    p.stderr.resume(); p.on('error', fail);
    p.on('close', code => { if (code !== 0 && code !== null) fail(); });
  }
  download.stdout.on('error', fail);
  download.stdin.on('error', fail);
  ffmpeg.stdin.on('error', fail);
  ffmpeg.stdout.on('error', fail);
  download.stdout.pipe(ffmpeg.stdin);
  download.stdin.end(prepared.input);
  player.play(createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw }));
  say(messages.nowPlaying(track.title));
}
player.on(AudioPlayerStatus.Idle, next);
player.on('error', () => { say(messages.playbackInterrupted(queue.length > 0)); if (!player.stop(true)) next(); });
const commands = [
  new SlashCommandBuilder().setName('play').setDescription(messages.command.play).addStringOption(o => o.setName('link').setDescription(messages.command.link).setRequired(true)),
  ...['queue', 'skip', 'pause', 'resume', 'stop'].map(name => new SlashCommandBuilder().setName(name).setDescription(messages.command[name])),
].map(c => c.setDMPermission(false).toJSON());
client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.commands.set(commands);
    console.log(messages.runtime.ready(client.user.tag));
  } catch { console.error(messages.runtime.registerFailed); client.destroy(); process.exitCode = 1; }
});
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (i.guildId !== GUILD_ID) throw new UserFacingError('wrongGuild');
    const member = await i.guild.members.fetch(i.user.id);
    const channel = member.voice.channel;
    if (!channel || channel.type !== 2) throw new UserFacingError('joinVoice');
    if (connection && connection.joinConfig.channelId !== channel.id) throw new UserFacingError('differentVoice');
    if (i.commandName === 'play') {
      if (busy) throw new UserFacingError('busy');
      if (queue.length >= 30) throw new UserFacingError('queueFull');
      busy = true;
      idleTimeout.reset();
      const version = generation;
      try {
        const track = await inspect(parseLink(i.options.getString('link', true)));
        if (generation !== version) throw new UserFacingError('cancelled');
        const fresh = await i.guild.members.fetch(i.user.id);
        if (fresh.voice.channelId !== channel.id) throw new UserFacingError('leftVoice');
        const permissions = channel.permissionsFor(i.guild.members.me);
        if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) throw new UserFacingError('voicePermissions');
        if (!connection) {
          connection = joinVoiceChannel({ guildId: GUILD_ID, channelId: channel.id, adapterCreator: i.guild.voiceAdapterCreator, selfDeaf: true });
          connection.subscribe(player);
          connection.on('error', () => { say(messages.voiceFailed); stop(); });
          connection.on(VoiceConnectionStatus.Disconnected, async () => {
            const active = connection;
            try { await Promise.race([entersState(active, VoiceConnectionStatus.Signalling, 5000), entersState(active, VoiceConnectionStatus.Connecting, 5000)]); }
            catch { if (connection === active) stop(); }
          });
        }
        try { await entersState(connection, VoiceConnectionStatus.Ready, 20000); }
        catch { stop(); throw new UserFacingError('voiceTimeout'); }
        if (generation !== version) throw new UserFacingError('cancelled');
        textChannel = i.channel; queue.push(track);
        if (!current) next();
        await i.editReply({ content: messages.added(track.title), allowedMentions: { parse: [] } });
      } finally { busy = false; }
      return;
    }
    if (i.commandName === 'queue') {
      const paused = player.state.status === AudioPlayerStatus.Paused || player.state.status === AudioPlayerStatus.AutoPaused;
      await i.editReply({ content: messages.queue(current, queue, paused), allowedMentions: { parse: [] } });
      return;
    }
    let confirmation;
    if (i.commandName === 'stop') {
      confirmation = connection || current || queue.length || busy ? messages.stopped : messages.stopEmpty;
      stop();
    }
    else {
      if (!current) throw new UserFacingError('nothingPlaying');
      if (i.commandName === 'skip') {
        confirmation = messages.skipped(current.title, queue.length > 0);
        if (!player.stop(true)) next();
      } else if (i.commandName === 'pause') {
        const paused = player.state.status === AudioPlayerStatus.Paused || player.state.status === AudioPlayerStatus.AutoPaused;
        confirmation = paused ? messages.alreadyPaused : player.pause() ? messages.paused : messages.pauseNotReady;
      } else if (i.commandName === 'resume') {
        confirmation = player.state.status === AudioPlayerStatus.Playing ? messages.alreadyPlaying : player.unpause() ? messages.resumed : messages.resumeNotReady;
      } else throw new UserFacingError('unsupportedCommand');
    }
    await i.editReply({ content: confirmation, allowedMentions: { parse: [] } });
  } catch (e) {
    if (!(e instanceof UserFacingError)) {
      // Keep arbitrary upstream messages (which can include URLs) out of Discord.
      const code = String(e?.code ?? e?.name ?? 'Unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      console.error(messages.runtime.unexpected(code));
    }
    const content = userError(e);
    if (i.deferred) await i.editReply({ content, allowedMentions: { parse: [] } }).catch(() => {});
    else await i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});
setInterval(() => {
  if (idleTimeout.due({ connected: Boolean(connection), hasTrack: Boolean(current), queueLength: queue.length, busy })) {
    say(messages.idleLeave(idleTimeoutMinutes));
    stop();
  }
}, 1000).unref();
setInterval(() => {
  if (!connection) { emptySince = undefined; return; }
  const channel = client.guilds.cache.get(GUILD_ID)?.channels.cache.get(connection.joinConfig.channelId);
  const hasHumans = channel?.members.some(m => !m.user.bot);
  if (hasHumans) emptySince = undefined;
  else { emptySince ??= Date.now(); if (Date.now() - emptySince > 60000) stop(); }
}, 10000).unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); client.destroy(); process.exit(0); });
client.login(DISCORD_TOKEN).catch(() => { console.error(messages.runtime.loginFailed); process.exit(1); });

