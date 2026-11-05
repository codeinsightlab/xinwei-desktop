import { ref } from 'vue';
import { defaultConfig } from '../domain/model';
import type { Preferences } from '../domain/model';
import { desktop } from '../platform/desktop';
export const config=ref(defaultConfig());
export const notice=ref('');
export const recoveryRequired=ref(false);
export const trayAvailable=ref(true);
export const loaded=ref(false);
export const appVersion=ref('读取中');
export async function loadAppVersion(){
  try{appVersion.value=await desktop.version();}
  catch(error){appVersion.value='未知版本';console.warn('无法读取实际应用版本',error);}
}
export async function reload() {
  const result=await desktop.load();config.value=result.config;
  recoveryRequired.value=result.recoveryRequired;trayAvailable.value=result.trayAvailable;
  if (result.notice) notice.value=result.notice;
  loaded.value=true;
}
export async function preference(key:keyof Preferences,value:boolean) {
  try {config.value=await desktop.preference(key,value);} catch(e) {notice.value=String(e);}
}
