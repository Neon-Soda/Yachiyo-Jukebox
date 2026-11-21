<script setup lang="ts">
import { ref, watch } from "vue";
import { call, state, t } from "../state";

type Update = { version: string };
type Phase = "checking" | "current" | "available" | "failed";
const dialog = ref<HTMLDialogElement>();
const visible = ref(false);
const phase = ref<Phase>("checking");
const available = ref<Update | null>(null);
const action = ref("");
const error = ref("");
let request = 0;

watch([visible, () => state.toolsPrompt], ([open, toolPrompt]) => {
  if (open && !toolPrompt) {
    if (!dialog.value?.open) dialog.value?.showModal();
  } else if (dialog.value?.open) dialog.value.close();
}, { flush: "post" });

async function check(manual: boolean) {
  const id = ++request;
  if (manual) {
    visible.value = true;
    phase.value = "checking";
    error.value = "";
    available.value = null;
  }
  try {
    const update = await call<Update | null>("checkForUpdate", manual);
    if (id !== request) return;
    available.value = update;
    phase.value = update ? "available" : "current";
    visible.value = manual || !!update;
  } catch (failure) {
    if (id !== request || !manual) return;
    phase.value = "failed";
    error.value = (failure as Error).message;
  }
}

watch(() => state.ready, (ready) => {
  if (ready) void check(false);
}, { immediate: true });

function dismiss() {
  if (action.value) return;
  request++;
  visible.value = false;
}

function cancel(event: Event) {
  event.preventDefault();
  dismiss();
}

async function act(operation: "openUpdateRelease" | "skipUpdate") {
  if (action.value || !available.value) return;
  error.value = "";
  action.value = operation;
  try {
    await call(operation, available.value.version);
    if (operation === "skipUpdate") visible.value = false;
  } catch (failure) {
    error.value = (failure as Error).message;
  } finally {
    action.value = "";
  }
}
</script>

<template>
  <button id="check-version" class="secondary" :disabled="!state.ready || !!action" @click="check(true)">
    {{ t("检查版本更新") }}
  </button>
  <dialog
    ref="dialog"
    id="update-prompt"
    class="tools-dialog update-dialog"
    aria-labelledby="update-title"
    @cancel="cancel"
  >
    <h2 id="update-title">{{ t(phase === "available" ? "发现新版本" : "检查版本更新") }}</h2>
    <p v-if="phase === 'checking'" role="status">{{ t("正在检查 GitHub 上的最新版本…") }}</p>
    <p v-else-if="phase === 'current'" role="status">{{ t("当前已是最新版本。") }}</p>
    <template v-else-if="phase === 'available'">
      <p class="update-versions">
        <span>{{ t("当前版本") }} <b>{{ state.version }}</b></span>
        <span aria-hidden="true">→</span>
        <span>{{ t("最新版本") }} <b>{{ available?.version }}</b></span>
      </p>
      <p>{{ t("在 GitHub 下载新版安装包，在原目录覆盖安装。") }}</p>
    </template>
    <p v-if="error" class="form-error" role="alert">{{ t(error) }}</p>
    <div class="actions">
      <button v-if="phase === 'available'" id="update-skip" class="subtle" :disabled="!!action" @click="act('skipUpdate')">
        {{ t("此版本不再提醒") }}
      </button>
      <button id="update-cancel" class="secondary" autofocus :disabled="!!action" @click="dismiss">
        {{ t(phase === "available" || phase === "checking" ? "取消" : "关闭") }}
      </button>
      <button v-if="phase === 'failed'" id="update-retry" class="primary" @click="check(true)">
        {{ t("重试") }}
      </button>
      <button v-if="phase === 'available'" id="update-release" class="primary" :disabled="!!action" @click="act('openUpdateRelease')">
        {{ t("查看 GitHub 发布页") }} ↗
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.update-dialog .update-versions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 12px;
  row-gap: 4px;
  font-variant-numeric: tabular-nums;
}

.update-versions b {
  margin-inline-start: 4px;
}

.update-dialog .actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
