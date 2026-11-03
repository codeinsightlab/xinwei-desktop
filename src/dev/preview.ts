import { defaultConfig, defaultProfile } from '../domain/model';
import { clock } from '../application/clock';
import { previewState } from '../application/preview-state';
/** Development fixtures only. No writes to personal browser or desktop configuration. */
export function setupPreview(){
  const params=new URLSearchParams(location.search),mode=params.get('preview');if(!mode)return;
  const dates:Record<string,string>={working:'2026-11-03T14:30:00+08:00',lunch:'2026-11-03T12:30:00+08:00',after:'2026-11-03T18:00:00+08:00',rest:'2026-11-07T10:00:00+08:00',before:'2026-11-03T08:30:00+08:00'};
  clock.now=()=>Date.parse(dates[mode] || dates.working!);
  const c=defaultConfig();c.profile=defaultProfile();c.preferences.closeHintSeen=true;
  if(mode==='privacy')c.preferences.privacyMode=true;
  if(mode==='long')c.profile.amountMinor=9999999999;
  if(mode==='invalid')for(let n=1;n<=30;n++)c.overrides[`2026-11-${String(n).padStart(2,'0')}`]='rest';
  if(mode==='onboarding')c.profile=null;
  previewState.enabled=true;previewState.config=c;previewState.failSave=mode==='save-failure';
  const theme=params.get('theme');if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;
}
