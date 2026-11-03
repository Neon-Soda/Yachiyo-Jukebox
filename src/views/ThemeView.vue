<script setup lang="ts">
import {
  state,
  t,
  go,
  dot,
  selectTheme,
  resetTheme,
  saveTheme,
  applyTheme,
  deleteTheme,
  importTheme,
  exportTheme,
  pickImage,
  refreshPreview,
  primaryEntries,
  detailEntries,
  preset,
} from "../state";
</script>
<template>
  <section class="page theme-page" id="page-theme">
    <div class="theme-toolbar">
      <div>
        <input
          id="theme-name"
          maxlength="80"
          v-model="state.theme.name"
          :aria-label="t('主题名称')"
        /><span id="theme-state" class="hint">{{ t(state.themeState) }}</span>
      </div>
      <div class="actions">
        <button
          id="import-theme"
          class="subtle"
          @click="importTheme"
          :disabled="state.busy || !state.ready"
        >
          {{ t("导入") }}</button
        ><button
          id="export-theme"
          class="secondary"
          @click="exportTheme"
          :disabled="state.busy || !state.ready"
        >
          {{ t("导出主题") }}</button
        ><button
          id="save-theme"
          class="secondary"
          @click="saveTheme"
          :disabled="state.busy || !state.ready"
        >
          {{ t("保存主题") }}</button
        ><button
          id="apply-theme"
          class="primary"
          @click="applyTheme"
          :disabled="state.busy || !state.ready"
        >
          {{ t("应用到点歌台 ↗") }}
        </button>
      </div>
    </div>
    <div class="theme-workspace">
      <div class="theme-editor">
        <article class="card">
          <div class="section-heading">
            <h3>{{ t("主题库") }}</h3>
            <button
              id="new-theme"
              class="subtle"
              @click="resetTheme"
              :disabled="state.busy || !state.ready"
            >
              {{ t("恢复默认") }}
            </button>
          </div>
          <div class="input-inline">
            <select
              id="theme-library"
              :value="state.themeId"
              @change="selectTheme(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t("选择已保存的主题") }}</option>
              <option
                v-for="item in state.library"
                :value="item.id"
                :key="item.id"
              >
                {{ item.theme.name }}
              </option></select
            ><button
              id="delete-theme"
              class="subtle"
              @click="deleteTheme"
              :disabled="state.busy || !state.themeId"
            >
              {{ t("删除") }}
            </button>
          </div>
          <div class="preset-row">
            <button
              data-preset="moon"
              @click="preset('moon')"
              :disabled="state.busy || !state.ready"
            >
              {{ t("月夜") }}</button
            ><button
              data-preset="forest"
              @click="preset('forest')"
              :disabled="state.busy || !state.ready"
            >
              {{ t("森绿") }}</button
            ><button
              data-preset="rose"
              @click="preset('rose')"
              :disabled="state.busy || !state.ready"
            >
              {{ t("暮色") }}
            </button>
          </div>
        </article>
        <article class="card">
          <div class="section-heading">
            <h3>{{ t("配色") }}</h3>
            <span class="small-label">PALETTE</span>
          </div>
          <div id="primary-colors" class="color-grid">
            <label
              v-for="[key, item] in primaryEntries"
              :key="key"
              class="color-field"
              ><input
                type="color"
                :aria-label="t(item.label)"
                :value="state.theme.colors[key] || item.default"
                @input="
                  state.theme.colors[key] = (
                    $event.target as HTMLInputElement
                  ).value
                "
              /><span
                >{{ t(item.label)
                }}<code>{{
                  (state.theme.colors[key] || item.default).toUpperCase()
                }}</code></span
              ></label
            >
          </div>
          <details>
            <summary>{{ t("更多细节颜色") }}</summary>
            <div id="detail-colors" class="color-grid detail-colors">
              <label
                v-for="[key, item] in detailEntries"
                :key="key"
                class="color-field"
                ><input
                  type="color"
                  :aria-label="t(item.label)"
                  :value="state.theme.colors[key] || item.default"
                  @input="
                    state.theme.colors[key] = (
                      $event.target as HTMLInputElement
                    ).value
                  "
                /><span
                  >{{ t(item.label)
                  }}<code>{{
                    (state.theme.colors[key] || item.default).toUpperCase()
                  }}</code></span
                ></label
              >
            </div>
          </details>
        </article>
        <article class="card">
          <div class="section-heading">
            <h3>{{ t("品牌图片") }}</h3>
            <span class="small-label">ARTWORK</span>
          </div>
          <div class="image-field">
            <div id="logo-preview" class="image-preview">
              <img
                v-if="state.theme.images.logo"
                :src="state.theme.images.logo"
                alt=""
              /><span v-else="">☾</span>
            </div>
            <div>
              <strong>{{ t("Logo / 月亮图标") }}</strong>
              <p>{{ t("PNG、JPEG、WebP · 最大 2 MB") }}</p>
              <button
                data-image="logo"
                class="secondary"
                @click="pickImage('logo')"
                :disabled="state.busy || !state.ready"
              >
                {{ t("选择图片") }}</button
              ><button
                data-remove-image="logo"
                class="subtle"
                @click="delete state.theme.images.logo"
                :disabled="state.busy || !state.ready"
              >
                {{ t("还原") }}
              </button>
            </div>
          </div>
          <div class="image-field">
            <div id="cover-preview" class="image-preview cover">
              <img
                v-if="state.theme.images.defaultCover"
                :src="state.theme.images.defaultCover"
                alt=""
              /><span v-else="">♫</span>
            </div>
            <div>
              <strong>{{ t("默认封面") }}</strong>
              <p>{{ t("没有歌曲封面时显示") }}</p>
              <button
                data-image="defaultCover"
                class="secondary"
                @click="pickImage('defaultCover')"
                :disabled="state.busy || !state.ready"
              >
                {{ t("选择图片") }}</button
              ><button
                data-remove-image="defaultCover"
                class="subtle"
                @click="delete state.theme.images.defaultCover"
                :disabled="state.busy || !state.ready"
              >
                {{ t("还原") }}
              </button>
            </div>
          </div>
        </article>
        <article class="card">
          <h3>{{ t("文字也可以是你的风格") }}</h3>
          <p class="hint">
            {{
              t(
                "标题、按钮、状态提示和 Bot 回复，都在「提示文案」中。修改会随主题一起保存。",
              )
            }}
          </p>
          <button data-go="copy" class="secondary" @click="go('copy')">
            {{ t("编辑提示文案 →") }}
          </button>
        </article>
      </div>
      <div class="preview-panel">
        <div class="preview-heading">
          <span><i class="dot online"></i> {{ t("点歌台实时预览") }}</span
          ><small>{{ t("示例数据 · 不会播放音频") }}</small
          ><button
            id="refresh-preview"
            class="subtle"
            @click="refreshPreview"
            :disabled="state.busy || !state.ready"
          >
            {{ t("刷新 ↻") }}
          </button>
        </div>
        <iframe
          id="theme-preview"
          sandbox="allow-scripts allow-same-origin"
          :src="state.previewSrc"
          v-if="state.page === 'theme' &amp;&amp; !!state.previewSrc"
          :title="t('点歌台主题实时预览')"
        ></iframe>
        <p class="preview-error" v-if="state.previewError" role="alert">
          {{ state.previewError }}
        </p>
      </div>
    </div>
  </section>
</template>
