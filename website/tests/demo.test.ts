import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoClock, derive, hhmm, money } from '../src/lib/demo.ts';
import { fixture } from '../src/content/demo.ts';

function setup() {
  let elapsed=0;
  const clock=new DemoClock(()=>elapsed);
  return {clock, advance:(seconds:number)=>{elapsed+=seconds*1000;}};
}

test('14:30 fixed fixture has one consistent set of derived values',()=>{
  const x=derive(fixture.initialSecond);
  assert.equal(x.minor,45_000);assert.equal(x.goalMinor,80_000);assert.equal(x.monthMinor,125_000);
  assert.equal(x.progress,56.25);assert.equal(hhmm(x.remainingSeconds),'03:30');assert.equal(money(x.minor),'450.00');
});
test('default sample never starts itself',()=>{const {clock,advance}=setup();advance(600);assert.equal(clock.read().second,fixture.initialSecond);assert.equal(clock.read().playback,'idle');});
test('14:30 finish freezes 450.00 and 56.25; cannot resume closed session',()=>{
  const {clock,advance}=setup();clock.finish();advance(500);clock.play();
  assert.equal(clock.read().session,'closed');assert.equal(derive(clock.read().second).minor,45_000);assert.equal(derive(clock.read().second).progress,56.25);assert.notEqual(clock.read().playback,'running');
});
test('pause excludes all paused monotonic time; duplicate play is harmless',()=>{
  const {clock,advance}=setup();clock.play();advance(30);clock.play();advance(30);clock.pause();const frozen=clock.read();advance(10_000);
  assert.equal(clock.read().second,frozen.second);assert.equal(clock.read().playback,'paused');clock.play();advance(1);assert.equal(clock.read().second,frozen.second+1);
});
test('18:00 caps salary and reaches 100% without automatically closing',()=>{
  const {clock,advance}=setup();clock.play();advance(3.5*3600);const s=clock.read();const x=derive(s.second);
  assert.equal(x.minor,80_000);assert.equal(x.progress,100);assert.equal(x.remainingSeconds,0);assert.equal(x.timeStatus,'after');assert.equal(s.session,'active');assert.equal(s.playback,'running');
});
test('18:47 records 47 extra minutes and no extra salary',()=>{
  const {clock,advance}=setup();clock.play();advance(3.5*3600+47*60);clock.finish();
  assert.equal(derive(clock.read().second).minor,80_000);assert.equal(derive(clock.read().second).overtimeSeconds,47*60);
});
test('salary is computed directly from elapsed seconds, never ticks or frames',()=>{
  const {clock,advance}=setup();clock.play();advance(1_000.999);const expected=derive(fixture.initialSecond+1_000.999);
  assert.deepEqual(derive(clock.read().second),expected);assert.equal(expected.minor,47_777);
});
test('lunch contributes no salary',()=>{assert.equal(derive(12*3600).minor,30_000);assert.equal(derive(12.5*3600).minor,30_000);assert.equal(derive(13*3600).minor,30_000);});
test('day boundary stops at 23:59:59 without manufacturing a new day',()=>{
  const {clock,advance}=setup();clock.play();advance(48*3600);const s=clock.read();
  assert.equal(s.second,86_399);assert.equal(s.atDayBoundary,true);assert.equal(s.playback,'paused');assert.equal(s.session,'active');clock.play();advance(100);assert.equal(clock.read().second,86_399);
});
test('reset returns only this clock to initial state after finishing',()=>{
  const {clock,advance}=setup();clock.play();advance(47);clock.finish();clock.reset();
  assert.deepEqual(clock.read(),{second:fixture.initialSecond,playback:'idle',session:'active',atDayBoundary:false});
});
