import { describe, expect, it } from 'vitest';
import { clone, defaultConfig, defaultProfile, parseSalary, validateConfig } from '../src/domain/model';
import { buildMonthIntervals, dateKey, formatMinor, monthDates } from '../src/domain/salary';
import { catchupPreviewTotal, dayValue, newLedger, recordedMonth, reduceEngagement } from '../src/domain/engagement';
const fixture = () => ({...defaultConfig(), profile:defaultProfile()});
const at = (time:string) => Date.parse(time + '+08:00');

describe('计划区间与主动激活的金额', () => {
  it.each([
    ['08:59:59',0n], ['09:00:00',0n], ['09:00:00.999',0n], ['09:00:36',100n],
    ['10:30:00',15000n], ['11:59:59',29997n], ['12:00:00',30000n], ['12:30:00',30000n],
    ['13:00:00',30000n], ['13:30:00',35000n], ['18:00:00',80000n], ['19:00:00',80000n],
  ] as const)('已开工日的左闭右开区间，%s', (time, amount) => {
    const config = fixture();
    const {ledger} = reduceEngagement(config, {type:'start'}, at('2026-11-03T08:45:00'));
    const now = at('2026-11-03T' + time);
    expect(dayValue(ledger.days['2026-11-03']!, now).net).toBe(amount);
    expect(recordedMonth(ledger, now)).toBe(amount);
  });

  it('列出 21 个计划工作日、168 小时，创建计划不会激活日期', () => {
    const config = fixture(), before = clone(config);
    const plan = buildMonthIntervals(config, '2026-11');
    expect(plan).toMatchObject({days:21, seconds:168*3600});
    expect(plan.intervals).toHaveLength(42);
    expect(config).toEqual(before);
    expect(recordedMonth(config.engagement, at('2026-11-30T18:00:00'))).toBe(0n);
  });
  it('特殊班休覆盖周历，仅影响其所处月份', () => {
    const config = fixture();
    config.overrides['2026-11-03'] = 'rest';
    expect(buildMonthIntervals(config, '2026-11').days).toBe(20);
    config.overrides['2026-11-07'] = 'work';
    const plan = buildMonthIntervals(config, '2026-11');
    expect(plan.days).toBe(21);
    expect(plan.intervals.some(i => i.date === '2026-11-03')).toBe(false);
    expect(plan.intervals.filter(i => i.date === '2026-11-07')).toHaveLength(2);
    expect(buildMonthIntervals(config, '2026-12')).toEqual(buildMonthIntervals(fixture(), '2026-12'));
  });
  it('无午休时为连续区间，午间仍按快照累积', () => {
    const config = fixture();
    config.profile.breakEnabled = false;
    const {ledger} = reduceEngagement(config,{type:'start'},at('2026-11-03T09:00:00'));
    const day=ledger.days['2026-11-03']!;
    expect(day.snapshot.intervals).toHaveLength(1);
    expect(day.snapshot.monthSeconds).toBe(189*3600);
    expect(dayValue(day,at('2026-11-03T12:30:00')).seconds).toBe(3.5*3600);
  });
  it.each([[[7],5],[[1,2,3,4,5,6],25],[[1,2,3,4,5,6,7],30]] as [number[],number][])(
    '周计划 %j', (weekdays,days) => {
      const config=fixture();
      config.profile.weekdays=weekdays;
      expect(buildMonthIntervals(config,'2026-11').days).toBe(days);
    });
  it.each([1,100,9999999999])('整月完整补算仅在确认后生效，精确覆盖月薪 %s 分', salary => {
    const config=fixture();
    config.profile.amountMinor=salary;
    config.engagement=newLedger(at('2026-11-01T00:00:00'));
    const now=at('2026-11-30T18:00:00');
    const dates=[...new Set(buildMonthIntervals(config,'2026-11').intervals.map(i => i.date))];
    expect(catchupPreviewTotal(config,dates)).toBe(BigInt(salary));
    expect(recordedMonth(config.engagement,now)).toBe(0n);
    const {ledger}=reduceEngagement(config,{type:'catchup',dates,batchId:'november-confirmed'},now);
    expect(recordedMonth(ledger,now)).toBe(BigInt(salary));
    expect(recordedMonth(ledger,at('2026-12-01T00:00:00'))).toBe(0n);
  });
  it('固定时区、月末、闰日及跨年', () => {
    expect(dateKey(Date.parse('2026-11-02T17:00:00Z'))).toBe('2026-11-03');
    expect(dateKey(Date.parse('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
    expect(monthDates('2028-02')).toHaveLength(29);
    expect(monthDates('2027-02')).toHaveLength(28);
    expect(monthDates('2026-12')).toHaveLength(31);
  });
  it('区分未配置和无效的作息', () => {
    expect(validateConfig(defaultConfig())).toBeNull();
    expect(buildMonthIntervals(defaultConfig(),'2026-11').days).toBe(0);
    const config=fixture(); config.profile.weekdays=[];
    expect(validateConfig(config)).toBeTruthy();
  });
  it('分值按两位小数显示，完整保留负号和长金额', () => {
    expect(formatMinor(9999999999n)).toBe('99,999,999.99');
    expect(formatMinor(-5n)).toBe('-0.05');
  });
});

describe('input contracts',()=>{
  it.each(['-1','0','','1e6','Infinity','NaN','1.001','100000000','1,00','abc'])('rejects %s',value=>expect(()=>parseSalary(value)).toThrow());
  it.each([['１６８００．００',1680000],['16,800.50',1680050],['0.01',1],['99999999.99',9999999999]])('normalizes %s',(value,expected)=>expect(parseSalary(String(value))).toBe(expected));
  it('rejects invalid schedules and malformed date overrides',()=>{const c=fixture();c.profile.breakEnd=1100;expect(validateConfig(c)).toBeTruthy();c.profile.breakEnd=780;c.overrides['2026-02-30']='rest';expect(validateConfig(c)).toBeTruthy();});
});
