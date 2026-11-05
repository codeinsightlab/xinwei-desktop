import { test, expect, type Page } from '@playwright/test';
import { clone, defaultConfig, defaultProfile } from '../../src/domain/model';
import { newLedger, ruleSnapshot } from '../../src/domain/engagement-money';

const at=(time:string)=>new Date(`2026-11-04T${time}+08:00`);
const key='xinwei-preview-v1';
function fixture(hidden=false){
  const c=defaultConfig();
  c.profile={...defaultProfile(),start:450,end:870,breakStart:690,breakEnd:750};
  c.preferences.privacyMode=hidden;c.preferences.showFunText=false;
  c.engagement=newLedger(at('07:40:00').getTime());
  c.engagement.lastSeenDate='2026-11-04';
  c.engagement.policy={mode:'PER_MINUTE',graceMinutes:0,perMinuteMinor:100};
  c.engagement.days['2026-11-04']={workDate:'2026-11-04',state:'ACTIVE',source:'USER',
    firstStartedAt:at('07:40:00').getTime(),endedAt:null,revision:1,estimatedEnd:false,
    lateSeconds:600,chargedMinutes:10,deductionMinor:1000,
    snapshot:ruleSnapshot(c,'2026-11-04',c.engagement.policy)};
  c.profile.end=990; // Existing saved settings already say 16:30.
  return c;
}
const stored=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);

for(const hidden of [false,true])test(`confirm existing 16:30 setting updates today and both windows (privacy=${hidden})`,async({page,context})=>{
  const config=fixture(hidden),original=clone(config.engagement!);
  await page.addInitScript(({config,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(config));},{config,key});
  await page.clock.setFixedTime(at('13:20:00'));await page.goto('/?view=settings');
  const widget=await context.newPage();await widget.clock.setFixedTime(at('13:20:00'));await widget.goto('/');
  await expect(widget.locator('.widget-status-row')).toContainText('14:30');
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  const quote=page.locator('.today-change');
  await expect(quote.getByRole('checkbox')).toBeChecked();
  await expect(quote).toContainText('2026-11-04');
  await expect(quote).toContainText('12:30–14:30 → 07:30–11:30、12:30–16:30');
  await expect(page.getByRole('dialog')).toContainText('今天按上述预览更新，其余记录保留');
  if(hidden){await expect(quote).toContainText('¥ •••••• → ¥ ••••••');await expect(quote).not.toContainText(/¥\s*\d/);}
  await page.getByRole('dialog').screenshot({path:`artifacts/today-settings-${hidden?'private':'normal'}.png`});
  await page.keyboard.press('Escape');
  expect((await stored(page)).engagement).toEqual(original);
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved=await stored(page),day=saved.engagement.days['2026-11-04'];
  expect(day.snapshot.intervals.at(-1).end).toBe(at('16:30:00').getTime()/1000);
  expect(day.firstStartedAt).toBe(original.days['2026-11-04']!.firstStartedAt);
  expect(day.deductionMinor).toBe(1000);expect(day.chargedMinutes).toBe(10);expect(day.revision).toBe(2);
  expect(saved.engagement.receipts).toEqual(original.receipts);
  await expect(widget.locator('.widget-status-row')).toContainText('16:30');
  await widget.reload();await expect(widget.locator('.widget-status-row')).toContainText('16:30');
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  await expect(page.locator('.today-change')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置',exact:true}).click();
  expect((await stored(page)).engagement.days['2026-11-04']).toEqual(day);
});

test('editing 14:30 to 16:30 takes effect today and keeps the lunch pause',async({page})=>{
  const config=fixture();config.profile!.end=870;
  await page.addInitScript(({config,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(config));},{config,key});
  await page.clock.setFixedTime(at('11:29:59'));await page.goto('/?view=settings');
  await page.getByLabel('下班时间',{exact:true}).fill('16:30');
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  await expect(page.locator('.today-change').getByRole('checkbox')).toBeChecked();
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('.widget-status-row')).toContainText('16:30');
  await page.clock.setFixedTime(at('11:30:00'));
  await expect(page.locator('.work-status')).toHaveText('午休中');
  const amount=await page.locator('.salary .amount-accessible').innerText();
  await page.clock.setFixedTime(at('12:29:59'));
  await expect(page.locator('.work-status')).toHaveText('午休中');
  await expect(page.locator('.salary .amount-accessible')).toHaveText(amount);
  await page.clock.setFixedTime(at('12:31:00'));
  await expect(page.locator('.work-status')).toHaveText('计数中');
  await expect(page.locator('.salary .amount-accessible')).not.toHaveText(amount);
  await page.clock.setFixedTime(at('14:31:00'));
  await expect(page.locator('.work-status')).toHaveText('计数中');
});

test('opt out preserves today; concurrent changes and midnight reject the old preview',async({page,context})=>{
  const config=fixture();
  await page.addInitScript(({config,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(config));},{config,key});
  await page.clock.setFixedTime(at('13:20:00'));await page.goto('/?view=settings');
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  await page.locator('.today-change').getByRole('checkbox').uncheck();
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置',exact:true}).click();
  expect((await stored(page)).engagement).toEqual(config.engagement);
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  const widget=await context.newPage();await widget.clock.setFixedTime(at('13:20:00'));await widget.goto('/');
  await widget.getByRole('button',{name:'隐藏金额',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('配置已更新');
  expect((await stored(page)).engagement).toEqual(config.engagement);
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  await page.clock.setFixedTime(new Date('2026-11-05T00:00:01+08:00'));
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('日期已变化');
  expect((await stored(page)).engagement).toEqual(config.engagement);
});
