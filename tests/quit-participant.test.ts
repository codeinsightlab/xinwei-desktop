import { describe,it,expect,vi } from 'vitest';
import { QuitParticipant } from '../src/application/quit-participant';
import { trackWrite,waitForWrites,pendingWrites } from '../src/application/activity';
function setup(dirty=false){
  const ports={wait:vi.fn(async()=>{}),dirty:()=>dirty,freeze:vi.fn(),ready:vi.fn(async()=>{}),review:vi.fn(),resolve:vi.fn(async()=>{}),cancel:vi.fn(async()=>{})};
  return {ports,p:new QuitParticipant(ports)};
}
describe('quit participant and persistence barrier',()=>{
  it('prepares only once; no draft is acknowledged without a redundant confirmation',async()=>{
    const {p,ports}=setup();await Promise.all([p.prepare(1),p.prepare(1)]);
    expect(ports.wait).toHaveBeenCalledTimes(1);expect(ports.ready).toHaveBeenCalledExactlyOnceWith(1,false);expect(ports.review).not.toHaveBeenCalled();
  });
  it('one review, cancel then retry, stale messages cannot finish a newer transaction',async()=>{
    const {p,ports}=setup(true);await p.prepare(1);p.review(1);p.review(1);expect(ports.review).toHaveBeenCalledTimes(1);
    await p.cancel();await p.prepare(2);p.review(1);p.release(1);await p.approve();
    expect(ports.ready).toHaveBeenLastCalledWith(2,true);expect(ports.resolve).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('deduplicates concurrent approvals and waits before committing exit',async()=>{
    const {p,ports}=setup(true);await p.prepare(3);let complete!:()=>void;
    ports.wait.mockImplementationOnce(()=>new Promise<void>(resolve=>complete=resolve));
    const first=p.approve(),second=p.approve();expect(ports.resolve).not.toHaveBeenCalled();complete();await Promise.all([first,second]);
    expect(ports.resolve).toHaveBeenCalledExactlyOnceWith(3);
  });
  it('save timeout/failure cancels, never permits an exit and can retry',async()=>{
    const {p,ports}=setup(true);ports.wait.mockRejectedValueOnce(Error('保存失败'));await p.prepare(4);
    expect(ports.cancel).toHaveBeenCalled();expect(ports.ready).not.toHaveBeenCalled();expect(ports.resolve).not.toHaveBeenCalled();
    await p.prepare(5);ports.wait.mockRejectedValueOnce(Error('保存超时'));await expect(p.approve()).rejects.toThrow('超时');
    expect(ports.resolve).not.toHaveBeenCalled();
  });
  it('waits for actual pending writes, reports a failed write, and times out safely',async()=>{
    let finish!:()=>void;const write=trackWrite(()=>new Promise<void>(resolve=>finish=resolve));await Promise.resolve();
    let ready=false;const barrier=waitForWrites().then(()=>{ready=true;});await Promise.resolve();expect(ready).toBe(false);finish();await write;await barrier;expect(pendingWrites.value).toBe(0);
    let fail!:(e:Error)=>void;const bad=trackWrite(()=>new Promise<void>((_,reject)=>fail=reject));await Promise.resolve();
    const waiting=waitForWrites();const caught=bad.catch(()=>{});fail(Error('disk'));await caught;await expect(waiting).rejects.toThrow('保存失败');
    let release!:()=>void;const stuck=trackWrite(()=>new Promise<void>(resolve=>release=resolve));await Promise.resolve();
    await expect(waitForWrites(10)).rejects.toThrow('未完成');release();await stuck;
  });
  it('an auxiliary checkpoint failure does not turn a normal quit into a business save error',async()=>{
    let fail!:(e:Error)=>void;const job=trackWrite(()=>new Promise<void>((_,reject)=>fail=reject),false);await Promise.resolve();
    const idle=waitForWrites();const caught=job.catch(()=>{});fail(Error('auxiliary only'));await caught;await expect(idle).resolves.toBeUndefined();
  });
});
