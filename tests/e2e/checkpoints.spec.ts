import { test, expect, type Page } from '@playwright/test';
import { defaultConfig, defaultProfile, type Config } from '../../src/domain/model';
import { newLedger, ruleSnapshot } from '../../src/domain/engagement-money';

const storageKey = 'xinwei-preview-v1';
const at = (time: string) => Date.parse(`2026-11-03T${time}+08:00`);
const read = (page: Page): Promise<Config> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
const receipts = async (page: Page) => Object.values((await read(page)).engagement!.receipts).filter(r => r.sceneId.startsWith('checkpoint_'));
function fixture() {
  const config = defaultConfig();
  config.profile = defaultProfile();
  config.engagement = newLedger(at('09:00:00'));
  config.engagement.days['2026-11-03'] = {
    workDate: '2026-11-03', firstStartedAt: at('09:00:00'), endedAt: null,
    state: 'ACTIVE', source: 'USER', snapshot: ruleSnapshot(config, '2026-11-03', config.engagement.policy),
    lateSeconds: 0, chargedMinutes: 0, deductionMinor: 0, estimatedEnd: false, revision: 1,
  };
  return config;
}
async function open(page: Page, before = '11:59:55', config = fixture()) {
  await page.addInitScript(({ key, config }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(config));
  }, { key: storageKey, config });
  await page.clock.install({ time: at(before) - 10_000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '收工', exact: true })).toBeVisible();
  await page.clock.pauseAt(at(before));
  await page.clock.runFor(1_000);
}
async function visible(page: Page, value: boolean) {
  // Explicit browser visibility fixture; native visibility is checked by the Rust adapter.
  await page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value ? 'visible' : 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}
async function feedback(page: Page, enabled: boolean) {
  await page.evaluate(({ key, enabled }) => {
    const config = JSON.parse(localStorage.getItem(key)!);
    config.preferences.showFunText = enabled;
    config.revision++;
    localStorage.setItem(key, JSON.stringify(config));
    window.dispatchEvent(new Event('preview-config-changed'));
  }, { key: storageKey, enabled });
}

for (const [before, scene, status] of [
  ['11:59:55', 'lunch_start', '午休中'],
  ['12:59:55', 'lunch_end', '计数中'],
  ['17:59:55', 'work_end', '晚收工中'],
] as const) {
  test(`${scene}: one brief non-modal interaction preserves all work facts`, async ({ page }) => {
    const config = fixture();
    config.preferences.privacyMode = scene === 'lunch_end';
    await open(page, before, config);
    const original = (await read(page)).engagement!.days;
    await page.clock.runFor(6_000);
    await expect(page.locator('.checkpoint-card')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.work-status')).toHaveText(status);
    expect((await receipts(page)).map(r => r.sceneId)).toEqual(['checkpoint_' + scene]);
    expect((await read(page)).engagement!.days).toEqual(original);
    if (config.preferences.privacyMode) {
      await expect(page.locator('.salary-amount')).toContainText('••••••');
      await expect(page.locator('.checkpoint-card')).not.toContainText(/¥|300\.00|16,?800/);
      await page.locator('.widget').screenshot({ path: 'artifacts/checkpoint-private.png' });
    } else if (scene === 'lunch_start') {
      await page.locator('.widget').screenshot({ path: 'artifacts/checkpoint-normal.png' });
    }
    await page.clock.runFor(9_000);
    await expect(page.locator('.checkpoint-card')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: '收工', exact: true })).toBeVisible();
    await page.clock.runFor(2_000);
    await expect(page.locator('.checkpoint-card')).toHaveCount(0);
    expect(await receipts(page)).toHaveLength(1);
    expect((await read(page)).engagement!.days).toEqual(original);
  });
}

test('hidden or disabled checkpoints are skipped without replay, disabling clears a visible card', async ({ page }) => {
  await open(page);
  await visible(page, false);
  await page.clock.runFor(6_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  expect(await receipts(page)).toHaveLength(0);
  await visible(page, true);
  await page.clock.runFor(2_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  await feedback(page, false);
  await page.clock.pauseAt(at('12:59:55'));
  await page.clock.runFor(6_000);
  expect(await receipts(page)).toHaveLength(0);
  await feedback(page, true);
  await page.clock.runFor(2_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  await page.clock.pauseAt(at('17:59:55'));
  await page.clock.runFor(6_000);
  await expect(page.locator('.checkpoint-card')).toBeVisible();
  await feedback(page, false);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  expect(await receipts(page)).toHaveLength(1);
});

test('a menu or recent input is never interrupted and skipped cards are not queued', async ({ page }) => {
  await open(page, '11:58:00');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.clock.pauseAt(at('11:59:55'));
  await page.clock.runFor(6_000);
  await expect(page.locator('.widget-menu')).toBeVisible();
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.clock.runFor(2_000);
  expect(await receipts(page)).toHaveLength(0);
  await page.clock.pauseAt(at('12:59:55'));
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await page.clock.runFor(6_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  expect(await receipts(page)).toHaveLength(0);
});

test('opening late and sleep/time jumps do not backfill interactions', async ({ page }) => {
  await open(page, '12:00:10');
  await page.clock.runFor(2_000);
  await page.clock.pauseAt(at('13:00:05'));
  await page.clock.runFor(2_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  expect(await receipts(page)).toHaveLength(0);
});

test('two visible widgets share one persistent checkpoint receipt', async ({ page, context }) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  await Promise.all([page.clock.runFor(6_000), other.clock.runFor(6_000)]);
  await expect.poll(async () => (await receipts(page)).length).toBe(1);
  await expect.poll(async () => (await page.locator('.checkpoint-card').count()) + (await other.locator('.checkpoint-card').count())).toBe(1);
});

test('hiding during a pending persistence claim cannot deliver or replay a card', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    void navigator.locks.request('xinwei-config', () => new Promise<void>(resolve => {
      (window as unknown as {releaseCheckpointLock: () => void}).releaseCheckpointLock = resolve;
    }));
  });
  await page.waitForFunction(() => !!(window as unknown as {releaseCheckpointLock?: () => void}).releaseCheckpointLock);
  await page.clock.runFor(6_000);
  await visible(page, false);
  await page.evaluate(() => (window as unknown as {releaseCheckpointLock: () => void}).releaseCheckpointLock());
  await expect.poll(async () => (await receipts(page)).length).toBe(1);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  await visible(page, true);
  await page.clock.runFor(2_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
});

test('failed auxiliary persistence stays quiet and preserves the saved work facts', async ({ page }) => {
  await open(page);
  const original = (await read(page)).engagement!.days;
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw Error('fixture: checkpoint storage unavailable'); };
  });
  await page.clock.runFor(6_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await receipts(page)).toHaveLength(0);
  expect((await read(page)).engagement!.days).toEqual(original);
  await expect(page.getByRole('button', { name: '收工', exact: true })).toBeEnabled();
});

test('unknown native-style visibility fails closed without recording an interaction', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const source = '/src/platform/desktop.ts';
    const { desktop } = await import(source);
    desktop.isWidgetVisible = async () => { throw Error('fixture: visibility unknown'); };
  });
  await page.clock.runFor(6_000);
  await expect(page.locator('.checkpoint-card')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await receipts(page)).toHaveLength(0);
});
