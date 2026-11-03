<script setup lang="ts">
import {
  state,
  t,
  run,
  dot,
  simple,
  refreshCache,
  clearCache,
  exportDiagnostics,
} from "../state";
</script>
<template>
  <section class="page" id="page-storage">
    <article class="card">
      <div class="section-heading">
        <div>
          <h3>{{ t("音频缓存") }}</h3>
          <p>{{ t("播放时按需下载。歌曲链接和歌单会话不会被写进分发包。") }}</p>
        </div>
        <button
          id="refresh-cache"
          class="subtle"
          @click="() => run(refreshCache)"
          :disabled="state.busy || !state.ready"
        >
          {{ t("刷新") }}
        </button>
      </div>
      <div class="cache-stat">
        <strong id="cache-size"
          >{{ (state.cache.bytes / 1024 ** 2).toFixed(1) }} MB</strong
        ><span id="cache-count">{{
          t("{count} 首已缓存 · 上限 {limit} MB", {
            count: state.cache.count,
            limit: state.cache.limitMb,
          })
        }}</span>
      </div>
      <progress
        id="cache-progress"
        max="100"
        :value="(state.cache.bytes / 1024 ** 2 / state.cache.limitMb) * 100"
      ></progress>
      <div class="save-row">
        <span>{{ t("停止 Bot 后可以清理缓存，之后播放会重新下载。") }}</span
        ><button
          id="clear-cache"
          class="secondary"
          @click="clearCache"
          :disabled="state.busy || state.status.wanted"
        >
          {{ t("清理音频缓存") }}
        </button>
      </div>
    </article>
    <article class="card">
      <div class="section-heading">
        <div>
          <h3>{{ t("诊断与数据") }}</h3>
          <p>
            {{
              t(
                "诊断报告只包含连接状态、版本和配置是否齐全，不包含 Token、Cookie 或私钥。",
              )
            }}
          </p>
        </div>
      </div>
      <div class="actions">
        <button
          id="export-diagnostics"
          class="primary"
          @click="exportDiagnostics"
          :disabled="state.busy || !state.ready"
        >
          {{ t("导出脱敏诊断") }}</button
        ><button
          id="open-data"
          class="secondary"
          @click="simple('openData')"
          :disabled="state.busy || !state.ready"
        >
          {{ t("打开本机数据文件夹 ↗") }}
        </button>
      </div>
      <p class="hint">
        {{
          t("个人设置保存在安装目录下的 user-data 文件夹，更新和卸载会保留。")
        }}
      </p>
    </article>
    <article class="card">
      <h3>{{ t("托盘状态说明") }}</h3>
      <div class="legend">
        <span
          ><i class="dot online"></i>
          {{ t("绿色：Bot 与所需公网服务已连接") }}</span
        ><span
          ><i class="dot warning"></i>
          {{ t("黄色：Bot 在线，点歌台公网访问异常") }}</span
        ><span><i class="dot"></i> {{ t("灰色：Bot 未连接或已停止") }}</span>
      </div>
    </article>
  </section>
</template>
