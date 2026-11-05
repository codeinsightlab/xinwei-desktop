import { test, expect } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';
import { newLedger, ruleSnapshot } from '../../src/domain/engagement-money';

for (const hidden of [false, true]) {
  test(`frozen schedule remains visible and lunch pauses money (privacy=${hidden})`, async ({ page }) => {
    const at = (time: string) => new Date(`2026-11-04T${time}+08:00`);
    const config = defaultConfig();
    config.profile = { ...defaultProfile(), start:450, end:870, breakStart:690, breakEnd:750 };
    config.preferences.privacyMode = hidden;
    config.preferences.showFunText = false;
    config.engagement = newLedger(at('07:30:00').getTime());
    config.engagement.days['2026-11-04'] = {
      workDate:'2026-11-04', firstStartedAt:at('07:30:00').getTime(), endedAt:null,
      state:'ACTIVE', source:'USER', snapshot:ruleSnapshot(config,'2026-11-04',config.engagement.policy),
      lateSeconds:0, chargedMinutes:0, deductionMinor:0, estimatedEnd:false, revision:1,
    };
    config.profile.end = 990; // Saved future setting differs from today's frozen 14:30.
    await page.addInitScript(config => localStorage.setItem('xinwei-preview-v1', JSON.stringify(config)), config);
    await page.clock.setFixedTime(at('11:29:59'));
    await page.goto('/');
    await expect(page.locator('.widget-status-row')).toContainText('距今日 14:30 下班');
    await page.clock.setFixedTime(at('11:30:00'));
    await expect(page.locator('.work-status')).toHaveText('午休中');
    const amount = await page.locator('.salary .amount-accessible').innerText();
    const progress = await page.locator('.engagement-progress').innerHTML();
    await page.clock.setFixedTime(at('12:29:59'));
    await expect(page.locator('.work-status')).toHaveText('午休中');
    await expect(page.locator('.salary .amount-accessible')).toHaveText(amount);
    expect(await page.locator('.engagement-progress').innerHTML()).toBe(progress);
    await page.clock.setFixedTime(at('12:31:00'));
    await expect(page.locator('.work-status')).toHaveText('计数中');
    if (!hidden) await expect(page.locator('.salary .amount-accessible')).not.toHaveText(amount);
    else await expect(page.locator('.salary .amount-accessible')).toHaveText('••••••');
    await page.getByRole('button', {name:'今日明细',exact:true}).click();
    await expect(page.locator('.day-schedule')).toContainText('07:30–11:30、12:30–14:30');
    await page.locator('.work-records').screenshot({path:`artifacts/day-schedule-${hidden?'private':'normal'}.png`});
    await page.goto('/?view=settings');
    await expect(page.locator('.today-schedule')).toContainText('07:30–11:30、12:30–14:30');
    await expect(page.locator('.today-schedule')).toContainText('保存预览可同时更新今天');
  });
}
