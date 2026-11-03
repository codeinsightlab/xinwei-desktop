export interface Profile {
  amountMinor: number; basis: string; weekdays: number[];
  start: number; end: number; breakEnabled: boolean; breakStart: number; breakEnd: number;
  timeZone: 'Asia/Shanghai';
}
export interface Preferences {
  privacyMode: boolean; alwaysOnTop: boolean; showFunText: boolean; funMode: boolean;
  launchAtLogin: boolean; showWidgetOnLaunch: boolean; closeHintSeen: boolean;
}
export interface Config {
  schemaVersion: number; revision: number; profile: Profile | null;
  overrides: Record<string, 'work' | 'rest'>; preferences: Preferences;
}
export const defaultProfile = (): Profile => ({ amountMinor: 1680000, basis: '税前', weekdays: [1,2,3,4,5], start: 540, end: 1080, breakEnabled: true, breakStart: 720, breakEnd: 780, timeZone: 'Asia/Shanghai' });
export const defaultConfig = (): Config => ({ schemaVersion: 1, revision: 0, profile: null, overrides: {}, preferences: { privacyMode: false, alwaysOnTop: true, showFunText: true, funMode: false, launchAtLogin: false, showWidgetOnLaunch: true, closeHintSeen: false } });
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function parseSalary(raw: string): number {
  const value = raw.trim().replace(/[０-９]/g, c => String(c.charCodeAt(0)-65296)).replace(/．/g,'.').replace(/，/g,',');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) throw new Error('请输入合法金额，最多两位小数');
  const [whole, fraction = ''] = value.replace(/,/g,'').split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2,'0'));
  if (cents < 1n || cents > 9999999999n) throw new Error('月薪范围为 ¥0.01 至 ¥99,999,999.99');
  return Number(cents);
}
export function validateConfig(c: Config): string | null {
  if (c.schemaVersion !== 1 || !Number.isSafeInteger(c.revision) || c.revision < 0) return '配置版本无法读取';
  const p = c.profile;
  if (p) {
    if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor < 1 || p.amountMinor > 9999999999) return '月薪超出范围';
    if (!p.basis.trim() || [...p.basis].length > 12) return '工资口径请填写1至12个字符';
    if (p.timeZone !== 'Asia/Shanghai') return '首版使用北京时间';
    if (!Array.isArray(p.weekdays) || !p.weekdays.length || new Set(p.weekdays).size !== p.weekdays.length || p.weekdays.some(d => !Number.isInteger(d) || d<1 || d>7)) return '请至少选择一个工作日';
    if (![p.start,p.end,p.breakStart,p.breakEnd].every(t => Number.isInteger(t) && t>=0 && t<1440) || p.start>=p.end) return '上班时间必须早于下班时间，暂不支持跨夜';
    if (p.breakEnabled && !(p.start<p.breakStart && p.breakStart<p.breakEnd && p.breakEnd<p.end)) return '午休必须位于上下班之间，且开始早于结束';
  }
  if (!c.overrides || Object.entries(c.overrides).some(([d,v]) => !validDate(d) || !['work','rest'].includes(v))) return '日历配置无法读取';
  const keys: (keyof Preferences)[] = ['privacyMode','alwaysOnTop','showFunText','funMode','launchAtLogin','showWidgetOnLaunch','closeHintSeen'];
  if (!c.preferences || keys.some(k => typeof c.preferences[k] !== 'boolean')) return '显示偏好无法读取';
  return null;
}
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===date;
}
