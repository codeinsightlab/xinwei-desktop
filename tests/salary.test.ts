import { describe, expect, it } from 'vitest';
import { clone, defaultConfig, defaultProfile, parseSalary, validateConfig } from '../src/domain/model';
import { buildMonthIntervals, calculateEarnings, dateKey, formatMinor, monthDates, roundRatio } from '../src/domain/salary';
const fixture=()=>{const c=defaultConfig();c.profile=defaultProfile();return c;};
const at=(time:string)=>Date.parse(time+'+08:00');
describe('PRD deterministic earnings',()=>{
  it.each([
    ['2026-11-03T08:59:59',0,80000,'BEFORE_WORK'],
    ['2026-11-03T09:00:00',0,80000,'WORKING'],
    ['2026-11-03T09:00:36',100,80100,'WORKING'],
    ['2026-11-03T10:30:00',15000,95000,'WORKING'],
    ['2026-11-03T11:59:59',29997,109997,'WORKING'],
    ['2026-11-03T12:00:00',30000,110000,'BREAK'],
    ['2026-11-03T12:30:00',30000,110000,'BREAK'],
    ['2026-11-03T13:00:00',30000,110000,'WORKING'],
    ['2026-11-03T13:30:00',35000,115000,'WORKING'],
    ['2026-11-03T18:00:00',80000,160000,'AFTER_WORK'],
    ['2026-11-07T10:00:00',0,400000,'DAY_OFF'],
    ['2026-11-30T18:00:00',80000,1680000,'AFTER_WORK'],
    ['2026-12-01T00:00:00',0,0,'BEFORE_WORK'],
  ])('%s',(date,today,month,status)=>{const result=calculateEarnings(fixture(),at(date));expect(result.today).toBe(BigInt(today));expect(result.monthAmount).toBe(BigInt(month));expect(result.status).toBe(status);});
  it('uses 21 days / 168 hours and exact reference rates',()=>{const c=fixture(),p=buildMonthIntervals(c,'2026-11'),r=calculateEarnings(c,at('2026-11-03T10:30:00'));expect(p.days).toBe(21);expect(p.seconds).toBe(604800);expect(r.hourly).toBe(10000n);expect(r.rate).toBe('0.0278');});
  it('recomputes after sleep, exit and clock rollback without stored counters',()=>{const c=fixture();calculateEarnings(c,at('2026-11-03T11:30:00'));expect(calculateEarnings(c,at('2026-11-03T13:30:00')).today).toBe(35000n);expect(calculateEarnings(c,at('2026-11-03T10:00:00')).today).toBe(10000n);});
  it('reallocates past earnings when adding a future workday',()=>{const c=fixture();c.overrides['2026-11-07']='work';const r=calculateEarnings(c,at('2026-11-03T10:30:00'));expect(r.totalSeconds).toBe(176*3600);expect(r.monthAmount).toBe(90682n);});
  it('date overrides beat weekly schedule',()=>{const c=fixture();c.overrides['2026-11-03']='rest';expect(calculateEarnings(c,at('2026-11-03T10:30:00')).today).toBe(0n);expect(buildMonthIntervals(c,'2026-11').days).toBe(20);});
  it('disabling lunch creates a continuous interval',()=>{const c=fixture();c.profile!.breakEnabled=false;expect(buildMonthIntervals(c,'2026-11').seconds).toBe(189*3600);expect(calculateEarnings(c,at('2026-11-03T12:30:00')).status).toBe('WORKING');});
  it('supports single day, weekends and 7-day schedules',()=>{const c=fixture();c.profile!.weekdays=[7];expect(buildMonthIntervals(c,'2026-11').days).toBe(5);c.profile!.weekdays=[1,2,3,4,5,6];expect(buildMonthIntervals(c,'2026-11').days).toBe(25);c.profile!.weekdays=[1,2,3,4,5,6,7];expect(buildMonthIntervals(c,'2026-11').days).toBe(30);});
  it('zero work month is not a division',()=>{const c=fixture();for(const d of monthDates('2026-11'))c.overrides[d]='rest';expect(calculateEarnings(c,at('2026-11-03T12:00:00')).status).toBe('INVALID_CONFIG');});
  it('small salaries do not accumulate rounded daily amounts',()=>{const c=fixture();c.profile!.amountMinor=100;expect(calculateEarnings(c,at('2026-11-02T18:00:00')).today).toBe(5n);expect(calculateEarnings(c,at('2026-11-30T18:00:00')).monthAmount).toBe(100n);c.profile!.amountMinor=1;expect(calculateEarnings(c,at('2026-11-30T18:00:00')).monthAmount).toBe(1n);});
  it('large amount multiplication does not overflow',()=>{const c=fixture();c.profile!.amountMinor=9999999999;const r=calculateEarnings(c,at('2026-11-30T18:00:00'));expect(r.monthAmount).toBe(9999999999n);expect(formatMinor(r.monthAmount)).toBe('99,999,999.99');});
  it('half up is deterministic without float rounding',()=>{expect(roundRatio(1n,2n)).toBe(1n);expect(roundRatio(1n,3n)).toBe(0n);expect(roundRatio(5n,2n)).toBe(3n);});
  it('time zone is fixed independent of host zone',()=>{expect(dateKey(Date.parse('2026-11-02T17:00:00Z'))).toBe('2026-11-03');});
  it('supports leap years and year rollover',()=>{expect(monthDates('2028-02')).toHaveLength(29);expect(monthDates('2027-02')).toHaveLength(28);expect(monthDates('2026-12')).toHaveLength(31);expect(calculateEarnings(fixture(),at('2027-01-01T00:00:00')).monthAmount).toBe(0n);});
  it('partial seconds are consistently truncated',()=>{const c=fixture();expect(calculateEarnings(c,at('2026-11-03T09:00:00.999')).today).toBe(0n);});
  it('date overrides do not carry to the next month',()=>{const c=fixture();c.overrides['2026-11-07']='work';expect(buildMonthIntervals(c,'2026-12').days).toBe(buildMonthIntervals(fixture(),'2026-12').days);});
  it('unconfigured is distinct from invalid',()=>{expect(calculateEarnings(defaultConfig(),Date.now()).status).toBe('UNCONFIGURED');const c=fixture();c.profile!.weekdays=[];expect(calculateEarnings(c,Date.now()).status).toBe('INVALID_CONFIG');});
  it('is immutable and identical across repeated input',()=>{const c=fixture(),before=clone(c),time=at('2026-11-03T10:30:00');expect(calculateEarnings(c,time)).toEqual(calculateEarnings(c,time));expect(c).toEqual(before);});
});
describe('input contracts',()=>{
  it.each(['-1','0','','1e6','Infinity','NaN','1.001','100000000','1,00','abc'])('rejects %s',value=>expect(()=>parseSalary(value)).toThrow());
  it.each([['１６８００．００',1680000],['16,800.50',1680050],['0.01',1],['99999999.99',9999999999]])('normalizes %s',(value,expected)=>expect(parseSalary(String(value))).toBe(expected));
  it('rejects invalid schedules and malformed date overrides',()=>{const c=fixture();c.profile!.breakEnd=1100;expect(validateConfig(c)).toBeTruthy();c.profile!.breakEnd=780;c.overrides['2026-02-30']='rest';expect(validateConfig(c)).toBeTruthy();});
});
