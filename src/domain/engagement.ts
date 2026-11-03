import { clone, validDate } from './model';
import type { Config } from './model';
import { dateKey, isWorkday } from './salary';
import {
  catchupCandidates, dayEnd, dayValue, elapsed, gapDays, newLedger, quoteLate, ruleSnapshot, scheduleEnd,
} from './engagement-money';
import type { EngagementDay, Ledger, Policy, Receipt } from './engagement-money';
import { contextScenes, FATIGUE, receipt, returnScene, scenes, selectReceipt, TAP_COOLDOWN_MS } from './engagement-copy';
import type { ContextKey } from './engagement-copy';

export * from './engagement-money';
export * from './engagement-copy';
export type Command =
  | {type:'visit'|'rollover'|'start'|'end'|'reopen'|'tap'}
  | {type:'policy';policy:Policy}
  | {type:'settle';date:string;end:number}
  | {type:'catchup';dates:string[];batchId:string}
  | {type:'undoCatchup';batchId:string}
  | {type:'reply';eventId:string;replyId?:string}
  | {type:'context';eventId:string;answer:ContextKey};

function validatePolicy(policy: Policy) {
  if (!['NONE','PER_MINUTE'].includes(policy.mode) || !Number.isInteger(policy.graceMinutes)
    || policy.graceMinutes < 0 || policy.graceMinutes > 60) throw Error('宽限须在 0～60 分钟之间');
  const min = policy.mode === 'PER_MINUTE' ? 1 : 0;
  if (!Number.isSafeInteger(policy.perMinuteMinor) || policy.perMinuteMinor < min || policy.perMinuteMinor > 999999)
    throw Error('每分钟扣减金额须在 0.01～9999.99 元之间，最多两位小数');
}
function savePolicy(ledger: Ledger, policy: Policy) {
  validatePolicy(policy);
  const old = ledger.policy;
  ledger.policy = clone(policy);
  if (old.mode !== policy.mode) return policy.mode === 'NONE' ? 'policy_deduction_removed' : 'policy_per_minute';
  if (old.graceMinutes !== policy.graceMinutes && policy.graceMinutes > 0) return 'policy_grace';
  return policy.mode === 'NONE' ? 'policy_none' : 'policy_per_minute';
}
function previousScheduledDate(config: Config, ledger: Ledger, date: string) {
  for (let time = dayEnd(date) - 86400000 - 1; dateKey(time) >= ledger.firstUsedDate; time -= 86400000) {
    const key = dateKey(time);
    if (ledger.days[key] || isWorkday(config, key)) return key;
  }
}
function startScene(config: Config, ledger: Ledger, day: EngagementDay, now: number) {
  const welcome = returnScene(gapDays(config, ledger, now));
  if (welcome && !ledger.receipts[day.workDate + ':return']) return welcome;
  const previousDate = previousScheduledDate(config, ledger, day.workDate);
  const previous = previousDate && ledger.days[previousDate];
  if (previous && previous.state === 'CLOSED') {
    if (dayValue(previous, now).overtimeSeconds >= FATIGUE.minutes * 60) return 'start_after_late_end';
    if (previous.deductionMinor && !day.deductionMinor) return 'start_after_paid_day';
  }
  if (day.deductionMinor) return 'start_late_paid';
  if (day.lateSeconds && day.snapshot.policy.mode === 'PER_MINUTE') return 'start_within_grace';
  if (day.lateSeconds) return 'start_late_free';
  return now < day.snapshot.intervals[0]!.start * 1000 ? 'start_early' : 'start_on_time';
}
function newDay(config: Config, ledger: Ledger, workDate: string): EngagementDay {
  return {
    workDate, firstStartedAt:null, endedAt:null, state:'ACTIVE', source:'USER',
    snapshot:ruleSnapshot(config, workDate, ledger.policy), lateSeconds:0, chargedMinutes:0,
    deductionMinor:0, estimatedEnd:false, revision:1,
  };
}
function start(config: Config, ledger: Ledger, date: string, now: number, seed: number) {
  if (ledger.days[date]) return;
  const day = newDay(config, ledger, date);
  if (!day.snapshot.intervals.length) throw Error('今天是休息日，不开启计数');
  if (now >= scheduleEnd(day)) throw Error('今天已到收工时间，可以按设置补算今天的进度');
  day.firstStartedAt = now;
  day.lateSeconds = elapsed(day.snapshot, now);
  Object.assign(day, quoteLate(day.snapshot.policy, day.lateSeconds));
  const scene = startScene(config, ledger, day, now);
  ledger.days[date] = day;
  return receipt(ledger, date + ':start', scene, seed);
}
function recentLateEnds(config: Config, ledger: Ledger, day: EngagementDay, now: number) {
  let current: EngagementDay | undefined = day;
  for (let count = 0; count < FATIGUE.consecutiveDays; count++) {
    if (!current || current.state !== 'CLOSED' || dayValue(current, now).overtimeSeconds < FATIGUE.minutes * 60) return false;
    if (count + 1 === FATIGUE.consecutiveDays) return true;
    const prior = previousScheduledDate(config, ledger, current.workDate);
    current = prior ? ledger.days[prior] : undefined;
  }
  return false;
}
function close(config: Config, ledger: Ledger, day: EngagementDay | undefined, now: number, seed: number) {
  if (day?.state !== 'ACTIVE') return;
  day.endedAt = Math.max(now, day.firstStartedAt!);
  day.state = 'CLOSED';
  day.revision++;
  let scene = 'end_on_time';
  if (day.endedAt < scheduleEnd(day)) scene = 'end_early';
  else if (dayValue(day, now).overtimeSeconds > 0) {
    scene = recentLateEnds(config, ledger, day, now) ? 'end_repeated_overtime' : 'end_overtime';
  }
  const key = day.workDate + ':end';
  return receipt(ledger, ledger.receipts[key] ? key + ':' + day.revision : key, scene, seed);
}
function settle(ledger: Ledger, date: string, end: number) {
  const day = ledger.days[date];
  if (day?.state === 'CLOSED' && day.estimatedEnd && day.endedAt === end) return;
  if (day?.state !== 'PENDING_END') throw Error('该日期无需收尾');
  if (!Number.isSafeInteger(end) || dateKey(end) !== date || end < day.firstStartedAt!)
    throw Error('请选择该日开工之后的时间');
  day.endedAt = end;
  day.state = 'CLOSED';
  day.estimatedEnd = true;
  day.revision++;
}
function catchup(config: Config, ledger: Ledger, command: Extract<Command,{type:'catchup'}>, now: number, seed: number) {
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(command.batchId) || ['constructor','__proto__','prototype'].includes(command.batchId))
    throw Error('补算批次无效');
  const id = dateKey(now) + ':catchup:' + command.batchId;
  // A receipt also survives undo, preventing an old in-flight confirmation from recreating its batch.
  if (ledger.batches[command.batchId] || Object.keys(ledger.receipts).some(key => key.endsWith(':catchup:' + command.batchId))) return;
  const dates = [...new Set(command.dates)];
  const allowed = catchupCandidates(config, ledger, now);
  if (!dates.length || dates.some(d => !validDate(d) || !allowed.includes(d)))
    throw Error('补算日期已变化，请重新预览');
  for (const date of dates) {
    const day = newDay(config, ledger, date);
    day.source = 'ESTIMATED_CATCHUP';
    day.state = 'ESTIMATED';
    day.batchId = command.batchId;
    ledger.days[date] = day;
  }
  ledger.batches[command.batchId] = dates;
  return receipt(ledger, id, 'catchup_done', seed);
}
function undoCatchup(ledger: Ledger, batchId: string) {
  if (!Object.hasOwn(ledger.batches, batchId)) return;
  for (const date of ledger.batches[batchId]!) {
    const day = ledger.days[date];
    if (day?.source === 'ESTIMATED_CATCHUP' && day.batchId === batchId) delete ledger.days[date];
  }
  delete ledger.batches[batchId];
}
function answer(ledger: Ledger, command: Extract<Command,{type:'reply'|'context'}>, date: string, seed: number) {
  const item = ledger.receipts[command.eventId];
  if (!item || item.skipped || item.responded || item.replyId) return;
  if (command.type === 'context') {
    if (!['return_one','return_gap','return_long'].includes(item.sceneId) || !Object.hasOwn(contextScenes, command.answer))
      throw Error('这次互动没有这项回复');
    item.responded = true;
    if (command.answer === 'unwell') ledger.gentleDate = date;
    // Only the acknowledgement is persisted. The personal reply lives in the triggering window.
    return {...selectReceipt(ledger, item.eventId, contextScenes[command.answer], seed), responded:true};
  }
  if (!command.replyId) {item.skipped = true; return;}
  const scene = scenes.find(s => s.id === item.sceneId);
  if (!scene?.choices.some(choice => choice.id === command.replyId)) throw Error('这次互动没有这项回复');
  item.replyId = command.replyId;
  return item;
}
function visit(config: Config, ledger: Ledger, date: string, now: number, seed: number) {
  if (!isWorkday(config, date) && !ledger.days[date]) return receipt(ledger, date + ':visit', 'rest_day_visit', seed);
  const scene = returnScene(gapDays(config, ledger, now));
  if (scene && !ledger.days[date]) return receipt(ledger, date + ':return', scene, seed);
  if (ledger.days[date]?.state === 'CLOSED') return receipt(ledger, date + ':visit', 'visit_after_end', seed);
}
export function reduceEngagement(config: Config, command: Command, timestamp: number, seed = 0) {
  const now = Math.floor(timestamp), date = dateKey(now);
  const ledger = clone(config.engagement ?? newLedger(now));
  const before = JSON.stringify(ledger);
  let event: Receipt | undefined;
  const highWater = ledger.lastSeenDate ?? ledger.lastInteractionDate ?? ledger.firstUsedDate;
  if (date < highWater) {
    if (command.type === 'visit' || command.type === 'rollover') return {ledger,event,changed:false};
    throw Error('系统日期早于已有记录，请检查时间后重试');
  }
  if (ledger.gentleDate && ledger.gentleDate < date) delete ledger.gentleDate;
  for (const day of Object.values(ledger.days)) {
    if (day.state === 'ACTIVE' && day.workDate < date) {day.state = 'PENDING_END'; day.revision++;}
  }
  const today = ledger.days[date];
  switch (command.type) {
    case 'rollover': break;
    case 'visit': event = visit(config, ledger, date, now, seed); break;
    case 'start': event = start(config, ledger, date, now, seed); break;
    case 'end': event = close(config, ledger, today, now, seed); break;
    case 'reopen':
      if (today?.state === 'CLOSED' && today.source === 'USER') {today.state = 'ACTIVE'; today.endedAt = null; today.revision++;}
      break;
    case 'settle': settle(ledger, command.date, command.end); break;
    case 'policy': event = receipt(ledger, date + ':policy:' + config.revision, savePolicy(ledger, command.policy), seed); break;
    case 'catchup': event = catchup(config, ledger, command, now, seed); break;
    case 'undoCatchup': undoCatchup(ledger, command.batchId); break;
    case 'reply':
    case 'context': event = answer(ledger, command, date, seed); break;
    case 'tap':
      if (now - (ledger.lastTapAt ?? 0) >= TAP_COOLDOWN_MS) {
        ledger.lastTapAt = now;
        event = receipt(ledger, date + ':tap:' + Math.floor(now / TAP_COOLDOWN_MS), 'mascot_tap', seed);
      }
      break;
  }
  ledger.lastSeenDate = date;
  if (command.type !== 'rollover' && (command.type !== 'visit' || ledger.lastInteractionDate)) {
    ledger.lastInteractionDate = date;
  }
  return {ledger, event, changed:!config.engagement || before !== JSON.stringify(ledger)};
}
