import catalog from '../../docs/iteration-engagement/content/interaction-catalog.zh-CN.json';
import { dateKey, formatMinor } from './salary';
import { dayValue } from './engagement-money';
import type { Ledger, Receipt } from './engagement-money';

export type Pose = 'neutral'|'working'|'lucky'|'annoyed'|'resting'|'tired'|'offduty'|'welcome';
export const scenes = catalog.scenes;
export const RETURN_THRESHOLDS = {short:1, medium:2, long:5};
export const FATIGUE = {minutes:60, consecutiveDays:3};
export const TAP_COOLDOWN_MS = 30_000;

export function returnScene(gap: number) {
  if (gap >= RETURN_THRESHOLDS.long) return 'return_long';
  if (gap >= RETURN_THRESHOLDS.medium) return 'return_gap';
  if (gap >= RETURN_THRESHOLDS.short) return 'return_one';
}
function sceneById(id: string) {
  const scene = scenes.find(item => item.id === id);
  if (!scene) throw Error('互动文案暂不可用');
  return scene;
}
function seededNumber(key: string, seed: number) {
  let value = seed;
  for (const character of key) value = (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0;
  return value;
}
/** Deterministic selection with recent variants excluded as far as the pool permits. */
export function selectReceipt(ledger: Ledger, eventId: string, sceneId: string, seed = 0): Receipt {
  const scene = sceneById(sceneId);
  const recent = Object.values(ledger.receipts).filter(r => r.sceneId === sceneId)
    .sort((a,b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .slice(-Math.min(3, scene.messages.length - 1)).map(r => r.messageId);
  const fresh = scene.messages.filter(m => !recent.includes(m.id));
  const pool = fresh.length ? fresh : scene.messages;
  const chosen = pool[seededNumber(eventId, seed) % pool.length]!;
  return {eventId, sceneId, messageId:chosen.id};
}
export function receipt(ledger: Ledger, eventId: string, sceneId: string, seed = 0) {
  if (ledger.receipts[eventId]) return;
  const selected = selectReceipt(ledger, eventId, sceneId, seed);
  // Rust's JSON object keys may be sorted on reload. Keep selection history in event order.
  selected.sequence = Object.keys(ledger.receipts).length + 1;
  return ledger.receipts[eventId] = selected;
}
export type ContextKey = 'busy'|'rest'|'unwell'|'forgot';
export const contextScenes: Record<ContextKey,string> = {
  busy:'return_busy', rest:'return_rest', unwell:'return_unwell', forgot:'return_forgot',
};
function neutral(text: string) { return {text, pose:'neutral' as Pose, choices:[]}; }
export function interactionText(item: Receipt, ledger: Ledger, now: number, hidden: boolean, fun: boolean) {
  if (!fun) return neutral('已记录。');
  const scene = sceneById(item.sceneId);
  if (ledger.gentleDate === dateKey(now) && scene.tone === 'playful') return neutral('今天按自己的节奏来，我在这儿。');
  const day = ledger.days[item.eventId.split(':')[0]!];
  const reply = scene.choices.find(choice => choice.id === item.replyId);
  const main = scene.messages.find(message => message.id === item.messageId)?.text;
  let text = reply?.response ?? main ?? '欢迎回来。';
  if (hidden && !reply && scene.privacyFallback) text = scene.privacyFallback;
  const lateSeconds = day?.lateSeconds ?? 0;
  if (lateSeconds % 60) {
    const minutes = Math.floor(lateSeconds / 60);
    const duration = (minutes ? minutes + ' 分 ' : '') + (lateSeconds % 60) + ' 秒';
    text = text.replace(/\{lateMinutes\}\s*分钟/g, duration);
  }
  const variables: Record<string,string> = {
    graceMinutes:String(ledger.policy.graceMinutes),
    lateMinutes:String(Math.floor(lateSeconds / 60)),
    deductionAmount:hidden ? '••••••' : '¥' + formatMinor(day?.deductionMinor ?? 0),
    overtimeMinutes:day ? String(Math.floor(dayValue(day, now).overtimeSeconds / 60)) : '0',
  };
  return {
    text:text.replace(/\{(\w+)\}/g, (_, key:string) => variables[key] ?? ''),
    pose:scene.pose as Pose,
    choices:item.replyId || item.skipped || item.responded ? [] : scene.choices,
  };
}
