<script setup lang="ts">
import {
  state,
  t,
  savedText,
  saveSettings,
  importSecret,
  removeSecret,
} from "../state";
</script>
<template>
  <section class="page" id="page-playback">
    <form id="playback-form" @submit.prevent="saveSettings">
      <article class="card">
        <div class="section-heading">
          <div>
            <h3>{{ t("启动与后台运行") }}</h3>
            <p>
              {{
                t(
                  "窗口关闭后保留托盘；在托盘菜单里退出会停止 Bot 和应用管理的隧道。",
                )
              }}
            </p>
          </div>
        </div>
        <label class="switch-row"
          ><input
            type="checkbox"
            id="autoStart"
            v-model="state.config.autoStart"
          /><span
            ><strong>{{ t("打开应用时自动启动 Bot") }}</strong
            ><small>{{ t("需要先完成 Discord 配置。") }}</small></span
          ></label
        ><label class="switch-row"
          ><input
            type="checkbox"
            id="launchAtLogin"
            v-model="state.config.launchAtLogin"
          /><span
            ><strong>{{ t("登录 Windows 后自动启动到托盘") }}</strong
            ><small>{{ t("不需要保持 PowerShell 窗口打开。") }}</small></span
          ></label
        >
      </article>
      <article class="card">
        <div class="section-heading">
          <div>
            <h3>{{ t("播放设置") }}</h3>
            <p>{{ t("同一语音频道共享控制，频道之间独立保存歌单。") }}</p>
          </div>
        </div>
        <div class="form-grid">
          <label
            >{{ t("缓存容量（MB）")
            }}<input
              id="cacheMb"
              type="number"
              min="256"
              max="10240"
              v-model.number="state.config.cacheMb"
            /><small>{{
              t("达到上限后自动淘汰最久未用的音频；正在播放的缓存会保留。")
            }}</small></label
          ><label
            >{{ t("/play 闲置退出（分钟）")
            }}<input
              id="idleMinutes"
              type="number"
              min="0"
              max="1440"
              v-model.number="state.config.idleMinutes"
            /><small>{{
              t(
                "0 关闭。Activity 期间不会闲置退出；语音频道无人 60 秒仍会结束。",
              )
            }}</small></label
          >
        </div>
      </article>
      <div class="save-row">
        <span>{{ t("播放设置在下次启动或重启时生效。") }}</span
        ><button
          type="submit"
          class="primary"
          :disabled="state.busy || !state.ready"
        >
          {{ t("保存播放设置") }}
        </button>
      </div>
    </form>
    <article class="card">
      <div class="section-heading">
        <div>
          <h3>{{ t("音乐平台登录") }}</h3>
          <p>
            {{
              t(
                "按需导入你自己账号的 Netscape Cookie 文件。网页浏览器登录不会自动同步。",
              )
            }}
          </p>
        </div>
      </div>
      <div class="secret-files cookies">
        <div>
          <strong>YouTube</strong
          ><span data-secret-state="youtubeCookies">{{
            savedText("youtubeCookies")
          }}</span
          ><button
            data-import-secret="youtubeCookies"
            class="secondary"
            @click="importSecret('youtubeCookies')"
            :disabled="state.busy || !state.ready"
          >
            {{ t("导入 Cookie") }}</button
          ><button
            data-remove-secret="youtubeCookies"
            class="subtle"
            @click="removeSecret('youtubeCookies')"
            :disabled="state.busy || !state.ready"
          >
            {{ t("移除") }}
          </button>
        </div>
        <div>
          <strong>Bilibili</strong
          ><span data-secret-state="bilibiliCookies">{{
            savedText("bilibiliCookies")
          }}</span
          ><button
            data-import-secret="bilibiliCookies"
            class="secondary"
            @click="importSecret('bilibiliCookies')"
            :disabled="state.busy || !state.ready"
          >
            {{ t("导入 Cookie") }}</button
          ><button
            data-remove-secret="bilibiliCookies"
            class="subtle"
            @click="removeSecret('bilibiliCookies')"
            :disabled="state.busy || !state.ready"
          >
            {{ t("移除") }}
          </button>
        </div>
        <div>
          <strong>{{ t("网易云音乐") }}</strong
          ><span data-secret-state="neteaseCookies">{{
            savedText("neteaseCookies")
          }}</span
          ><button
            data-import-secret="neteaseCookies"
            class="secondary"
            @click="importSecret('neteaseCookies')"
            :disabled="state.busy || !state.ready"
          >
            {{ t("导入 Cookie") }}</button
          ><button
            data-remove-secret="neteaseCookies"
            class="subtle"
            @click="removeSecret('neteaseCookies')"
            :disabled="state.busy || !state.ready"
          >
            {{ t("移除") }}
          </button>
        </div>
      </div>
    </article>
  </section>
</template>
