<script setup lang="ts">
import { computed, ref } from "vue";
import { state, t, run, call } from "../state";
import project from "../../project.json";
import licenseText from "../../LICENSE?raw";
import thirdPartyText from "../../licenses/THIRD-PARTY-NOTICES.txt?raw";

const dialog = ref<HTMLDialogElement>();
const document = ref<"license" | "thirdParty">("license");
const documentTitle = computed(() =>
  t(document.value === "license" ? "MIT 许可" : "第三方许可"),
);
const documentText = computed(() =>
  document.value === "license" ? licenseText : thirdPartyText,
);
function showDocument(which: "license" | "thirdParty") {
  document.value = which;
  dialog.value?.showModal();
}
function openProjectLink(destination: string) {
  void run(() => call("openProjectLink", destination));
}
</script>

<template>
  <section class="page info-page" id="page-info">
    <div class="info-hero">
      <div class="info-mark" aria-hidden="true">☾</div>
      <div>
        <div class="eyebrow">MADE FOR SHARED MUSIC</div>
        <h2>Yachiyo</h2>
        <p id="info-version" class="info-version">
          {{ t("版本") }} {{ state.version }}
        </p>
        <p class="info-description">
          {{ t("为 Discord 频道打造的音乐工作台。") }}
        </p>
      </div>
    </div>

    <div class="info-groups">
      <section class="info-group" aria-labelledby="info-project-title">
        <h3 id="info-project-title">{{ t("项目") }}</h3>
        <div class="info-links">
          <button
            id="info-source"
            class="info-link"
            @click="openProjectLink('source')"
            :disabled="state.busy || !state.ready"
          >
            <span class="info-symbol" aria-hidden="true">&lt;/&gt;</span>
            <span
              ><strong>GitHub</strong
              ><small>{{ t("查看源代码，参与项目") }}</small></span
            >
            <span class="info-arrow" aria-hidden="true">↗</span>
          </button>
          <button
            id="info-releases"
            class="info-link"
            @click="openProjectLink('releases')"
            :disabled="state.busy || !state.ready"
          >
            <span class="info-symbol" aria-hidden="true">↓</span>
            <span
              ><strong>{{ t("发行版本") }}</strong
              ><small>{{ t("查看更新记录与安装包") }}</small></span
            >
            <span class="info-arrow" aria-hidden="true">↗</span>
          </button>
          <button
            id="info-issues"
            class="info-link"
            @click="openProjectLink('issues')"
            :disabled="state.busy || !state.ready"
          >
            <span class="info-symbol" aria-hidden="true">?</span>
            <span
              ><strong>{{ t("问题反馈") }}</strong
              ><small>{{ t("报告问题或提出建议") }}</small></span
            >
            <span class="info-arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </section>
      <section class="info-group" aria-labelledby="info-open-title">
        <h3 id="info-open-title">{{ t("开源") }}</h3>
        <div class="info-links">
          <button
            id="info-license"
            class="info-link"
            @click="showDocument('license')"
          >
            <span class="info-symbol" aria-hidden="true">§</span>
            <span
              ><strong>{{ t("MIT 许可") }}</strong
              ><small>{{ t("查看本项目的完整许可证") }}</small></span
            >
            <span class="info-arrow" aria-hidden="true">›</span>
          </button>
          <button
            id="info-third-party"
            class="info-link"
            @click="showDocument('thirdParty')"
          >
            <span class="info-symbol" aria-hidden="true">◇</span>
            <span
              ><strong>{{ t("第三方许可") }}</strong
              ><small>{{ t("致谢与组件来源说明") }}</small></span
            >
            <span class="info-arrow" aria-hidden="true">›</span>
          </button>
          <button
            id="info-docs"
            class="info-link"
            @click="openProjectLink('docs')"
            :disabled="state.busy || !state.ready"
          >
            <span class="info-symbol" aria-hidden="true">≡</span>
            <span
              ><strong>{{ t("使用文档") }}</strong
              ><small>{{ t("配置、工具库与点歌台指南") }}</small></span
            >
            <span class="info-arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </section>
    </div>
    <div class="info-footer">
      <p>© {{ project.copyrightYear }} {{ project.copyrightHolder }}</p>
      <p>{{ t("Yachiyo 使用 MIT 许可，第三方组件遵循各自的许可。") }}</p>
    </div>
    <dialog
      ref="dialog"
      id="info-document"
      class="info-dialog"
      aria-labelledby="info-document-title"
    >
      <div class="info-document-heading">
        <h3 id="info-document-title">{{ documentTitle }}</h3>
        <button
          id="close-info-document"
          class="subtle"
          @click="dialog?.close()"
          :aria-label="t('关闭')"
        >
          ✕
        </button>
      </div>
      <pre id="info-document-text">{{ documentText }}</pre>
      <div class="info-document-footer">
        <span>{{ t("许可证保留英文原文。") }}</span>
        <button
          v-if="document === 'license'"
          id="info-license-web"
          class="secondary"
          @click="openProjectLink('license')"
          :disabled="state.busy || !state.ready"
        >
          {{ t("查看 MIT 许可网页") }} ↗
        </button>
      </div>
    </dialog>
  </section>
</template>
