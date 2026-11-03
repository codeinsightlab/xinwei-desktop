<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { clone, defaultProfile, parseSalary, validateConfig } from '../domain/model';
import type { Config, Profile } from '../domain/model';
import { buildMonthIntervals, calculateEarnings, isWorkday, monthDates, monthKey, salaryString } from '../domain/salary';
import { config, notice, recoveryRequired, trayAvailable, reload, preference } from '../application/state';
import { desktop, native } from '../platform/desktop';
import Icon from '../shared/Icon.vue';
import BrandIllustration from '../shared/BrandIllustration.vue';
import SalaryAmount from '../shared/SalaryAmount.vue';
import { clock } from '../application/clock';
import { previewState } from '../application/preview-state';
import { privateMoney } from '../shared/money';
const tab=ref('salary'); const tabs=[['salary','工资与作息','sun'],['calendar','本月日历','calendar'],['appearance','桌面偏好','settings'],['about','关于薪慰','leaf']];
const draft=reactive({salary:'',basis:'税前',customBasis:'',weekdays:[1,2,3,4,5],start:'09:00',end:'18:00',breakEnabled:true,breakStart:'12:00',breakEnd:'13:00'});
const overrides=ref<Config['overrides']>({});const baseRevision=ref(config.value.revision);const editMonth=ref(monthKey(clock.now()));
const original=ref('');const editingSalary=ref(!config.value.profile);const review=ref(false);const confirmDiscard=ref(false);const confirmReset=ref(false);const confirmFresh=ref(false);const saving=ref(false);const errors=reactive<Record<string,string>>({});
const selectedDate=ref('');const previewTime=ref(clock.now());const previewConfig=ref<Config>();const previewOld=ref<Config>();const monthNotice=ref('');
const closeInfo=ref(false);
const time=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
function minutes(v:string){if(!/^\d{2}:\d{2}$/.test(v))return NaN;const [h,m]=v.split(':').map(Number);return h!*60+m!;}
function snapshot(){return JSON.stringify({draft,overrides:overrides.value});}
const dirty=computed(()=>snapshot()!==original.value);
const first=computed(()=>!config.value.profile);
const privateDisplay=computed(()=>config.value.preferences.privacyMode);
watch(privateDisplay,(value)=>{if(value)editingSalary.value=false;});
function initialize(){
  const p=config.value.profile || defaultProfile();
  Object.assign(draft,{salary:config.value.profile?salaryString(p):'',basis:['税前','到手'].includes(p.basis)?p.basis:'custom',customBasis:['税前','到手'].includes(p.basis)?'':p.basis,weekdays:[...p.weekdays],start:time(p.start),end:time(p.end),breakEnabled:p.breakEnabled,breakStart:time(p.breakStart),breakEnd:time(p.breakEnd)});
  overrides.value=clone(config.value.overrides);baseRevision.value=config.value.revision;editMonth.value=monthKey(clock.now());original.value=snapshot();editingSalary.value=!config.value.profile;
}
initialize();
watch(()=>config.value.revision,()=>{if(!dirty.value)initialize();});
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
  try{previewConfig.value=candidate();previewOld.value=clone(config.value);previewTime.value=clock.now();baseRevision.value=config.value.revision;review.value=true;}catch{notice.value='请检查标出的设置';tab.value='salary';}
}
const before=computed(()=>previewOld.value?calculateEarnings(previewOld.value,previewTime.value):null);
const after=computed(()=>previewConfig.value?calculateEarnings(previewConfig.value,previewTime.value):null);
const liveSummary=computed(()=>calculateEarnings(config.value,clock.now()));
function display(n?:bigint){return privateMoney(n,privateDisplay.value);}
async function save(){
  if(checkMonth() || !previewConfig.value)return;
  saving.value=true;
  try{
    const next=clone(previewConfig.value);next.preferences=clone(config.value.preferences);
    config.value=await desktop.save(next,baseRevision.value);initialize();review.value=false;notice.value='';
    await desktop.finish();
  }catch(e){notice.value=String(e);review.value=false;}finally{saving.value=false;}
}
async function requestClose(){if(saving.value)return;if(dirty.value){confirmDiscard.value=true;return;}await hide();}
async function hide(){
  if(first.value){await desktop.quit();return;}
  if(!config.value.preferences.closeHintSeen){closeInfo.value=true;return;}
  try{await desktop.hide('settings');}catch(e){notice.value=String(e);}
}
async function discard(){initialize();confirmDiscard.value=false;await hide();}
async function acceptClose(){await preference('closeHintSeen',true);if(config.value.preferences.closeHintSeen){closeInfo.value=false;await hide();}}
async function reset(){saving.value=true;try{await desktop.reset();await reload();initialize();tab.value='salary';confirmReset.value=false;}catch(e){notice.value=String(e);}finally{saving.value=false;}}
async function fresh(){try{await desktop.fresh();await reload();initialize();confirmFresh.value=false;}catch(e){notice.value=String(e);}}
function toggleDay(day:number){draft.weekdays=draft.weekdays.includes(day)?draft.weekdays.filter(d=>d!==day):[...draft.weekdays,day].sort();}
const dates=computed(()=>monthDates(editMonth.value));const leading=computed(()=>((new Date(dates.value[0]+'T00:00:00Z').getUTCDay()||7)-1));
const calendarConfig=computed(()=>{const c=clone(config.value);c.profile={...defaultProfile(),weekdays:draft.weekdays};c.overrides=overrides.value;return c;});
const calendarDays=computed(()=>buildMonthIntervals(calendarConfig.value,editMonth.value).days);
function override(kind:'work'|'rest'|'default'){if(checkMonth())return;if(kind==='default')delete overrides.value[selectedDate.value];else overrides.value[selectedDate.value]=kind;selectedDate.value='';}
let stop:(()=>void)|undefined;let timer:ReturnType<typeof setInterval>;let gone=false;
const modalOpen=computed(()=>review.value || confirmDiscard.value || confirmReset.value || confirmFresh.value || closeInfo.value);
let previousFocus:HTMLElement|null=null;
watch(modalOpen,async(open)=>{if(open){previousFocus=document.activeElement as HTMLElement;await nextTick();document.querySelector<HTMLElement>('.modal button:not([disabled])')?.focus();}else{previousFocus?.focus();}});
function modalKeys(e:KeyboardEvent){
  if(!modalOpen.value)return;
  if(e.key==='Escape' && !saving.value){review.value=false;confirmDiscard.value=false;confirmReset.value=false;confirmFresh.value=false;closeInfo.value=false;e.preventDefault();}
  if(e.key==='Tab'){
    const nodes=[...document.querySelectorAll<HTMLElement>('.modal button:not([disabled]),.modal input,.modal select')];const a=nodes[0],b=nodes.at(-1);
    if(e.shiftKey && document.activeElement===a){e.preventDefault();b?.focus();}else if(!e.shiftKey && document.activeElement===b){e.preventDefault();a?.focus();}
  }
}
function beforeUnload(e:BeforeUnloadEvent){if(dirty.value && !(import.meta.env.DEV && previewState.enabled)){e.preventDefault();}}
onMounted(async()=>{stop=await desktop.on('request-close',requestClose);if(gone){stop();return;}timer=setInterval(checkMonth,1000);window.addEventListener('beforeunload',beforeUnload);document.addEventListener('keydown',modalKeys);});
onUnmounted(()=>{gone=true;stop?.();clearInterval(timer);window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('keydown',modalKeys);});
</script>
<template>
  <div class="settings-app" :class="{'has-save-footer':!recoveryRequired && ['salary','calendar'].includes(tab)}">
    <aside class="sidebar">
      <div class="settings-brand"><BrandIllustration compact/><div><strong>薪慰</strong><small>XINWEI</small></div></div>
      <p class="sidebar-tagline">每一秒，都算数。</p>
      <nav aria-label="设置分类"><button v-for="[id,label,icon] in tabs" :key="id" :class="{selected:tab===id}" @click="tab=id!"><Icon :name="icon!"/>{{label}}</button></nav>
      <div class="sidebar-bottom"><span class="local-dot"/> 数据留在这台电脑<small>Xinwei · v1.0.0</small></div>
    </aside>
    <main class="settings-main">
      <header class="settings-heading"><div><span class="eyebrow">{{first?'欢迎来到薪慰':'让工作，轻一点'}}</span><h1>{{tabs.find(t=>t[0]===tab)?.[1]}}</h1></div><button v-if="!first" class="outline-btn" @click="requestClose"><Icon name="back" :size="14"/> 回到小窗</button></header>
      <div v-if="notice" class="banner" role="alert">{{notice.replace(/^Error:\s*/, '')}}<button class="icon-btn" aria-label="关闭提示" @click="notice=''">×</button></div>
      <div v-if="monthNotice" class="banner" role="status">{{monthNotice}}</div>
      <div v-if="!trayAvailable && native" class="banner">托盘不可用，请保留窗口，或点击<button class="text-btn" @click="desktop.quit">退出薪慰</button>。</div>
      <section v-if="recoveryRequired" class="section-card"><h2>先恢复你的设置</h2><p>原始文件将保留。重新设置后可继续使用，工资不会用示例值代替。</p><button class="primary" @click="confirmFresh=true">保留原文件，重新设置</button></section>
      <template v-else>
        <template v-if="tab==='salary'">
          <p class="page-intro">设置一次，之后就让工资安静地往前走。</p>
          <div v-if="!first" class="settings-context"><span>本月已赚 <SalaryAmount :value="liveSummary.monthAmount" :hidden="privateDisplay" v-if="liveSummary.status!=='INVALID_CONFIG'"/><span v-else>—</span></span><span>{{liveSummary.workdays}} 个计划工作日</span></div>
          <section class="section-card"><h2><span class="section-number">01</span> 你的月薪</h2>
            <label class="field-label" for="salary">固定月薪 <span>CNY · 人民币</span></label>
            <div class="salary-input-wrap"><span>¥</span><input id="salary" :value="privateDisplay && !editingSalary?'':draft.salary" :type="privateDisplay && !editingSalary?'password':'text'" inputmode="decimal" :placeholder="privateDisplay && !editingSalary?'金额已隐藏':'例如 16800.00'" :readonly="privateDisplay && !editingSalary" :aria-invalid="!!errors.salary" @input="draft.salary=($event.target as HTMLInputElement).value" @focus="!privateDisplay && (editingSalary=true)"/><button v-if="privateDisplay && !editingSalary" class="text-btn" @click="editingSalary=true">编辑工资</button><button v-else-if="privateDisplay" class="text-btn" @click="editingSalary=false">隐藏</button></div>
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
          </section>
          <button v-if="first" class="text-btn demo-button" @click="desktop.demo">先试试示例，不保存工资 <Icon name="arrow" :size="14"/></button>
        </template>
        <template v-if="tab==='calendar'">
          <p class="page-intro">这月怎么上班，由你说了算。</p>
          <section class="section-card"><div class="calendar-heading"><h2>{{editMonth.replace('-','年')}}月</h2><span>{{calendarDays}} 个计划工作日</span></div><p class="field-help">点击日期调整。工资会在本月计划工作时间内重新分摊。</p>
            <div class="calendar"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day" class="calendar-weekday">{{day}}</span><span v-for="n in leading" :key="'empty'+n"/>
              <button v-for="date in dates" :key="date" :class="{work:isWorkday(calendarConfig,date),overridden:!!overrides[date],picked:date===selectedDate}" :aria-label="`${date} ${isWorkday(calendarConfig,date)?'工作日':'休息日'}${overrides[date]?' 已调整':''}`" @click="selectedDate=date"><span>{{Number(date.slice(-2))}}</span><small class="day-kind">{{isWorkday(calendarConfig,date)?'班':'休'}}</small><i v-if="overrides[date]"/></button>
            </div><div class="calendar-legend"><span><i class="legend-work"/>工作日</span><span><i/>休息日</span><span>· 已手动调整</span></div>
            <div v-if="selectedDate" class="date-editor"><strong>{{selectedDate}}</strong><div><button @click="override('work')">设为工作日</button><button @click="override('rest')">设为休息日</button><button @click="override('default')">跟随每周规则</button></div></div>
          </section><p class="field-help">不会自动同步法定节假日。设为休息日不代表请假扣款，增加工作日也不会增加月薪。</p>
        </template>
        <template v-if="tab==='appearance'">
          <p class="page-intro">让这块小小的桌面，合你的心意。</p>
          <section class="section-card preference-card"><h2>显示与隐私</h2>
            <label class="preference-row"><span><strong>隐藏金额</strong><small>隐藏工资、秒薪和金额预览</small></span><input type="checkbox" :checked="config.preferences.privacyMode" @change="preference('privacyMode',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>窝囊费文案</strong><small>给今日已赚换一个有趣的名字</small></span><input type="checkbox" :checked="config.preferences.funMode" @change="preference('funMode',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>显示趣味短句</strong><small>一点点自嘲，一点点安慰</small></span><input type="checkbox" :checked="config.preferences.showFunText" @change="preference('showFunText',($event.target as HTMLInputElement).checked)"/></label>
            <div class="preference-row"><span><strong>主题</strong><small>自动跟随系统的浅色与深色外观</small></span><span class="pill">跟随系统</span></div>
          </section>
          <section class="section-card preference-card"><h2>桌面与启动</h2>
            <label class="preference-row"><span><strong>小窗置顶</strong><small>留在普通应用窗口上方</small></span><input type="checkbox" :checked="config.preferences.alwaysOnTop" @change="preference('alwaysOnTop',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>开机启动</strong><small>登录电脑后自动打开薪慰</small></span><input type="checkbox" :checked="config.preferences.launchAtLogin" @change="preference('launchAtLogin',($event.target as HTMLInputElement).checked)"/></label>
            <label class="preference-row"><span><strong>开机时显示小窗</strong><small>关闭后，自动启动时只驻留托盘</small></span><input type="checkbox" :checked="config.preferences.showWidgetOnLaunch" @change="preference('showWidgetOnLaunch',($event.target as HTMLInputElement).checked)"/></label>
          </section><p class="field-help">这些偏好即时保存。工资、作息和日历需预览后保存。</p>
        </template>
        <template v-if="tab==='about'">
          <section class="about-hero"><BrandIllustration/><h2>薪慰 Xinwei</h2><p>每一秒，都算数。</p><span class="pill">VERSION 1.0.0</span></section>
          <section class="section-card"><h2>工资是怎么算的？</h2><p>把你填写的固定月薪，均匀分摊到本月计划工作时间。今日和本月分别按真实经过的工作秒数计算，午休与下班后暂停增长。</p><p>退出、关机或休眠后重开，也会根据当前时间重新计算。金额显示四舍五入到分，每日显示值之和可能与本月独立计算的总额相差几分钱。</p><div class="calculation-facts"><span>计薪时区<strong>北京时间</strong></span><span>本月工作日<strong>{{liveSummary.workdays}} 天</strong></span><span>理论时薪<strong>¥ {{display(liveSummary.hourly)}}</strong></span></div><p class="field-help">整月固定月薪估算，不用于考勤和实际薪资结算。调整日历会重算整月金额。</p></section>
          <section class="section-card"><h2>只属于你的数据</h2><p>无账号、无广告，工资只保存在本机。普通本地文件不提供密码保护。首版不保存历史薪资账单。</p><button class="danger-btn" @click="confirmReset=true">清除所有本地数据</button></section>
          <button class="text-btn" @click="desktop.quit">退出薪慰</button>
        </template>
      </template>
      <footer v-if="!recoveryRequired && ['salary','calendar'].includes(tab)" class="settings-footer"><span>{{first?'只需设置一次':'工资与作息修改将在预览后保存'}}</span><button class="primary" :disabled="saving" @click="openReview">{{first?'开始看看':'预览修改'}} <Icon name="arrow" :size="16"/></button></footer>
    </main>
    <div v-if="closeInfo" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="close-title"><h2 id="close-title">薪慰会留在系统托盘</h2><p>隐藏窗口后，从托盘图标可以找回小窗或设置。右键图标，选择“退出薪慰”即可结束程序。</p><div class="modal-actions"><button class="outline-btn" @click="closeInfo=false">取消</button><button class="primary" @click="acceptClose">知道了，隐藏窗口</button></div></section></div>
    <div v-if="review && after" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><span class="eyebrow">{{first?'准备好了':'修改预览'}}</span><h2 id="review-title">{{first?'让每一秒，都算数':'这些修改会重算本月'}}</h2><p>按本月计划工作时长分摊月薪。补班改变分摊时长，不增加月薪。</p><div class="review-table"><div><span>今日已赚</span><strong>{{first?'—':`¥ ${display(before?.today)}`}} <Icon name="arrow" :size="14"/> ¥ {{display(after.today)}}</strong></div><div><span>本月已赚</span><strong>{{first?'—':`¥ ${display(before?.monthAmount)}`}} <Icon name="arrow" :size="14"/> ¥ {{display(after.monthAmount)}}</strong></div><div><span>计划工作日</span><strong>{{first?'—':before?.workdays}} → {{after.workdays}} 天</strong></div><div><span>计划工作时长</span><strong>{{first?'—':(before?.totalSeconds||0)/3600}} → {{after.totalSeconds/3600}} 小时</strong></div></div><div v-if="after.status==='INVALID_CONFIG'" class="banner">本月没有工作时间，保存后将提示调整日历，不显示有效收入。</div><div class="modal-actions"><button class="outline-btn" :disabled="saving" @click="review=false">继续修改</button><button class="primary" :disabled="saving" @click="save">{{saving?'正在保存…':first?'开始看看':'保存并重算本月'}}</button></div></section></div>
    <div v-if="confirmDiscard || confirmReset || confirmFresh" class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">{{confirmDiscard?'放弃未保存的修改？':confirmFresh?'保留原文件并重新设置？':'清除全部本地数据？'}}</h2><p>{{confirmDiscard?'工资、作息和日历草稿将被放弃。':confirmFresh?'损坏文件会另行保留，薪慰将回到首次设置。':'会关闭开机启动，清除工资、作息、日历、偏好及备份。此操作无法撤销。'}}</p><div class="modal-actions"><button class="outline-btn" :disabled="saving" @click="confirmDiscard=false;confirmReset=false;confirmFresh=false">取消</button><button class="primary" :disabled="saving" @click="confirmDiscard?discard():confirmFresh?fresh():reset()">{{saving?'正在处理…':'确认'}}</button></div></section></div>
  </div>
</template>
