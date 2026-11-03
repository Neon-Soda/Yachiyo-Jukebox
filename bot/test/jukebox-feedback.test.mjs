import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendPlaybackChat, finishCommandReply } from '../src/jukebox-feedback.mjs';
import { UserFacingError } from '../src/messages.mjs';

test('automatic playback chat is suppressed once the room has an Activity', async () => {
  const sent = [];
  const room = { textChannel: { send: async message => sent.push(message) } };
  await sendPlaybackChat(room, 'Now playing'); assert.equal(sent.length, 1);
  room.instanceId = 'activity';
  await sendPlaybackChat(room, 'Now playing'); await sendPlaybackChat(room, 'Playback failed');
  assert.equal(sent.length, 1);
});

test('successful Activity commands remove their private acknowledgement; command-only mode retains feedback', async () => {
  const edits = []; let deleted = 0;
  const interaction = { user: { username: 'Test' }, editReply: async message => edits.push(message), deleteReply: async () => { deleted++; } };
  await finishCommandReply(interaction, {}, 'Added'); assert.equal(edits.length, 1); assert.equal(deleted, 0);
  await finishCommandReply(interaction, { instanceId: 'activity' }, 'Added'); assert.equal(edits.length, 1); assert.equal(deleted, 1);
});

test('Activity command errors become safe shared error events rather than chat messages', async () => {
  const events = []; let deleted = false;
  const interaction = { user: { globalName: '小月' }, editReply: async () => assert.fail('No duplicated chat reply'), deleteReply: async () => { deleted = true; } };
  const room = { instanceId: 'activity', recordOperation: (...args) => events.push(args) };
  await finishCommandReply(interaction, room, 'unused', new UserFacingError('queueFull'));
  assert.equal(deleted, true); assert.equal(events.length, 1); assert.equal(events[0][1], '小月'); assert.equal(events[0][2], 'error');
  await finishCommandReply(interaction, room, 'unused', new Error('private upstream text'));
  assert.ok(!JSON.stringify(events).includes('private'));
});
