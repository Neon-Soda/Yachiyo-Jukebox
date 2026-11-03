// Monotonic clock avoids wall-clock adjustments extending or shortening a wait.
export function idleMinutes(value) {
  if (value == null || String(value).trim() === '') return 5;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 5;
}

export function createIdleTimeout(minutes, clock = () => performance.now()) {
  let since;
  return {
    reset() { since = undefined; },
    due({ connected, hasTrack, queueLength, busy }) {
      if (!minutes || !connected || hasTrack || queueLength > 0 || busy) {
        since = undefined;
        return false;
      }
      const now = clock();
      since ??= now;
      return now - since >= minutes * 60000;
    },
  };
}
