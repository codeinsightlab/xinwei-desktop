import { test, expect } from '@playwright/test';

test('outside clicks dismiss only the menu and still reach the clicked control', async ({ page }) => {
  await page.goto('/?preview=working');
  const trigger = page.getByRole('button', { name: '更多操作', exact: true });
  const menu = page.locator('.widget-menu');
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.locator('.earning-label').click({ position: { x: 4, y: 4 } });
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.widget')).toBeVisible();
  await trigger.click();
  await page.locator('.privacy-toggle svg').click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: '显示金额', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await trigger.click();
  await page.getByRole('button', { name: '今日明细', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '今日明细', exact: true })).toBeVisible();
});

test('trigger toggles cleanly and inside clicks preserve menu actions', async ({ page }) => {
  await page.goto('/?preview=working');
  const trigger = page.getByRole('button', { name: '更多操作', exact: true });
  const menu = page.locator('.widget-menu');
  await trigger.click();
  await trigger.click();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu.click({ position: { x: 1, y: 1 } });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '取消置顶', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await expect(menu.getByRole('button', { name: '置顶小窗', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工资与作息', exact: true })).toBeVisible();
});

test('blur, native blur/visibility signals, focus leaving and Escape dismiss the menu', async ({ page }) => {
  await page.goto('/?preview=working');
  const trigger = page.getByRole('button', { name: '更多操作', exact: true });
  const menu = page.locator('.widget-menu');
  for (const event of ['blur', 'widget-blur', 'widget-visibility-changed']) {
    await trigger.click();
    await expect(menu).toBeVisible();
    // Explicit bridge/browser event fixtures, not native OS focus evidence.
    await page.evaluate(event => window.dispatchEvent(new Event(event)), event);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.widget')).toBeVisible();
  }
  await trigger.click();
  await page.getByRole('button', { name: '今日明细', exact: true }).focus();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
