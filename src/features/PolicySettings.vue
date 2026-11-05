<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { config, notice } from '../application/state';
import { engage, engagementBusy, interaction } from '../application/engagement';
import { interactionText, newLedger, quoteLate } from '../domain/engagement';
import type { Policy, Receipt } from '../domain/engagement';
import { dateKey } from '../domain/salary';
import { parseSalary } from '../domain/model';
import { privateMoney } from '../shared/money';
import Mascot from '../shared/Mascot.vue';

const props = defineProps<{ active: boolean; now: number }>();
const emit = defineEmits<{ dirty: [value: boolean] }>();
const defaultPolicy = newLedger(props.now).policy;
const saved = computed(() => config.value.engagement?.policy ?? defaultPolicy);
const hidden = computed(() => config.value.preferences.privacyMode);
const activeToday = computed(() => !!config.value.engagement?.days[dateKey(props.now)]);
const mode = ref<Policy['mode']>('NONE');
const grace = ref('0');
const rate = ref('');
const editingRate = ref(false);
const rateInput = ref<HTMLInputElement>();
const savedLocally = ref(false);
const baseline = ref('');
const savedBaseline = ref('');
const submitted = ref(false);
const warning = ref('');
const lastEvent = ref<Receipt>();
const draftKey = computed(() => JSON.stringify([mode.value, grace.value, rate.value]));
const dirty = computed(() => baseline.value !== draftKey.value);
const changedOutside = computed(() => savedBaseline.value !== JSON.stringify(saved.value));

function resetDraft() {
  mode.value = saved.value.mode;
  grace.value = String(saved.value.graceMinutes);
  rate.value = saved.value.perMinuteMinor ? (saved.value.perMinuteMinor / 100).toFixed(2) : '';
  baseline.value = draftKey.value;
  savedBaseline.value = JSON.stringify(saved.value);
  submitted.value = false;
  editingRate.value = false;
  warning.value = '';
  lastEvent.value = undefined;
  savedLocally.value = false;
}
resetDraft();
watch(dirty, value => emit('dirty', value), { immediate: true });
watch(() => JSON.stringify(saved.value), signature => {
  if (!dirty.value && signature !== savedBaseline.value) resetDraft();
});
watch([hidden, () => props.active], () => { editingRate.value = false; });
watch(() => props.active, active => { if (!active) lastEvent.value = undefined; });
watch(draftKey, () => { warning.value = ''; lastEvent.value = undefined; savedLocally.value=false; }, { flush: 'sync' });
function concealRate() { if (hidden.value) editingRate.value = false; }
onMounted(() => window.addEventListener('blur', concealRate));
onUnmounted(() => window.removeEventListener('blur', concealRate));
defineExpose({ resetDraft,save });

const parsed = computed((): { policy?: Policy; graceError?: string; rateError?: string } => {
  const graceMinutes = Number(grace.value);
  if (!/^\d+$/.test(grace.value) || graceMinutes > 60) return { graceError: '请填写 0 到 60 的整数分钟。' };
  let perMinuteMinor = 0;
  if (mode.value === 'PER_MINUTE') {
    try { perMinuteMinor = parseSalary(rate.value); } catch { /* Report the rate-specific limit below. */ }
    if (perMinuteMinor < 1 || perMinuteMinor > 999999) return { rateError: '请填写 0.01 到 9,999.99 元，最多两位小数。' };
  }
  return { policy: { mode: mode.value, graceMinutes, perMinuteMinor } };
});
const quote = computed(() => parsed.value.policy && quoteLate(parsed.value.policy, 600));
const feedback = computed(() => {
  const ledger = config.value.engagement;
  return ledger && lastEvent.value && interactionText(lastEvent.value, ledger, props.now, hidden.value, config.value.preferences.showFunText);
});
async function editRate() {
  editingRate.value = true;
  await nextTick();
  rateInput.value?.focus();
}
async function save() {
  submitted.value = true;
  if (!parsed.value.policy || changedOutside.value || engagementBusy.value || savedLocally.value) return false;
  const previousEvent = interaction.value?.eventId;
  const ok = await engage({ type: 'policy', policy: parsed.value.policy }, config.value.revision);
  if (!ok) { warning.value = notice.value || '未能保存。草稿还在，可以重试。'; return false; }
  const receipt = interaction.value?.eventId !== previousEvent ? interaction.value : undefined;
  resetDraft();
  notice.value = '';
  savedLocally.value = true;
  lastEvent.value = receipt;
  if (!receipt) warning.value = '开工约定已保存。';
  return true;
}
async function reply(replyId: string) {
  if (!lastEvent.value) return;
  if (await engage({ type: 'reply', eventId: lastEvent.value.eventId, replyId })) lastEvent.value = interaction.value;
}
function dismissFeedback() {
  const event = lastEvent.value;
  lastEvent.value = undefined;
  if (event && !event.replyId && !event.skipped) void engage({ type: 'reply', eventId: event.eventId });
}
</script>

