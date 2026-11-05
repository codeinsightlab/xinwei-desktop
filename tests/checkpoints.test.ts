import { describe, expect, it } from 'vitest';
import { clone, defaultConfig, defaultProfile } from '../src/domain/model';
import { dayValue, interactionText, recordedMonth, reduceEngagement } from '../src/domain/engagement';
import { CheckpointObserver, checkpointTime, CHECKPOINT_COOLDOWN_MS } from '../src/domain/checkpoints';

const at = (time: string, date = '2026-11-03') => Date.parse(`${date}T${time}+08:00`);
function working() {
  const config = { ...defaultConfig(), profile: defaultProfile() };
  config.engagement = reduceEngagement(config, { type: 'start' }, at('09:00:00')).ledger;
  return config;
}

describe('计划节点互动与收入隔离', () => {
  it('三个节点按已开工快照触发，只写回执，不改日期、工作事实、快照或收入', () => {
    const config = working();
    for (const [kind, time] of [['lunch_start', '12:00:00'], ['lunch_end', '13:00:00'], ['work_end', '18:00:00']] as const) {
      const before = clone(config.engagement!);
      const value = dayValue(before.days['2026-11-03']!, at(time));
      const result = reduceEngagement(config, { type: 'checkpoint', kind }, at(time));
      expect(result.event).toMatchObject({ sceneId: 'checkpoint_' + kind, shownAt: at(time) });
      expect(result.ledger.days).toEqual(before.days);
      expect(result.ledger.lastInteractionDate).toBe(before.lastInteractionDate);
      expect(result.ledger.lastSeenDate).toBe(before.lastSeenDate);
      expect(dayValue(result.ledger.days['2026-11-03']!, at(time))).toEqual(value);
      expect(recordedMonth(result.ledger, at(time))).toBe(recordedMonth(before, at(time)));
      for (const hidden of [false, true]) {
        const copy = interactionText(result.event!, result.ledger, at(time), hidden, true);
        expect(copy.choices).toEqual([]);
        expect(copy.text).not.toMatch(/¥|16800|300\.00/);
      }
      config.engagement = result.ledger;
    }
    expect(config.engagement!.days['2026-11-03']!.state).toBe('ACTIVE');
    expect(config.engagement!.days['2026-11-03']!.endedAt).toBeNull();
  });

  it('节点回执跨刷新幂等，过期、未到时间和关闭反馈均不写记录', () => {
    const config = working();
    const claim = () => reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:01'));
    expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('11:59:59')).changed).toBe(false);
    expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:01:01')).changed).toBe(false);
    config.preferences.showFunText = false;
    expect(claim().changed).toBe(false);
    config.preferences.showFunText = true;
    config.engagement = JSON.parse(JSON.stringify(claim().ledger));
    expect(claim().changed).toBe(false);
    expect(claim().event).toBeUndefined();
  });

  it('不为未开工、已收工、补算或系统日期倒退的日期生成互动', () => {
    const config = working();
    const day = config.engagement!.days['2026-11-03']!;
    for (const state of ['CLOSED', 'ESTIMATED', 'PENDING_END'] as const) {
      day.state = state;
      expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:00')).changed).toBe(false);
    }
    day.state = 'ACTIVE';
    config.engagement!.lastSeenDate = '2026-11-04';
    expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:00')).changed).toBe(false);
    delete config.engagement!.days['2026-11-03'];
    expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:00')).changed).toBe(false);
  });

  it('当天设置修改不改变快照节点，无午休不生成午休互动，晚开工不补旧节点', () => {
    const config = working();
    config.profile!.breakStart = 11 * 60;
    const day = config.engagement!.days['2026-11-03']!;
    expect(checkpointTime(day, 'lunch_start')).toBe(at('12:00:00'));
    day.firstStartedAt = at('12:00:00');
    expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:01')).event).toBeUndefined();
    day.snapshot.intervals = [{ ...day.snapshot.intervals[0]!, end: day.snapshot.intervals.at(-1)!.end }];
    expect(checkpointTime(day, 'lunch_start')).toBeUndefined();
    expect(checkpointTime(day, 'lunch_end')).toBeUndefined();
    expect(checkpointTime(day, 'work_end')).toBe(at('18:00:00'));
  });

  it('自动互动至少间隔30分钟；既有自定义扣减原样保留', () => {
    const config = working(), ledger = config.engagement!;
    ledger.days['2026-11-03']!.deductionMinor = 12345;
    ledger.receipts.recent = { eventId: 'recent', sceneId: 'checkpoint_work_end', messageId: 'test', shownAt: at('12:00:00') - CHECKPOINT_COOLDOWN_MS + 1 };
    expect(reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:00')).event).toBeUndefined();
    ledger.receipts.recent!.shownAt!--;
    const result = reduceEngagement(config, { type: 'checkpoint', kind: 'lunch_start' }, at('12:00:00'));
    expect(result.event).toBeDefined();
    expect(result.ledger.days).toEqual(ledger.days);
  });
});

describe('可见窗口连续观察', () => {
  it('仅连续可见时跨节点触发，隐藏后回来及初次打开不补弹', () => {
    const observer = new CheckpointObserver(), day = working().engagement!.days['2026-11-03']!;
    expect(observer.observe(day, at('11:59:59'), true)).toBeUndefined();
    expect(observer.observe(day, at('12:00:00'), true)).toBe('lunch_start');
    expect(observer.observe(day, at('12:00:01'), true)).toBeUndefined();
    observer.reset();
    observer.observe(day, at('12:59:59'), false);
    expect(observer.observe(day, at('13:00:00'), false)).toBeUndefined();
    expect(observer.observe(day, at('13:00:01'), true)).toBeUndefined();
    observer.reset();
    expect(observer.observe(day, at('18:00:01'), true)).toBeUndefined();
  });

  it('睡眠、大幅跳时、倒拨和跨日均不补发错过节点', () => {
    const observer = new CheckpointObserver(), day = working().engagement!.days['2026-11-03']!;
    observer.observe(day, at('11:59:00'), true);
    expect(observer.observe(day, at('13:00:01'), true)).toBeUndefined();
    expect(observer.observe(day, at('11:00:00'), true)).toBeUndefined();
    expect(observer.observe(day, at('12:00:00', '2026-11-04'), true)).toBeUndefined();
  });
});
