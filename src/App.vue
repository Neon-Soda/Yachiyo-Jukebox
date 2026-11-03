<script setup lang="ts">
import {
  state,
  pages,
  t,
  toast,
  service,
  go,
  overall,
  statusText,
  dot,
  savePreferences,
  initialize,
} from "./state";
import OverviewView from "./views/OverviewView.vue";
import ConnectionView from "./views/ConnectionView.vue";
import PlaybackView from "./views/PlaybackView.vue";
import AppearanceView from "./views/AppearanceView.vue";
import ThemeView from "./views/ThemeView.vue";
import CopyView from "./views/CopyView.vue";
import StorageView from "./views/StorageView.vue";
import ToolsView from "./views/ToolsView.vue";
import ToolsPrompt from "./views/ToolsPrompt.vue";
import InfoView from "./views/InfoView.vue";

void initialize();
</script>
<template>
  <aside class="sidebar">
    <div class="identity">
      <span class="moon">☾</span>
      <div>YACHIYO<small>DESKTOP STUDIO</small></div>
    </div>
    <div
      id="sidebar-status"
      class="workspace-tag"
      role="status"
      aria-live="polite"
      :class="overall"
    >
      <i class="dot" :class="overall"></i>{{ t(statusText) }}
    </div>
    <nav :aria-label="t('主导航')">
      <button
        data-page="overview"
        @click="go('overview')"
        class="nav"
        :class="{ active: state.page === 'overview' }"
      >
        <span>◉</span>{{ t("运行概览") }}
      </button>
      <button
        data-page="connection"
        @click="go('connection')"
        class="nav"
        :class="{ active: state.page === 'connection' }"
      >
        <span>⌁</span>{{ t("连接与账户") }}
      </button>
      <button
        data-page="playback"
        @click="go('playback')"
        class="nav"
        :class="{ active: state.page === 'playback' }"
      >
        <span>▷</span>{{ t("播放与启动") }}
      </button>
      <div class="nav-section">PERSONALIZE</div>
      <button
        data-page="appearance"
        @click="go('appearance')"
        class="nav"
        :class="{ active: state.page === 'appearance' }"
      >
        <span>◒</span>{{ t("应用外观") }}
      </button>
      <button
        data-page="theme"
        @click="go('theme')"
        class="nav"
        :class="{ active: state.page === 'theme' }"
      >
        <span>◐</span>{{ t("点歌台主题") }}
      </button>
      <button
        data-page="copy"
        @click="go('copy')"
        class="nav"
        :class="{ active: state.page === 'copy' }"
      >
        <span>≡</span>{{ t("提示文案") }}
      </button>
      <div class="nav-section">MAINTENANCE</div>
      <button
        data-page="tools"
        @click="go('tools')"
        class="nav"
        :class="{ active: state.page === 'tools' }"
      >
        <span>◇</span>{{ t("工具库")
        }}<i
          v-if="state.ready && !state.tools.ready"
          class="dot warning tool-nav-dot"
        ></i>
      </button>
      <button
        data-page="storage"
        @click="go('storage')"
        class="nav"
        :class="{ active: state.page === 'storage' }"
      >
        <span>▤</span>{{ t("缓存与诊断") }}
      </button>
      <button
        data-page="info"
        @click="go('info')"
        class="nav"
        :class="{ active: state.page === 'info' }"
      >
        <span>ⓘ</span>{{ t("关于") }}
      </button>
    </nav>
    <div class="sidebar-bottom">
      <p>{{ t("关闭窗口后继续在托盘运行") }}</p>
      <small id="version">VERSION {{ state.version }} · WINDOWS</small>
    </div>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <div>
        <div class="breadcrumb">
          WORKSPACE <span>/</span>
          <span id="page-crumb">{{ pages[state.page][1] }}</span>
        </div>
        <h1 id="page-title">{{ t(pages[state.page][0]) }}</h1>
      </div>
      <div class="top-right">
        <span id="pending" class="pending" v-if="state.pending">{{
          t("设置已保存 · 待重启生效")
        }}</span
        ><select
          id="language"
          class="language-select"
          data-no-i18n=""
          :value="state.preferences.language"
          @change="
            savePreferences({
              language: ($event.target as HTMLSelectElement).value as
                'zh-CN' | 'en',
            })
          "
          :disabled="!state.ready || state.preferenceSaving"
          :aria-label="t('界面语言')"
        >
          <option value="zh-CN">{{ t("中文") }}</option>
          <option value="en">English</option></select
        ><button
          id="check-top"
          class="secondary"
          @click="service('check')"
          :disabled="state.busy || !state.ready"
        >
          {{ t("检查连接") }} <span>↗</span></button
        ><span id="global-status" class="status-pill" :class="overall">{{
          t(statusText)
        }}</span>
      </div>
    </header>
    <main>
      <OverviewView v-show="state.page === 'overview'"></OverviewView>

      <ConnectionView v-show="state.page === 'connection'"></ConnectionView>

      <PlaybackView v-show="state.page === 'playback'"></PlaybackView>

      <AppearanceView v-show="state.page === 'appearance'"></AppearanceView>

      <ThemeView v-show="state.page === 'theme'"></ThemeView>

      <CopyView v-show="state.page === 'copy'"></CopyView>

      <StorageView v-show="state.page === 'storage'"></StorageView>
      <ToolsView v-show="state.page === 'tools'"></ToolsView>
      <InfoView v-show="state.page === 'info'"></InfoView>
    </main>
    <footer class="workspace-footer">
      <span>YACHIYO DESKTOP</span
      ><span>{{ t("把旋律留给频道，把管理留在这里。") }}</span>
    </footer>
  </div>
  <div
    id="toast"
    class="toast"
    role="status"
    aria-live="polite"
    v-if="!!state.toast"
    :class="{ error: state.toastError }"
  >
    {{ t(state.toast) }}
  </div>

  <div v-if="state.fatal" class="fatal-banner" role="alert">
    {{ state.fatal }}
  </div>
  <ToolsPrompt />
</template>
