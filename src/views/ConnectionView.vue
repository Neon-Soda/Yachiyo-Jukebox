<script setup lang="ts">
import {
  state,
  t,
  labels,
  hostname,
  caddy,
  savedText,
  saveSettings,
  saveSsh,
  importSecret,
  removeSecret,
  importProject,
  simple,
} from "../state";
</script>
<template>
  <section class="page" id="page-connection">
    <div class="page-intro">
      <p>
        {{
          t("每份应用连接自己的 Bot。凭据保存在当前 Windows 账户的加密存储中。")
        }}
      </p>
      <button
        id="import-project"
        class="secondary"
        @click="importProject"
        :disabled="state.busy || !state.ready"
      >
        {{ t("从旧项目导入") }}
      </button>
    </div>
    <form id="connection-form" @submit.prevent="saveSettings">
      <article class="card">
        <div class="section-heading">
          <div>
            <h3>{{ t("Discord 账户") }}</h3>
            <p>{{ t("在 Discord Developer Portal 创建或选择你的应用。") }}</p>
          </div>
          <div class="actions">
            <button
              type="button"
              id="open-invite"
              class="secondary"
              @click="simple('openInvite')"
              :disabled="state.busy || !state.ready"
            >
              {{ t("邀请 Bot") }}</button
            ><button
              type="button"
              id="open-portal"
              class="subtle"
              @click="simple('openPortal')"
              :disabled="state.busy || !state.ready"
            >
              {{ t("开发者后台 ↗") }}
            </button>
          </div>
        </div>
        <div class="form-grid">
          <label
            >Application ID<input
              id="clientId"
              autocomplete="off"
              inputmode="numeric"
              v-model="state.config.clientId"
              :placeholder="t('Discord 应用 ID')" /></label
          ><label
            >{{ t("服务器 ID")
            }}<input
              id="guildId"
              autocomplete="off"
              inputmode="numeric"
              v-model="state.config.guildId"
              :placeholder="t('Discord 服务器 ID')" /></label
          ><label
            >Bot Token
            <span id="token-saved" class="saved-state">{{
              savedText("botToken")
            }}</span
            ><input
              id="botToken"
              type="password"
              autocomplete="new-password"
              v-model="state.secrets.botToken"
              :placeholder="t('填入新值；留空保留已保存的凭据')" /></label
          ><label
            >Client Secret
            <span id="secret-saved" class="saved-state">{{
              savedText("clientSecret")
            }}</span
            ><input
              id="clientSecret"
              type="password"
              autocomplete="new-password"
              v-model="state.secrets.clientSecret"
              :placeholder="t('点歌台 OAuth 登录需要')"
          /></label>
        </div>
        <label class="switch-row"
          ><input
            id="activityEnabled"
            type="checkbox"
            v-model="state.config.activityEnabled"
          /><span
            ><strong>{{ t("启用 Discord Activity 点歌台") }}</strong
            ><small>{{
              t("关闭后仍可通过 /play 等聊天指令使用 Bot。")
            }}</small></span
          ></label
        >
      </article>
      <article class="card">
        <div class="section-heading">
          <div>
            <h3>{{ t("公网连接") }}</h3>
            <p>{{ t("选择这台电脑的网页服务如何被 Discord 访问。") }}</p>
          </div>
          <span id="tunnel-status" class="small-label">{{
            t(labels[state.status.tunnel] || state.status.tunnel)
          }}</span>
        </div>
        <div class="connection-choices">
          <label
            ><input
              type="radio"
              name="connectionMode"
              value="direct"
              v-model="state.config.connectionMode"
            /><strong>{{ t("公网直连") }}</strong
            ><small
              >{{ t("有公网 IP / 自有 HTTPS 服务") }}<br />{{
                t("不启动 frp 或 SSH 隧道")
              }}</small
            ></label
          ><label
            ><input
              type="radio"
              name="connectionMode"
              value="ssh"
              v-model="state.config.connectionMode"
            /><strong>{{ t("SSH 反向隧道") }}</strong
            ><small
              >{{ t("通过 VPS 转发到本机") }}<br />{{
                t("自动连接、断线重试")
              }}</small
            ></label
          ><label
            ><input
              type="radio"
              name="connectionMode"
              value="external"
              v-model="state.config.connectionMode"
            /><strong>{{ t("已有隧道 / 代理") }}</strong
            ><small
              >{{ t("自行运行 frp 或其他代理") }}<br />{{
                t("应用检查最终 HTTPS 地址")
              }}</small
            ></label
          >
        </div>
        <div class="form-grid">
          <label class="wide"
            >{{ t("公网 HTTPS 地址")
            }}<input
              id="publicOrigin"
              placeholder="https://music.example.com"
              type="url"
              v-model="state.config.publicOrigin"
            /><small>{{
              t(
                "填写网站根地址。有公网 IP 也需要有效 HTTPS，可使用已有反向代理或 Caddy。",
              )
            }}</small></label
          ><label
            >{{ t("本地端口")
            }}<input
              id="port"
              type="number"
              min="1024"
              max="65535"
              v-model.number="state.config.port" /></label
          ><label
            >{{ t("本地监听")
            }}<select id="bind" v-model="state.config.bind">
              <option value="127.0.0.1">
                {{ t("仅本机 · 127.0.0.1（推荐）") }}
              </option>
              <option value="0.0.0.0">
                {{ t("所有网卡 · 0.0.0.0") }}
              </option></select
            ><small>{{
              t("只有反向代理在其他设备上时才需要所有网卡。")
            }}</small></label
          >
        </div>
        <div id="ssh-settings" v-if="state.config.connectionMode === 'ssh'">
          <div class="separator"></div>
          <div class="form-grid">
            <label
              >{{ t("VPS 主机 / IPv4")
              }}<input
                id="sshHost"
                placeholder="vps.example.com"
                v-model="state.config.sshHost" /></label
            ><label
              >{{ t("SSH 用户名")
              }}<input
                id="sshUser"
                v-model="state.config.sshUser"
                :placeholder="t('专用隧道用户')" /></label
            ><label
              >{{ t("SSH 端口")
              }}<input
                id="sshPort"
                type="number"
                min="1"
                max="65535"
                v-model.number="state.config.sshPort" /></label
            ><label
              >{{ t("VPS 回环转发端口")
              }}<input
                id="remotePort"
                type="number"
                min="1024"
                max="65535"
                v-model.number="state.config.remotePort"
            /></label>
          </div>
          <div class="ssh-credentials">
            <div class="ssh-entry">
              <div class="ssh-entry-heading">
                <label for="sshKeyText">{{ t("SSH 私钥") }}</label
                ><span data-secret-state="sshKey">{{
                  savedText("sshKey")
                }}</span>
              </div>
              <textarea
                id="sshKeyText"
                rows="6"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                v-model="state.secrets.sshKey"
                :class="{ 'private-input': !state.showKey }"
                :placeholder="
                  t('粘贴完整私钥（含 BEGIN / END 行）；留空保留已保存的私钥。')
                "
                :aria-label="t('SSH 私钥输入')"
              ></textarea>
              <div class="actions">
                <button
                  type="button"
                  id="toggle-ssh-key"
                  class="subtle"
                  :aria-pressed="state.showKey"
                  @click="state.showKey = !state.showKey"
                  :disabled="state.busy || !state.ready"
                >
                  {{ t(state.showKey ? "隐藏输入" : "显示输入") }}</button
                ><button
                  type="button"
                  data-import-secret="sshKey"
                  class="secondary"
                  @click="importSecret('sshKey')"
                  :disabled="state.busy || !state.ready"
                >
                  {{ t("从文件导入") }}</button
                ><button
                  type="button"
                  data-remove-secret="sshKey"
                  class="subtle"
                  @click="removeSecret('sshKey')"
                  :disabled="state.busy || !state.ready"
                >
                  {{ t("移除已保存") }}
                </button>
              </div>
            </div>
            <div class="ssh-entry">
              <div class="ssh-entry-heading">
                <label for="knownHostsText">{{
                  t("known_hosts（服务器主机密钥）")
                }}</label
                ><span data-secret-state="knownHosts">{{
                  savedText("knownHosts")
                }}</span>
              </div>
              <textarea
                id="knownHostsText"
                rows="6"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                v-model="state.secrets.knownHosts"
                :placeholder="
                  t(
                    '粘贴已核对的服务器主机密钥记录；支持多行，留空保留现有内容。',
                  )
                "
                :aria-label="t('known_hosts 输入')"
              ></textarea>
              <div class="actions">
                <button
                  type="button"
                  data-import-secret="knownHosts"
                  class="secondary"
                  @click="importSecret('knownHosts')"
                  :disabled="state.busy || !state.ready"
                >
                  {{ t("从文件导入") }}</button
                ><button
                  type="button"
                  data-remove-secret="knownHosts"
                  class="subtle"
                  @click="removeSecret('knownHosts')"
                  :disabled="state.busy || !state.ready"
                >
                  {{ t("移除已保存") }}
                </button>
              </div>
            </div>
          </div>
          <div class="save-row">
            <span>{{
              t("输入内容仅在本机加密保存，保存后清空输入框。重启 Bot 后生效。")
            }}</span
            ><button
              type="button"
              id="save-ssh-credentials"
              class="primary"
              @click="saveSsh"
              :disabled="state.busy || !state.ready"
            >
              {{ t("保存 SSH 凭据") }}
            </button>
          </div>
          <p class="hint">
            {{
              t(
                "需要已配置好的密钥登录与 VPS 反向代理。应用不会保存或自动输入 VPS 密码，也不会修改服务器上的 frp。",
              )
            }}
          </p>
        </div>
        <details class="guide">
          <summary>
            {{ t("Discord URL Mapping 和 HTTPS 应该怎样填写？") }}
          </summary>
          <p>
            {{ t("在开发者后台启用 Activities。URL Mapping 的 Prefix 填") }}
            <code>/</code
            >{{
              t(
                "；Target 填下面的主机名。OAuth2 Redirect URI 可以使用下面的占位地址，Activity SDK 会处理实际回跳。",
              )
            }}
          </p>
          <label
            >URL Mapping · Target<input
              id="mapping-target"
              :readonly="true"
              :value="hostname" /></label
          ><label
            >OAuth2 Redirect URI<input
              id="redirect-uri"
              :readonly="true"
              value="https://127.0.0.1"
          /></label>
          <p>
            {{
              t(
                "如果在公网服务器或有公网 IP 的本机运行 Caddy，可使用以下配置（在对应主机上设置，应用不会自动安装 Caddy）：",
              )
            }}
          </p>
          <pre id="caddy-example">{{ caddy }}</pre>
          <p>
            {{
              t(
                "同时确保防火墙和路由转发允许 80 / 443 端口；本机服务仍由上面的本地端口提供。",
              )
            }}
          </p>
        </details>
      </article>
      <div class="save-row">
        <span>{{ t("保存后，重启 Bot 使连接设置生效。") }}</span
        ><button
          type="submit"
          class="primary"
          :disabled="state.busy || !state.ready"
        >
          {{ t("保存连接设置") }}
        </button>
      </div>
    </form>
  </section>
</template>
