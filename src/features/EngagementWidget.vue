<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { config, notice } from '../application/state';
import { engage, engagementBusy, interaction } from '../application/engagement';
import { useCheckpointInteractions } from '../application/checkpoint-interactions';
import { defaultConfig, defaultProfile, type Config } from '../domain/model';
import {
  catchupCandidates, catchupPreview, catchupPreviewTotal, dayValue, interactionText, newLedger, pendingDays,
  reduceEngagement, ruleSnapshot, scheduleEnd,
  type Command, type ContextKey, type Pose, type Receipt
} from '../domain/engagement';
import { dateKey, countdown, clockTime } from '../domain/salary';
import { desktop,platformInfo } from '../platform/desktop';
import { privateMoney } from '../shared/money';
import Mascot from '../shared/Mascot.vue';
import Icon from '../shared/Icon.vue';
import ProgressIndicator from '../shared/ProgressIndicator.vue';
import SalaryAmount from '../shared/SalaryAmount.vue';
import DayFacts from './DayFacts.vue';
import WidgetDialog from './WidgetDialog.vue';

const props = defineProps<{now:number;demo:boolean;obstructed?:boolean}>();
// Onboarding demo is its own clock and in-memory ledger.
const demoOrigin = props.now;
const demoModel = ref<Config>({...defaultConfig(),profile:defaultProfile()});
const current = computed(() => props.demo ? demoModel.value : config.value);
const now = computed(() => props.demo ? Date.parse('2026-11-03T09:10:00+08:00') + props.now-demoOrigin : props.now);
const today = computed(() => dateKey(now.value));
const ledger = computed(() => current.value.engagement ?? newLedger(now.value));
const day = computed(() => ledger.value.days[today.value]);
const hidden = computed(() => config.value.preferences.privacyMode);
const fun = computed(() => config.value.preferences.showFunText);
const busy = ref(false);
const disabled = computed(() => busy.value || engagementBusy.value);
const source = computed(() => {
  if(day.value) return day.value.snapshot;
  try { return ruleSnapshot(current.value,today.value,ledger.value.policy); }
  catch { return undefined; }
});
const schedule = computed(() => {
  const snapshot = source.value;
  if (!snapshot) return 'invalid';
  const periods = snapshot.intervals;
  if (!periods.length) return 'rest';
  const t = now.value/1000;
  if (t<periods[0]!.start) return 'before';
  if (t>=periods.at(-1)!.end) return 'after';
  return periods.some(p=>t>=p.start && t<p.end) ? 'work' : 'break';
});
const state = computed(() => {
  if (day.value?.state==='CLOSED') return 'closed';
  if (day.value?.state==='ESTIMATED') return 'estimated';
  if (day.value?.state==='PENDING_END') return 'pending';
  if (day.value?.state==='ACTIVE') return schedule.value;
  if (schedule.value==='invalid' || schedule.value==='rest') return schedule.value;
  return schedule.value==='after' ? 'missed' : 'idle';
});
const labels:Record<string,string> = {
  idle:'待开工',before:'等待计薪',work:'计数中',break:'午休中',after:'晚收工中',
  closed:'已收工',estimated:'已补算',missed:'已过约定时段',pending:'待收尾',rest:'休息日',invalid:'请检查作息'
};
const poses:Record<string,Pose> = {work:'working',break:'resting',rest:'resting',after:'tired',closed:'offduty',estimated:'offduty'};
const pose = computed(() => poses[state.value] || 'neutral');
const facts = computed(() => day.value ? dayValue(day.value,now.value) : undefined);
const progress = computed(() => {
  const total = source.value?.intervals.reduce((t,i)=>t+i.end-i.start,0) || 0;
  return total && facts.value ? Math.min(1,facts.value.seconds/total) : 0;
});
const pending = computed(() => pendingDays(ledger.value,now.value).sort((a,b)=>b.workDate.localeCompare(a.workDate)));
const eligible = computed(() => {
  return source.value ? catchupCandidates(current.value,ledger.value,now.value) : [];
});
const large = computed(() => facts.value && !hidden.value && String(facts.value.net).length>7);
const money = (value:bigint) => '¥ '+privateMoney(value,hidden.value);
const dayHint = computed(() => {
  switch(state.value) {
    case 'work': return '距今日 '+clockTime(scheduleEnd(day.value!)/1000)+' 下班 '+countdown((scheduleEnd(day.value!)-now.value)/1000);
    case 'after': return '已到约定下班时间，工资封顶';
    case 'break': return '午休暂停增长';
    case 'before': return '到约定时间开始累积';
    case 'estimated': return '按设置估算的展示进度';
    case 'rest': return '今天留给自己';
    case 'missed': return '可补上今天的进度';
    case 'closed': return '今天的记录已保存';
    case 'invalid': return '本月没有可用的工作时段';
    default: return '点开工，开启今天的估算';
  }
});

