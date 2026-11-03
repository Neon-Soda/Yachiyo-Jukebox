<script setup lang="ts">
import {
  state,
  t,
  go,
  applyTheme,
  groupNames,
  copyEntries,
  copyPages,
  visibleCopy,
  editCopy,
  copyVariables,
} from "../state";
</script>
<template>
  <section class="page" id="page-copy">
    <div class="page-intro">
      <p>
        {{
          t(
            "修改会加入当前主题。保留 {title} 等变量；用户昵称和歌曲名仍来自实际内容。",
          )
        }}
      </p>
      <div class="actions">
        <button data-go="theme" class="secondary" @click="go('theme')">
          {{ t("查看主题预览") }}</button
        ><button
          id="apply-copy"
          class="primary"
          @click="applyTheme"
          :disabled="state.busy || !state.ready"
        >
          {{ t("应用文案") }}
        </button>
      </div>
    </div>
    <article class="card copy-toolbar">
      <input
        id="copy-search"
        type="search"
        v-model="state.copySearch"
        :placeholder="t('搜索文案，例如：加入歌单、正在连接、暂停')"
      /><select id="copy-group" v-model="state.copyGroup">
        <option value="all">{{ t("全部文案") }}</option>
        <option value="page">{{ t("页面固定文字") }}</option>
        <option value="activity">{{ t("交互与状态") }}</option>
        <option value="room">{{ t("房间动态与校验") }}</option>
        <option value="bot">{{ t("Bot 回复与指令") }}</option></select
      ><span id="copy-count" class="hint">{{
        t("{count} 条文案", { count: copyEntries.length })
      }}</span>
    </article>
    <div id="copy-list" class="copy-list">
      <article class="copy-item" v-for="[key, item] in visibleCopy" :key="key">
        <div class="copy-item-head">
          <span>{{ t(groupNames[item.group]) }}</span
          ><button class="subtle" @click="editCopy(key, item.default, true)">
            {{ t("恢复默认") }}
          </button>
        </div>
        <div class="copy-original">{{ item.default }}</div>
        <textarea
          :data-copy-key="key"
          :aria-label="t('自定义：{text}', { text: item.default.slice(0, 60) })"
          :maxlength="item.max"
          :value="state.theme.texts[key] ?? item.default"
          @input="editCopy(key, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <div class="variables">{{ copyVariables(item.default, item.max) }}</div>
      </article>
    </div>
    <div class="pagination">
      <button
        id="copy-prev"
        class="secondary"
        @click="state.copyPage--"
        :disabled="state.copyPage === 0"
      >
        {{ t("上一页") }}</button
      ><span id="copy-page">{{ state.copyPage + 1 }} / {{ copyPages }}</span
      ><button
        id="copy-next"
        class="secondary"
        @click="state.copyPage++"
        :disabled="state.copyPage >= copyPages - 1"
      >
        {{ t("下一页") }}
      </button>
    </div>
  </section>
</template>
