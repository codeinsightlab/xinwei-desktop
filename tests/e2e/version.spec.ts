import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

test('widget and About show the current build version', async ({ page }) => {
  await page.goto('/?preview=working');
  await expect(page.locator('.app-version')).toHaveText('v' + version);
  await page.goto('/?view=settings&preview=working');
  await expect(page.locator('.sidebar-bottom')).toContainText(version);
  await page.getByRole('button', { name: '关于薪慰', exact: true }).click();
  await expect(page.locator('.about-hero .pill')).toHaveText('VERSION ' + version);
});

test('native version bridge reads the running app rather than the source version', async ({ page }) => {
  await page.goto('/?preview=working');
  await expect(page.locator('.app-version')).toHaveText('v' + version);
  const result = await page.evaluate(async () => {
    const commands: string[] = [];
    (window as unknown as {__TAURI_INTERNALS__:unknown}).__TAURI_INTERNALS__ = {
      invoke: (command: string) => { commands.push(command); return Promise.resolve('9.8.7'); },
    };
    const source = '/src/platform/desktop.ts?version-bridge-fixture';
    const { desktop } = await import(source);
    return { version: await desktop.version(), commands };
  });
  expect(result).toEqual({ version: '9.8.7', commands: ['plugin:app|version'] });
});
