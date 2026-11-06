import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

test('real client handlers: environment pause, privacy, reset scope, reduced motion and every reply',async()=>{
  // DOM integration, not a browser or OS emulation. The browser is checked separately.
  const {window,document}=parseHTML(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'));
  let now=0,hidden=false,reduced=false,animationCount=0;
  let tick=()=>{};
  let intersection:(entries:unknown[])=>void=()=>{};
  const keys=['window','document','performance','IntersectionObserver','setInterval'] as const;
  const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const set=(key:string,value:unknown)=>Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  set('window',window);set('document',document);set('performance',{now:()=>now});
  Object.defineProperty(document,'hidden',{get:()=>hidden});
  window.matchMedia=(()=>({get matches(){return reduced;}})) as typeof window.matchMedia;
  window.HTMLElement.prototype.getAnimations=()=>[];
  window.HTMLElement.prototype.animate=(()=>{animationCount++;return {cancel(){}};}) as unknown as typeof window.HTMLElement.prototype.animate;
  window.HTMLElement.prototype.focus=()=>{};
  set('setInterval',(callback:()=>void)=>{tick=callback;return 1;});
  set('IntersectionObserver',class {constructor(callback:typeof intersection){intersection=callback;}observe(){}disconnect(){}});
  const element=(selector:string)=>{const e=document.querySelector(selector);assert.ok(e,selector);return e as unknown as HTMLElement;};
  const click=(selector:string)=>element(selector).click();
  try{
    await import('../src/lib/client.ts');
    intersection([{isIntersecting:true,intersectionRatio:1}]);
    click('#demo-play');now+=10_000;tick();assert.equal(element('#money-digits').textContent,'450.27');
    hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));
    const frozen=element('#money-digits').textContent;now+=600_000;tick();assert.equal(element('#money-digits').textContent,frozen);
    hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));assert.equal(element('#play-label').textContent,'继续');
    click('#demo-play');now+=1000;tick();intersection([{isIntersecting:false,intersectionRatio:0}]);const offscreen=element('#money-digits').textContent;
    now+=600_000;tick();assert.equal(element('#money-digits').textContent,offscreen);
    intersection([{isIntersecting:true,intersectionRatio:1}]);assert.equal(element('#play-label').textContent,'继续');
    click('[data-scene="late-paid"]');click('[data-privacy]');assert.equal(element('#demo-money').getAttribute('aria-label'),'今日估算已隐藏');
    for(const value of ['1.00','16.66','10.00','6.66'])assert.ok(!element('#scene-facts').textContent!.includes(value));
    element('.faq details').setAttribute('open','');click('#demo-reset');
    assert.equal(element('[data-scene="late-paid"]').getAttribute('aria-pressed'),'true');assert.ok(element('.faq details').hasAttribute('open'));
    assert.equal(element('#demo-money').getAttribute('aria-label'),'今日估算已隐藏');
    click('#demo-finish');assert.ok(!element('#demo-feedback').textContent!.includes('450.00'));assert.equal(element('#demo-play').hidden,true);
    click('#demo-reset');click('[data-privacy]');assert.equal(element('#money-digits').textContent,'450.00');
    const {scenes}=await import('../src/content/scenarios.ts');
    for(const scene of scenes){
      click(`[data-scene="${scene.id}"]`);
      for(let i=0;i<scene.replies.length;i++){
        (element('#reply-actions').children[i] as HTMLElement).click();assert.equal(element('#scene-message').textContent,scene.replies[i]!.response);
        click('#reply-actions button');
      }
      click('#scene-skip');assert.equal(element('#scene-message').textContent,scene.skipped);
    }
    reduced=true;const animationsBefore=animationCount;click('[data-scene="late-free"]');click('#reply-actions button');
    assert.equal(animationCount,animationsBefore);assert.equal(element('#scene-message').textContent,'懂了，这事不写进年终总结。');
    reduced=false;click('[data-scene="late-paid"]');click('[data-scene="return"]');click('[data-scene="late-free"]');
    assert.equal(element('#scene-message').textContent,'碰上好人家了，迟到还不扣钱。');
    assert.equal(element('#money-digits').textContent,'450.00');
  }finally{
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});
