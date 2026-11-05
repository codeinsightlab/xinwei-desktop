import { test,expect,type Page } from '@playwright/test';
import {defaultConfig,defaultProfile} from '../../src/domain/model';
import {newLedger,ruleSnapshot} from '../../src/domain/engagement-money';
const key='xinwei-preview-v1';
function fixture(){
  const c=defaultConfig();c.profile=defaultProfile();c.preferences.showFunText=false;
  c.engagement=newLedger(Date.parse('2026-11-04T09:00:00+08:00'));c.engagement.lastSeenDate='2026-11-04';
  c.engagement.days['2026-11-04']={workDate:'2026-11-04',firstStartedAt:Date.parse('2026-11-04T09:10:00+08:00'),endedAt:null,
    state:'ACTIVE',source:'USER',snapshot:ruleSnapshot(c,'2026-11-04',c.engagement.policy),lateSeconds:600,chargedMinutes:0,deductionMinor:0,estimatedEnd:false,revision:1};
  return c;
}
async function open(page:Page,hidden=false){
  const c=fixture();c.preferences.privacyMode=hidden;
  await page.addInitScript(({c,key})=>{
    localStorage.setItem(key,JSON.stringify(c));
    Object.assign(window,{quitCompleted:0});window.addEventListener('preview-quit-completed',()=>{(window as any).quitCompleted++;});
  },{c,key});
  await page.clock.setFixedTime(new Date('2026-11-04T13:20:00+08:00'));
  await page.goto('/?view=settings');await expect(page.locator('#salary')).toBeVisible();return c;
}
const quit=(page:Page)=>page.evaluate(async()=>{const path='/src/platform/desktop.ts';const{desktop}=await import(path);await desktop.quit();});
const completed=(page:Page)=>page.evaluate(()=>(window as any).quitCompleted);
const stored=(page:Page)=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key);
async function chooseSave(page:Page){await quit(page);await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();}

