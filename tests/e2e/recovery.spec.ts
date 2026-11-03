import { test, expect } from '@playwright/test';

test('returning users can reply, explicitly preview catchup, and undo that batch', async({page})=>{
  await page.goto('/?preview=return');
  await page.getByRole('button',{name:/欢迎回来，聊两句/}).click();
  await page.getByRole('button',{name:'状态不太好',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText(/按自己的节奏|照顾自己|不催你/);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/天可补看/}).click();
  const preview=page.getByRole('dialog');
  await expect(preview).toContainText('按当前工资与作息估算');
  await expect(preview.getByRole('checkbox')).toHaveCount(3);
  await preview.getByRole('button',{name:'确认补算'}).click();
  await expect(page.getByRole('dialog')).toContainText('补算已保存');
  await page.getByRole('button',{name:'撤销本批补算'}).click();
  await expect(page.locator('.record-day')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'开工',exact:true})).toBeVisible();
});

test('the user can settle a previous day while keeping today unopened', async({page})=>{
  await page.goto('/?preview=pending');
  await page.getByRole('button',{name:/天待收尾/}).click();
  await page.getByLabel('大概的收工时间').fill('19:34:00');
  await page.getByRole('button',{name:'用所选时间'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'本月记录',exact:true}).click();
  await page.locator('.record-day>summary').first().click();
  await expect(page.getByRole('dialog')).toContainText('94 分钟');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'开工',exact:true})).toBeVisible();
});

test('failed storage keeps both an unopened day and an unsaved policy draft', async({page})=>{
  await page.goto('/?preview=save-failure');
  await page.getByRole('button',{name:'开工',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('写入配置失败');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'开工',exact:true})).toBeVisible();
  await page.goto('/?view=settings&preview=save-failure');
  await page.getByRole('button',{name:'开工约定',exact:true}).click();
  await page.getByLabel('迟到扣减方式').selectOption('PER_MINUTE');
  await page.getByLabel('每分钟扣减（元）').fill('4.21');
  await page.getByRole('button',{name:'保存开工约定'}).click();
  await expect(page.locator('.policy-settings')).toContainText('写入配置失败');
  await expect(page.getByLabel('每分钟扣减（元）')).toHaveValue('4.21');
  await expect(page.locator('.policy-feedback')).toHaveCount(0);
});
