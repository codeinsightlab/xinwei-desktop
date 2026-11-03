import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { clone, defaultConfig, validateConfig } from '../domain/model';
import type { Config, Preferences } from '../domain/model';
import { previewState } from '../application/preview-state';
export const native = '__TAURI_INTERNALS__' in window;
export interface LoadResult { config: Config; notice: string | null; recoveryRequired: boolean; trayAvailable: boolean }
const key = 'xinwei-preview-v1';
function loadBrowser(): LoadResult {
  if(import.meta.env.DEV && previewState.enabled && previewState.config)return {config:clone(previewState.config),notice:null,recoveryRequired:false,trayAvailable:false};
  try {
    const stored = localStorage.getItem(key);
    const config = stored ? JSON.parse(stored) as Config : defaultConfig();
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
export const desktop = {
  load: (): Promise<LoadResult> => native ? invoke('get_config') : Promise.resolve(loadBrowser()),
  save: (config: Config, expectedRevision: number): Promise<Config> => native ? invoke('save_config',{config,expectedRevision}) : Promise.resolve().then(()=>browserSave(config,expectedRevision)),
  preference: (name: keyof Preferences, value: boolean): Promise<Config> => {
    if (native) return invoke('set_preference',{key:name,value});
    if (name==='launchAtLogin') return Promise.reject(new Error('开机启动请在桌面应用中设置'));
    const c=loadBrowser().config;c.preferences[name]=value;return Promise.resolve().then(()=>browserSave(c,c.revision));
  },
  openSettings: () => native ? invoke<void>('open_settings') : Promise.resolve(window.location.assign('?view=settings')),
  finish: () => native ? invoke<void>('finish_setup') : Promise.resolve(window.location.assign('./')),
  demo: () => native ? invoke<void>('show_demo') : Promise.resolve(window.location.assign('./?demo=1')),
  hide: (label: string) => native ? invoke<void>('hide_window',{label}) : Promise.resolve(window.location.assign(label==='settings' ? './' : '?view=settings')),
  quit: () => native ? invoke<void>('quit_app') : Promise.resolve(),
  fresh: () => native ? invoke<void>('start_fresh') : Promise.resolve().then(()=>localStorage.removeItem(key)),
  reset: () => native ? invoke<void>('reset_data') : Promise.resolve().then(()=>{localStorage.removeItem(key);window.location.assign('?view=settings');}),
  drag: () => native ? getCurrentWindow().startDragging() : Promise.resolve(),
  async on<T>(event: string, fn: (payload: T)=>void): Promise<()=>void> {
    if (native) return listen<T>(event,e=>fn(e.payload));
    const listener=()=>fn(undefined as T);const name=event==='config-changed' ? 'preview-config-changed' : event;
    window.addEventListener(name,listener);if (event==='config-changed') window.addEventListener('storage',listener);
    return ()=>{window.removeEventListener(name,listener);window.removeEventListener('storage',listener);};
  }
};
