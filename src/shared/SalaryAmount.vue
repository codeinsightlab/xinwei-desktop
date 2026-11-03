<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { privateMoney } from './money';
import RollingDigit from './RollingDigit.vue';
const props=withDefaults(defineProps<{value: bigint; hidden?: boolean; hero?: boolean; rolling?: boolean}>(),{rolling:true});
const formatted=computed(()=>privateMoney(props.value,!!props.hidden));
const direction=ref(1);
watch(()=>props.value,(value,previous)=>{direction.value=value>=previous?1:-1;},{flush:'sync'});
const characters=computed(()=>Array.from(formatted.value,(character,index)=>({character,key:formatted.value.length-index})));
</script>
<template><span class="salary-amount" :class="{hero,long:formatted.length>10,masked:hidden}" aria-live="off"><span class="currency">¥</span><span class="amount-accessible">{{formatted}}</span><span v-if="hidden || !rolling" aria-hidden="true">{{formatted}}</span><span v-else class="rolling-amount" aria-hidden="true"><template v-for="item in characters" :key="item.key"><RollingDigit v-if="/\d/.test(item.character)" :value="Number(item.character)" :direction="direction"/><span v-else>{{item.character}}</span></template></span></span></template>
