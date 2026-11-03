import { copy as uiCopy } from './customization.mjs';
import { UserFacingError } from './messages.mjs';

const modes = { sequence: uiCopy("room.5bbcac595bc6", "顺序播放"), 'repeat-all': uiCopy("room.2fe0943eacb3", "列表循环"), 'repeat-one': uiCopy("room.8cde791504d2", "单曲循环"), shuffle: uiCopy("room.f34b7ce61098", "随机播放") };
const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const launch = promise => { promise.catch(() => {}); };

export function createRoomActionHandler({ ensureVoice }) {
  return async function action(session, data) {
    const { room, userId, displayName = '一位伙伴' } = session;
    room.assertOpen();
    let prepared;
    if (data.type === 'add' && data.previewId !== undefined) {
      const pending = session.pendingAdd;
      if (!pending || typeof data.previewId !== 'string' || pending.id !== data.previewId || pending.expires <= Date.now() || typeof data.url !== 'string' || pending.input !== data.url.trim() || pending.result.version !== room.addGeneration) throw new UserFacingError('cancelled');
      prepared = pending.result;
      // Consume before any await, so double clicks cannot enqueue the same choice twice.
      session.pendingAdd = null;
    }
    const record = message => room.recordOperation(message, displayName);
    if (['add', 'play', 'resume', 'next', 'previous', 'seek'].includes(data.type)) await ensureVoice(room, userId);
    switch (data.type) {
      case 'add': {
        if (typeof data.url !== 'string' || data.url.length > 4096) throw new UserFacingError('invalidLink');
        const single = data.single === true || Boolean(prepared && !prepared.collection);
        const url = prepared ? (single ? prepared.single?.url ?? prepared.parsed.url : prepared.parsed.url) : data.url;
        const track = await room.add(url, { single, prepared });
        record(track.kind === 'collection' ? uiCopy("room.7c51442da834", "加入了合集《{title}》，共 {count} 首{value3}", { title: track.title, count: track.count, value3: track.skipped ? uiCopy("room.c587e4968f79", "，跳过 {skipped} 个不可用或超长条目", { skipped: track.skipped }) : '' }) : uiCopy("room.d033d3081ed8", "加入了《{title}》", { title: track.title }));
        await ensureVoice(room, userId);
        // A finished playlist remains visible; start this addition, not an old song.
        if (!room.current) launch(room.play(track.kind === 'collection' ? track.firstTrackId : track.id));
        return track;
      }
      case 'play': {
        const track = room.tracks.find(t => t.id === data.id);
        if (!track) throw new UserFacingError('nothingPlaying');
        launch(room.play(data.id));
        record(uiCopy("room.eca78e4cac00", "点播《{title}》，正在准备", { title: track.title }));
        break;
      }
      case 'pause': {
        const wasPlaying = room.status === 'playing';
        room.pause();
        if (wasPlaying && room.status === 'paused') record(uiCopy("room.26328eacafc6", "暂停了《{title}》", { title: room.current.title }));
        break;
      }
      case 'resume': {
        const before = room.status;
        if (before === 'idle' && !room.tracks.length) throw new UserFacingError('nothingPlaying');
        launch(room.resume());
        if (before === 'paused' && room.status === 'playing') record(uiCopy("room.507680ed8a29", "继续播放《{title}》", { title: room.current.title }));
        else if (before === 'idle' && room.status === 'loading') record(uiCopy("room.151f10948f10", "开始准备《{title}》", { title: room.current.title }));
        break;
      }
      case 'next': case 'previous': {
        if (!room.tracks.length) break;
        launch(data.type === 'next' ? room.next() : room.previous());
        record(room.current ? uiCopy("room.a0196b8ea854", "切换到{value1}《{title}》，正在准备", { value1: data.type === 'next' ? uiCopy("room.486e42475adb", "下一首") : uiCopy("room.8c747908bf69", "上一首"), title: room.current.title }) : uiCopy("room.887c6ba16e57", "已到歌单末尾，播放停止"));
        break;
      }
      case 'seek': {
        if (!room.current || !Number.isFinite(room.current.duration) || !Number.isFinite(data.position) || data.position < 0) throw new UserFacingError('invalidSeek');
        const position = Math.min(data.position, Math.max(0, room.current.duration - 0.1));
        launch(room.seek(position));
        record(uiCopy("room.0428192fb479", "将《{title}》定位到 {value2}，正在准备", { title: room.current.title, value2: time(position) }));
        break;
      }
      case 'mode': {
        const before = room.mode;
        room.setMode(data.mode);
        if (before !== room.mode) record(uiCopy("room.a44b4dc67603", "将播放方式改为{value1}", { value1: modes[room.mode] }));
        break;
      }
      case 'move': {
        const from = room.tracks.findIndex(t => t.id === data.id);
        if (from < 0 || ![-1, 1].includes(data.direction)) break;
        const track = room.tracks[from];
        room.move(data.id, data.direction);
        const to = room.tracks.indexOf(track);
        if (from !== to) record(uiCopy("room.08c473329fe2", "将《{title}》移到歌单第 {value2} 位", { title: track.title, value2: to + 1 }));
        break;
      }
      case 'remove': {
        const track = room.tracks.find(t => t.id === data.id);
        if (!track) break;
        launch(room.remove(data.id));
        record(uiCopy("room.a2b9785b983b", "移除了《{title}》", { title: track.title }));
        break;
      }
      case 'clear': {
        const count = room.tracks.length;
        room.clear();
        if (count) record(uiCopy("room.b3c7c0538a12", "清空了歌单，共 {count} 首", { count: count }));
        break;
      }
      case 'end': record(uiCopy("room.050d3103f1ec", "结束了本频道的点歌台")); room.close(); break;
      default: throw new UserFacingError('invalidRequest');
    }
  };
}
