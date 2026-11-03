// Each room owns its timers so another channel cannot inherit an old deadline.
export function createRoomLifecycle({ idleMinutes = 5, clock = () => performance.now() } = {}) {
  let emptySince, idleSince;
  return {
    reset() { emptySince = idleSince = undefined; },
    check(room, { connected, hasListeners }) {
      if (!connected || room.closed) { this.reset(); return null; }
      const now = clock();
      if (hasListeners) emptySince = undefined;
      else {
        emptySince ??= now;
        if (now - emptySince >= 60000) return 'end';
      }
      // Once an Activity is attached, its participant lifecycle owns cleanup.
      // Only command-based /play sessions may time out while people remain.
      if (room.instanceId || !room.startedByPlay || room.status !== 'idle' || room.busy || !idleMinutes) {
        idleSince = undefined;
        return null;
      }
      idleSince ??= now;
      return now - idleSince >= idleMinutes * 60000 ? 'disconnect' : null;
    },
  };
}
