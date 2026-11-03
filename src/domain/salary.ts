import type { Config, Profile } from './model';
const OFFSET = 8 * 3600;
export type WorkStatus = 'BEFORE_WORK' | 'WORKING' | 'BREAK' | 'AFTER_WORK' | 'DAY_OFF' | 'INVALID_CONFIG' | 'UNCONFIGURED';
export interface Interval { start: number; end: number; date: string }
export interface MonthPlan { month: string; intervals: Interval[]; seconds: number; days: number }
export function dateKey(now: number): string { return new Date(now + OFFSET*1000).toISOString().slice(0,10); }
export function monthKey(now: number) { return dateKey(now).slice(0,7); }
export function monthDates(month: string): string[] {
  const [year, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year!,m!,0)).getUTCDate();
  return Array.from({length:count},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
}
export function isWorkday(config: Config, date: string): boolean {
  if (config.overrides[date]) return config.overrides[date] === 'work';
  const iso = new Date(date+'T00:00:00Z').getUTCDay() || 7;
  return config.profile?.weekdays.includes(iso) ?? false;
}
export function buildMonthIntervals(config: Config, month: string): MonthPlan {
  const intervals: Interval[] = []; let days = 0;
  if (config.profile) for (const date of monthDates(month)) {
    if (!isWorkday(config,date)) continue;
    days++;
    const p = config.profile;
    const periods = p.breakEnabled ? [[p.start,p.breakStart],[p.breakEnd,p.end]] : [[p.start,p.end]];
    const midnight = Date.parse(date+'T00:00:00+08:00')/1000;
    for (const [a,b] of periods) intervals.push({start:midnight+a!*60,end:midnight+b!*60,date});
  }
  return {month,intervals,days,seconds:intervals.reduce((s,i)=>s+i.end-i.start,0)};
}
export function formatMinor(minor: bigint | number): string {
  const raw = BigInt(minor);
  const n = raw<0n?-raw:raw;
  return `${raw<0n?'-':''}${(n/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(n%100n).toString().padStart(2,'0')}`;
}
export function salaryString(p: Profile) { return `${Math.floor(p.amountMinor/100)}.${String(p.amountMinor%100).padStart(2,'0')}`; }
export const statusText: Record<WorkStatus,string> = {BEFORE_WORK:'还没上班',WORKING:'正在计薪',BREAK:'午休中',AFTER_WORK:'今日收工',DAY_OFF:'休息日',INVALID_CONFIG:'请检查工作时间',UNCONFIGURED:'等待设置'};
export function countdown(seconds: number): string {
  const mins = Math.max(0,Math.ceil(seconds/60));
  return mins>=60 ? `${Math.floor(mins/60)}小时${mins%60 ? `${mins%60}分` : ''}` : `${mins}分钟`;
}
