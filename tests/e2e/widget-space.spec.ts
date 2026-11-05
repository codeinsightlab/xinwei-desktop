import { test, expect } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';
import { newLedger } from '../../src/domain/engagement-money';

for (const hidden of [false, true]) for (const theme of ['light', 'dark']) {
  test(`original-sized widget opens detailed settings records (${theme}, privacy=${hidden})`, async ({ page }) => {
    await page.setViewportSize({width:304,height:250});
    await page.goto(`/?preview=late-paid&theme=${theme}`);
    expect(await page.locator('.widget').evaluate(el=>el.getBoundingClientRect().height)).toBe(250);
    if(hidden)await page.getByRole('button',{name:'隐藏金额',exact:true}).click();
    await page.getByRole('button',{name:'开工',exact:true}).click();
    await expect(page.locator('.day-facts')).toContainText('按设置扣减');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'今日明细',exact:true}).click();
    await page.setViewportSize({width:620,height:740});
    await expect(page.getByRole('heading',{name:'今日明细',exact:true})).toBeVisible();
    await expect(page.locator('.day-schedule')).toContainText('09:00–12:00、13:00–18:00');
    await expect(page.locator('.day-facts')).toContainText('按设置扣减');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if(hidden){await expect(page.locator('.work-records')).toContainText('••••••');await expect(page.locator('.work-records')).not.toContainText('¥ 10.00');}
    await page.screenshot({path:`artifacts/settings-today-${theme}-${hidden}.png`});
    await page.getByRole('button',{name:'本月记录',exact:true}).click();
    await expect(page.locator('.record-entry')).toHaveCount(1);
    await page.locator('.record-entry summary').click();
    await expect(page.locator('.record-entry .day-facts')).toBeVisible();
    await page.screenshot({path:`artifacts/settings-records-${theme}-${hidden}.png`});
  });
}

for(const hidden of [false,true])test(`settings retain long catchup previews and undo (privacy=${hidden})`,async({page})=>{
  const c=defaultConfig();c.profile=defaultProfile();c.preferences.privacyMode=hidden;
  c.engagement=newLedger(Date.parse('2026-11-01T09:00:00+08:00'));
  await page.addInitScript(c=>localStorage.setItem('xinwei-preview-v1',JSON.stringify(c)),c);
  await page.clock.setFixedTime(new Date('2026-11-30T14:30:00+08:00'));
  await page.goto('/');await page.getByRole('button',{name:'本月记录',exact:true}).click();
  await page.setViewportSize({width:620,height:740});
  await expect(page.getByRole('heading',{name:'本月记录',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'预览补算',exact:true}).click();
  const preview=page.getByRole('region',{name:'补算预览'});
  expect(await preview.getByRole('checkbox').count()).toBeGreaterThan(15);
  if(hidden)await expect(preview).toContainText('合计 ¥ ••••••');
  expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('xinwei-preview-v1')!).engagement.days).length)).toBe(0);
  await preview.getByRole('button',{name:'确认补算',exact:true}).click();
  await expect(page.locator('.work-records')).toContainText('补算已保存');
  expect(await page.locator('.record-entry').count()).toBeGreaterThan(15);
  await page.getByRole('button',{name:'撤销最近补算',exact:true}).click();
  await expect(page.locator('.record-entry')).toHaveCount(0);
});
