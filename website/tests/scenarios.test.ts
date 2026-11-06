import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenes } from '../src/content/scenarios.ts';
import { Conversation } from '../src/lib/scenario.ts';
import { DemoClock } from '../src/lib/demo.ts';
import { downloads } from '../src/content/site.ts';

for(const scene of scenes){
  scene.replies.forEach((reply,index)=>test(`${scene.id}: reply ${reply.label}`,()=>{
    const c=new Conversation();c.select(scene.id);c.answer(index);assert.equal(c.result,reply.response);assert.equal(c.selectedReply,reply.label);
    c.answer((index+1)%scene.replies.length);assert.equal(c.result,reply.response);
    c.restart();assert.equal(c.result,null);assert.equal(c.pose,scene.pose);
  }));
  test(`${scene.id}: skip and restart`,()=>{
    const c=new Conversation();c.select(scene.id);c.skip();assert.equal(c.result,scene.skipped);c.restart();assert.equal(c.result,null);
  });
}
test('rapid scene switching resets old response synchronously and never changes clock',()=>{
  const c=new Conversation();let now=0;const clock=new DemoClock(()=>now);clock.play();now=9000;
  for(const scene of scenes){c.select(scene.id);c.answer(0);}
  c.select('late-free');assert.equal(c.result,null);assert.equal(c.pose,'working');assert.equal(clock.read().second,52209);assert.equal(clock.read().session,'active');assert.equal(clock.read().playback,'running');
});
test('fatigue response uses quiet pose; return is not a penalty',()=>{
  const c=new Conversation();c.select('return');c.answer(2);assert.equal(c.pose,'quiet');assert.equal(c.result,'那今天不贫了。你按自己的节奏来。');
});
test('pending downloads have no guessed URLs, versions or checksums',()=>{
  for(const item of downloads){if(item.status==='pending'){assert.equal(item.url,null);assert.equal(item.version,null);assert.equal(item.checksum,null);}}
});
