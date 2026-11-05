import { ref, watch } from 'vue';
import { desktop } from '../platform/desktop';
import { loaded,notice } from './state';
import { pendingWrites,quitId,quitPreparing,waitForWrites } from './activity';
import { QuitParticipant } from './quit-participant';
export {quitId,quitPreparing};
export const settingsContext=ref({dirty:false,busy:false,modal:false});
let owner:((id:number)=>void)|undefined;
export function registerQuitOwner(fn:(id:number)=>void){owner=fn;return()=>{if(owner===fn)owner=undefined;};}
let participant:QuitParticipant|undefined;
export async function approveQuit(){await participant?.approve();}
export async function cancelQuit(message?:string){await participant?.cancel(message);}
export async function startLifecycle(role:'widget'|'settings'){
  const report=()=>desktop.reportContext({ready:loaded.value && (role!=='settings'||!!owner),dirty:role==='settings'&&settingsContext.value.dirty,
    modal:role==='settings'&&settingsContext.value.modal,busy:!!pendingWrites.value || (role==='settings'&&settingsContext.value.busy)}).catch(e=>console.warn('窗口上下文上报失败',e));
  participant=new QuitParticipant({
    wait:async()=>{const start=performance.now();while(!loaded.value || (role==='settings'&&!owner)){
      if(performance.now()-start>5_000)throw Error('窗口尚未就绪，已取消退出。');await new Promise(resolve=>setTimeout(resolve,20));
    }await waitForWrites();},
    dirty:()=>role==='settings'&&settingsContext.value.dirty,
    freeze:(id,preparing)=>{quitId.value=id;quitPreparing.value=preparing;void report();},
    ready:(id,dirty)=>desktop.quitReady(id,dirty), review:id=>owner?.(id),
    resolve:id=>desktop.resolveQuit(id,true),cancel:(id,message)=>desktop.cancelQuit(id,message),
  });
  const stops=await Promise.all([
    desktop.on<{id:number}>('prepare-quit',event=>{void participant?.prepare(event.id);}),
    desktop.on<{id:number}>('review-quit',event=>participant?.review(event.id)),
    desktop.on<{id:number;message:string}>('quit-cancelled',event=>{participant?.release(event.id);if(event.message)notice.value=event.message;}),
    desktop.on('platform-changed',()=>{void desktop.refreshPlatform().catch(e=>console.warn('平台能力刷新失败',e));}),
  ]);
  const stopWatch=watch([settingsContext,pendingWrites,loaded],()=>{void report();},{deep:true,immediate:true});
  const heartbeat=setInterval(()=>{if(quitId.value!==undefined)void report();},1_000);
  return()=>{stops.forEach(stop=>stop());stopWatch();clearInterval(heartbeat);participant=undefined;};
}