<template>
  <div v-if="active" class="policy-settings">
    <p class="page-intro">点「开工」才开启当天的估算。晚一点打开，也会补齐当天已过去的计划内进度。</p>
    <form class="section-card" @submit.prevent="save" novalidate>
      <h2>晚来时，怎么约定？</h2>
      <label class="policy-field" for="policy-mode">迟到扣减方式</label>
      <select id="policy-mode" v-model="mode"><option value="NONE">不扣款</option><option value="PER_MINUTE">按分钟扣减</option></select>
      <div class="policy-fields">
        <div><label class="policy-field" for="grace-minutes">宽限（分钟）</label><input id="grace-minutes" v-model="grace" type="text" inputmode="numeric" :aria-invalid="submitted && !!parsed.graceError"/><small v-if="submitted && parsed.graceError" class="field-error">{{ parsed.graceError }}</small></div>
        <div v-if="mode === 'PER_MINUTE'"><label class="policy-field" for="deduction-rate">每分钟扣减（元）</label><div class="rate-field"><input id="deduction-rate" ref="rateInput" :value="hidden && !editingRate ? '' : rate" :readonly="hidden && !editingRate" :placeholder="hidden && !editingRate ? '金额已隐藏' : '请输入'" type="text" inputmode="decimal" :aria-invalid="submitted && !!parsed.rateError" @input="rate=($event.target as HTMLInputElement).value" @blur="editingRate=false"/><button v-if="hidden && !editingRate" class="text-btn" type="button" @click="editRate">编辑</button></div><small v-if="submitted && parsed.rateError" class="field-error">{{ parsed.rateError }}</small></div>
      </div>
      <div class="policy-example">
        <strong>举个例子</strong>
        <p v-if="quote && mode === 'PER_MINUTE'">晚来 10 个工作分钟，扣除 {{ parsed.policy?.graceMinutes }} 分钟宽限，计费 {{ quote.chargedMinutes }} 分钟，展示金额扣减 ¥ {{ privateMoney(BigInt(quote.deductionMinor),hidden) }}。</p>
        <p v-else-if="mode === 'NONE'">晚来 10 个工作分钟，开工时仍会计入这 10 分钟的计划内估算。</p>
        <p v-else>填写宽限和每分钟金额后，这里会显示扣减示例。</p>
        <small>午休排除在晚来时长之外。超过宽限后，不足一分钟按一分钟计算，首次开工只扣一次。</small>
      </div>
      <p class="field-help">{{ activeToday ? '今天已开启，修改从下一个未开启的工作日起使用。' : '保存后，下次开启工作日时使用这份约定。' }}</p>
      <p class="field-help">晚来时长只取决于你在薪慰中点开工的时间。</p>
      <div v-if="changedOutside" class="field-help" role="status">开工约定已在其他窗口修改。<button type="button" class="text-btn" @click="resetDraft">查看最新约定</button></div>
      <button type="submit" class="primary" :disabled="engagementBusy || changedOutside || savedLocally">{{ engagementBusy ? '正在保存…' : '保存开工约定' }}</button>
      <p v-if="warning" role="status" class="field-help">{{ warning.replace(/^Error:\s*/, '') }}</p>
    </form>
    <section v-if="feedback" class="section-card policy-feedback" aria-label="约定已保存">
      <div class="feedback-header"><strong>约定已保存</strong><button class="icon-btn" type="button" aria-label="关闭约定反馈" @click="dismissFeedback">×</button></div>
      <div class="feedback-copy"><Mascot v-if="config.preferences.showFunText" :pose="feedback.pose" compact/><span role="status">{{ feedback.text }}</span></div>
      <div v-if="feedback.choices.length" class="feedback-choices"><button v-for="choice in feedback.choices" :key="choice.id" type="button" class="outline-btn" :disabled="engagementBusy" @click="reply(choice.id)">{{ choice.label }}</button></div>
    </section>
  </div>
</template>

<style scoped>
.policy-field{display:block;font-size:12px;margin-bottom:8px;color:var(--secondary)}
.policy-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px;margin-top:16px}
.policy-fields input,.policy-settings select{width:100%}.rate-field{display:flex;align-items:center;gap:6px}.rate-field .text-btn{white-space:nowrap}
.policy-example{margin-top:20px;padding:12px 14px;background:var(--canvas);border-left:3px solid var(--accent);border-radius:5px}
.policy-example strong,.feedback-header strong{font-size:12px}.policy-example p{font-size:12px;margin:6px 0}.policy-example small{line-height:1.6;display:block}
.policy-settings form>.primary{margin-top:16px}.feedback-header,.feedback-copy,.feedback-choices{display:flex;align-items:center;gap:8px}.feedback-header{justify-content:space-between}.feedback-copy{font-size:13px;line-height:1.7}.feedback-choices{margin-top:12px;flex-wrap:wrap}.feedback-choices button{font-size:11px}
</style>
