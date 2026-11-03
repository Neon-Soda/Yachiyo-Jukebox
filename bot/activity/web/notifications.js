// Initial history is shown without replaying old toasts. New event IDs arrive
// through both action responses and polling, so each client consumes them once.
export function createEventCursor() {
  let roomId, latest = 0;
  return {
    take(nextRoomId, events) {
      const ordered = [...events].sort((a, b) => a.id - b.id);
      if (roomId !== nextRoomId) {
        roomId = nextRoomId; latest = ordered.at(-1)?.id ?? 0;
        return [];
      }
      const fresh = ordered.filter(event => event.id > latest);
      latest = Math.max(latest, ordered.at(-1)?.id ?? 0);
      return fresh;
    },
  };
}

export function createNotificationFeed({ list, empty, toastHost }) {
  // A stale document must not block the player if it predates the history panel.
  if (!list || !empty) return { render() {} };
  const cursor = createEventCursor();
  let previousKey;
  const timestamp = value => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function showToast(event) {
    const host = toastHost();
    const toast = document.createElement('div'); toast.className = `operation-toast${event.kind === 'error' ? ' operation-error' : ''}`;
    const icon = document.createElement('span'); icon.className = 'toast-check'; icon.textContent = event.kind === 'error' ? '!' : '✓'; icon.ariaHidden = 'true';
    const content = document.createElement('span');
    const actor = document.createElement('strong'); actor.textContent = event.actor;
    const message = document.createElement('span'); message.textContent = ` ${event.message}`;
    content.append(actor, message); toast.append(icon, content); host.append(toast);
    while (host.children.length > 3) host.firstElementChild.remove();
    setTimeout(() => toast.remove(), 6100);
  }
  return {
    render(state) {
      const events = (state.events ?? []).slice(-5);
      const fresh = cursor.take(state.id, events);
      const key = JSON.stringify([state.id, events]);
      if (key !== previousKey) {
        previousKey = key; list.replaceChildren(); empty.hidden = events.length > 0;
        for (const event of [...events].reverse()) {
          const row = document.createElement('li'); row.className = `operation-row${event.kind === 'error' ? ' operation-error' : ''}`;
          const text = document.createElement('span'); text.className = 'operation-text';
          const actor = document.createElement('strong'); actor.textContent = event.actor;
          const message = document.createElement('span'); message.textContent = ` ${event.message}`;
          text.append(actor, message);
          const at = document.createElement('time'); at.dateTime = new Date(event.at).toISOString(); at.textContent = timestamp(event.at);
          row.append(text, at); list.append(row);
        }
      }
      for (const event of fresh) showToast(event);
    },
  };
}
