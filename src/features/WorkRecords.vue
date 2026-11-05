<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { config, notice } from '../application/state';
import { engage, engagementBusy } from '../application/engagement';
import { clone, type Config } from '../domain/model';
import { dateKey, monthKey } from '../domain/salary';
import { catchupCandidates, catchupPreview, catchupPreviewTotal, dayValue, pendingDays, recordedMonth, ruleSnapshot, scheduleEnd, type EngagementDay } from '../domain/engagement';
import { privateMoney } from '../shared/money';
import DayFacts from './DayFacts.vue';

const props=defineProps<{mode:'today'|'records';now:number}>();
const today=computed(()=>dateKey(props.now));
const month=computed(()=>monthKey(props.now));
const ledger=computed(()=>config.value.engagement);
const todayRecord=computed(()=>ledger.value?.days[today.value]);
const records=computed(()=>Object.values(ledger.value?.days??{}).filter(d=>d.workDate.startsWith(month.value)).sort((a,b)=>b.workDate.localeCompare(a.workDate)));
const total=computed(()=>recordedMonth(ledger.value,props.now));
const pending=computed(()=>pendingDays(ledger.value,props.now).sort((a,b)=>b.workDate.localeCompare(a.workDate)));
const candidates=computed(()=>ledger.value && config.value.profile ? catchupCandidates(config.value,ledger.value,props.now):[]);
const latestBatch=computed(()=>Object.entries(ledger.value?.batches??{}).filter(([,dates])=>dates.some(d=>d.startsWith(month.value))).at(-1)?.[0]);
const hidden=computed(()=>config.value.preferences.privacyMode);
const money=(amount:bigint)=>'¥ '+privateMoney(amount,hidden.value);
function status(day:EngagementDay){return day.source==='ESTIMATED_CATCHUP'?'按设置补算':day.state==='CLOSED'?'已收工':day.workDate!==today.value?'待收尾':'进行中';}
function time(value:number|null){return value===null?'尚未收工':new Date(value+8*3600000).toISOString().slice(11,19);}
const panel=ref<'catchup'|'settle'>();
const feedback=ref('');
watch(()=>props.mode,()=>{panel.value=undefined;feedback.value='';});
const preview=ref<Config>();
const previewDate=ref('');
const previewRevision=ref(0);
const rows=ref<{date:string;minor:bigint}[]>([]);
const selected=ref<string[]>([]);
const batchId=ref('');
const basis=ref<{salary:bigint;hours:number}>();
const sum=computed(()=>preview.value?catchupPreviewTotal(preview.value,selected.value):0n);
const stale=computed(()=>previewRevision.value!==config.value.revision||previewDate.value!==today.value);
function openCatchup(){
  if(!ledger.value || !candidates.value.length)return;
  try{
    const c=clone(config.value);const dates=[...candidates.value];
    const snapshot=ruleSnapshot(c,dates[0]!,ledger.value.policy);
    preview.value=c;previewRevision.value=c.revision;previewDate.value=today.value;
    rows.value=dates.map(date=>({date,minor:catchupPreview(c,date)}));selected.value=dates;
    basis.value={salary:BigInt(snapshot.salaryMinor),hours:snapshot.monthSeconds/3600};
    batchId.value=crypto.randomUUID();panel.value='catchup';feedback.value='';
  }catch(e){notice.value=String(e);}
}
async function confirmCatchup(){
  if(stale.value){notice.value='记录或日期已变化，请重新预览。';return;}
  if(engagementBusy.value || !selected.value.length)return;
  if(await engage({type:'catchup',dates:[...selected.value],batchId:batchId.value},previewRevision.value)){
    panel.value=undefined;feedback.value='补算已保存，可撤销最近补算。';
  }
}
async function undo(){
  if(!latestBatch.value || engagementBusy.value)return;
  if(await engage({type:'undoCatchup',batchId:latestBatch.value},config.value.revision))feedback.value='最近补算已撤销。';
}
const pendingDate=ref('');const endTime=ref('');
const selectedPending=computed(()=>pending.value.find(d=>d.workDate===pendingDate.value));
function choosePending(date:string){
  pendingDate.value=date;const day=selectedPending.value;
  if(day)endTime.value=time(Math.max(scheduleEnd(day),day.firstStartedAt!));
}
function openSettle(){if(pending.value[0]){choosePending(pending.value[0].workDate);panel.value='settle';feedback.value='';}}
async function settle(scheduled:boolean){
  const day=selectedPending.value;if(!day || engagementBusy.value)return;
  const end=scheduled?Math.max(scheduleEnd(day),day.firstStartedAt!):Date.parse(day.workDate+'T'+endTime.value+'+08:00');
  if(await engage({type:'settle',date:day.workDate,end},config.value.revision)){panel.value=undefined;feedback.value='估算收尾已保存。';}
}
</script>