type Panel = 'receipt'|'settle'|'catchup';
const panel = ref<Panel>();
const shown = ref<Receipt>();
const teaser = ref<Receipt>();
const priorFact = computed(() => shown.value && ledger.value.days[shown.value.eventId.split(':')[0]!]);
const copy = computed(() => shown.value && interactionText(shown.value,ledger.value,now.value,hidden.value,fun.value));
const returnChoices = [
  ['最近有点忙','busy'],['休息了一阵','rest'],
  ['状态不太好','unwell'],['忘了打开','forgot']
] as const;
const canAnswerReturn = computed(() => fun.value && !shown.value?.responded && !shown.value?.skipped && ['return_gap','return_long'].includes(shown.value?.sceneId||''));
const dismissOnClick = computed(() => (panel.value==='receipt' && !copy.value?.choices.length && !canAnswerReturn.value
    && !(shown.value?.sceneId==='catchup_done' && ledger.value.batches[batchId.value])
    && !(!day.value && state.value==='idle')));
const {message: checkpointMessage, dismiss: dismissCheckpoint} = useCheckpointInteractions({
  day: () => day.value,
  enabled: () => !props.demo && fun.value && day.value?.state === 'ACTIVE',
  blocked: () => !!panel.value || !!props.obstructed || disabled.value || !!notice.value,
  claim: async kind => (await run({type:'checkpoint',kind})).event,
});
const checkpointCopy = computed(() => checkpointMessage.value
  && interactionText(checkpointMessage.value,ledger.value,now.value,hidden.value,fun.value));

async function run(command:Command, revision?:number) {
  if (busy.value) return {ok:false, event:undefined};
  busy.value=true;
  try {
    if (props.demo) {
      const result=reduceEngagement(demoModel.value,command,now.value);
      if (result.changed) demoModel.value={...demoModel.value,engagement:result.ledger,revision:demoModel.value.revision+1};
      return {ok:true,event:result.event};
    }
    const previous=interaction.value;
    const ok=await engage(command,revision);
    return {ok,event:ok && interaction.value!==previous ? interaction.value : undefined};
  } catch(error) {
    notice.value=error instanceof Error ? error.message : String(error);
    return {ok:false,event:undefined};
  } finally { busy.value=false; }
}

