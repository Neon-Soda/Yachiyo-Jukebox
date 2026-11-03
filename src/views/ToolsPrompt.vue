<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { state, t, dismissToolsPrompt, setupTools } from "../state";
const dialog = ref<HTMLDialogElement>();
function synchronize() {
  if (state.toolsPrompt && !dialog.value?.open) dialog.value?.showModal();
  else if (!state.toolsPrompt && dialog.value?.open) dialog.value.close();
}
watch(() => state.toolsPrompt, synchronize, { flush: "post" });
onMounted(synchronize);
</script>
<template>
  <dialog
    ref="dialog"
    id="tools-prompt"
    class="tools-dialog"
    aria-labelledby="tools-prompt-title"
    @cancel="dismissToolsPrompt"
    @close="dismissToolsPrompt"
  >
    <span class="eyebrow">READY FOR MUSIC</span>
    <h2 id="tools-prompt-title">{{ t("还差一步，准备播放工具") }}</h2>
    <p>
      {{
        t(
          "Yachiyo 需要 FFmpeg、FFprobe 和 yt-dlp 来播放音乐。工具库会引导你打开下载页、选择文件并自动检查。",
        )
      }}
    </p>
    <div class="tool-prompt-flow">
      <span>{{ t("下载工具") }}</span
      ><b>→</b><span>{{ t("选择文件") }}</span
      ><b>→</b><span>{{ t("自动检查") }}</span>
    </div>
    <p class="hint">
      {{ t("已有工具可以直接选择。应用会记住路径，下次打开无需重复设置。") }}
    </p>
    <div class="actions">
      <button id="setup-tools" class="primary" @click="setupTools">
        {{ t("配置工具库") }}</button
      ><button id="dismiss-tools" class="subtle" @click="dismissToolsPrompt">
        {{ t("稍后设置") }}
      </button>
    </div>
  </dialog>
</template>
