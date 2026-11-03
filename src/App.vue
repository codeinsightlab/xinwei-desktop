<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import EngagementWidget from './features/EngagementWidget.vue';
import './styles/engagement-widget.css';
import { config, notice, loaded, reload, preference } from './application/state';
import { desktop, native } from './platform/desktop';
import Icon from './shared/Icon.vue';
import Settings from './features/Settings.vue';
import { clock } from './application/clock';
const settings=new URLSearchParams(location.search).get('view')==='settings';
const demo=ref(new URLSearchParams(location.search).has('demo'));
const now=ref(clock.now());
const closeHint=ref(false);const menu=ref(false);
const hidden=computed(()=>config.value.preferences.privacyMode);
function rebuild(){now.value=clock.now();}
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
  if(!document.hidden)now.value=t;
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
  <Settings v-if="settings && loaded" :now="now"/>
  <div v-else class="widget-stage">
    <article class="widget engagement-shell" :class="{'is-private':hidden}" @keydown.esc="menu=false">
      <header class="widget-header" @mousedown.left="!($event.target as HTMLElement).closest('button') && desktop.drag()">
        <div class="brand"><span>薪慰</span><span v-if="demo" class="demo-tag">示例</span></div>
        <div class="widget-actions">
          <button class="icon-btn" aria-label="更多操作" title="更多操作" :aria-expanded="menu" @click="menu=!menu">···</button>
        </div>
      </header>
      <div v-if="menu" class="widget-menu"><button @click="preference('privacyMode',!hidden);menu=false"><Icon :name="hidden?'hidden':'eye'" :size="14"/>{{hidden?'显示金额':'隐藏金额'}}</button><button @click="preference('alwaysOnTop',!config.preferences.alwaysOnTop);menu=false"><Icon name="pin" :size="14"/>{{config.preferences.alwaysOnTop?'取消置顶':'置顶小窗'}}</button><button @click="menu=false;safely(()=>desktop.openSettings())"><Icon name="settings" :size="14"/>设置</button><button @click="menu=false;close()">隐藏小窗</button><button @click="desktop.quit()">退出薪慰</button></div>
      <EngagementWidget v-if="loaded && (config.profile || demo)" :key="String(demo)" :demo="demo" :now="now"/>
      <div v-else class="widget-empty"><strong>{{loaded?'让时间，有一点回报。':'正在打开薪慰…'}}</strong><button class="primary" @click="desktop.openSettings()">设置工资 <Icon name="arrow" :size="14"/></button></div>
      <div v-if="closeHint" class="widget-overlay"><strong>薪慰会留在系统托盘</strong><p>隐藏后可从托盘找回，右键图标可退出。</p><button class="primary" @click="dismissClose">知道了，隐藏小窗</button><button class="text-btn" @click="closeHint=false">取消</button></div>
      <div v-if="notice" class="widget-notice" role="alert">{{notice.replace(/^Error:\s*/, '')}}<button class="icon-btn" aria-label="关闭提示" @click="notice=''">×</button></div>
    </article>
    <div v-if="!native" class="preview-caption">薪慰 Xinwei <span>每一秒，都算数。</span><a href="?view=settings">打开设置 ↗</a></div>
  </div>
</template>
