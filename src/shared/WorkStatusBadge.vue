<script setup lang="ts">
import type { WorkStatus } from '../domain/salary';
import { statusText } from '../domain/salary';
defineProps<{status: WorkStatus}>();
</script>
<template><span class="work-status" :data-status="status"><span class="status-dot"/>{{statusText[status]}}</span></template>
