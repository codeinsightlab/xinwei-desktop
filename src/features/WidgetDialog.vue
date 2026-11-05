<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import Icon from '../shared/Icon.vue';
import { notice } from '../application/state';

const props = withDefaults(defineProps<{title:string;dismissOnClick?:boolean}>(),{dismissOnClick:false});
const emit = defineEmits<{close:[]}>();
const element = ref<HTMLDialogElement>();
let opener:HTMLElement|null;
function dismiss(event:MouseEvent) {
  if (!props.dismissOnClick || notice.value || window.getSelection()?.toString()) return;
  if ((event.target as HTMLElement).closest('button,a,input,select,textarea,summary,label')) return;
  emit('close');
}
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
  <dialog ref="element" class="engagement-dialog" :data-dismiss-on-click="dismissOnClick" aria-labelledby="engagement-dialog-title" @click="dismiss" @keydown.esc.stop @cancel.prevent.stop="emit('close')">
    <header>
      <h2 id="engagement-dialog-title">{{title}}</h2>
      <button v-if="!dismissOnClick" autofocus class="icon-btn" aria-label="收起面板" @click="emit('close')"><Icon name="close" :size="16"/></button>
    </header>
    <div class="engagement-dialog-body">
      <p v-if="notice" class="engagement-error" role="alert">{{notice}}</p>
      <slot/>
    </div>
    <p v-if="dismissOnClick" class="dismiss-hint">点击空白处收起 · Esc</p>
    <footer v-if="$slots.actions"><slot name="actions"/></footer>
  </dialog>
</template>
