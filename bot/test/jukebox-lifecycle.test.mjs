import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomLifecycle } from '../src/jukebox-lifecycle.mjs';

function setup(overrides = {}, minutes = 5) {
  let now = 0;
  const lifecycle = createRoomLifecycle({ idleMinutes: minutes, clock: () => now });
  const room = { status: 'idle', busy: false, closed: false, startedByPlay: true, ...overrides };
  const state = { connected: true, hasListeners: true };
  return { room, state, check: () => lifecycle.check(room, state), at: value => { now = value; } };
}

test('an open Activity never disconnects for inactivity, including empty and paused playlists', () => {
  for (const status of ['idle', 'paused', 'loading', 'playing']) {
    const s = setup({ instanceId: 'activity', status });
    assert.equal(s.check(), null); s.at(24 * 60 * 60000); assert.equal(s.check(), null);
  }
});

test('only idle /play sessions disconnect, and attaching an Activity cancels an existing deadline', () => {
  const s = setup(); assert.equal(s.check(), null);
  s.at(299999); assert.equal(s.check(), null);
  s.at(300000); assert.equal(s.check(), 'disconnect');
  s.room.instanceId = 'activity'; assert.equal(s.check(), null);
  s.at(900000); assert.equal(s.check(), null);
  const unused = setup({ startedByPlay: false }); unused.check(); unused.at(900000); assert.equal(unused.check(), null);
});

test('command idle timeout restarts after playback or preparation and can be disabled', () => {
  for (const update of [{status: 'playing'}, {status: 'paused'}, {status: 'loading'}, {busy: true}]) {
    const s = setup(); s.check(); s.at(200000); Object.assign(s.room, update); assert.equal(s.check(), null);
    s.at(300000); Object.assign(s.room, {status: 'idle', busy: false}); assert.equal(s.check(), null);
    s.at(599999); assert.equal(s.check(), null); s.at(600000); assert.equal(s.check(), 'disconnect');
  }
  const disabled = setup({}, 0); disabled.check(); disabled.at(900000); assert.equal(disabled.check(), null);
});

test('60 seconds without voice listeners ends both Activity and command rooms, resetting on return', () => {
  for (const instanceId of [undefined, 'activity']) {
    const s = setup({ instanceId, status: 'paused' }); s.state.hasListeners = false; s.check();
    s.at(59999); assert.equal(s.check(), null);
    s.state.hasListeners = true; assert.equal(s.check(), null);
    s.at(60000); s.state.hasListeners = false; assert.equal(s.check(), null);
    s.at(119999); assert.equal(s.check(), null); s.at(120000); assert.equal(s.check(), 'end');
  }
});

test('another room, a closed room and a disconnected room do not inherit old timers', () => {
  const a = setup(); a.check(); a.at(300000); assert.equal(a.check(), 'disconnect');
  const b = setup(); b.at(300000); assert.equal(b.check(), null);
  b.state.connected = false; b.at(600000); assert.equal(b.check(), null);
  b.state.connected = true; assert.equal(b.check(), null);
  b.room.closed = true; b.at(900000); assert.equal(b.check(), null);
});
