import { clone, type Config } from './model';
import { dateKey } from './salary';
import { dayValue, ruleSnapshot, type RuleSnapshot } from './engagement-money';

export interface TodaySettingsUpdate { date: string; snapshot: RuleSnapshot }
function sameSnapshot(a: RuleSnapshot, b: RuleSnapshot): boolean {
  return a.version===b.version && a.timeZone===b.timeZone && a.salaryMinor===b.salaryMinor
    && a.monthSeconds===b.monthSeconds && a.policy.mode===b.policy.mode
    && a.policy.graceMinutes===b.policy.graceMinutes && a.policy.perMinuteMinor===b.policy.perMinuteMinor
    && a.intervals.length===b.intervals.length
    && a.intervals.every((i,index)=>{const j=b.intervals[index]!;return i.date===j.date && i.start===j.start && i.end===j.end;});
}

/** Preview and save use the same snapshot, while start facts and deductions stay fixed. */
export function todaySettingsChange(current: Config, next: Config, now: number) {
  const date = dateKey(now), day = current.engagement?.days[date];
  if (!day || day.state !== 'ACTIVE' || day.source !== 'USER') return;
  const snapshot = ruleSnapshot(next, date, day.snapshot.policy);
  if (!snapshot.intervals.length) throw Error('今天已开工，不能改为空的计薪时段；可取消“同时更新今天”，只保存后续安排。');
  if (sameSnapshot(snapshot,day.snapshot)) return;
  const revised = {...clone(day), snapshot, revision:day.revision + 1};
  return {
    update: {date, snapshot} satisfies TodaySettingsUpdate,
    before: day, after: revised,
    beforeAmount: dayValue(day,now).net, afterAmount: dayValue(revised,now).net,
  };
}

export function applyTodaySettings(current: Config, next: Config, update: TodaySettingsUpdate, now: number): Config {
  if (update.date !== dateKey(now)) throw Error('日期已变化，请重新预览后保存。');
  const expected = todaySettingsChange(current,next,now);
  if (!expected || !sameSnapshot(update.snapshot,expected.update.snapshot))
    throw Error('今天的记录已变化，请重新预览后保存。');
  const result = clone(next);
  result.engagement = clone(current.engagement!);
  result.engagement.days[update.date] = expected.after;
  return result;
}
