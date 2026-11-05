<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import EngagementWidget from './features/EngagementWidget.vue';
import './styles/engagement-widget.css';
import { config, notice, loaded, reload, preference, trayAvailable, appVersion, loadAppVersion } from './application/state';
import { desktop, native } from './platform/desktop';
import Icon from './shared/Icon.vue';
import Settings from './features/Settings.vue';
import { clock } from './application/clock';
import {startLifecycle,quitId} from './application/lifecycle';
import {platformInfo} from './platform/info';
const settings=new URLSearchParams(location.search).get('view')==='settings';
const demo=ref(new URLSearchParams(location.search).has('demo'));
const now=ref(clock.now());
const menu=ref(false);
const menuTrigger=ref<HTMLButtonElement>();
const menuPanel=ref<HTMLElement>();
const hidden=computed(()=>config.value.preferences.privacyMode);
function dismissMenu(){menu.value=false;}
function dismissMenuOutside(event:Event){
  if(!menu.value)return;
  const path=event.composedPath();
  if((menuTrigger.value && path.includes(menuTrigger.value)) || (menuPanel.value && path.includes(menuPanel.value)))return;
  dismissMenu();
}
function onVisibilityChange(){onVisible();if(document.hidden)dismissMenu();}
function rebuild(){now.value=clock.now();}
async function safely(action:()=>Promise<unknown>){try{await action();}catch(e){notice.value=String(e);}}
async function close(){
  if(demo.value){demo.value=false;await safely(()=>desktop.openSettings());await safely(()=>desktop.hide('widget'));return;}
  await safely(()=>desktop.hide('widget'));
}
let timer:ReturnType<typeof setInterval>;const cleanups:(()=>void)[]=[];let disposed=false;let lastWall=clock.now(),lastMono=performance.now();
function tick(){
  const t=clock.now(),mono=performance.now();
  if(Math.abs((t-lastWall)-(mono-lastMono))>120000){notice.value='系统时间变化，已重新计算';}
  lastWall=t;lastMono=mono;
  if(!document.hidden)now.value=t;
}
function onVisible(){tick();}
onMounted(async()=>{
  void loadAppVersion();
  document.body.classList.toggle('is-native',native);document.body.classList.toggle('settings-page',settings);
  try{
    cleanups.push(await startLifecycle(settings?'settings':'widget'));
    await desktop.refreshPlatform();
    cleanups.push(await desktop.on('config-changed',async()=>{await reload();if(config.value.profile)demo.value=false;rebuild();}));
    cleanups.push(await desktop.on<string>('desktop-notice',m=>notice.value=m));
    cleanups.push(await desktop.on('refresh-now',()=>{now.value=clock.now();rebuild();}));
    cleanups.push(await desktop.on('demo-mode',()=>{demo.value=true;rebuild();}));
    if(!settings){
      cleanups.push(await desktop.on('request-close',close));
      cleanups.push(await desktop.on('widget-blur',dismissMenu));
      cleanups.push(await desktop.on('widget-visibility-changed',dismissMenu));
    }
    await reload();rebuild();
  }catch(e){notice.value=String(e);loaded.value=true;}
  if(disposed){cleanups.forEach(f=>f());return;}
  timer=setInterval(tick,1000);window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisibilityChange);
  if(!settings){
    document.addEventListener('pointerdown',dismissMenuOutside,true);
    document.addEventListener('focusin',dismissMenuOutside,true);
    window.addEventListener('blur',dismissMenu);
  }
});
onUnmounted(()=>{disposed=true;clearInterval(timer);cleanups.forEach(f=>f());window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisibilityChange);document.removeEventListener('pointerdown',dismissMenuOutside,true);document.removeEventListener('focusin',dismissMenuOutside,true);window.removeEventListener('blur',dismissMenu);});
</script>
<template>
  <Settings v-if="settings && loaded" :now="now"/>
  <div v-else class="widget-stage">
    <article class="widget engagement-shell" :class="{'is-private':hidden}" :inert="quitId!==undefined" @keydown.esc.stop="menu=false">
      <header class="widget-header" data-tauri-drag-region="deep" @mousedown="safely(()=>desktop.drag($event))">
        <div class="brand"><span>薪慰</span><span class="app-version">{{/^\d/.test(appVersion)?'v'+appVersion:appVersion}}</span><span v-if="demo" class="demo-tag">示例</span></div>
        <div class="widget-actions" data-tauri-drag-region="false">
          <button class="icon-btn privacy-toggle" :aria-label="hidden?'显示金额':'隐藏金额'" :title="hidden?'显示金额':'隐藏金额'" :aria-pressed="hidden" @click="preference('privacyMode',!hidden)"><Icon :name="hidden?'hidden':'eye'" :size="15"/></button>
          <button ref="menuTrigger" class="icon-btn" aria-label="更多操作" title="更多操作" aria-controls="widget-menu" :aria-expanded="menu" @click="menu=!menu">···</button>
          <button class="icon-btn" aria-label="隐藏小窗" title="隐藏小窗" @click="close"><Icon name="close" :size="14"/></button>
        </div>
      </header>
      <div v-if="menu" id="widget-menu" ref="menuPanel" class="widget-menu"><button @click="preference('alwaysOnTop',!config.preferences.alwaysOnTop);menu=false"><Icon name="pin" :size="14"/>{{config.preferences.alwaysOnTop?'取消置顶':'置顶小窗'}}</button><button @click="menu=false;safely(()=>desktop.openSettings())"><Icon name="settings" :size="14"/>设置</button><button v-if="!platformInfo.recovery.statusItem && native" @click="safely(()=>desktop.quit())">退出薪慰</button></div>
      <EngagementWidget v-if="loaded && (config.profile || demo)" :key="String(demo)" :demo="demo" :now="now" :obstructed="menu"/>
      <div v-else class="widget-empty"><strong>{{loaded?'让时间，有一点回报。':'正在打开薪慰…'}}</strong><button class="primary" @click="desktop.openSettings()">设置工资 <Icon name="arrow" :size="14"/></button></div>
      <div v-if="notice" class="widget-notice" role="alert">{{notice.replace(/^Error:\s*/, '')}}<button class="icon-btn" aria-label="关闭提示" @click="notice=''">×</button></div>
    </article>
    <div v-if="!native" class="preview-caption">薪慰 Xinwei <span>每一秒，都算数。</span><a href="?view=settings">打开设置 ↗</a></div>
  </div>
</template>
