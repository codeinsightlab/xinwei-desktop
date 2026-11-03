<script setup lang="ts">
import { computed } from 'vue';
const props=defineProps<{value:number; label?:string}>();
const progress=computed(()=>Math.max(0,Math.min(100,props.value*100)));
</script>
<template><div class="progress-track" role="progressbar" :aria-label="label || '今日工作时间进度'" :aria-valuenow="Number(progress.toFixed(2))" aria-valuemin="0" aria-valuemax="100"><div :style="{width:progress+'%'}"/></div></template>
