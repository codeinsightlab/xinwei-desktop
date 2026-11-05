import { describe, expect, it } from 'vitest';
import { clone, defaultConfig, defaultProfile } from '../src/domain/model';
import { reduceEngagement, dayValue } from '../src/domain/engagement';
import { applyTodaySettings, todaySettingsChange } from '../src/domain/settings-change';
const at=(time:string,date='2026-11-04')=>Date.parse(`${date}T${time}+08:00`);
function fixture(){
  const c=defaultConfig();
  c.profile={...defaultProfile(),start:450,end:870,breakStart:690,breakEnd:750};
  c.engagement=reduceEngagement(c,{type:'start'},at('07:40:00')).ledger;
  c.engagement.days['2026-11-04']!.deductionMinor=1000;
  const next=clone(c);next.profile!.end=990;
  return {c,next};
}
describe('confirmed settings apply to today',()=>{
  it('updates the active snapshot once while preserving activation, deduction and receipts',()=>{
    const {c,next}=fixture(),original=clone(c),now=at('13:20:00');
    const preview=todaySettingsChange(c,next,now)!;
    expect(preview.beforeAmount).toBe(dayValue(c.engagement!.days['2026-11-04']!,now).net);
    const saved=applyTodaySettings(c,next,preview.update,now);
    const day=saved.engagement!.days['2026-11-04']!;
    expect(day.snapshot.intervals.at(-1)!.end).toBe(at('16:30:00')/1000);
    expect(day).toEqual({...original.engagement!.days['2026-11-04'],snapshot:preview.update.snapshot,revision:2});
    expect(saved.engagement!.receipts).toEqual(c.engagement!.receipts);
    expect(todaySettingsChange(saved,saved,now)).toBeUndefined();
    const reordered=clone(saved);
    const record=reordered.engagement!.days['2026-11-04']!;
    // Native serde_json may reorder object fields; equality is semantic.
    record.snapshot=Object.fromEntries(Object.entries(record.snapshot).reverse()) as typeof record.snapshot;
    expect(todaySettingsChange(reordered,reordered,now)).toBeUndefined();
    expect(c).toEqual(original);
    expect(dayValue(day,at('11:30:00')).net).toBe(dayValue(day,at('12:30:00')).net);
    expect(dayValue(day,at('12:31:00')).net).toBeGreaterThan(dayValue(day,at('12:30:00')).net);
  });
  it('corrects an already saved future setting even without editing the form again',()=>{
    const {c,next}=fixture();c.profile=clone(next.profile);
    expect(todaySettingsChange(c,c,at('13:20:00'))!.update.snapshot.intervals.at(-1)!.end).toBe(at('16:30:00')/1000);
  });
  it('rejects stale date, ended day, modified quote and empty current workday',()=>{
    const {c,next}=fixture(),now=at('13:20:00'),preview=todaySettingsChange(c,next,now)!;
    expect(()=>applyTodaySettings(c,next,preview.update,at('00:00:00','2026-11-05'))).toThrow('日期');
    const changed=clone(preview.update);changed.snapshot.salaryMinor++;
    expect(()=>applyTodaySettings(c,next,changed,now)).toThrow('重新预览');
    c.engagement!.days['2026-11-04']!.state='CLOSED';
    expect(todaySettingsChange(c,next,now)).toBeUndefined();
    expect(()=>applyTodaySettings(c,next,preview.update,now)).toThrow('重新预览');
    c.engagement!.days['2026-11-04']!.state='ACTIVE';next.overrides['2026-11-04']='rest';
    expect(()=>todaySettingsChange(c,next,now)).toThrow('不能改为空');
  });
});