test('no draft exits once without confirmation, repeated requests share one transaction',async({page})=>{
  const initial=await open(page);await Promise.all([quit(page),quit(page),quit(page)]);
  await expect.poll(()=>completed(page)).toBe(1);await expect(page.getByRole('dialog')).toHaveCount(0);
  await quit(page);expect(await completed(page)).toBe(1);
  expect((await stored(page)).engagement).toEqual(initial.engagement);
});
test('draft cancellation rearms protection; discard exits once without changing saved facts',async({page})=>{
  const initial=await open(page);await page.locator('#salary').fill('20000');await quit(page);
  await expect(page.getByRole('dialog')).toContainText('退出前处理未保存的修改');
  await Promise.all([quit(page),quit(page)]);await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('#salary')).toHaveValue('20000');expect(await completed(page)).toBe(0);
  await quit(page);await page.getByRole('dialog').getByRole('button',{name:'放弃修改并退出'}).click();
  await expect.poll(()=>completed(page)).toBe(1);expect(await stored(page)).toEqual(initial);
});
for(const hidden of [false,true])test(`save and quit requires the existing dated recalculation preview (privacy=${hidden})`,async({page})=>{
  const initial=await open(page,hidden);await page.getByLabel('下班时间',{exact:true}).fill('16:30');await chooseSave(page);
  await expect(page.getByRole('dialog')).toContainText('确认新设置');await expect(page.locator('.today-change')).toContainText('2026-11-04');
  if(hidden)await expect(page.locator('.today-change')).toContainText('¥ •••••• → ¥ ••••••');
  expect(await completed(page)).toBe(0);
  await page.getByRole('dialog').getByRole('button',{name:'继续修改'}).click();
  expect(await completed(page)).toBe(0);await expect(page.getByLabel('下班时间',{exact:true})).toHaveValue('16:30');
  await chooseSave(page);await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();
  await expect.poll(()=>completed(page)).toBe(1);
  const day=(await stored(page)).engagement.days['2026-11-04'];
  expect(day.state).toBe('ACTIVE');expect(day.endedAt).toBeNull();expect(day.firstStartedAt).toBe(initial.engagement!.days['2026-11-04']!.firstStartedAt);
  expect(day.snapshot.intervals.at(-1).end).toBe(Date.parse('2026-11-04T16:30:00+08:00')/1000);
  expect(day.deductionMinor).toBe(0);expect((await stored(page)).engagement.receipts).toEqual(initial.engagement!.receipts);
});
test('invalid salary and invalid policy keep drafts and cancel exit',async({page})=>{
  const initial=await open(page);await page.locator('#salary').fill('invalid');await chooseSave(page);
  await expect(page.locator('.field-error')).toBeVisible();expect(await completed(page)).toBe(0);
  await expect(page.locator('#salary')).toHaveValue('invalid');
  await page.locator('#salary').fill('16800.00');await page.getByRole('button',{name:'开工约定',exact:true}).click();
  await page.locator('#grace-minutes').fill('99');await chooseSave(page);
  await expect(page.locator('.field-error')).toContainText('0 到 60');expect(await completed(page)).toBe(0);
  expect(await stored(page)).toEqual(initial);
});
test('write failure retains draft; concurrent revision rejects the quote and never exits',async({page})=>{
  const initial=await open(page);await page.locator('#salary').fill('20000');await chooseSave(page);
  await page.evaluate(key=>{
    const original=Storage.prototype.setItem;
    (window as any).restoreStorage=()=>{Storage.prototype.setItem=original;};
    Storage.prototype.setItem=function(k,v){if(k===key)throw Error('fixture: disk unavailable');original.call(this,k,v);};
  },key);
  await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('disk unavailable');await expect(page.locator('#salary')).toHaveValue('20000');expect(await completed(page)).toBe(0);
  await page.evaluate(()=>(window as any).restoreStorage());await chooseSave(page);
  await page.evaluate(key=>{const c=JSON.parse(localStorage.getItem(key)!);c.revision++;c.preferences.privacyMode=true;localStorage.setItem(key,JSON.stringify(c));window.dispatchEvent(new Event('preview-config-changed'));},key);
  await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('配置已更新');expect(await completed(page)).toBe(0);
  expect((await stored(page)).engagement).toEqual(initial.engagement);await expect(page.locator('#salary')).toHaveAttribute('readonly','');
});
test('exit waits for a pending write and a policy-only draft saves before exiting',async({page})=>{
  await open(page);await page.getByRole('button',{name:'开工约定',exact:true}).click();await page.locator('#grace-minutes').fill('5');
  await page.evaluate(async()=>{const path='/src/application/activity.ts';const{trackWrite}=await import(path);void trackWrite(()=>new Promise<void>(resolve=>(window as any).finishWrite=resolve));});
  await quit(page);await page.waitForTimeout(50);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await completed(page)).toBe(0);
  await page.evaluate(()=>(window as any).finishWrite());await expect(page.getByRole('dialog')).toContainText('退出前处理未保存的修改');
  await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();
  await expect.poll(()=>completed(page)).toBe(1);expect((await stored(page)).engagement.policy.graceMinutes).toBe(5);
});

test('salary and policy drafts both commit before exit without changing the first deduction',async({page})=>{
  const initial=await open(page);await page.getByRole('button',{name:'开工约定',exact:true}).click();await page.locator('#grace-minutes').fill('5');
  await page.getByRole('button',{name:'工资与作息',exact:true}).click();await page.locator('#salary').fill('20000');await chooseSave(page);
  await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();await expect.poll(()=>completed(page)).toBe(1);
  const saved=await stored(page);expect(saved.profile.amountMinor).toBe(2000000);expect(saved.engagement.policy.graceMinutes).toBe(5);
  expect(saved.engagement.days['2026-11-04'].snapshot.policy).toEqual(initial.engagement!.days['2026-11-04']!.snapshot.policy);
  expect(saved.engagement.days['2026-11-04'].deductionMinor).toBe(0);
});

test('saving first-time setup during exit does not activate a day or show the widget',async({page})=>{
  await page.addInitScript(()=>{Object.assign(window,{quitCompleted:0});window.addEventListener('preview-quit-completed',()=>{(window as any).quitCompleted++;});});
  await page.goto('/?view=settings');await page.locator('#salary').fill('16800');await chooseSave(page);
  await page.getByRole('dialog').getByRole('button',{name:'保存并退出',exact:true}).click();await expect.poll(()=>completed(page)).toBe(1);
  expect(Object.keys((await stored(page)).engagement?.days??{})).toEqual([]);expect(new URL(page.url()).searchParams.get('view')).toBe('settings');
});
