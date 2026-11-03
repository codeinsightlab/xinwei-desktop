<script setup lang="ts">
import { computed } from 'vue';
import { dayValue, type EngagementDay } from '../domain/engagement';
import { privateMoney } from '../shared/money';

const props = defineProps<{day:EngagementDay;now:number;hidden:boolean}>();
const facts = computed(() => dayValue(props.day, props.now));
const money = (v:bigint) => '¥ ' + privateMoney(v,props.hidden);
function duration(seconds:number) {
  const minutes = Math.floor(seconds/60);
  const rest = seconds%60;
  return rest ? minutes+' 分 '+rest+' 秒' : minutes+' 分钟';
}
</script>
<template>
  <dl class="day-facts">
    <div><dt>计划内累积</dt><dd>{{money(facts.gross)}}</dd></div>
    <div v-if="day.source==='USER' && day.lateSeconds"><dt>比约定晚开工</dt><dd>{{duration(day.lateSeconds)}}</dd></div>
    <div v-if="day.deductionMinor"><dt>按设置扣减 · {{day.chargedMinutes}} 分钟</dt><dd>{{money(facts.deduction)}}</dd></div>
    <div class="day-facts-total"><dt>今日估算</dt><dd>{{money(facts.net)}}</dd></div>
    <div v-if="facts.overtimeSeconds"><dt>估算晚收工</dt><dd>{{duration(facts.overtimeSeconds)}}</dd></div>
  </dl>
</template>
