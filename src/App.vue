<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { buildMonthIntervals, calculateEarnings, countdown, monthKey, statusText } from './domain/salary';
import type { MonthPlan } from './domain/salary';
import { clone, defaultProfile } from './domain/model';
import { config, notice, loaded, reload, preference } from './application/state';
import { desktop, native } from './platform/desktop';
import Icon from './shared/Icon.vue';
import Settings from './features/Settings.vue';
import BrandIllustration from './shared/BrandIllustration.vue';
import SalaryAmount from './shared/SalaryAmount.vue';
import WorkStatusBadge from './shared/WorkStatusBadge.vue';
import ProgressIndicator from './shared/ProgressIndicator.vue';
import { clock } from './application/clock';
const settings=new URLSearchParams(location.search).get('view')==='settings';
const demo=ref(new URLSearchParams(location.search).has('demo'));
const now=ref(clock.now());const plan=shallowRef<MonthPlan>();
const closeHint=ref(false);const menu=ref(false);
const effective=computed(()=>{const c=clone(config.value);if(demo.value)c.profile=defaultProfile();return c;});
const earnings=computed(()=>calculateEarnings(effective.value,now.value,plan.value));
const hidden=computed(()=>config.value.preferences.privacyMode);
const title=computed(()=>config.value.preferences.funMode?'今日窝囊费':'今日已赚');
const hint=computed(()=>{const e=earnings.value;if (e.nextBoundary) return `${e.status==='WORKING'?'距下班':e.status==='BREAK'?'距下午开工':'距上班'} ${countdown(e.nextBoundary-now.value/1000)}`;return e.status==='DAY_OFF'?'今天休息，也值得好好过':e.status==='AFTER_WORK'?'今天辛苦了，去过自己的生活':'设置工资，开始看看';});
const funText=computed(()=>earnings.value.status==='WORKING'?(config.value.preferences.funMode?'今天的委屈，正在折算成人民币。':'时间在走，努力也有了形状。'):earnings.value.status==='AFTER_WORK'?'今天的每一秒，都算数。':'慢一点，也没关系。');
function rebuild(){now.value=clock.now();plan.value=buildMonthIntervals(effective.value,monthKey(now.value));}
const longAmount=computed(()=>!hidden.value && earnings.value.today>=100000000n);
async function safely(action:()=>Promise<unknown>){try{await action();}catch(e){notice.value=String(e);}}
async function close(){
  if(demo.value){demo.value=false;await safely(()=>desktop.openSettings());await safely(()=>desktop.hide('widget'));return;}
  if(!config.value.preferences.closeHintSeen){closeHint.value=true;return;}
  await safely(()=>desktop.hide('widget'));
}
async function dismissClose(){await preference('closeHintSeen',true);closeHint.value=false;await safely(()=>desktop.hide('widget'));}
let timer:ReturnType<typeof setInterval>;const cleanups:(()=>void)[]=[];let disposed=false;let lastWall=clock.now(),lastMono=performance.now();
function tick(){
  const t=clock.now(),mono=performance.now();
  if(Math.abs((t-lastWall)-(mono-lastMono))>120000){notice.value='系统时间变化，已重新计算';}
  lastWall=t;lastMono=mono;
  if(!document.hidden){now.value=t;if(plan.value?.month!==monthKey(t))rebuild();}
}
function onVisible(){tick();}
onMounted(async()=>{
  document.body.classList.toggle('is-native',native);document.body.classList.toggle('settings-page',settings);
  try{
    cleanups.push(await desktop.on('config-changed',async()=>{await reload();if(config.value.profile)demo.value=false;rebuild();}));
    cleanups.push(await desktop.on<string>('desktop-notice',m=>notice.value=m));
    cleanups.push(await desktop.on('refresh-now',()=>{now.value=clock.now();rebuild();}));
    cleanups.push(await desktop.on('demo-mode',()=>{demo.value=true;rebuild();}));
    if(!settings)cleanups.push(await desktop.on('request-close',close));
    await reload();rebuild();
  }catch(e){notice.value=String(e);loaded.value=true;}
  if(disposed){cleanups.forEach(f=>f());return;}
  timer=setInterval(tick,1000);window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);
});
onUnmounted(()=>{disposed=true;clearInterval(timer);cleanups.forEach(f=>f());window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);});
</script>
<template>
  <Settings v-if="settings && loaded"/>
  <div v-else class="widget-stage">
    <article class="widget" :class="{'is-private':hidden,'has-long-amount':longAmount}" :data-status="earnings.status">
      <header class="widget-header" @mousedown.left="!($event.target as HTMLElement).closest('button') && desktop.drag()">
        <div class="brand"><BrandIllustration compact/><span>薪慰</span><span v-if="demo" class="demo-tag">示例</span></div>
        <div class="widget-actions">
          <button class="icon-btn" aria-label="更多操作" title="更多操作" :aria-expanded="menu" @click="menu=!menu">···</button>
        </div>
      </header>
      <div v-if="menu" class="widget-menu"><button @click="preference('privacyMode',!hidden);menu=false"><Icon :name="hidden?'hidden':'eye'" :size="14"/>{{hidden?'显示金额':'隐藏金额'}}</button><button @click="preference('alwaysOnTop',!config.preferences.alwaysOnTop);menu=false"><Icon name="pin" :size="14"/>{{config.preferences.alwaysOnTop?'取消置顶':'置顶小窗'}}</button><button @click="menu=false;safely(()=>desktop.openSettings())"><Icon name="settings" :size="14"/>设置</button><button @click="menu=false;close()">隐藏小窗</button><button @click="desktop.quit()">退出薪慰</button></div>
      <template v-if="loaded && effective.profile && earnings.status!=='INVALID_CONFIG'">
        <div class="earning-label">{{title}}</div>
        <div class="salary"><SalaryAmount :value="earnings.today" :hidden="hidden" hero/></div>
        <BrandIllustration v-if="!longAmount && earnings.status==='WORKING'" class="widget-character"/>
        <div class="widget-status-row"><WorkStatusBadge :status="earnings.status"/><span>{{earnings.todaySeconds?`今日 ${((earnings.progress)*100).toFixed(2)}%`:'今天休息'}}</span></div>
        <ProgressIndicator v-if="earnings.todaySeconds" :value="earnings.progress"/>
        <footer class="widget-footnote">{{earnings.status==='BREAK'?'暂停计薪，下午再继续':earnings.status==='WORKING'?(config.preferences.showFunText?'每一秒，都算数。':'按设置估算'):earnings.status==='DAY_OFF'?'今天，也给自己放个假':hint}}</footer>
      </template>
      <div v-else class="widget-empty"><strong>{{loaded?(effective.profile?'本月没有有效工作时间':'让时间，有一点回报。'):'正在打开薪慰…'}}</strong><button class="primary" @click="desktop.openSettings()">{{effective.profile?'调整工作时间':'设置工资'}} <Icon name="arrow" :size="14"/></button></div>
      <div v-if="closeHint" class="widget-overlay"><strong>薪慰会留在系统托盘</strong><p>隐藏后可从托盘找回，右键图标可退出。</p><button class="primary" @click="dismissClose">知道了，隐藏小窗</button><button class="text-btn" @click="closeHint=false">取消</button></div>
      <div v-if="notice" class="widget-notice" role="alert">{{notice.replace(/^Error:\s*/, '')}}<button class="icon-btn" aria-label="关闭提示" @click="notice=''">×</button></div>
    </article>
    <div v-if="!native" class="preview-caption">薪慰 Xinwei <span>每一秒，都算数。</span><a href="?view=settings">打开设置 ↗</a></div>
  </div>
</template>
