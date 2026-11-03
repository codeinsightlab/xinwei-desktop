import { test, expect } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';
async function seed(page:import('@playwright/test').Page){
  const c=defaultConfig();c.profile=defaultProfile();
  await page.addInitScript(c=>{if(!localStorage.getItem('xinwei-preview-v1'))localStorage.setItem('xinwei-preview-v1',JSON.stringify(c));},c);
}
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-11-03T10:30:00+08:00')});await page.clock.setFixedTime(new Date('2026-11-03T10:30:00+08:00'));});
test('onboarding, exact current amount and return to settings',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?view=settings');await expect(page.getByRole('heading',{name:'工资与作息'})).toBeVisible();
  await page.locator('#salary').fill('16800');
  await page.getByRole('button',{name:'开始看看',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toContainText('950.00');
  await dialog.getByRole('button',{name:'开始看看',exact:true}).click();
  await expect(page.locator('.salary')).toContainText('150.00');
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.locator('#salary')).toHaveValue('16800.00');await expect(page.locator('.settings-context')).toContainText('950.00');expect(errors).toEqual([]);
});
test('privacy hides all displayed monetary information and persists',async({page})=>{
  await seed(page);await page.goto('/');await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('button',{name:'隐藏金额',exact:true}).click();await expect(page.locator('.salary')).toContainText('••••••');
  await expect(page.locator('.widget')).not.toContainText('0.0278');await page.reload();await expect(page.locator('.salary')).toContainText('••••••');
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.locator('#salary')).toHaveValue('');
  await page.getByRole('button',{name:'预览修改',exact:true}).click();await expect(page.getByRole('dialog')).not.toContainText('950.00');
  await page.getByRole('button',{name:'继续修改'}).click();await page.getByRole('button',{name:'关于薪慰',exact:true}).click();await expect(page.locator('.calculation-facts')).not.toContainText('100.00');
});
test('calendar reallocation preview and cancel retain persisted rule',async({page})=>{
  await seed(page);await page.goto('/?view=settings');await page.getByRole('button',{name:'本月日历',exact:true}).click();
  await page.getByRole('button',{name:'2026-11-07 休息日',exact:true}).click();await page.getByRole('button',{name:'设为工作日',exact:true}).click();
  await page.getByRole('button',{name:'预览修改'}).click();await expect(page.getByRole('dialog')).toContainText('906.82');
  await page.getByRole('button',{name:'继续修改'}).click();await page.getByRole('button',{name:'回到小窗'}).click();await expect(page.getByRole('dialog')).toContainText('放弃未保存');
  await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
  // First close hint is shown before returning to widget.
  await page.getByRole('button',{name:'知道了，隐藏窗口'}).click();await expect(page.locator('.salary')).toContainText('150.00');
});
test('invalid input and keyboard dialog handling',async({page})=>{
  await page.goto('/?view=settings');await page.locator('#salary').fill('1e8');await page.getByRole('button',{name:'开始看看',exact:true}).click();await expect(page.locator('.field-error')).toContainText('合法金额');
  await page.locator('#salary').fill('10000');await page.getByRole('button',{name:'开始看看',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('cross-month edit discards only old month calendar draft',async({page})=>{
  await seed(page);await page.goto('/?view=settings');await page.locator('#salary').fill('20000');await page.getByRole('button',{name:'本月日历',exact:true}).click();
  await page.getByRole('button',{name:'2026-11-07 休息日',exact:true}).click();await page.getByRole('button',{name:'设为工作日',exact:true}).click();
  await page.clock.setFixedTime(new Date('2026-12-01T10:30:00+08:00'));await expect(page.getByRole('status')).toContainText('旧月未保存的日历修改已放弃');
  await page.getByRole('button',{name:'工资与作息',exact:true}).click();await expect(page.locator('#salary')).toHaveValue('20000');
  await page.getByRole('button',{name:'预览修改'}).click();await page.getByRole('button',{name:'保存并重算本月'}).click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('xinwei-preview-v1')!));expect(stored.profile.amountMinor).toBe(2000000);expect(stored.overrides['2026-11-07']).toBeUndefined();
});
