import { ref } from 'vue';
import { defaultConfig } from '../domain/model';
import type { Preferences } from '../domain/model';
import { desktop } from '../platform/desktop';
export const config=ref(defaultConfig());
export const notice=ref('');
export const recoveryRequired=ref(false);
export const trayAvailable=ref(true);
export const loaded=ref(false);
export async function reload() {
  const result=await desktop.load();config.value=result.config;
  recoveryRequired.value=result.recoveryRequired;trayAvailable.value=result.trayAvailable;
  if (result.notice) notice.value=result.notice;
  loaded.value=true;
}
export async function preference(key:keyof Preferences,value:boolean) {
  try {config.value=await desktop.preference(key,value);} catch(e) {notice.value=String(e);}
}
