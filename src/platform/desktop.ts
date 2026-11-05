import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { clone, defaultConfig, validateConfig } from '../domain/model';
import type { Ledger } from '../domain/engagement';
import type { Config, Preferences } from '../domain/model';
import { previewState } from '../application/preview-state';
import { applyTodaySettings, type TodaySettingsUpdate } from '../domain/settings-change';
import { trackWrite } from '../application/activity';
import { platformInfo,type PlatformInfo } from './info';
export {backgroundEntry,backgroundHelp,platformInfo} from './info';
export const native = '__TAURI_INTERNALS__' in window;
export type SettingsPage = 'today' | 'records';
let previewQuit:number|undefined;
let previewExited=false;
const previewEvent=(event:string,detail:unknown)=>window.dispatchEvent(new CustomEvent(event,{detail}));
export interface LoadResult { config: Config; notice: string | null; recoveryRequired: boolean; trayAvailable: boolean }
const key = 'xinwei-preview-v1';
function loadBrowser(): LoadResult {
  if(import.meta.env.DEV && previewState.enabled && previewState.config){
    const handoff=sessionStorage.getItem('xinwei-settings-preview');
    if(handoff){
      sessionStorage.removeItem('xinwei-settings-preview');
      try{const data=JSON.parse(handoff);if(data.preview===new URLSearchParams(location.search).get('preview') && !validateConfig(data.config))previewState.config=data.config;}
      catch(error){console.warn('演示页面交接未读取',error);}
    }
    return {config:clone(previewState.config!),notice:null,recoveryRequired:false,trayAvailable:false};
  }
  try {
    const stored = localStorage.getItem(key);
    const config = stored ? JSON.parse(stored) as Config : defaultConfig();
    if (config.preferences && config.preferences.rollingAmount === undefined) config.preferences.rollingAmount = true;
    if (validateConfig(config)) throw new Error();
    return {config,notice:null,recoveryRequired:false,trayAvailable:false};
  } catch { return {config:defaultConfig(),notice:'配置无法读取，请重新设置。',recoveryRequired:true,trayAvailable:false}; }
}
function browserSave(config: Config, expected: number): Config {
  if(import.meta.env.DEV && previewState.failSave)throw new Error('写入配置失败，草稿已保留。请检查磁盘空间后重试。');
  if (loadBrowser().config.revision!==expected) throw new Error('配置已更新，草稿已保留，请重新预览');
  const error=validateConfig(config); if (error) throw new Error(error);
  const saved=clone(config); saved.revision=expected+1;
  if(import.meta.env.DEV && previewState.enabled)previewState.config=clone(saved);else localStorage.setItem(key,JSON.stringify(saved)); window.dispatchEvent(new Event('preview-config-changed'));return saved;
}
// The browser preview mirrors the native revision transaction across same-origin windows.
function browserTransaction<T>(write:()=>T):Promise<T> {
  return navigator.locks ? navigator.locks.request('xinwei-config', write) : Promise.resolve().then(write);
}
export const desktop = {
  refreshPlatform:async()=>{
    const previewOS=import.meta.env.DEV && new URLSearchParams(location.search).get('previewPlatform');
    platformInfo.value=native?await invoke<PlatformInfo>('platform_info'):{os:previewOS==='macos'?'macos':previewOS==='windows'?'windows':'preview',backgroundEntry:'浏览器预览',recovery:{statusItem:false,dock:false,relaunch:false,otherWindow:false},canHide:true,backgroundLaunch:false};
  },
  version: ():Promise<string> => native ? getVersion() : Promise.resolve(__APP_VERSION__),
  drag: (event: MouseEvent):Promise<void> => {
    // Other platforms use Tauri's declarative drag region. macOS needs a valid
    // native mouse-down event even when asynchronous IPC has already returned.
    if (!native || platformInfo.value.os!=='macos' || event.button !== 0 || event.detail > 1) return Promise.resolve();
    const target = event.target instanceof Element ? event.target
      : event.target instanceof Node ? event.target.parentElement : null;
    if (!target || target.closest('[data-tauri-drag-region="false"],button,a,input,select,textarea')) return Promise.resolve();
    event.preventDefault();
    event.stopPropagation();
    return invoke('start_widget_drag');
  },
  isWidgetVisible: ():Promise<boolean> => native ? invoke('is_widget_visible') : Promise.resolve(document.visibilityState === 'visible'),
  load: (): Promise<LoadResult> => native ? invoke('get_config') : Promise.resolve(loadBrowser()),
  saveEngagement: (engagement:Ledger,expectedRevision:number,auxiliary=false):Promise<Config> => trackWrite(()=>native ? invoke('save_engagement',{engagement,expectedRevision}) : browserTransaction(()=>{const c=loadBrowser().config;c.engagement=engagement;return browserSave(c,expectedRevision);}),!auxiliary),
  save: (config: Config, expectedRevision: number, todayUpdate?: TodaySettingsUpdate): Promise<Config> => trackWrite(()=>native
    ? invoke('save_config',{config,expectedRevision,todayUpdate:todayUpdate ?? null})
    : browserTransaction(()=>{
      const current=loadBrowser().config;
      if(current.revision!==expectedRevision)throw Error('配置已更新，草稿已保留，请重新预览');
      return browserSave(todayUpdate ? applyTodaySettings(current,config,todayUpdate,Date.now()) : {...config,engagement:current.engagement},expectedRevision);
    })),
  preference: (name: keyof Preferences, value: boolean): Promise<Config> => {
    if (native) return trackWrite(()=>invoke('set_preference',{key:name,value}));
    if (name==='launchAtLogin') return Promise.reject(new Error('开机启动请在桌面应用中设置'));
    return trackWrite(()=>browserTransaction(()=>{const c=loadBrowser().config;c.preferences[name]=value;return browserSave(c,c.revision);}));
  },
  openSettings: (section?: SettingsPage) => {
    if (native) return invoke<void>('open_settings', { section: section ?? null });
    const params = new URLSearchParams(); params.set('view','settings');
    if (section) params.set('section',section);
    if (import.meta.env.DEV && previewState.enabled) {
      const current = new URLSearchParams(location.search);
      for (const key of ['preview','theme']) if(current.has(key)) params.set(key,current.get(key)!);
      sessionStorage.setItem('xinwei-settings-preview',JSON.stringify({preview:current.get('preview'),config:previewState.config}));
    }
    return Promise.resolve(window.location.assign('?'+params));
  },
  takeSettingsPage: ():Promise<SettingsPage|null> => native ? invoke('take_settings_page') : Promise.resolve(null),
  finish: () => native ? invoke<void>('finish_setup') : Promise.resolve(window.location.assign('./')),
  demo: () => native ? invoke<void>('show_demo') : Promise.resolve(window.location.assign('./?demo=1')),
  hide: (label: string) => native ? invoke<void>('hide_window',{label}) : Promise.resolve(window.location.assign(label==='settings' ? './' : '?view=settings')),
  quit: () => native ? invoke<void>('quit_app') : Promise.resolve().then(()=>{if(previewExited||previewQuit!==undefined)return;previewQuit=Date.now();previewEvent('prepare-quit',{id:previewQuit});}),
  reportContext:(context:{ready:boolean;dirty:boolean;busy:boolean;modal:boolean})=>native?invoke<void>('report_window_context',{context}):Promise.resolve(),
  quitReady:(id:number,dirty:boolean)=>native?invoke<void>('quit_ready',{id,dirty}):Promise.resolve().then(()=>{if(previewQuit!==id)return;if(dirty)previewEvent('review-quit',{id});else return desktop.resolveQuit(id,true);}),
  // A completed preview quit represents an exited process, until this page reloads.
  resolveQuit:(id:number,allow:boolean)=>native?invoke<void>('resolve_quit',{id,allow}):Promise.resolve().then(()=>{if(previewQuit!==id)return;previewQuit=undefined;previewExited=allow;previewEvent('quit-cancelled',{id,message:''});if(allow)previewEvent('preview-quit-completed',{id});}),
  cancelQuit:(id:number,message?:string)=>native?invoke<void>('cancel_quit',{id,message:message??null}):Promise.resolve().then(()=>{if(previewQuit!==id)return;previewQuit=undefined;previewEvent('quit-cancelled',{id,message:message??''});}),
  fresh: () => native ? invoke<void>('start_fresh') : Promise.resolve().then(()=>localStorage.removeItem(key)),
  reset: () => native ? invoke<void>('reset_data') : Promise.resolve().then(()=>{localStorage.removeItem(key);window.location.assign('?view=settings');}),
  async on<T>(event: string, fn: (payload: T)=>void): Promise<()=>void> {
    if (native) return listen<T>(event,e=>fn(e.payload), ['request-close','review-quit','settings-page-requested'].includes(event) ? {target:getCurrentWindow().label} : undefined);
    const listener=(event:Event)=>fn((event as CustomEvent<T>).detail);const name=event==='config-changed' ? 'preview-config-changed' : event;
    window.addEventListener(name,listener);if (event==='config-changed') window.addEventListener('storage',listener);
    return ()=>{window.removeEventListener(name,listener);window.removeEventListener('storage',listener);};
  }
};
