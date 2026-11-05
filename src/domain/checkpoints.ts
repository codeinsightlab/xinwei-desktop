import { dateKey } from './salary';
import type { EngagementDay, Ledger } from './engagement-money';

export const CHECKPOINT_KINDS = ['lunch_start', 'lunch_end', 'work_end'] as const;
export type CheckpointKind = typeof CHECKPOINT_KINDS[number];
export const CHECKPOINT_COOLDOWN_MS = 30 * 60_000;
export const CHECKPOINT_TTL_MS = 8_000;
export const CHECKPOINT_GRACE_MS = 60_000;

export function checkpointTime(day: EngagementDay, kind: CheckpointKind): number | undefined {
  const intervals = day.snapshot.intervals;
  if (kind === 'work_end') return intervals.at(-1) && intervals.at(-1)!.end * 1000;
  const first = intervals[0], next = intervals[1];
  if (!first || !next || first.end >= next.start) return;
  return (kind === 'lunch_start' ? first.end : next.start) * 1000;
}

export function checkpointId(date: string, kind: CheckpointKind) {
  return `${date}:checkpoint:${kind}`;
}

export function canClaimCheckpoint(ledger: Ledger, kind: CheckpointKind, now: number): boolean {
  if (!CHECKPOINT_KINDS.includes(kind)) return false;
  const date = dateKey(now), day = ledger.days[date];
  if (date < (ledger.lastSeenDate ?? ledger.lastInteractionDate ?? ledger.firstUsedDate)) return false;
  if (day?.state !== 'ACTIVE' || day.source !== 'USER' || day.firstStartedAt === null) return false;
  const at = checkpointTime(day, kind);
  if (at === undefined || day.firstStartedAt >= at || now < at || now - at > CHECKPOINT_GRACE_MS) return false;
  if (ledger.receipts[checkpointId(date, kind)]) return false;
  return !Object.values(ledger.receipts).some(r => r.sceneId.startsWith('checkpoint_')
    && r.shownAt !== undefined && now - r.shownAt < CHECKPOINT_COOLDOWN_MS);
}

/** Only continuous, visible observation can cross a checkpoint. Opening a
 * window, waking from sleep, clock jumps and missed checkpoints never catch up. */
export class CheckpointObserver {
  private previous?: { now: number; visible: boolean };
  reset() { this.previous = undefined; }
  observe(day: EngagementDay | undefined, now: number, visible: boolean): CheckpointKind | undefined {
    const previous = this.previous;
    this.previous = { now, visible };
    if (!previous || !visible || !previous.visible || !day || day.state !== 'ACTIVE'
      || day.source !== 'USER' || dateKey(now) !== day.workDate
      || now <= previous.now || now - previous.now > 10_000) return;
    return CHECKPOINT_KINDS.find(kind => {
      const at = checkpointTime(day, kind);
      return at !== undefined && previous.now < at && at <= now;
    });
  }
}
