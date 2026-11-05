import { test, expect } from '@playwright/test';

for (const platform of ['Macintosh; Intel Mac OS X', 'Windows NT 10.0; Win64; x64']) {
  test(`platform drag routing and exclusions: ${platform}`, async ({ page }) => {
    await page.goto('/?preview=working');
    await expect(page.locator('.widget-header')).toBeVisible();
    const result = await page.evaluate(async platform => {
      // Deliberately disagree with the Mac fixture: native information is authoritative.
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Windows NT 10.0)' });
      const calls: string[] = [];
      (window as unknown as {__TAURI_INTERNALS__:unknown}).__TAURI_INTERNALS__ = {
        invoke: (command: string) => {
          if(command==='platform_info')return Promise.resolve({os:platform.startsWith('Macintosh')?'macos':'windows',backgroundEntry:'fixture',recovery:{statusItem:true,dock:false,relaunch:true,otherWindow:false},canHide:true,backgroundLaunch:false});
          calls.push(command); return Promise.resolve();
        },
      };
      // Import a separate bridge instance with explicit native/OS fixtures.
      // This tests routing, not real AppKit movement.
      const source = '/src/platform/desktop.ts?drag-routing-fixture';
      const { desktop } = await import(source);
      await desktop.refreshPlatform();
      const header = document.querySelector('.widget-header')!;
      let completion = Promise.resolve();
      header.addEventListener('mousedown', event => { completion = desktop.drag(event); });
      const cancelled: boolean[] = [];
      for (const [selector, button, detail] of [
        ['.widget-header', 0, 1], ['.brand span', 0, 1], ['text-title', 0, 1],
        ['.privacy-toggle svg', 0, 1], ['.widget-actions', 0, 1],
        ['.widget-header', 2, 1], ['.widget-header', 0, 2], ['.widget-header', 0, 0],
      ] as const) {
        const event = new MouseEvent('mousedown', { button, detail, bubbles: true, cancelable: true });
        const target = selector === 'text-title' ? document.querySelector('.brand span')!.firstChild! : document.querySelector(selector)!;
        cancelled.push(!target.dispatchEvent(event));
        await completion;
      }
      return {calls, cancelled};
    }, platform);
    if (platform.startsWith('Macintosh')) {
      expect(result.calls).toEqual(['start_widget_drag', 'start_widget_drag', 'start_widget_drag', 'start_widget_drag']);
      expect(result.cancelled).toEqual([true, true, true, false, false, false, false, true]);
    } else {
      expect(result.calls).toEqual([]);
      expect(result.cancelled).toEqual([false, false, false, false, false, false, false, false]);
    }
  });
}

for (const density of [1, 2]) {
  test.describe(`widget drag region DPR ${density}`, () => {
    test.use({ deviceScaleFactor: density });

    test('the visible top padding and title belong to one drag region', async ({ page }) => {
      await page.goto('/?preview=working');
      const widget = page.locator('.widget');
      const header = page.locator('.widget-header');
      await expect(header).toHaveAttribute('data-tauri-drag-region', 'deep');
      const bounds = (await widget.boundingBox())!;
      const titlebar = (await header.boundingBox())!;
      expect(titlebar.y - bounds.y).toBeLessThanOrEqual(1);
      expect(titlebar.height).toBeGreaterThanOrEqual(48);
      for (const y of [3, 8, 25, 45]) {
        const hit = await page.evaluate(({ x, y }) => {
          return document.elementFromPoint(x, y)?.closest('.widget-header')?.getAttribute('data-tauri-drag-region');
        }, { x: bounds.x + 120, y: bounds.y + y });
        expect(hit).toBe('deep');
      }
      await expect(header.locator('.brand')).toBeVisible();
      expect(await widget.evaluate(el => el.getBoundingClientRect().height)).toBe(250);
      await expect(page.getByRole('button', { name: '收工', exact: true })).toBeVisible();
    });

    test('header SVG controls stay clickable and body controls are outside the drag region', async ({ page }) => {
      await page.goto('/?preview=working');
      await expect(page.locator('.widget-actions')).toHaveAttribute('data-tauri-drag-region', 'false');
      await page.locator('.privacy-toggle svg').click();
      await expect(page.getByRole('button', { name: '显示金额', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '更多操作', exact: true }).click();
      await expect(page.locator('.widget-menu').getByRole('button', { name: '设置', exact: true })).toBeVisible();
      expect(await page.getByRole('button', { name: '收工', exact: true }).evaluate(el => !!el.closest('[data-tauri-drag-region="deep"]'))).toBe(false);
    });
  });
}
