<script setup lang="ts">
import Mascot from './Mascot.vue';
defineProps<{compact?:boolean}>();
</script>
<template><Mascot :compact="compact"/></template>
