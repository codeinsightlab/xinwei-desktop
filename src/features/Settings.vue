<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { clone, defaultProfile, parseSalary, validateConfig } from '../domain/model';
import type { Config, Profile } from '../domain/model';
import { buildMonthIntervals, dateKey, isWorkday, monthDates, monthKey, salaryString, scheduleLabel } from '../domain/salary';
import { config, notice, recoveryRequired, trayAvailable, reload, preference, appVersion } from '../application/state';
import { desktop, native, backgroundHelp,platformInfo } from '../platform/desktop';
import Icon from '../shared/Icon.vue';
import BrandIllustration from '../shared/BrandIllustration.vue';
import SalaryAmount from '../shared/SalaryAmount.vue';
import { clock } from '../application/clock';
import { previewState } from '../application/preview-state';
import { privateMoney } from '../shared/money';
import { pendingDays, recordedMonth } from '../domain/engagement';
import { engagementBusy } from '../application/engagement';
import PolicySettings from './PolicySettings.vue';
import { todaySettingsChange } from '../domain/settings-change';
import {registerQuitOwner,approveQuit,cancelQuit,settingsContext,quitId,quitPreparing} from '../application/lifecycle';
import {waitForWrites} from '../application/activity';
import WorkRecords from './WorkRecords.vue';
import type { SettingsPage } from '../platform/desktop';
const props=defineProps<{now:number}>();
const initialSection=new URLSearchParams(location.search).get('section');
const tab=ref(initialSection==='today'||initialSection==='records'?initialSection:'salary'); const tabs=[['salary','工资与作息','sun'],['today','今日明细','clock'],['records','本月记录','calendar'],['calendar','本月日历','calendar'],['policy','开工约定','clock'],['appearance','桌面偏好','settings'],['about','关于薪慰','leaf']];
const draft=reactive({salary:'',basis:'税前',customBasis:'',weekdays:[1,2,3,4,5],start:'09:00',end:'18:00',breakEnabled:true,breakStart:'12:00',breakEnd:'13:00'});
const overrides=ref<Config['overrides']>({});const baseRevision=ref(config.value.revision);const editMonth=ref(monthKey(clock.now()));
const original=ref('');const editingSalary=ref(!config.value.profile);const review=ref(false);const confirmDiscard=ref(false);const confirmReset=ref(false);const confirmFresh=ref(false);const saving=ref(false);const errors=reactive<Record<string,string>>({});
const selectedDate=ref('');const previewTime=ref(clock.now());const previewConfig=ref<Config>();const previewOld=ref<Config>();const monthNotice=ref('');
const policyDirty=ref(false);
const applyToday=ref(true);
const confirmQuit=ref(false),saveQuit=ref(false);
const unregisterQuit=registerQuitOwner(()=>{review.value=false;confirmDiscard.value=false;confirmReset.value=false;confirmFresh.value=false;confirmQuit.value=true;saveQuit.value=false;});
watch(quitId,id=>{if(id===undefined){confirmQuit.value=false;saveQuit.value=false;}});
const policySettings=ref<InstanceType<typeof PolicySettings>>();
const salaryInput=ref<HTMLInputElement>();
const todayKey=computed(()=>dateKey(props.now));
const month=computed(()=>monthKey(props.now));
const monthRecords=computed(()=>Object.keys(config.value.engagement?.days ?? {}).filter(date=>date.startsWith(month.value)));
const savedToday=computed(()=>!!config.value.engagement?.days[todayKey.value]);
const todaySchedule=computed(()=>scheduleLabel(config.value.engagement?.days[todayKey.value]?.snapshot.intervals ?? []));
const pendingCount=computed(()=>pendingDays(config.value.engagement,props.now).filter(day=>day.workDate.startsWith(month.value)).length);
const monthAmount=computed(()=>recordedMonth(config.value.engagement,props.now));
const monthPlan=computed(()=>buildMonthIntervals(config.value,month.value));
async function revealSalary(){editingSalary.value=true;await nextTick();salaryInput.value?.focus();}
const time=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
function minutes(v:string){if(!/^\d{2}:\d{2}$/.test(v))return NaN;const [h,m]=v.split(':').map(Number);return h!*60+m!;}
function snapshot(){return JSON.stringify({draft,overrides:overrides.value});}
const dirty=computed(()=>snapshot()!==original.value);
const first=computed(()=>!config.value.profile);
const privateDisplay=computed(()=>config.value.preferences.privacyMode);
watch([privateDisplay,tab],()=>{if(privateDisplay.value)editingSalary.value=false;});
function initialize(){
  const p=config.value.profile || defaultProfile();
  Object.assign(draft,{salary:config.value.profile?salaryString(p):'',basis:['税前','到手'].includes(p.basis)?p.basis:'custom',customBasis:['税前','到手'].includes(p.basis)?'':p.basis,weekdays:[...p.weekdays],start:time(p.start),end:time(p.end),breakEnabled:p.breakEnabled,breakStart:time(p.breakStart),breakEnd:time(p.breakEnd)});
  overrides.value=clone(config.value.overrides);baseRevision.value=config.value.revision;editMonth.value=monthKey(clock.now());original.value=snapshot();editingSalary.value=!privateDisplay.value && !config.value.profile;
}
initialize();
watch(()=>config.value.revision,()=>{if(!dirty.value && !review.value)initialize();});
watch(()=>config.value.profile===null,(noProfile)=>{if(noProfile)initialize();});
function candidate():Config {
  Object.keys(errors).forEach(k=>delete errors[k]);
  let amountMinor=0;
  try{amountMinor=parseSalary(draft.salary);}catch(e){errors.salary=(e as Error).message;}
  if(!draft.weekdays.length)errors.weekdays='请至少选择一个工作日';
  const p:Profile={amountMinor,basis:draft.basis==='custom'?draft.customBasis.trim():draft.basis,weekdays:[...draft.weekdays].sort(),start:minutes(draft.start),end:minutes(draft.end),breakEnabled:draft.breakEnabled,breakStart:minutes(draft.breakStart),breakEnd:minutes(draft.breakEnd),timeZone:'Asia/Shanghai'};
  const c=clone(config.value);c.profile=p;c.overrides=clone(overrides.value);
  const error=validateConfig(c);if(error && !errors.salary && !errors.weekdays)errors.schedule=error;
  if(Object.keys(errors).length)throw new Error('请检查标出的设置');return c;
}
function checkMonth():boolean {
  const current=monthKey(clock.now());if(current===editMonth.value)return false;
  const restored=clone(overrides.value);
  for(const date of Object.keys(restored)) if(date.startsWith(editMonth.value)){delete restored[date];}
  for(const [date,value] of Object.entries(config.value.overrides))if(date.startsWith(editMonth.value))restored[date]=value;
  overrides.value=restored;editMonth.value=current;selectedDate.value='';review.value=false;
  monthNotice.value='月份已变化：工资与作息草稿已保留，旧月未保存的日历修改已放弃，请重新查看本月设置。';return true;
}
function openReview(){
  if(checkMonth())return;
  try{previewConfig.value=candidate();previewOld.value=clone(config.value);previewTime.value=clock.now();baseRevision.value=config.value.revision;applyToday.value=true;review.value=true;}catch{notice.value='请检查标出的设置';tab.value='salary';}
}
const todayPreview=computed(()=>{
  if(!previewOld.value || !previewConfig.value)return {};
  try{return {change:todaySettingsChange(previewOld.value,previewConfig.value,previewTime.value)};}
  catch(e){return {error:String((e as Error).message)};}
});
const before=computed(()=>previewOld.value ? buildMonthIntervals(previewOld.value,monthKey(previewTime.value)) : undefined);
const after=computed(()=>previewConfig.value ? buildMonthIntervals(previewConfig.value,monthKey(previewTime.value)) : undefined);
function display(n?:bigint){return privateMoney(n,privateDisplay.value);}
async function save(){
  if(checkMonth() || !previewConfig.value)return;
  saving.value=true;
  const initialSetup=first.value;
  try{
    if(dateKey(clock.now())!==dateKey(previewTime.value))throw Error('日期已变化，请重新预览后保存。');
    if(applyToday.value && todayPreview.value.error)throw Error(todayPreview.value.error);
    const next=clone(previewConfig.value);next.preferences=clone(config.value.preferences);
    const update=applyToday.value ? todayPreview.value.change?.update : undefined;
    config.value=await desktop.save(next,baseRevision.value,update);initialize();review.value=false;notice.value='';
    if(saveQuit.value){await savePolicyAndQuit();}
    else if(policyDirty.value){tab.value='policy';monthNotice.value='工资与作息已保存，开工约定还有未保存的修改。';}
    else if(initialSetup) await desktop.finish();
    else monthNotice.value=update?'设置和今天的计薪约定已保存，小窗已同步。':'设置已保存，小窗已同步。';
  }catch(e){notice.value=String(e);review.value=false;if(saveQuit.value)await cancelExit();}finally{saving.value=false;}
}
async function cancelExit(){confirmQuit.value=false;saveQuit.value=false;await cancelQuit();}
async function discardAndQuit(){
  if(!confirmQuit.value || saving.value || engagementBusy.value)return;
  // Discard is authorized once for this transaction; don't re-enter window-close confirmation.
  initialize();policySettings.value?.resetDraft();confirmQuit.value=false;
  try{await approveQuit();}catch(e){notice.value=String(e);}
}
async function savePolicyAndQuit(){
  if(policyDirty.value && !await policySettings.value?.save()){
    tab.value='policy';await cancelExit();return;
  }
  confirmQuit.value=false;
  await approveQuit();
}
async function saveAndQuit(){
  if(saveQuit.value || saving.value || engagementBusy.value)return;
  confirmQuit.value=false;saveQuit.value=true;
  if(dirty.value){openReview();if(!review.value)await cancelExit();return;}
  try{await savePolicyAndQuit();}catch(e){notice.value=String(e);await cancelExit();}
}
async function cancelReview(){review.value=false;if(saveQuit.value)await cancelExit();}
async function requestClose(){
  if(quitId.value!==undefined){confirmQuit.value=true;return;}
  try{await waitForWrites();}catch(e){notice.value=String(e);return;}
  if(dirty.value || policyDirty.value){confirmDiscard.value=true;return;}await hide();
}
async function hide(){
  try{await desktop.hide('settings');}catch(e){notice.value=String(e);}
}
async function discard(){initialize();policySettings.value?.resetDraft();confirmDiscard.value=false;await hide();}
async function reset(){saving.value=true;try{await desktop.reset();await reload();initialize();policySettings.value?.resetDraft();tab.value='salary';confirmReset.value=false;}catch(e){notice.value=String(e);}finally{saving.value=false;}}
async function fresh(){try{await desktop.fresh();await reload();initialize();confirmFresh.value=false;}catch(e){notice.value=String(e);}}
function toggleDay(day:number){draft.weekdays=draft.weekdays.includes(day)?draft.weekdays.filter(d=>d!==day):[...draft.weekdays,day].sort();}
const dates=computed(()=>monthDates(editMonth.value));const leading=computed(()=>((new Date(dates.value[0]+'T00:00:00Z').getUTCDay()||7)-1));
const calendarConfig=computed(()=>{const c=clone(config.value);c.profile={...defaultProfile(),weekdays:draft.weekdays};c.overrides=overrides.value;return c;});
const calendarDays=computed(()=>buildMonthIntervals(calendarConfig.value,editMonth.value).days);
function override(kind:'work'|'rest'|'default'){if(checkMonth())return;if(kind==='default')delete overrides.value[selectedDate.value];else overrides.value[selectedDate.value]=kind;selectedDate.value='';}
let stop:(()=>void)|undefined;let timer:ReturnType<typeof setInterval>;let gone=false;
let stopNavigation:(()=>void)|undefined;
const pendingPage=ref<SettingsPage>();
let navigation=Promise.resolve();
function receivePage(){
  navigation=navigation.then(async()=>{const page=await desktop.takeSettingsPage();if(!gone && page)pendingPage.value=page;}).catch(e=>{notice.value=String(e);});
}
const modalOpen=computed(()=>review.value || confirmDiscard.value || confirmReset.value || confirmFresh.value || confirmQuit.value);
watch([pendingPage,modalOpen,quitId],async()=>{
  if(!pendingPage.value || modalOpen.value || quitId.value!==undefined)return;
  tab.value=pendingPage.value;pendingPage.value=undefined;
  await nextTick();document.querySelector('.settings-main')?.scrollTo(0,0);
});
watch([dirty,policyDirty,saving,engagementBusy,modalOpen],()=>{settingsContext.value={dirty:dirty.value||policyDirty.value,busy:saving.value||engagementBusy.value,modal:modalOpen.value};},{immediate:true});
let previousFocus:HTMLElement|null=null;
watch(modalOpen,async(open)=>{if(open){previousFocus=document.activeElement as HTMLElement;await nextTick();document.querySelector<HTMLElement>('.modal button:not([disabled])')?.focus();}else{previousFocus?.focus();}});
function modalKeys(e:KeyboardEvent){
  if(!modalOpen.value)return;
  if(e.key==='Escape' && !saving.value){if(confirmQuit.value)void cancelExit();else if(review.value)void cancelReview();confirmDiscard.value=false;confirmReset.value=false;confirmFresh.value=false;e.preventDefault();e.stopPropagation();}
  if(e.key==='Tab'){
    const nodes=[...document.querySelectorAll<HTMLElement>('.modal button:not([disabled]),.modal input,.modal select')];const a=nodes[0],b=nodes.at(-1);
    if(e.shiftKey && document.activeElement===a){e.preventDefault();b?.focus();}else if(!e.shiftKey && document.activeElement===b){e.preventDefault();a?.focus();}
  }
}
function concealSalary(){if(privateDisplay.value)editingSalary.value=false;}
function beforeUnload(e:BeforeUnloadEvent){if((dirty.value || policyDirty.value) && !(import.meta.env.DEV && previewState.enabled)){e.preventDefault();}}
onMounted(async()=>{stop=await desktop.on('request-close',requestClose);stopNavigation=await desktop.on('settings-page-requested',receivePage);if(gone){stop();stopNavigation();return;}receivePage();timer=setInterval(checkMonth,1000);window.addEventListener('blur',concealSalary);window.addEventListener('beforeunload',beforeUnload);document.addEventListener('keydown',modalKeys);});
onUnmounted(()=>{gone=true;stop?.();stopNavigation?.();unregisterQuit();clearInterval(timer);window.removeEventListener('blur',concealSalary);window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('keydown',modalKeys);});
</script>
<template>
  <div class="settings-app" :class="{'has-save-footer':!recoveryRequired && ['salary','calendar'].includes(tab)}">
    <aside class="sidebar">
      <div class="settings-brand"><BrandIllustration compact/><div><strong>薪慰</strong><small>XINWEI</small></div></div>
      <p class="sidebar-tagline">每一秒，都算数。</p>
      <nav aria-label="设置分类"><button v-for="[id,label,icon] in tabs" :key="id" :class="{selected:tab===id}" @click="tab=id!"><Icon :name="icon!"/>{{label}}</button></nav>
      <div class="sidebar-bottom"><span class="local-dot"/> 数据留在这台电脑<small>Xinwei · {{appVersion}}</small></div>
    </aside>
    <main class="settings-main" :inert="quitPreparing || confirmQuit || (saveQuit && !review)">
      <header class="settings-heading"><div><span class="eyebrow">{{first?'欢迎来到薪慰':'让工作，轻一点'}}</span><h1>{{tabs.find(t=>t[0]===tab)?.[1]}}</h1></div><button v-if="!first" class="outline-btn" @click="requestClose"><Icon name="back" :size="14"/> 回到小窗</button></header>
      <div v-if="notice" class="banner" role="alert">{{notice.replace(/^Error:\s*/, '')}}<button class="icon-btn" aria-label="关闭提示" @click="notice=''">×</button></div>
      <div v-if="monthNotice" class="banner" role="status">{{monthNotice}}</div>
      <div v-if="native && !platformInfo.recovery.statusItem" class="banner">{{backgroundHelp}} <button class="text-btn" @click="desktop.quit().catch(e=>notice=String(e))">退出薪慰</button></div>
      <section v-if="recoveryRequired" class="section-card"><h2>先恢复你的设置</h2><p>原始文件将保留。重新设置后可继续使用，工资不会用示例值代替。</p><button class="primary" @click="confirmFresh=true">保留原文件，重新设置</button></section>
      <template v-else>
        <PolicySettings ref="policySettings" :active="tab==='policy'" :now="now" @dirty="policyDirty=$event"/>
        <WorkRecords v-if="tab==='today'||tab==='records'" :mode="tab" :now="now"/>
        <template v-if="tab==='salary'">
          <p class="page-intro">设好月薪和作息，再到小窗点「开工」。</p>
          <div v-if="!first" class="record-summary">
            <div class="settings-context"><span>本月已记录估算 <SalaryAmount v-if="monthRecords.length" :rolling="config.preferences.rollingAmount" :value="monthAmount" :hidden="privateDisplay"/><strong v-else>—</strong></span><span>{{monthRecords.length}} 个记录日</span></div>
            <p class="field-help">{{monthRecords.length ? '按每天开工或补算时的约定累计，实际结果取决于收工时间和已保存的扣减。' : '这个月还没有开工或补算记录。'}}</p>
            <p v-if="pendingCount" class="field-help">其中 {{pendingCount}} 天待收尾，计划内估算已计入。</p>
          </div>
          <section class="section-card"><h2><span class="section-number">01</span> 你的月薪</h2>
            <label class="field-label" for="salary">固定月薪 <span>CNY · 人民币</span></label>
            <div class="salary-input-wrap"><span>¥</span><input id="salary" ref="salaryInput" :value="privateDisplay && !editingSalary?'':draft.salary" :type="privateDisplay && !editingSalary?'password':'text'" inputmode="decimal" :placeholder="privateDisplay && !editingSalary?'金额已隐藏':'例如 16800.00'" :readonly="privateDisplay && !editingSalary" :aria-invalid="!!errors.salary" @input="draft.salary=($event.target as HTMLInputElement).value" @blur="privateDisplay && (editingSalary=false)"/><button v-if="privateDisplay && !editingSalary" class="text-btn" @click="revealSalary">编辑工资</button><button v-else-if="privateDisplay" class="text-btn" @click="editingSalary=false">隐藏</button></div>
            <p v-if="errors.salary" class="field-error">{{errors.salary}}</p>
            <div class="inline-fields"><label>工资口径<select v-model="draft.basis"><option>税前</option><option>到手</option><option value="custom">自定义口径</option></select></label><label v-if="draft.basis==='custom'">口径名称<input v-model="draft.customBasis" maxlength="12" placeholder="例如基本工资"/></label></div>
            <p class="field-help">填写你希望看到的月薪。按设置估算，不计算税费或实际到账。</p>
          </section>
          <section class="section-card"><h2><span class="section-number">02</span> 你的作息 <small>北京时间</small></h2>
            <label class="field-label">每周工作日</label><div class="weekdays"><button v-for="(day,i) in ['一','二','三','四','五','六','日']" :key="i" :class="{chosen:draft.weekdays.includes(i+1)}" :aria-pressed="draft.weekdays.includes(i+1)" :aria-label="`周${day}`" @click="toggleDay(i+1)">{{day}}</button></div><p v-if="errors.weekdays" class="field-error">{{errors.weekdays}}</p>
            <div class="time-row"><label>上班时间<input v-model="draft.start" type="time" required/></label><span>—</span><label>下班时间<input v-model="draft.end" type="time" required/></label></div>
            <label class="check-row"><input v-model="draft.breakEnabled" type="checkbox"/> 午休暂停计薪</label>
            <div v-if="draft.breakEnabled" class="time-row"><label>午休开始<input v-model="draft.breakStart" type="time" required/></label><span>—</span><label>午休结束<input v-model="draft.breakEnd" type="time" required/></label></div>
            <p v-if="errors.schedule" class="field-error">{{errors.schedule}}</p><p class="field-help">默认按每周作息安排。节假日与调休，可以在“本月日历”里调整。</p>
            <p v-if="savedToday" class="banner today-schedule">今日计薪时段（北京时间）：{{todaySchedule}}。保存预览可同时更新今天尚未收工的记录，已收工及历史日期保留原约定。</p>
          </section>
          <button v-if="first" class="text-btn demo-button" @click="desktop.demo">先试试示例，不保存工资 <Icon name="arrow" :size="14"/></button>
        </template>
        <template v-if="tab==='calendar'">
          <p class="page-intro">这月怎么上班，由你说了算。</p>
          <section class="section-card"><div class="calendar-heading"><h2>{{editMonth.replace('-','年')}}月</h2><span>{{calendarDays}} 个计划工作日</span></div><p class="field-help">点击日期调整班休。已开启的日期保留当时的设置，新的分摊时长用于以后开启的日期。</p>
            <div class="calendar"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day" class="calendar-weekday">{{day}}</span><span v-for="n in leading" :key="'empty'+n"/>
              <button v-for="date in dates" :key="date" :class="{work:isWorkday(calendarConfig,date),overridden:!!overrides[date],picked:date===selectedDate}" :aria-label="`${date} ${isWorkday(calendarConfig,date)?'工作日':'休息日'}${overrides[date]?' 已调整':''}`" @click="selectedDate=date"><span>{{Number(date.slice(-2))}}</span><small class="day-kind">{{isWorkday(calendarConfig,date)?'班':'休'}}</small><i v-if="overrides[date]"/></button>
            </div><div class="calendar-legend"><span><i class="legend-work"/>工作日</span><span><i/>休息日</span><span>· 已手动调整</span></div>
            <div v-if="selectedDate" class="date-editor"><strong>{{selectedDate}}</strong><p v-if="config.engagement?.days[selectedDate]" class="field-help">这一天已有记录，保留当时的作息。</p><div v-else><button @click="override('work')">设为工作日</button><button @click="override('rest')">设为休息日</button><button @click="override('default')">跟随每周规则</button></div></div>
          </section><p class="field-help">不会自动同步法定节假日。设为休息日不代表请假扣款，增加工作日也不会增加月薪。</p>
        </template>
        <template v-if="tab==='appearance'">
          <p class="page-intro">让这块小小的桌面，合你的心意。</p>
          <section class="section-card preference-card"><h2>显示与隐私</h2>
            <label class="preference-row"><span><strong>金额滚动动画</strong><small>默认连续滚动，关闭后数字直接更新</small></span><input type="checkbox" :checked="config.preferences.rollingAmount" @change="preference('rollingAmount',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>隐藏金额</strong><small>隐藏工资、秒薪和金额预览</small></span><input type="checkbox" :checked="config.preferences.privacyMode" @change="preference('privacyMode',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>窝囊费文案</strong><small>给今日已赚换一个有趣的名字</small></span><input type="checkbox" :checked="config.preferences.funMode" @change="preference('funMode',($event.target as HTMLInputElement).checked)"/></label>

            <div class="preference-row"><span><strong>主题</strong><small>自动跟随系统的浅色与深色外观</small></span><span class="pill">跟随系统</span></div>
          </section>
          <section class="section-card preference-card"><h2>互动</h2>
            <label class="preference-row"><span><strong>趣味反馈</strong><small>开工、收工时聊两句。小窗可见时，午休与下班节点偶尔提醒；关闭后不出现自动互动。</small></span><input type="checkbox" :checked="config.preferences.showFunText" @change="preference('showFunText',($event.target as HTMLInputElement).checked)"/></label>
          </section>
          <section class="section-card preference-card"><h2>桌面与启动</h2>
            <label class="preference-row"><span><strong>小窗置顶</strong><small>留在普通应用窗口上方</small></span><input type="checkbox" :checked="config.preferences.alwaysOnTop" @change="preference('alwaysOnTop',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>登录后自动启动</strong><small>登录电脑后自动打开薪慰</small></span><input type="checkbox" :checked="config.preferences.launchAtLogin" @change="preference('launchAtLogin',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>自动启动时显示小窗</strong><small>关闭后在后台运行。{{backgroundHelp}}</small></span><input type="checkbox" :checked="config.preferences.showWidgetOnLaunch" @change="preference('showWidgetOnLaunch',($event.target as HTMLInputElement).checked)"/></label>
          </section><p class="field-help">这些偏好即时保存。工资、作息和日历需预览后保存。</p>
        </template>
        <template v-if="tab==='about'">
          <section class="about-hero"><BrandIllustration/><h2>薪慰 Xinwei</h2><p>每一秒，都算数。</p><span class="pill">VERSION {{appVersion}}</span></section>
          <section class="section-card"><h2>开工之后，工资怎样增长？</h2>
            <p>月薪按当月计划工作秒数分摊。开工时，薪慰把当天已过去的计划内进度一起计入。之后按工作秒数累积，午休暂停，提前收工会停在收工时刻。约定下班以后只记录晚收工时长。</p>
            <p>每天采用当日已确认的月薪和作息；保存设置可预览并更新今天尚未收工的记录。如有扣减，只在首次开工时确定一次。计划内累积减去扣减后，展示结果截断到分，可显示负数。</p>
            <p>本月将已开启和已补算日期的估算相加，再把总数截断到分。跳过的日期保持空白。</p>
            <div class="calculation-facts"><span>计薪时区<strong>北京时间</strong></span><span>本月计划<strong>{{monthPlan.days}} 个工作日</strong></span><span>已记录<strong>{{monthRecords.length}} 天</strong></span></div>
          </section>
          <section class="section-card"><h2>只属于你的数据</h2><p>工资、开收工记录、约定和互动选择保存在这台电脑。补算日期会标为「按设置估算」。</p><button class="danger-btn" @click="confirmReset=true">清除所有本地数据</button></section>
          <p class="field-help">关闭窗口只会隐藏。{{backgroundHelp}}</p>
        </template>
      </template>
      <footer v-if="!recoveryRequired && ['salary','calendar'].includes(tab)" class="settings-footer"><span>{{first?'只需设置一次':'工资与作息修改将在预览后保存'}}</span><button class="primary" :disabled="saving" @click="openReview">{{first?'开始看看':'预览修改'}} <Icon name="arrow" :size="16"/></button></footer>
    </main>
    <div v-if="review && after" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <span class="eyebrow">{{first?'准备好了':'修改预览'}}</span><h2 id="review-title">{{first?'看看你的工作计划':'确认新设置'}}</h2>
      <p>新设置用于尚未开工的日期。今天尚未收工时，可在下方确认同时更新今天；已收工和历史日期保留原约定。</p>
      <section v-if="todayPreview.change || todayPreview.error" class="today-change">
        <label><input v-model="applyToday" type="checkbox"/> 同时更新今天（{{dateKey(previewTime)}}）</label>
        <p v-if="todayPreview.error" class="field-error">{{todayPreview.error}}</p>
        <template v-if="todayPreview.change">
          <p>北京时间：{{scheduleLabel(todayPreview.change.before.snapshot.intervals)}} → {{scheduleLabel(todayPreview.change.after.snapshot.intervals)}}</p>
          <p>截至预览时今日估算：¥ {{display(todayPreview.change.beforeAmount)}} → ¥ {{display(todayPreview.change.afterAmount)}}</p>
          <p>勾选时按新约定重算今天；首次开工时间与已确定扣减保持不变，不重复扣款。</p>
        </template>
      </section>
      <div class="review-table">
        <div><span>固定月薪</span><strong>{{previewOld?.profile?'¥ '+display(BigInt(previewOld.profile.amountMinor)):'—'}} → ¥ {{display(BigInt(previewConfig?.profile?.amountMinor ?? 0))}}</strong></div>
        <div><span>计划工作日</span><strong>{{first?'—':before?.days}} → {{after.days}} 天</strong></div>
        <div><span>计划工作时长</span><strong>{{first?'—':(before?.seconds||0)/3600}} → {{after.seconds/3600}} 小时</strong></div>
        <div v-if="monthRecords.length"><span>已有记录</span><strong>{{applyToday && todayPreview.change ? '今天按上述预览更新，其余记录保留' : monthRecords.length+' 天，按原约定保留'}}</strong></div>
      </div>
      <p v-if="!after.seconds" class="banner">本月没有计划工作时间。请调整工作日后再开启当天计数。</p>
      <div class="modal-actions"><button class="outline-btn" :disabled="saving" @click="cancelReview">继续修改</button><button class="primary" :disabled="saving" @click="save">{{saving?'正在保存…':saveQuit?'保存并退出':first?'开始看看':'保存新设置'}}</button></div>
    </section></div>
    <div v-if="confirmQuit" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="quit-title"><h2 id="quit-title">退出前处理未保存的修改</h2><p>保存会使用原有校验和金额预览。取消退出会保留草稿；放弃只影响尚未保存的修改，不会删除已有记录。</p><div class="modal-actions"><button class="outline-btn" :disabled="saving" @click="cancelExit">取消</button><button class="outline-btn" :disabled="saving" @click="discardAndQuit">放弃修改并退出</button><button class="primary" :disabled="saving" @click="saveAndQuit">保存并退出</button></div></section></div>
    <div v-if="confirmDiscard || confirmReset || confirmFresh" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{{confirmDiscard?'放弃未保存的修改？':confirmFresh?'保留原文件并重新设置？':'清除全部本地数据？'}}</h2><p>{{confirmDiscard?'尚未保存的工资、作息、日历和开工约定草稿将被放弃。':confirmFresh?'损坏文件会另行保留，薪慰将回到首次设置。':'会关闭开机启动，清除工资、作息、日历、偏好、开收工和补算记录及备份。此操作无法撤销。'}}</p><div class="modal-actions"><button class="outline-btn" :disabled="saving" @click="confirmDiscard=false;confirmReset=false;confirmFresh=false">取消</button><button class="primary" :disabled="saving" @click="confirmDiscard?discard():confirmFresh?fresh():reset()">{{saving?'正在处理…':'确认'}}</button></div></section></div>
  </div>
</template>

<style scoped>
.record-summary{margin:0 0 20px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.record-summary .settings-context{margin:0;padding:0;border:0;flex-wrap:wrap}.record-summary .field-help{margin-top:8px}
</style>
