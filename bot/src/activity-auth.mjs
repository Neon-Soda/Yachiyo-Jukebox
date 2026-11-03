import { copy as uiCopy } from './customization.mjs';
import { UserFacingError } from './messages.mjs';

function authFailure(stage) {
  const error = new UserFacingError('activityRequired');
  error.message = uiCopy("room.acff2e7228d6", "点歌台登录校验未通过（{stage}），请将此提示告知维护者。", { stage: stage });
  console.warn(`[Activity auth] ${stage}`);
  return error;
}

export function validateActivityInstance(data, { applicationId, guildId, channelId, instanceId, userId }) {
  if (!data) throw authFailure('instance-not-found');
  if (data.application_id !== applicationId) throw authFailure('instance-application');
  if (data.instance_id !== instanceId) throw authFailure('instance-id');
  if (data.location?.guild_id !== guildId) throw authFailure('instance-guild');
  if (data.location?.channel_id !== channelId) throw authFailure('instance-channel');
  if (!data.users?.includes(userId)) throw authFailure('instance-participant');
  return data;
}

export function createDiscordAuth({ applicationId, clientSecret, botToken, guildId, channelForUser, roomFor, fetchImpl = fetch }) {
  const instances = new Map();
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`https://discord.com/api/v10/${path}`, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw authFailure(`${path === 'oauth2/token' ? 'oauth-exchange' : 'oauth-user'}-${response.status}`);
    return response.json();
  };
  async function getInstance(instanceId, fresh = false) {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(instanceId)) throw new UserFacingError('activityRequired');
    const cached = instances.get(instanceId);
    if (!fresh && cached?.until > Date.now()) return cached.data;
    const response = await fetchImpl(`https://discord.com/api/v10/applications/${applicationId}/activity-instances/${encodeURIComponent(instanceId)}`, { headers: { Authorization: `Bot ${botToken}` }, signal: AbortSignal.timeout(15000) });
    if (response.status === 404) { instances.delete(instanceId); return null; }
    if (!response.ok) throw authFailure(`instance-api-${response.status}`);
    const data = await response.json();
    instances.set(instanceId, { until: Date.now() + 10000, data });
    if (instances.size > 100) for (const [key, value] of instances) if (value.until < Date.now()) instances.delete(key);
    return data;
  }
  async function authorize(session) {
    const channel = await channelForUser(session.userId);
    if (channel.id !== session.room.channelId) throw new UserFacingError('differentVoice');
    validateActivityInstance(await getInstance(session.instanceId), { applicationId, guildId, channelId: channel.id, instanceId: session.instanceId, userId: session.userId });
  }
  return {
    getInstance, authorize,
    async authenticate(body) {
      if (body.guildId !== guildId) throw authFailure('request-guild');
      if (typeof body.code !== 'string' || body.code.length > 512 || typeof body.instanceId !== 'string' || !/^\d{17,20}$/.test(body.channelId ?? '')) throw authFailure('request-format');
      const token = await request('oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: applicationId, client_secret: clientSecret, grant_type: 'authorization_code', code: body.code }) });
      if (!token.access_token) throw new UserFacingError('activityRequired');
      const user = await request('users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const channel = await channelForUser(user.id);
      if (channel.id !== body.channelId) throw new UserFacingError('differentVoice');
      const instance = validateActivityInstance(await getInstance(body.instanceId, true), { applicationId, guildId, channelId: channel.id, instanceId: body.instanceId, userId: user.id });
      const room = roomFor(channel, body.instanceId);
      room.participants = instance.users.length;
      return { userId: user.id, displayName: user.global_name || user.username || uiCopy("room.c87feea9ea18", "一位伙伴"), instanceId: body.instanceId, room, accessToken: token.access_token, expiresIn: token.expires_in };
    },
  };
}