<template>
  <div class="work-records">
    <p v-if="feedback" class="banner" role="status">{{feedback}}</p>
    <template v-if="mode==='today'">
      <p class="page-intro">{{today}} · 北京时间</p>
      <section v-if="todayRecord" class="section-card">
        <h2>{{status(todayRecord)}}</h2>
        <DayFacts :day="todayRecord" :now="now" :hidden="hidden"/>
        <p class="field-help">{{todayRecord.source==='ESTIMATED_CATCHUP'?'这天按设置补算了展示进度。':'晚收工时长按本次开工和收工操作估算。'}}</p>
        <p v-if="todayRecord.firstStartedAt" class="field-help">开工 {{time(todayRecord.firstStartedAt)}} · {{time(todayRecord.endedAt)}}</p>
      </section>
      <section v-else class="section-card"><h2>今天还没有记录</h2><p>到小窗点「开工」后，这里会显示今天的计薪时段、扣减和估算。</p></section>
    </template>
    <template v-else>
      <p class="page-intro">{{month.replace('-','年')}}月 · 北京时间</p>
      <section class="section-card">
        <h2>本月已记录估算 {{money(total)}}</h2>
        <p class="field-help">合计已开工和主动补算的日期。{{records.length}} 个记录日。</p>
        <div class="record-actions">
          <button v-if="candidates.length" class="primary" :disabled="engagementBusy" @click="openCatchup">预览补算</button>
          <button v-if="pending.length" class="outline-btn" :disabled="engagementBusy" @click="openSettle">{{pending.length}} 天待收尾</button>
          <button v-if="latestBatch" class="text-btn" :disabled="engagementBusy" @click="undo">撤销最近补算</button>
        </div>
      </section>
    </template>
    <section v-if="panel==='catchup'" class="section-card record-preview" aria-label="补算预览">
      <h2>补看工资进度</h2><p>按当前工资与作息估算。勾选要补上的日期。</p>
      <p v-if="basis" class="field-help">月薪 {{money(basis.salary)}} · 本月计划 {{Number(basis.hours.toFixed(2))}} 小时。每个所选日期计入完整计划时段。</p>
      <div class="record-selection"><label v-for="row in rows" :key="row.date"><input type="checkbox" v-model="selected" :value="row.date"/><span>{{row.date}}</span><strong>{{money(row.minor)}}</strong></label></div>
      <p>合计 <strong>{{money(sum)}}</strong></p>
      <div class="record-actions"><button v-if="stale" class="primary" @click="openCatchup">重新预览</button><button v-else class="primary" :disabled="engagementBusy||!selected.length" @click="confirmCatchup">确认补算</button><button class="outline-btn" :disabled="engagementBusy" @click="panel=undefined">取消</button></div>
    </section>
    <section v-if="panel==='settle'" class="section-card record-preview" aria-label="收尾记录">
      <h2>为那天收个尾</h2><p>那天忘了说再见？选一个大概的结束时间就好。</p>
      <label class="end-field">待收尾日期<select :value="pendingDate" @change="choosePending(($event.target as HTMLSelectElement).value)"><option v-for="day in pending" :key="day.workDate">{{day.workDate}}</option></select></label>
      <label class="end-field">大概的收工时间<input type="time" step="1" v-model="endTime"/></label>
      <p class="field-help">保存后将标记为估算收尾。</p>
      <div class="record-actions"><button class="primary" :disabled="engagementBusy||!selectedPending" @click="settle(true)">按约定时间收工</button><button class="outline-btn" :disabled="engagementBusy||!selectedPending||!endTime" @click="settle(false)">用所选时间</button><button class="text-btn" :disabled="engagementBusy" @click="panel=undefined">先不管</button></div>
    </section>
    <template v-if="mode==='records'">
      <section v-if="!records.length" class="section-card"><p>本月还没有记录。</p></section>
      <details v-for="day in records" :key="day.workDate" class="section-card record-entry"><summary><span>{{day.workDate}} · {{status(day)}}</span><strong>{{money(dayValue(day,now).net)}}</strong></summary><DayFacts :day="day" :now="now" :hidden="hidden" total-label="当日估算"/><p v-if="day.firstStartedAt" class="field-help">开工 {{time(day.firstStartedAt)}} · {{time(day.endedAt)}}</p></details>
    </template>
  </div>
</template>

<style scoped>
.record-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.record-entry summary{display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;font-size:12px}
.record-entry summary::before{content:'▸';color:var(--secondary)}
.record-entry[open] summary::before{content:'▾'}
.record-entry summary span{flex:1}
.record-entry[open] summary{margin-bottom:16px}
.work-records :deep(.day-facts){font-size:13px;line-height:1.8}
.work-records :deep(.day-facts>div){padding:5px 0}
.work-records :deep(.day-schedule){margin-bottom:12px}
.record-selection{margin:12px 0;display:grid;gap:4px}
.record-selection label{display:flex;align-items:center;gap:10px;font-size:12px;padding:5px 0}
.record-selection strong{margin-left:auto}
.record-preview .end-field{margin-bottom:12px}
</style>
