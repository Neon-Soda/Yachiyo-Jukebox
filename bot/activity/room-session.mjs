import { copy as uiCopy } from '../shared/customization.mjs';
// Only a confirmed terminal room snapshot may close the Discord Activity.
// A failed action or a temporary network error must leave the controls open.
import { readApiResponse } from './api-response.mjs';
export function createRoomSession({ login, notice, close, fetchImpl = fetch }) {
  let session = login.session, timer, exitTimer, polling = false, listener;
  let ending = false, disposed = false;
  function leave() {
    disposed = true;
    clearInterval(timer);
    clearTimeout(exitTimer);
    if (!session) return;
    fetchImpl('./api/leave', { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    session = null;
  }
  function endIfClosed(state) {
    if (!state.closed || ending || disposed) return;
    ending = true;
    clearInterval(timer);
    notice(uiCopy("activity.afd942c5d632", "点歌台已结束，正在退出 Activity…"));
    // Give the shared end message a moment to appear before closing this client.
    exitTimer = setTimeout(() => {
      leave();
      try { close(); }
      catch { notice(uiCopy("activity.71167409585a", "点歌台已结束，请手动关闭 Activity。")); }
    }, 900);
  }
  const request = async (path, body) => {
    const r = await fetchImpl(`./api/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status === 410 || r.status === 401) clearInterval(timer);
    return readApiResponse(r);
  };
  return {
    subscribe(fn) {
      if (disposed) return;
      listener = fn; fn(login.state);
      endIfClosed(login.state);
      clearInterval(timer);
      if (ending) return;
      timer = setInterval(async () => {
        if (polling || disposed || ending) return;
        polling = true;
        try {
          const state = await request('state');
          if (!disposed) { listener(state); endIfClosed(state); }
        } catch (error) { if (!disposed && !ending) notice(error.message); }
        finally { polling = false; }
      }, 1500);
    },
    async action(type, data) {
      if (disposed || ending) throw new Error(uiCopy("activity.2118db23c089", "点歌台已结束，请重新打开。"));
      const state = await request('action', { type, ...data });
      endIfClosed(state);
      return state;
    },
    async search(query, platforms) {
      if (disposed || ending) throw new Error(uiCopy("activity.2118db23c089", "点歌台已结束，请重新打开。"));
      const result = await request('search', { query, ...(platforms ? { platforms } : {}) });
      if (result.closed) { listener?.(result); endIfClosed(result); throw new Error(uiCopy("activity.2118db23c089", "点歌台已结束，请重新打开。")); }
      return result;
    },
    async prepareAdd(url) {
      if (disposed || ending) throw new Error(uiCopy("activity.2118db23c089", "点歌台已结束，请重新打开。"));
      const result = await request('prepare-add', { url });
      if (result.closed) { listener?.(result); endIfClosed(result); throw new Error(uiCopy("activity.2118db23c089", "点歌台已结束，请重新打开。")); }
      return result;
    },
    leave,
  };
}
