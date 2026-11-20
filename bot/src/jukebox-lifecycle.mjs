// Each room owns its timers so another channel cannot inherit an old deadline.
export function createRoomLifecycle({ idleMinutes = 5, clock = () => performance.now() } = {}) {
  let emptySince, idleSince;
  return {
    reset() { emptySince = idleSince = undefined; },
    check(room, { connected, hasListeners }) {
      if (room.closed || (!connected && !room.activityInstances)) { this.reset(); return null; }
      const now = clock();
      if (hasListeners) emptySince = undefined;
      else {
        emptySince ??= now;
        if (now - emptySince >= 60000) return 'end';
      }
      // Activity rooms use Discord participation for cleanup instead of playback inactivity.
      if (room.activityInstances || !room.startedByPlay || room.status !== 'idle' || room.busy || !idleMinutes) {
        idleSince = undefined;
        return null;
      }
      idleSince ??= now;
      return now - idleSince >= idleMinutes * 60000 ? 'disconnect' : null;
    },
  };
}
