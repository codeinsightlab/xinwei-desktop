import { ref } from 'vue';
export const pendingWrites=ref(0);
export const quitId=ref<number>();
export const quitPreparing=ref(false);
let failures=0;
const idleListeners=new Set<()=>void>();
export function recordWriteFailure(){failures++;}
export function trackWrite<T>(work:()=>Promise<T>,important=true):Promise<T>{
  pendingWrites.value++;
  return Promise.resolve().then(work).catch(error=>{if(important)recordWriteFailure();throw error;}).finally(()=>{
    pendingWrites.value--;if(!pendingWrites.value)for(const notify of [...idleListeners])notify();
  });
}
/** Wait for actual completion, including caller microtasks. A timeout cancels exit, never forces it. */
export function waitForWrites(timeoutMs=8_000):Promise<void>{
  const baseline=failures;
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{clearTimeout(timer);idleListeners.delete(check);};
    const finish=()=>{if(settled)return;if(pendingWrites.value)return;settled=true;cleanup();failures===baseline?resolve():reject(Error('保存失败，已取消退出。请检查提示后重试。'));};
    const check=()=>{if(!pendingWrites.value)setTimeout(finish,0);};
    const timer=setTimeout(()=>{if(settled)return;settled=true;cleanup();reject(Error('保存仍未完成，已取消退出。草稿仍保留，请稍后重试。'));},timeoutMs);
    idleListeners.add(check);check();
  });
}
