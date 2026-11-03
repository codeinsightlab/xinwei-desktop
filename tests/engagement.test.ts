import { describe, expect, it } from 'vitest';
import { clone, defaultConfig, defaultProfile } from '../src/domain/model';
import type { Config } from '../src/domain/model';
import {
  catchupCandidates, catchupPreview, catchupPreviewTotal, dayValue, gapDays, interactionText, newLedger, recordedMonth,
  reduceEngagement, scenes, selectReceipt, pendingDays,
} from '../src/domain/engagement';
import type { Command, Policy, Receipt } from '../src/domain/engagement';
import { formatMinor } from '../src/domain/salary';

const payByMinute:Policy = {mode:'PER_MINUTE', graceMinutes:0, perMinuteMinor:100};
const free:Policy = {mode:'NONE', graceMinutes:0, perMinuteMinor:0};
const at = (clock:string, date='2026-11-03') => Date.parse(date+'T'+clock+'+08:00');
function setup(policy:Policy=free, firstDate='2026-11-03') {
  const config:Config = {...defaultConfig(), profile:defaultProfile(), engagement:newLedger(at('08:00:00',firstDate))};
  config.engagement!.policy = clone(policy);
  function run(command:Command, time:number) {
    const result=reduceEngagement(config,command,time,42);
    if(result.changed){config.engagement=result.ledger;config.revision++;}
    return result;
  }
  const day=(date='2026-11-03')=>config.engagement!.days[date]!;
  return {config,run,day};
}
describe('主动开工与规则快照',()=>{
  it('打开、刷新均未开工，不为此前日期估算金额',()=>{
    const {config,run}=setup();run({type:'visit'},at('09:10:00'));
    expect(run({type:'visit'},at('09:12:00')).changed).toBe(false);
    expect(config.engagement!.days).toEqual({});
    expect(recordedMonth(config.engagement,at('14:30:00'))).toBe(0n);
  });
  it.each([[free,1666n,45000n,0n],[payByMinute,666n,44000n,1000n]] as const)(
    '09:10 开工后补齐计划内累计，只减一次设置的金额', (policy,net,later,deduction)=>{
      const {config,run,day}=setup(policy);
      const first=run({type:'start'},at('09:10:00'));
      expect(first.event).toBeDefined();
      expect(day().snapshot.monthSeconds).toBe(168*3600);
      expect(dayValue(day(),at('09:10:00'))).toMatchObject({gross:1666n,net,deduction});
      expect(dayValue(day(),at('14:30:00')).net).toBe(later);
      expect(recordedMonth(config.engagement,at('14:30:00'))).toBe(later);
      const reloaded=clone(config);
      const second=reduceEngagement(reloaded,{type:'start'},at('09:11:00'));
      expect(second).toMatchObject({changed:false,event:undefined});
      expect(second.ledger.days['2026-11-03']?.deductionMinor).toBe(Number(deduction));
    });
  it.each([['09:05:00',0],['09:05:01',1],['09:06:00',1],['12:45:00',175],['13:00:01',176]] as const)(
    '有效迟到秒数扣除宽限后按分钟进位 %s', (clock,chargedMinutes)=>{
      const {run,day}=setup({...payByMinute,graceMinutes:5});
      run({type:'start'},at(clock));expect(day().chargedMinutes).toBe(chargedMinutes);
      expect(day().deductionMinor).toBe(chargedMinutes*100);
    });
  it('提前开工只计计划区间，午休和约定收工后没有额外工资',()=>{
    const {run,day}=setup();run({type:'start'},at('08:30:00'));
    expect(day().lateSeconds).toBe(0);
    const net=(time:string)=>dayValue(day(),at(time)).net;
    expect(net('08:55:00')).toBe(0n);expect(net('12:30:00')).toBe(30000n);
    expect(net('13:00:00')).toBe(30000n);expect(net('13:00:36')).toBe(30100n);
    expect(net('18:47:00')).toBe(net('18:00:00'));run({type:'end'},at('18:47:00'));
    expect(dayValue(day(),at('20:00:00')).overtimeSeconds).toBe(47*60);
  });
  it('早收工冻结时间，撤销后沿用首次开工和扣减',()=>{
    const {run,day}=setup(payByMinute);run({type:'start'},at('09:10:00'));run({type:'end'},at('17:30:00'));
    const early=dayValue(day(),at('20:00:00'));expect(early.net).toBe(74000n);expect(early.overtimeSeconds).toBe(0);
    expect(run({type:'end'},at('18:00:00')).changed).toBe(false);
    run({type:'reopen'},at('17:45:00'));
    expect(day().firstStartedAt).toBe(at('09:10:00'));expect(day().deductionMinor).toBe(1000);
    expect(dayValue(day(),at('18:00:00')).net).toBe(79000n);
  });
  it('负数按净额绝对值截断，含金额的文案和回复遵循隐私显示',()=>{
    const {run,day,config}=setup({...payByMinute,perMinuteMinor:200});
    const r=run({type:'start'},at('09:10:00')).event!;
    expect(formatMinor(dayValue(day(),at('09:10:00')).net)).toBe('-3.33');
    const forced={...r,messageId:'start_late_paid.1'};
    const copy=(hidden:boolean)=>interactionText(forced,config.engagement!,at('09:10:00'),hidden,true).text;
    expect(copy(false)).toContain('¥20.00');expect(copy(true)).not.toMatch(/¥|20\.00|\{/);
    const choice=scenes.find(s=>s.id===r.sceneId)!.choices[0]!;
    const replied=run({type:'reply',eventId:r.eventId,replyId:choice.id},at('09:12:00')).event!;
    expect(interactionText(replied,config.engagement!,at('09:12:00'),true,true).text).toBe(choice.response);
  });
  it('时钟回拨夹住首次开工，不会生成先前日期的记录或重复扣减',()=>{
    const {config,run,day}=setup(payByMinute);run({type:'start'},at('09:10:00'));
    expect(dayValue(day(),at('08:30:00')).net).toBe(666n);
    expect(run({type:'start'},at('08:30:00')).changed).toBe(false);
    expect(()=>run({type:'start'},at('10:00:00','2026-11-02'))).toThrow('系统日期');
    expect(Object.keys(config.engagement!.days)).toEqual(['2026-11-03']);
  });
  it('跨日留待收尾，不从未知结束时间推断晚收工；当天仍可开工',()=>{
    const {config,run,day}=setup();run({type:'start'},at('09:00:00'));
    const next=at('09:01:00','2026-11-04');const rollover=run({type:'rollover'},next);
    expect(rollover.event).toBeUndefined();expect(rollover.ledger.lastInteractionDate).toBe('2026-11-03');
    expect(pendingDays(config.engagement,next)).toHaveLength(1);
    expect(dayValue(day(),next)).toMatchObject({overtimeSeconds:0,net:80000n});
    expect(run({type:'start'},next).event?.sceneId).toBe('start_late_free');
    expect(()=>run({type:'settle',date:day().workDate,end:at('08:00:00')},next)).toThrow();
    const settle:Command={type:'settle',date:day().workDate,end:at('18:10:00')};
    run(settle,next);expect(day().estimatedEnd).toBe(true);expect(dayValue(day(),next).overtimeSeconds).toBe(600);
    expect(run(settle,next).changed).toBe(false);
  });
  it('多套快照的月净额精确相加，最后一次截断，不逐日丢分',()=>{
    const {config,run,day}=setup();
    config.profile!.amountMinor=10;run({type:'start'},at('09:00:00'));run({type:'end'},at('18:00:00'));
    config.profile!.amountMinor=11;config.overrides['2026-11-07']='work';
    run({type:'start'},at('09:00:00','2026-11-04'));run({type:'end'},at('18:00:00','2026-11-04'));
    config.profile!.amountMinor=12;
    run({type:'start'},at('09:00:00','2026-11-05'));run({type:'end'},at('18:00:00','2026-11-05'));
    expect(day().snapshot.salaryMinor).toBe(10);expect(day().snapshot.monthSeconds).toBe(168*3600);
    expect(day('2026-11-04').snapshot.monthSeconds).toBe(176*3600);
    expect(recordedMonth(config.engagement,at('18:00:00','2026-11-05'))).toBe(1n);
  });
  it('休息日、零工时和整日已结束均不能产生开工扣减',()=>{
    const {config,run}=setup(payByMinute);
    expect(()=>run({type:'start'},at('18:00:00'))).toThrow('补算');
    expect(()=>run({type:'start'},at('09:10:00','2026-11-07'))).toThrow('休息日');
    for(let n=1;n<=30;n++)config.overrides['2026-11-'+String(n).padStart(2,'0')]='rest';
    expect(()=>run({type:'start'},at('09:10:00'))).toThrow('有效');
    expect(config.engagement!.days).toEqual({});
  });
});

describe('回归、补看与互动记忆',()=>{
  it('多日补算预览先累计精确分数，只对合计截分',()=>{
    const {config}=setup(free,'2026-11-02');config.profile!.amountMinor=12;
    const dates=['2026-11-02','2026-11-03'];
    expect(catchupPreview(config,dates[0]!)).toBe(0n);
    expect(catchupPreviewTotal(config,dates)).toBe(1n);
  });
  it('保存约定后的文案反映实际变更，并保留已开启日期的旧快照',()=>{
    const {config,run,day}=setup();const now=at('09:10:00');
    run({type:'start'},now);
    expect(run({type:'policy',policy:payByMinute},now).event?.sceneId).toBe('policy_per_minute');
    const withGrace={...payByMinute,graceMinutes:10};
    expect(run({type:'policy',policy:withGrace},now).event?.sceneId).toBe('policy_grace');
    const next=at('09:15:00','2026-11-04');run({type:'start'},next);
    expect(day().deductionMinor).toBe(0);expect(day('2026-11-04').deductionMinor).toBe(500);
    expect(run({type:'policy',policy:free},next).event?.sceneId).toBe('policy_deduction_removed');
    const old=clone(config);
    expect(()=>run({type:'policy',policy:{...payByMinute,perMinuteMinor:0}},next)).toThrow();
    expect(()=>run({type:'policy',policy:{...payByMinute,graceMinutes:61}},next)).toThrow();
    expect(config).toEqual(old);
  });
  it('只列出本月、启用后未记录的计划日，末班之后今天也可确认估算',()=>{
    const {config,run}=setup(payByMinute,'2026-11-03');
    const now=at('18:05:00','2026-11-06');
    run({type:'start'},at('09:10:00'));run({type:'end'},at('17:30:00'));
    expect(catchupCandidates(config,config.engagement!,now)).toEqual(['2026-11-04','2026-11-05','2026-11-06']);
    expect(catchupPreview(config,'2026-11-04')).toBe(80000n);
    const old=clone(config);expect(()=>run({type:'catchup',dates:['2026-11-04','2026-11-03'],batchId:'bad-batch'},now)).toThrow();
    expect(config).toEqual(old);
    const confirm:Command={type:'catchup',dates:['2026-11-04','2026-11-06'],batchId:'confirmed'};
    run(confirm,now);const estimated=config.engagement!.days['2026-11-04']!;
    expect(estimated).toMatchObject({source:'ESTIMATED_CATCHUP',firstStartedAt:null,endedAt:null,deductionMinor:0});
    expect(dayValue(estimated,now)).toMatchObject({net:80000n,overtimeSeconds:0});
    expect(run(confirm,now).changed).toBe(false);run({type:'undoCatchup',batchId:'confirmed'},now);
    expect(Object.keys(config.engagement!.days)).toEqual(['2026-11-03']);
    expect(run(confirm,now).changed).toBe(false);
    expect(catchupCandidates(config,config.engagement!,at('09:00:00','2026-12-01'))).toEqual([]);
  });
  it('回归前排除周末和无历史日期，只询问一次，回答不记录个人状况',()=>{
    const {config,run}=setup(free,'2026-10-30');
    run({type:'visit'},at('08:00:00','2026-10-30'));
    expect(gapDays(config,config.engagement!,at('08:00:00','2026-11-16'))).toBe(0);
    run({type:'start'},at('09:00:00','2026-10-30'));run({type:'end'},at('18:00:00','2026-10-30'));
    expect(gapDays(config,config.engagement!,at('08:00:00','2026-11-02'))).toBe(0);
    const now=at('09:10:00','2026-11-04');
    const ret=run({type:'visit'},now).event!;
    expect(ret.sceneId).toBe('return_gap');expect(run({type:'visit'},now).event).toBeUndefined();
    const answer=run({type:'context',eventId:ret.eventId,answer:'unwell'},now).event!;
    expect(answer.sceneId).toBe('return_unwell');expect(config.engagement!.gentleDate).toBe('2026-11-04');
    expect(JSON.stringify(config.engagement)).not.toMatch(/unwell|不太好/);
    const started=run({type:'start'},now).event!;
    expect(started.sceneId).not.toContain('return_');
    expect(interactionText(started,config.engagement!,now,false,true).text).toContain('自己的节奏');
    run({type:'rollover'},at('08:00:00','2026-11-05'));
    expect(config.engagement!.gentleDate).toBeUndefined();
  });
  it('上次已确认的工作日可跨周末反馈，连续三次晚收工必须每个计划日有确定事实',()=>{
    const {run}=setup(free,'2026-10-30');
    const worked=(date:string)=>{const first=run({type:'start'},at('09:00:00',date));const last=run({type:'end'},at('19:00:00',date));return {first,last};};
    worked('2026-10-30');expect(worked('2026-11-02').first.event?.sceneId).toBe('start_after_late_end');
    expect(worked('2026-11-03').last.event?.sceneId).toBe('end_repeated_overtime');
    expect(worked('2026-11-05').last.event?.sceneId).toBe('end_overtime');
  });
  it('同事件选句可复现，后续尽量避开最近文案；关趣味后返回中性反馈',()=>{
    const {config,run}=setup();const ledger=config.engagement!;
    const render=(r:Receipt)=>interactionText(r,ledger,at('09:10:00'),false,false);
    const r=selectReceipt(ledger,'event-A','mascot_tap',42);
    expect(selectReceipt(ledger,'event-A','mascot_tap',42)).toEqual(r);
    ledger.receipts[r.eventId]=r;expect(selectReceipt(ledger,'event-B','mascot_tap',42).messageId).not.toBe(r.messageId);
    expect(render(r)).toMatchObject({pose:'neutral',choices:[]});
    expect(run({type:'tap'},at('09:10:00')).event).toBeDefined();
    expect(run({type:'tap'},at('09:10:29')).event).toBeUndefined();
    expect(run({type:'tap'},at('09:10:30')).event).toBeDefined();
  });
});
