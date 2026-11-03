<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Icon from '../shared/Icon.vue';
import { notice } from '../application/state';

defineProps<{title:string}>();
const emit = defineEmits<{close:[]}>();
const element = ref<HTMLDialogElement>();
let opener:HTMLElement|null;
onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  element.value?.showModal();
});
onUnmounted(() => {
  element.value?.close();
  if (opener?.isConnected) opener.focus();
});
</script>
<template>
  <dialog ref="element" class="engagement-dialog" aria-labelledby="engagement-dialog-title" @cancel.prevent="emit('close')">
    <header>
      <h2 id="engagement-dialog-title">{{title}}</h2>
      <button autofocus class="icon-btn" aria-label="关闭面板" @click="emit('close')"><Icon name="close" :size="16"/></button>
    </header>
    <div class="engagement-dialog-body">
      <p v-if="notice" class="engagement-error" role="alert">{{notice}}</p>
      <slot/>
    </div>
    <footer v-if="$slots.actions"><slot name="actions"/></footer>
  </dialog>
</template>
