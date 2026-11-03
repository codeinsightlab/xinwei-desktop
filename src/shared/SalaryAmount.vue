<script setup lang="ts">
import { computed } from 'vue';
import { privateMoney } from './money';
const props=defineProps<{value: bigint; hidden?: boolean; hero?: boolean}>();
const formatted=computed(()=>privateMoney(props.value,!!props.hidden));
</script>
<template><span class="salary-amount" :class="{hero,long:formatted.length>10,masked:hidden}" aria-live="off"><span class="currency">¥</span><span>{{formatted}}</span></span></template>
