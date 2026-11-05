import type { Config } from './model';
import { clone } from './model';
import { buildMonthIntervals, dateKey, isWorkday, monthDates, monthKey } from './salary';
import type { Interval } from './salary';

export interface Policy {
  mode: 'NONE' | 'PER_MINUTE';
  graceMinutes: number;
  perMinuteMinor: number;
}
export interface RuleSnapshot {
  version: 1;
  timeZone: 'Asia/Shanghai';
  salaryMinor: number;
  monthSeconds: number;
  intervals: Interval[];
  policy: Policy;
}
export interface EngagementDay {
  workDate: string;
  firstStartedAt: number | null;
  endedAt: number | null;
  state: 'ACTIVE' | 'CLOSED' | 'PENDING_END' | 'ESTIMATED';
  source: 'USER' | 'ESTIMATED_CATCHUP';
  snapshot: RuleSnapshot;
  lateSeconds: number;
  chargedMinutes: number;
  deductionMinor: number;
  estimatedEnd: boolean;
  revision: number;
  batchId?: string;
}
export interface Receipt {
  eventId: string;
  sceneId: string;
  messageId: string;
  sequence?: number;
  replyId?: string;
  skipped?: boolean;
  responded?: boolean;
  shownAt?: number;
}
export interface Ledger {
  version: 1;
  firstUsedDate: string;
  lastSeenDate?: string;
  lastInteractionDate?: string;
  gentleDate?: string;
  policy: Policy;
  days: Record<string, EngagementDay>;
  receipts: Record<string, Receipt>;
  batches: Record<string, string[]>;
  lastTapAt?: number;
}
export function newLedger(now: number): Ledger {
  return {
    version: 1, firstUsedDate: dateKey(now),
    policy: {mode:'NONE', graceMinutes:0, perMinuteMinor:0},
    days:{}, receipts:{}, batches:{},
  };
}
export function ruleSnapshot(config: Config, date: string, policy: Policy): RuleSnapshot {
  const plan = buildMonthIntervals(config, date.slice(0, 7));
  if (!config.profile || !plan.seconds) throw Error('请先设置有效的工资与工作时间');
  return {
    version:1, timeZone:'Asia/Shanghai', salaryMinor:config.profile.amountMinor,
    monthSeconds:plan.seconds, intervals:plan.intervals.filter(i => i.date === date),
    policy:clone(policy),
  };
}
export function quoteLate(policy: Policy, lateSeconds: number) {
  if (policy.mode === 'NONE') return {chargedMinutes:0, deductionMinor:0};
  const outsideGrace = Math.max(0, lateSeconds - policy.graceMinutes * 60);
  const chargedMinutes = Math.ceil(outsideGrace / 60);
  return {chargedMinutes, deductionMinor:chargedMinutes * policy.perMinuteMinor};
}
export function elapsed(snapshot: RuleSnapshot, now: number): number {
  const second = Math.floor(now / 1000);
  return snapshot.intervals.reduce((sum, interval) =>
    sum + Math.max(0, Math.min(second, interval.end) - interval.start), 0);
}
export function dayEnd(date: string) { return Date.parse(date + 'T00:00:00+08:00') + 86400000; }
export function scheduleEnd(day: EngagementDay) { return day.snapshot.intervals.at(-1)!.end * 1000; }

function effectiveTime(day: EngagementDay, now: number) {
  if (day.state === 'CLOSED') return day.endedAt!;
  if (day.state === 'PENDING_END' || day.state === 'ESTIMATED') return dayEnd(day.workDate);
  return Math.max(day.firstStartedAt!, Math.min(now, dayEnd(day.workDate)));
}
function valueParts(day: EngagementDay, now: number) {
  if (!Number.isSafeInteger(day.snapshot.monthSeconds) || day.snapshot.monthSeconds <= 0)
    throw Error('记录缺少有效的月计划工时');
  const stop = effectiveTime(day, now);
  const seconds = elapsed(day.snapshot, stop);
  const denominator = BigInt(day.snapshot.monthSeconds);
  const gross = BigInt(seconds) * BigInt(day.snapshot.salaryMinor);
  const deduction = BigInt(day.deductionMinor);
  return {denominator, gross, deduction, net:gross - deduction * denominator, seconds, stop};
}
export function dayValue(day: EngagementDay, now: number) {
  const value = valueParts(day, now);
  const unknownEnd = day.state === 'ACTIVE' && dateKey(now) !== day.workDate;
  const overtimeSeconds = day.source === 'USER' && day.state !== 'PENDING_END' && !unknownEnd
    ? Math.max(0, Math.floor((value.stop - Math.max(scheduleEnd(day), day.firstStartedAt!)) / 1000)) : 0;
  return {
    gross:value.gross / value.denominator, net:value.net / value.denominator,
    deduction:value.deduction, seconds:value.seconds, overtimeSeconds,
  };
}
/** Each rule snapshot can have a different denominator. Truncate only after adding them. */
function truncatedSum(parts: Iterable<{net:bigint; denominator:bigint}>): bigint {
  let numerator = 0n, denominator = 1n;
  for (const value of parts) {
    if (denominator === value.denominator) {numerator += value.net; continue;}
    numerator = numerator * value.denominator + value.net * denominator;
    denominator *= value.denominator;
  }
  return numerator / denominator;
}
export function recordedMonth(ledger: Ledger | undefined, now: number): bigint {
  const month = monthKey(now);
  const days = Object.values(ledger?.days ?? {}).filter(day => day.workDate.startsWith(month));
  return truncatedSum(days.map(day => valueParts(day, now)));
}
export function pendingDays(ledger: Ledger | undefined, now: number) {
  return Object.values(ledger?.days ?? {}).filter(day =>
    day.state === 'PENDING_END' || (day.state === 'ACTIVE' && day.workDate < dateKey(now)));
}
export function catchupDates(config: Config, ledger: Ledger, now: number) {
  const today = dateKey(now);
  return monthDates(monthKey(now)).filter(date =>
    date >= ledger.firstUsedDate && date < today && !ledger.days[date] && isWorkday(config, date));
}
export function catchupCandidates(config: Config, ledger: Ledger, now: number) {
  const dates = catchupDates(config, ledger, now);
  const today = dateKey(now);
  if (!ledger.days[today] && today >= ledger.firstUsedDate && isWorkday(config, today)) {
    const last = ruleSnapshot(config, today, ledger.policy).intervals.at(-1);
    if (last && now >= last.end * 1000) dates.push(today);
  }
  return dates;
}
export function catchupPreviewTotal(config: Config, dates: string[]) {
  return truncatedSum([...new Set(dates)].map(date => {
    const snapshot = ruleSnapshot(config, date, config.engagement?.policy ?? newLedger(dayEnd(date)).policy);
    return {net:BigInt(snapshot.salaryMinor) * BigInt(elapsed(snapshot, dayEnd(date))), denominator:BigInt(snapshot.monthSeconds)};
  }));
}
export function catchupPreview(config: Config, date: string) {
  return catchupPreviewTotal(config, [date]);
}
export function gapDays(config: Config, ledger: Ledger, now: number) {
  if (!ledger.lastInteractionDate) return 0;
  const today = dateKey(now);
  let count = 0;
  for (let day = dayEnd(ledger.lastInteractionDate); dateKey(day) < today; day += 86400000) {
    if (isWorkday(config, dateKey(day))) count++;
  }
  return count;
}
