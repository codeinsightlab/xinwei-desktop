import { computed, ref } from 'vue';
export interface PlatformInfo {
  os:'macos'|'windows'|'other'|'preview'|'unknown'; backgroundEntry:string;
  recovery:{statusItem:boolean;dock:boolean;relaunch:boolean;otherWindow:boolean};canHide:boolean;backgroundLaunch:boolean;
}
export const platformInfo=ref<PlatformInfo>({os:'unknown',backgroundEntry:'后台入口',recovery:{statusItem:false,dock:false,relaunch:false,otherWindow:false},canHide:false,backgroundLaunch:false});
export const backgroundEntry=computed(()=>platformInfo.value.backgroundEntry);
export const backgroundHelp=computed(()=>{
  const p=platformInfo.value,r=p.recovery,entries:string[]=[];
  if(r.statusItem)entries.push(p.backgroundEntry);if(r.dock)entries.push('Dock');if(r.relaunch)entries.push('再次打开薪慰');if(r.otherWindow)entries.push('另一个窗口');
  return entries.length ? `隐藏后可通过${entries.join('、')}找回。` : '当前没有可用的找回入口，请保留窗口，或明确退出薪慰。';
});
