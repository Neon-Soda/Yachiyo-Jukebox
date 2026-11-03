import { copy as uiCopy } from '../shared/customization.mjs';
import { DiscordSDK, RPCCloseCodes } from '@discord/embedded-app-sdk';
import { createRoomSession } from './room-session.mjs';
import { readApiResponse } from './api-response.mjs';

export async function connect(config, notice) {
  const step = async (label, operation, timeout = 30000) => {
    notice(label);
    let timer;
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(uiCopy("activity.3eecca8b4742", "{label}超时，请关闭点歌台后重试。", { label: label }))), timeout);
      })]);
    } finally { clearTimeout(timer); }
  };
  if (!new URLSearchParams(location.search).has('frame_id')) throw new Error(uiCopy("activity.30e08d24f46b", "请在 Discord 语音频道中打开 Yachiyo Activity。"));
  const sdk = new DiscordSDK(config.clientId);
  await step(uiCopy("activity.77e049867eb2", "正在连接 Discord"), () => sdk.ready());
  if (!sdk.guildId || !sdk.channelId) throw new Error(uiCopy("activity.e33aa3436317", "请从服务器的普通语音频道打开点歌台。"));
  const oauthState = crypto.randomUUID();
  const auth = await step(uiCopy("activity.d73a13b90022", "正在等待 Discord 登录授权"), () => sdk.commands.authorize({ client_id: config.clientId, response_type: 'code', state: oauthState, prompt: 'none', scope: ['identify'] }), 120000);
  if (auth.state && auth.state !== oauthState) throw new Error(uiCopy("activity.b43bb707325c", "登录校验未通过，请重新打开点歌台。"));
  notice(uiCopy("activity.3f8bffa91265", "正在验证频道身份"));
  const response = await fetch('./api/auth', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: auth.code, instanceId: sdk.instanceId, channelId: sdk.channelId, guildId: sdk.guildId }) });
  const login = await readApiResponse(response);
  await step(uiCopy("activity.2c17a58d3dfd", "正在完成 Discord 登录"), () => sdk.commands.authenticate({ access_token: login.accessToken }));
  notice('');
  return createRoomSession({ login, notice,
    close: () => sdk.close(RPCCloseCodes.CLOSE_NORMAL, 'Yachiyo room ended'),
  });
}
