<script setup lang="ts">
import mascot from '../assets/mascot-work.svg';
defineProps<{compact?: boolean}>();
</script>
<template><img :src="mascot" class="brand-illustration" :class="{compact}" alt="" aria-hidden="true" draggable="false"/></template>
