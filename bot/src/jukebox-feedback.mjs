import { userError } from './messages.mjs';

export function sendPlaybackChat(room, content) {
  if (room.instanceId) return;
  return room.textChannel?.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
}

export async function finishCommandReply(interaction, room, content, error = null) {
  if (room?.instanceId) {
    if (error && !room.closed) {
      room.recordOperation(userError(error), interaction.user.globalName || interaction.user.username || '一位伙伴', 'error');
    }
    // Discord commands still need an acknowledgement; remove the private
    // deferred response once the result is available in the Activity.
    await interaction.deleteReply().catch(() => {});
    return;
  }
  await interaction.editReply({ content, allowedMentions: { parse: [] } });
}
