import { test, expect, type Page } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';

const key = 'xinwei-preview-v1';
const moment = (time:string, date='2026-11-03') => new Date(date+'T'+time+':00+08:00');
async function seed(page:Page, paid=false) {
  const c=defaultConfig();
  c.profile=defaultProfile();
  c.preferences.closeHintSeen=true;
  if(paid) c.engagement={
    version:1,firstUsedDate:'2026-11-02',policy:{mode:'PER_MINUTE',graceMinutes:0,perMinuteMinor:100},
    days:{},receipts:{},batches:{}
  };
  await page.addInitScript(({key,c})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(c));
  },{key,c});
}
const stored = (page:Page)=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key);
test.beforeEach(async({page})=>{await page.clock.setFixedTime(moment('09:10'));});

test('setting up a salary leaves the day unopened until the explicit start',async({page})=>{
  await page.goto('/?view=settings');
  await page.locator('#salary').fill('16800');
  await page.getByRole('button',{name:'开始看看',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'开始看看',exact:true}).click();
  await expect(page.getByRole('button',{name:'开工',exact:true})).toBeVisible();
  expect(Object.keys((await stored(page)).engagement?.days||{})).toEqual([]);
  await page.getByRole('button',{name:'开工',exact:true}).click();
  await expect(page.locator('.widget')).toContainText('16.66');
  await page.reload();
  await expect(page.getByRole('button',{name:'收工',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('concurrent start writes and announces one event, restart preserves the deduction',async({page,context})=>{
  await seed(page,true);
  await page.goto('/');
  const other=await context.newPage();
  await other.clock.setFixedTime(moment('09:10'));
  await other.goto('/');
  const buttons=[page,other].map(p=>p.getByRole('button',{name:'开工',exact:true}));
  await Promise.all(buttons.map(b=>expect(b).toBeVisible()));
  await Promise.all(buttons.map(b=>b.evaluate(el=>(el as HTMLButtonElement).click())));
  await expect.poll(async()=>(await stored(page)).engagement.days['2026-11-03']?.deductionMinor).toBe(1000);
  await expect.poll(async()=>(await page.getByRole('dialog').count())+(await other.getByRole('dialog').count())).toBe(1);
  expect(Object.keys((await stored(page)).engagement.days)).toEqual(['2026-11-03']);
  const loser=(await page.getByRole('dialog').count())?other:page;
  await expect(loser.locator('.widget')).toContainText('6.66');
  await loser.reload();
  await expect(loser.getByRole('dialog')).toHaveCount(0);
  await loser.clock.setFixedTime(moment('18:47'));
  await loser.getByRole('button',{name:'收工',exact:true}).click();
  await expect(loser.getByRole('dialog')).toContainText('47');
  const day=(await stored(loser)).engagement.days['2026-11-03'];
  expect(day.state).toBe('CLOSED');expect(day.deductionMinor).toBe(1000);
});

test('privacy is shared between windows and the policy editor conceals its amount',async({page,context})=>{
  await seed(page,true);await page.goto('/');
  const settings=await context.newPage();await settings.clock.setFixedTime(moment('09:10'));
  await settings.goto('/?view=settings');
  await settings.getByRole('button',{name:'桌面偏好',exact:true}).click();
  await settings.getByRole('checkbox',{name:/隐藏金额/}).check();
  await page.getByRole('button',{name:'开工',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.widget')).not.toContainText(/16\.66|6\.66|10\.00/);
  await expect(page.locator('.rolling-digit')).toHaveCount(0);
  const attrs=await page.locator('[aria-label],[title]').evaluateAll(nodes=>nodes.map(n=>[n.getAttribute('aria-label'),n.getAttribute('title')]).flat().join(' '));
  expect(attrs).not.toMatch(/16\.66|6\.66|10\.00/);
  await settings.getByRole('button',{name:'工资与作息',exact:true}).click();
  await expect(settings.locator('#salary')).toHaveValue('');
  await settings.getByRole('button',{name:'开工约定',exact:true}).click();
  await expect(settings.locator('main')).not.toContainText('¥1.00');
});

test('calendar drafts can be cancelled, invalid input preserves the saved profile',async({page})=>{
  await seed(page);await page.goto('/?view=settings');
  await page.getByRole('button',{name:'本月日历',exact:true}).click();
  await page.getByRole('button',{name:'2026-11-07 休息日',exact:true}).click();
  await page.getByRole('button',{name:'设为工作日',exact:true}).click();
  await page.getByRole('button',{name:'预览修改'}).click();
  await expect(page.getByRole('dialog')).toContainText('176');
  await page.keyboard.press('Escape');
  expect((await stored(page)).overrides).toEqual({});
  await page.getByRole('button',{name:'工资与作息',exact:true}).click();
  await page.locator('#salary').fill('1e8');
  await page.getByRole('button',{name:'预览修改'}).click();
  await expect(page.locator('.field-error')).toBeVisible();
  expect((await stored(page)).profile.amountMinor).toBe(1680000);
});

test('month rollover preserves the salary draft and expires only the old calendar draft',async({page})=>{
  await seed(page);await page.goto('/?view=settings');await page.locator('#salary').fill('20000');
  await page.getByRole('button',{name:'本月日历',exact:true}).click();
  await page.getByRole('button',{name:'2026-11-07 休息日',exact:true}).click();await page.getByRole('button',{name:'设为工作日',exact:true}).click();
  await page.clock.setFixedTime(moment('10:30','2026-12-01'));
  await expect(page.getByRole('status')).toContainText('旧月');
  await page.getByRole('button',{name:'工资与作息',exact:true}).click();await expect(page.locator('#salary')).toHaveValue('20000');
  await page.getByRole('button',{name:'预览修改'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'保存新设置'}).click();
  await expect.poll(async()=>(await stored(page)).profile.amountMinor).toBe(2000000);
  const saved=await stored(page);expect(saved.overrides['2026-11-07']).toBeUndefined();
});
