<script setup lang="ts">
import { state, t, service, go, labels, dot } from "../state";
</script>
<template>
  <section class="page" id="page-overview">
    <div
      v-if="state.ready && !state.tools.ready"
      class="tool-notice"
      role="status"
    >
      <span>{{ t("播放工具尚未就绪，先完成工具库配置。") }}</span
      ><button class="secondary" @click="go('tools')">
        {{ t("配置工具库") }} ↗
      </button>
    </div>
    <div class="hero">
      <div>
        <span class="eyebrow">YOUR MUSIC, ALWAYS WITH YOU</span>
        <h2 id="hero-title">{{ t("让音乐，随时待命。") }}</h2>
        <p id="hero-description">
          {{ t("从这里管理 Bot、点歌台和连接。每一个状态，都一目了然。") }}
        </p>
        <div class="actions">
          <button
            id="start"
            class="primary"
            @click="service('start')"
            :disabled="state.busy || !state.ready || state.status.wanted"
          >
            {{ t("启动 Bot") }} <span>▷</span></button
          ><button
            id="restart"
            class="secondary"
            @click="service('restart')"
            :disabled="state.busy || !state.status.wanted"
          >
            {{ t("重新启动") }}</button
          ><button
            id="stop"
            class="subtle"
            @click="service('stop')"
            :disabled="state.busy || !state.status.wanted"
          >
            {{ t("停止服务") }}
          </button>
        </div>
      </div>
      <div class="hero-orbit" aria-hidden="true">
        <div class="orbit-ring"></div>
        <div class="hero-moon">☾</div>
        <span>YACHIYO / 01</span>
      </div>
    </div>
    <div class="status-grid">
      <article class="card status-card">
        <div class="card-label">
          DISCORD BOT
          <i class="dot" id="bot-dot" :class="dot(state.status.bot)"></i>
        </div>
        <h3 id="bot-state">
          {{ t(labels[state.status.bot] || state.status.bot) }}
        </h3>
        <p id="bot-detail">
          {{
            state.status.bot === "online"
              ? t("{rooms} 个房间 · 延迟 {ping} ms", {
                  rooms: state.status.rooms,
                  ping: state.status.ping?.toFixed(0) ?? "—",
                })
              : t(state.status.reason)
          }}
        </p>
      </article>
      <article class="card status-card">
        <div class="card-label">
          {{ t("本地点歌台") }}
          <i class="dot" id="local-dot" :class="dot(state.status.local)"></i>
        </div>
        <h3 id="local-state">
          {{ t(labels[state.status.local] || state.status.local) }}
        </h3>
        <p id="local-detail">
          {{
            state.config.activityEnabled
              ? "127.0.0.1:" + state.config.port
              : t("未启用")
          }}
        </p>
      </article>
      <article class="card status-card">
        <div class="card-label">
          {{ t("公网 HTTPS") }}
          <i class="dot" id="public-dot" :class="dot(state.status.public)"></i>
        </div>
        <h3 id="public-state">
          {{ t(labels[state.status.public] || state.status.public) }}
        </h3>
        <p id="public-detail">
          {{ t(state.status.publicReason || "Discord 访问入口") }}
        </p>
      </article>
    </div>
    <div class="overview-bottom">
      <article class="card setup-card">
        <div class="section-heading">
          <h3>{{ t("开始之前") }}</h3>
          <span class="small-label">QUICK SETUP</span>
        </div>
        <ol class="setup-list">
          <li>
            <b>01</b>
            <div>
              <strong>{{ t("连接你的 Discord 应用") }}</strong>
              <p>{{ t("填写 Application ID、Bot Token 和服务器 ID。") }}</p>
            </div>
            <button
              data-go="connection"
              class="icon-link"
              @click="go('connection')"
              :aria-label="t('打开连接设置')"
            >
              ↗
            </button>
          </li>
          <li>
            <b>02</b>
            <div>
              <strong>{{ t("选择公网连接方式") }}</strong>
              <p>{{ t("公网直连、SSH 隧道，或已有的 frp 服务。") }}</p>
            </div>
            <button
              data-go="connection"
              class="icon-link"
              @click="go('connection')"
              :aria-label="t('打开公网设置')"
            >
              ↗
            </button>
          </li>
          <li>
            <b>03</b>
            <div>
              <strong>{{ t("让点歌台成为你的风格") }}</strong>
              <p>{{ t("颜色、文案和图片，在预览里慢慢调整。") }}</p>
            </div>
            <button
              data-go="theme"
              class="icon-link"
              @click="go('theme')"
              :aria-label="t('打开主题编辑')"
            >
              ↗
            </button>
          </li>
        </ol>
      </article>
      <article class="card">
        <div class="section-heading">
          <h3>{{ t("最近运行动态") }}</h3>
          <span class="small-label">LIVE</span>
        </div>
        <ol id="events" class="event-list">
          <li v-if="!state.status.events.length">
            {{ t("还没有运行记录。") }}
          </li>
          <li
            v-for="(item, index) in state.status.events.slice(0, 7)"
            :key="item.at + ':' + index"
          >
            <time>{{
              new Date(item.at).toLocaleTimeString(state.preferences.language, {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}</time
            ><span>{{ t(item.message) }}</span>
          </li>
        </ol>
      </article>
    </div>
  </section>
</template>