function showReceipt(event:Receipt) {
  shown.value=event;
  teaser.value=undefined;
  panel.value='receipt';
}
async function action(command:Command) {
  const result=await run(command);
  if (!result.ok) return;
  if (result.event) showReceipt(result.event);
  else if (command.type==='end' && day.value?.state==='CLOSED') await openRecords('today');
  else if (command.type==='reopen' || command.type==='start') panel.value=undefined;
}
async function openRecords(section:'today'|'records') {
  try { await desktop.openSettings(section); }
  catch(error) { notice.value=String(error); }
}
async function enterDay(_date:string,previousDate?:string) {
  panel.value=undefined;
  shown.value=undefined;
  teaser.value=undefined;
  const result=await run({type:previousDate || (!props.demo && platformInfo.value.backgroundLaunch) ? 'rollover' : 'visit'});
  if (result.event && fun.value) teaser.value=result.event;
}
watch(today,enterDay,{immediate:true});
function openTeaser() {
  if (teaser.value) showReceipt(teaser.value);
}
function closePanel() {
  const receipt=panel.value==='receipt' && shown.value;
  panel.value=undefined;
  if (receipt && !receipt.replyId && !receipt.skipped && !receipt.responded && !busy.value) void run({type:'reply',eventId:receipt.eventId});
}
async function reply(replyId:string) {
  if (!shown.value) return;
  const result=await run({type:'reply',eventId:shown.value.eventId,replyId});
  if (result.event) shown.value=result.event;
}
async function answerReturn(answer:ContextKey) {
  if (!shown.value) return;
  const r=await run({type:'context',eventId:shown.value.eventId,answer});
  if (!r.ok) return;
  if (r.event) shown.value=r.event;
}
const panelTitle = computed(() => {
  if(panel.value==='settle') return '为那天收个尾';
  if(panel.value==='catchup') return '补看工资进度';
  if (shown.value?.eventId.includes(':end')) return '收工回顾';
  if (shown.value?.eventId.includes(':start')) return '开工啦';
  if (shown.value?.sceneId==='catchup_done') return '补算已保存';
  return '薪慰想说';
});
const draftDates = ref<string[]>([]);
const candidates = ref<{date:string;minor:bigint}[]>([]);
const previewConfig = ref<Config>();
const previewBasis = ref<{salaryMinor:bigint;monthHours:number}>();
const capturedRevision = ref(0);
const batchId = ref('');
function openCatchup(onlyToday=false) {
  const dates=onlyToday?[today.value]:eligible.value;
  if (!dates.length) return;
  const id=crypto.randomUUID();
  try {
    candidates.value=dates.map(date=>({date,minor:catchupPreview(current.value,date)}));
    previewConfig.value=current.value;
    const snapshot=ruleSnapshot(current.value,dates[0]!,ledger.value.policy);
    previewBasis.value={salaryMinor:BigInt(snapshot.salaryMinor),monthHours:snapshot.monthSeconds/3600};
    draftDates.value=[...dates];
    capturedRevision.value=current.value.revision;
    batchId.value=id;
    panel.value='catchup';
  } catch(error) {notice.value=String(error);}
}
const catchupSum=computed(()=>previewConfig.value ? catchupPreviewTotal(previewConfig.value,draftDates.value) : 0n);
async function confirmCatchup() {
  const result=await run({type:'catchup',dates:[...draftDates.value],batchId:batchId.value},capturedRevision.value);
  if (!result.ok) return;
  if (result.event) showReceipt(result.event);
  else {panel.value=undefined;await openRecords('records');}
}
async function undoBatch(id:string) {
  if ((await run({type:'undoCatchup',batchId:id})).ok) {panel.value=undefined;await openRecords('records');}
}
const selectedPendingDate = ref('');
const selectedPending = computed(()=>pending.value.find(d=>d.workDate===selectedPendingDate.value));
const endTime = ref('');
function choosePending(date:string) {
  selectedPendingDate.value=date;
  if(selectedPending.value) {
    const t=Math.max(scheduleEnd(selectedPending.value),selectedPending.value.firstStartedAt!);
    endTime.value=new Date(t+8*3600000).toISOString().slice(11,19);
  }
}
function openSettle() {
  if(pending.value[0]) { choosePending(pending.value[0].workDate); panel.value='settle'; }
}
async function settle(scheduled:boolean) {
  const d=selectedPending.value;
  if(!d) return;
  const end=scheduled?Math.max(scheduleEnd(d),d.firstStartedAt!):Date.parse(d.workDate+'T'+endTime.value+'+08:00');
  if((await run({type:'settle',date:d.workDate,end})).ok) panel.value=undefined;
}
</script>

