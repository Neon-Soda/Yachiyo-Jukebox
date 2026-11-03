<script setup lang="ts">
import { state, t, savePreferences } from "../state";
</script>
<template>
  <section class="page" id="page-appearance">
    <div class="page-intro">
      <p>{{ t("选择桌面软件的语言和配色，切换后立即保存。") }}</p>
      <span id="appearance-state" class="hint" role="status">{{
        t(
          state.preferenceSaving
            ? "正在保存外观…"
            : "更换即保存，无需重启 Bot。",
        )
      }}</span>
    </div>
    <article class="card appearance-card">
      <div class="section-heading">
        <div>
          <h3>{{ t("应用主题") }}</h3>
          <p>
            {{
              t(
                "只改变这台电脑上的控制中心。Discord 点歌台的主题和文案在各自的页签中设置。",
              )
            }}
          </p>
        </div>
        <span class="small-label">APPEARANCE</span>
      </div>
      <div class="app-theme-grid" role="group" :aria-label="t('应用主题')">
        <label class="app-theme-choice"
          ><input
            type="radio"
            name="appTheme"
            value="forest"
            :checked="state.preferences.appTheme === 'forest'"
            @change="savePreferences({ appTheme: 'forest' })"
            :disabled="!state.ready || state.preferenceSaving"
          />
          <div class="mini-app" data-preview-theme="forest" aria-hidden="true">
            <div class="mini-sidebar"><b>☾</b><i></i><i></i><i></i></div>
            <div class="mini-main">
              <div class="mini-heading"></div>
              <div class="mini-hero"><span>☾</span></div>
              <div class="mini-cards"><i></i><i></i><i></i></div>
            </div>
          </div>
          <span class="choice-title">{{ t("森绿") }}</span
          ><small>{{ t("深色 · 柔和的薄荷绿") }}</small
          ><span class="selected-tag">{{ t("已选用") }}</span></label
        >
        <label class="app-theme-choice"
          ><input
            type="radio"
            name="appTheme"
            value="midnight"
            :checked="state.preferences.appTheme === 'midnight'"
            @change="savePreferences({ appTheme: 'midnight' })"
            :disabled="!state.ready || state.preferenceSaving"
          />
          <div
            class="mini-app"
            data-preview-theme="midnight"
            aria-hidden="true"
          >
            <div class="mini-sidebar"><b>☾</b><i></i><i></i><i></i></div>
            <div class="mini-main">
              <div class="mini-heading"></div>
              <div class="mini-hero"><span>☾</span></div>
              <div class="mini-cards"><i></i><i></i><i></i></div>
            </div>
          </div>
          <span class="choice-title">{{ t("午夜") }}</span
          ><small>{{ t("深色 · 月光紫") }}</small
          ><span class="selected-tag">{{ t("已选用") }}</span></label
        >
        <label class="app-theme-choice"
          ><input
            type="radio"
            name="appTheme"
            value="ocean"
            :checked="state.preferences.appTheme === 'ocean'"
            @change="savePreferences({ appTheme: 'ocean' })"
            :disabled="!state.ready || state.preferenceSaving"
          />
          <div class="mini-app" data-preview-theme="ocean" aria-hidden="true">
            <div class="mini-sidebar"><b>☾</b><i></i><i></i><i></i></div>
            <div class="mini-main">
              <div class="mini-heading"></div>
              <div class="mini-hero"><span>☾</span></div>
              <div class="mini-cards"><i></i><i></i><i></i></div>
            </div>
          </div>
          <span class="choice-title">{{ t("海蓝") }}</span
          ><small>{{ t("深色 · 清澈的蓝") }}</small
          ><span class="selected-tag">{{ t("已选用") }}</span></label
        >
        <label class="app-theme-choice"
          ><input
            type="radio"
            name="appTheme"
            value="daylight"
            :checked="state.preferences.appTheme === 'daylight'"
            @change="savePreferences({ appTheme: 'daylight' })"
            :disabled="!state.ready || state.preferenceSaving"
          />
          <div
            class="mini-app"
            data-preview-theme="daylight"
            aria-hidden="true"
          >
            <div class="mini-sidebar"><b>☾</b><i></i><i></i><i></i></div>
            <div class="mini-main">
              <div class="mini-heading"></div>
              <div class="mini-hero"><span>☾</span></div>
              <div class="mini-cards"><i></i><i></i><i></i></div>
            </div>
          </div>
          <span class="choice-title">{{ t("晴昼") }}</span
          ><small>{{ t("浅色 · 温暖的纸白") }}</small
          ><span class="selected-tag">{{ t("已选用") }}</span></label
        >
      </div>
      <label class="system-theme"
        ><input
          type="radio"
          name="appTheme"
          value="system"
          :checked="state.preferences.appTheme === 'system'"
          @change="savePreferences({ appTheme: 'system' })"
          :disabled="!state.ready || state.preferenceSaving"
        /><span class="system-symbol" aria-hidden="true">◑</span
        ><span
          ><strong>{{ t("跟随系统") }}</strong
          ><small>{{ t("随 Windows 的深浅色设置自动切换") }}</small></span
        ><span class="selected-tag">{{ t("已选用") }}</span></label
      >
    </article>
    <article class="card">
      <div class="section-heading">
        <div>
          <h3>{{ t("界面语言") }}</h3>
          <p>
            {{
              t(
                "语言仅用于桌面界面、状态提示和托盘菜单；不会翻译你自定义的点歌台内容。",
              )
            }}
          </p>
        </div>
        <select
          id="appearance-language"
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
          <option value="en">English</option>
        </select>
      </div>
    </article>
  </section>
</template>
