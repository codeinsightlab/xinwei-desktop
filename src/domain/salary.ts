import { validateConfig } from './model';
import type { Config, Profile } from './model';
const OFFSET = 8 * 3600;
export type WorkStatus = 'BEFORE_WORK' | 'WORKING' | 'BREAK' | 'AFTER_WORK' | 'DAY_OFF' | 'INVALID_CONFIG' | 'UNCONFIGURED';
export interface Interval { start: number; end: number; date: string }
export interface MonthPlan { month: string; intervals: Interval[]; seconds: number; days: number }
export interface Earnings {
  status: WorkStatus; month: string; date: string; totalSeconds: number; elapsedSeconds: number;
  todaySeconds: number; todayElapsed: number; workdays: number; nextBoundary: number | null;
  today: bigint; monthAmount: bigint; target: bigint; hourly: bigint; rate: string;
  progress: number; monthProgress: number;
}
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
/** Exact half-up for non-negative fractions; values are in minor currency units. */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator<=0n) throw new Error('无有效工作时间');
  return (numerator * 2n + denominator) / (denominator * 2n);
}
export function formatMinor(minor: bigint | number): string {
  const n = BigInt(minor);
  return `${(n/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(n%100n).toString().padStart(2,'0')}`;
}
export function salaryString(p: Profile) { return `${Math.floor(p.amountMinor/100)}.${String(p.amountMinor%100).padStart(2,'0')}`; }
export function calculateEarnings(config: Config, now: number, cached?: MonthPlan): Earnings {
  const date = dateKey(now), month = date.slice(0,7), t = Math.floor(now/1000);
  const empty: Earnings = { status:'UNCONFIGURED',date,month,totalSeconds:0,elapsedSeconds:0,todaySeconds:0,todayElapsed:0,workdays:0,nextBoundary:null,today:0n,monthAmount:0n,target:0n,hourly:0n,rate:'0.0000',progress:0,monthProgress:0 };
  if (validateConfig(config)) return {...empty,status:'INVALID_CONFIG'};
  if (!config.profile) return empty;
  const plan = cached?.month===month ? cached : buildMonthIntervals(config,month);
  if (!plan.seconds) return {...empty,status:'INVALID_CONFIG'};
  const todayIntervals = plan.intervals.filter(i=>i.date===date);
  const elapsed = (i: Interval) => Math.max(0,Math.min(t,i.end)-i.start);
  const monthElapsed = plan.intervals.reduce((s,i)=>s+elapsed(i),0);
  const todayElapsed = todayIntervals.reduce((s,i)=>s+elapsed(i),0);
  const todaySeconds = todayIntervals.reduce((s,i)=>s+i.end-i.start,0);
  let status: WorkStatus = 'DAY_OFF';
  if (todayIntervals.length) {
    if (t<todayIntervals[0]!.start) status='BEFORE_WORK';
    else if (t>=todayIntervals.at(-1)!.end) status='AFTER_WORK';
    else if (todayIntervals.some(i=>t>=i.start && t<i.end)) status='WORKING';
    else status='BREAK';
  }
  const salary = BigInt(config.profile.amountMinor), denominator = BigInt(plan.seconds);
  const amount = (seconds: number) => roundRatio(salary*BigInt(seconds),denominator);
  const nextBoundary = status==='WORKING' ? todayIntervals.at(-1)!.end : todayIntervals.find(i=>i.start>t)?.start ?? null;
  const rateScaled = roundRatio(salary*100n,denominator).toString().padStart(5,'0');
  return {...empty,status,totalSeconds:plan.seconds,elapsedSeconds:monthElapsed,todaySeconds,todayElapsed,workdays:plan.days,nextBoundary,today:amount(todayElapsed),monthAmount:amount(monthElapsed),target:amount(todaySeconds),hourly:amount(3600),rate:`${rateScaled.slice(0,-4)}.${rateScaled.slice(-4)}`,progress:todaySeconds ? todayElapsed/todaySeconds : 0,monthProgress:monthElapsed/plan.seconds};
}
export const statusText: Record<WorkStatus,string> = {BEFORE_WORK:'还没上班',WORKING:'正在计薪',BREAK:'午休中',AFTER_WORK:'今日收工',DAY_OFF:'休息日',INVALID_CONFIG:'请检查工作时间',UNCONFIGURED:'等待设置'};
export function countdown(seconds: number): string {
  const mins = Math.max(0,Math.ceil(seconds/60));
  return mins>=60 ? `${Math.floor(mins/60)}小时${mins%60 ? `${mins%60}分` : ''}` : `${mins}分钟`;
}
