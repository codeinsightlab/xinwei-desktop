import { test, expect } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';
import { newLedger, ruleSnapshot } from '../../src/domain/engagement-money';

test('record buttons open their settings pages without a widget dialog', async ({ page }) => {
  await page.goto('/?preview=working');
  await page.getByRole('button', { name: '今日明细', exact: true }).click();
  await expect(page).toHaveURL(/view=settings.*section=today/);
  await expect(page.getByRole('heading', {name:'今日明细',exact:true})).toBeVisible();
  await expect(page.locator('.day-facts')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '本月记录', exact: true }).click();
  await page.locator('.record-entry summary').first().click();
  await expect(page.locator('.record-entry').first()).toHaveAttribute('open', '');
  await page.getByRole('heading', {name:'本月记录',exact:true}).click();
  await expect(page.locator('.work-records')).toBeVisible();
});

test('direct privacy control synchronizes and fun feedback preserves widget geometry', async ({ page, context }) => {
  // Use ordinary storage, so separate browser windows share the preference transaction.
  await page.clock.setFixedTime(new Date('2026-11-03T09:10:00+08:00'));
  await page.goto('/?view=settings');
  await page.locator('#salary').fill('16800');
  await page.getByRole('button', { name: '开始看看', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '开始看看', exact: true }).click();
  await page.getByRole('button', { name: '开工', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const settings = await context.newPage();
  await settings.clock.setFixedTime(new Date('2026-11-03T09:10:00+08:00'));
  await settings.goto('/?view=settings');
  await settings.getByRole('button', { name: '桌面偏好', exact: true }).click();
  const before = await page.locator('.mascot-tap').boundingBox();
  const controls = await page.locator('.engagement-controls').boundingBox();
  await page.locator('.widget').screenshot({ path: 'artifacts/widget-normal.png' });
  await settings.getByRole('checkbox', { name: /趣味反馈/ }).uncheck();
  await expect(page.getByRole('button', { name: '和薪慰说句话' })).toBeDisabled();
  expect(await page.locator('.mascot-tap').boundingBox()).toEqual(before);
  expect(await page.locator('.engagement-controls').boundingBox()).toEqual(controls);
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await expect(page.getByRole('button', { name: '显示金额', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('checkbox', { name: /隐藏金额/ })).toBeChecked();
  await page.locator('.widget').screenshot({ path: 'artifacts/widget-private.png' });
  await settings.getByRole('checkbox', { name: /趣味反馈/ }).check();
  await expect(page.getByRole('button', { name: '和薪慰说句话' })).toBeEnabled();
  expect(await page.locator('.mascot-tap').boundingBox()).toEqual(before);
});

test('confirmation panels do not dismiss or commit on a content click', async ({ page }) => {
  await page.goto('/?preview=pending');
  await page.getByRole('button', { name: /天待收尾/ }).click();
  await page.getByRole('dialog').getByRole('heading').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('大概的收工时间')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /天待收尾/ })).toBeVisible();
});

test('closing the initial setup hides it rather than calling quit', async ({ page }) => {
  await page.goto('/?view=settings');
  await page.locator('#salary').waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('request-close')));
  await expect(page.getByRole('button', { name: /设置工资/ })).toBeVisible();
});

test('schedule boundaries update status without unsolicited interaction dialogs', async ({ page }) => {
  const config = defaultConfig();
  config.profile = defaultProfile();
  config.engagement = newLedger(Date.parse('2026-11-03T09:00:00+08:00'));
  config.engagement.days['2026-11-03'] = {
    workDate: '2026-11-03', firstStartedAt: Date.parse('2026-11-03T09:00:00+08:00'), endedAt: null,
    state: 'ACTIVE', source: 'USER', snapshot: ruleSnapshot(config, '2026-11-03', config.engagement.policy),
    lateSeconds: 0, chargedMinutes: 0, deductionMinor: 0, estimatedEnd: false, revision: 1,
  };
  await page.addInitScript(config => localStorage.setItem('xinwei-preview-v1', JSON.stringify(config)), config);
  await page.clock.setFixedTime(new Date('2026-11-03T11:59:59+08:00'));
  await page.goto('/');
  await expect(page.locator('.work-status')).toHaveText('计数中');
  for (const [time, status] of [['12:00:01', '午休中'], ['13:00:01', '计数中'], ['18:00:01', '晚收工中']]) {
    await page.clock.setFixedTime(new Date(`2026-11-03T${time}+08:00`));
    await expect(page.locator('.work-status')).toHaveText(status!);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