<template>
  <div class="engagement-widget" :data-state="state">
    <aside v-if="checkpointCopy" class="checkpoint-card" role="status" aria-live="polite" @click="dismissCheckpoint">
      <Mascot :pose="checkpointCopy.pose"/>
      <p>{{checkpointCopy.text}}<small>点击收起</small></p>
      <button class="icon-btn" aria-label="收起时间提醒" @click.stop="dismissCheckpoint"><Icon name="close" :size="14"/></button>
    </aside>
    <div class="earning-label">{{config.preferences.funMode?'今日窝囊费':'今日估算'}}</div>
    <div class="engagement-hero" :class="{large}">
      <div class="salary">
        <SalaryAmount v-if="facts" hero :value="facts.net" :rolling="config.preferences.rollingAmount" :hidden="hidden"/>
        <strong v-else class="idle-headline">{{state==='idle'?'今天还没开张':state==='rest'?'今日休息':state==='missed'?'今天还没记录':'等待开启'}}</strong>
      </div>
      <button v-if="!large" class="mascot-tap" aria-label="和薪慰说句话" :disabled="disabled || !fun" @click="action({type:'tap'})"><Mascot :pose="pose"/></button>
    </div>
    <div class="widget-status-row"><span class="work-status" :data-state="state"><i class="status-dot"/>{{labels[state]}}</span>
      <span>{{state==='after'?'晚收工 '+Math.floor((facts?.overtimeSeconds||0)/60)+' 分钟':dayHint}}</span>
    </div>
    <div class="engagement-progress"><ProgressIndicator v-if="facts" :value="progress"/><span v-else>{{state==='rest'?'按你的工作日历，今天休息。':'金额待开启'}}</span></div>
    <div class="engagement-controls">
      <button v-if="state==='idle'" class="primary" :disabled="disabled" @click="action({type:'start'})">开工 <Icon name="arrow" :size="15"/></button>
      <button v-else-if="day?.state==='ACTIVE'" class="primary" :disabled="disabled" @click="action({type:'end'})">收工 <Icon name="check" :size="15"/></button>
      <button v-else-if="state==='closed'" class="outline-btn" :disabled="disabled" @click="action({type:'reopen'})">刚才点错了，继续</button>
      <button v-else-if="state==='missed'" class="primary" :disabled="disabled" @click="openCatchup(true)">补看今天</button>
      <button v-else-if="state==='invalid'" class="primary" @click="desktop.openSettings()">调整作息</button>
      <button v-if="day" class="text-btn" @click="openRecords('today')">今日明细</button>
      <button class="text-btn" @click="openRecords('records')">本月记录</button>
    </div>
    <div class="engagement-notes">
      <button v-if="teaser" class="link-chip" @click="openTeaser">{{teaser.sceneId.startsWith('return_')?'欢迎回来，聊两句':'薪慰有句话'}} ↗</button>
      <button v-if="pending.length" class="link-chip" @click="openSettle">{{pending.length}} 天待收尾 ↗</button>
      <button v-if="eligible.length && state!=='missed'" class="link-chip" @click="openCatchup()">{{eligible.length}} 天可补看 ↗</button>
      <small v-if="!teaser && !pending.length && !eligible.length">按设置估算 · {{props.demo?'示例体验':'仅在本机记录'}}</small>
    </div>

    <WidgetDialog v-if="panel" :title="panelTitle" :dismiss-on-click="dismissOnClick" @close="closePanel">
      <template v-if="panel==='receipt' && shown && copy">
        <div class="companion-line"><Mascot :pose="copy.pose"/><p>{{copy.text}}</p></div>
        <DayFacts v-if="priorFact && (shown.eventId.includes(':start')||shown.eventId.includes(':end'))" :day="priorFact" :now="now" :hidden="hidden"/>
        <div v-if="copy.choices.length" class="reply-choices"><button v-for="choice in copy.choices" :key="choice.id" class="outline-btn" :disabled="disabled" @click="reply(choice.id)">{{choice.label}}</button></div>
        <div v-if="canAnswerReturn" class="reply-choices"><button v-for="[label,scene] in returnChoices" :key="scene" class="outline-btn" :disabled="disabled" @click="answerReturn(scene)">{{label}}</button></div>
      </template>
      <template v-if="panel==='catchup'">
        <p>按当前工资与作息估算。勾选要补上的日期。</p>
        <p v-if="previewBasis" class="compact-note">月薪 {{money(previewBasis.salaryMinor)}} · 本月计划 {{Number(previewBasis.monthHours.toFixed(2))}} 小时。每个所选日期计入完整计划时段。</p>
        <div class="catchup-list"><label v-for="row in candidates" :key="row.date"><input type="checkbox" v-model="draftDates" :value="row.date"/><span>{{row.date}}</span><strong>{{money(row.minor)}}</strong></label></div>
        <p>合计 <strong>{{money(catchupSum)}}</strong></p>
      </template>
      <template v-if="panel==='settle'">
        <p>那天忘了说再见？选一个大概的结束时间就好。</p>
        <label class="end-field">待收尾日期<select :value="selectedPendingDate" @change="choosePending(($event.target as HTMLSelectElement).value)"><option v-for="item in pending" :key="item.workDate">{{item.workDate}}</option></select></label>
        <label class="end-field">大概的收工时间<input type="time" step="1" v-model="endTime"/></label>
        <p class="compact-note">保存后将标记为估算收尾。</p>
      </template>
      <template #actions>
        <template v-if="panel==='catchup'">
          <button v-if="capturedRevision!==current.revision" class="primary" @click="openCatchup()">重新预览</button>
          <button v-else class="primary" :disabled="disabled||!draftDates.length" @click="confirmCatchup">确认补算</button>
        </template>
        <template v-else-if="panel==='settle' && selectedPending">
          <button class="primary" :disabled="disabled" @click="settle(true)">按约定时间收工</button>
          <button class="outline-btn" :disabled="disabled||!endTime" @click="settle(false)">用所选时间</button>
        </template>
        <button v-else-if="panel==='receipt' && shown?.sceneId==='catchup_done' && ledger.batches[batchId]" class="outline-btn" :disabled="disabled" @click="undoBatch(batchId)">撤销本批补算</button>
        <button v-else-if="panel==='receipt' && !day && state==='idle'" class="primary" :disabled="disabled" @click="action({type:'start'})">直接开工</button>
        <button v-if="!dismissOnClick" class="text-btn" @click="closePanel">{{panel==='settle'?'先不管':'收起'}}</button>
      </template>
    </WidgetDialog>
  </div>
</template>
