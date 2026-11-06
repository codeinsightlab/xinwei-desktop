import { DemoClock, derive, money, hhmm, clockLabel } from './demo.ts';
import { Conversation } from './scenario.ts';
import { type FactPart } from '../content/scenarios.ts';

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少官网组件：${id}`);
  return element as T;
}

// A separate, non-published build injects a monotonic clock for long-day browser QA.
// The normal production bundle tree-shakes this branch and all test controls away.
let qaNow = 0;
const qa = typeof import.meta.env !== 'undefined' && import.meta.env.XINWEI_BROWSER_QA === '1';
const clock = new DemoClock(qa ? () => qaNow : () => performance.now());
const conversation = new Conversation();
let privateAmounts = false;
let inViewport = false;
let pausedByEnvironment = false;
let lastMoney = '';
let digitNodes: HTMLSpanElement[] = [];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const play = required<HTMLButtonElement>('demo-play');
const finish = required<HTMLButtonElement>('demo-finish');
const reset = required<HTMLButtonElement>('demo-reset');
const message = required('scene-message');
const mascot = required<HTMLImageElement>('scene-mascot');
const replyActions = required('reply-actions');
const skip = required<HTMLButtonElement>('scene-skip');
const announcement = required('action-announcement');
const moneyDigits = required('money-digits');
const moneyContainer = required('demo-money');
const bar = required('demo-progress');
const barFill = bar.querySelector<HTMLElement>('span')!;
const status = required('demo-status');
const timeCaption = required('time-caption');
const feedback = required('demo-feedback');

function announce(text: string) { announcement.textContent = text; }
function amount(minor: number) { return privateAmounts ? '金额已隐藏' : `¥${money(minor)}`; }
function factText(part: FactPart) { return typeof part === 'string' ? part : privateAmounts ? '••••' : part.money; }

function drawMoney(next: string) {
  if (lastMoney === next) return;
  if (privateAmounts || lastMoney.length !== next.length || digitNodes.length !== next.length) {
    moneyDigits.replaceChildren();
    digitNodes = [];
    for (const character of next) {
      const span = document.createElement('span');
      span.className = character === '.' ? 'digit decimal' : 'digit';
      span.textContent = character;
      digitNodes.push(span); moneyDigits.append(span);
    }
  } else {
    [...next].forEach((character, i) => {
      const span = digitNodes[i]!;
      if (span.textContent === character) return;
      span.textContent = character;
      span.getAnimations().forEach(animation => animation.cancel());
      if (!reducedMotion.matches) span.animate([{ transform:'translateY(4px)',opacity:.45 },{transform:'translateY(0)',opacity:1}],{duration:180,easing:'ease-out'});
    });
  }
  lastMoney = next;
}

function renderDemo() {
  const state = clock.read();
  const value = derive(state.second);
  drawMoney(privateAmounts ? '••••••' : money(value.minor));
  moneyContainer.classList.toggle('is-private',privateAmounts);
  moneyContainer.setAttribute('aria-label',privateAmounts ? '今日估算已隐藏' : `今日估算 ${money(value.minor)} 元`);
  const percent = value.progress.toFixed(2);
  bar.setAttribute('aria-valuenow',percent);
  barFill.style.width = `${percent}%`;
  required('demo-percent').textContent = `${percent}%`;
  required('demo-time').textContent = clockLabel(state.second);
  if (value.timeStatus === 'after') {
    timeCaption.textContent = `晚收工 ${Math.floor(value.overtimeSeconds/60)} 分钟`;
  } else {
    timeCaption.replaceChildren('距下班 ');
    const strong = document.createElement('strong'); strong.textContent = hhmm(value.remainingSeconds); timeCaption.append(strong);
  }
  const closed = state.session === 'closed';
  play.hidden = closed;
  finish.hidden = closed;
  reset.textContent = closed ? '重新体验' : '重置';
  reset.className = closed ? 'text-button restart-demo' : 'text-button';
  play.disabled = state.atDayBoundary;
  required('play-label').textContent = state.playback === 'running' ? '暂停' : state.playback === 'idle' ? '开始演示' : '继续';
  if (closed) status.textContent = '已收工 · 演示已停止';
  else if (state.atDayBoundary) status.textContent = '当日演示已结束 · 请重置或收工';
  else if (value.timeStatus === 'after') status.textContent = `已到下班时间 · 尚未收工${state.playback==='running'?'':' · 已暂停'}`;
  else status.textContent = `工作中 · ${state.playback==='running'?'演示播放中':state.playback==='idle'?'演示未播放':pausedByEnvironment?'离开后已暂停':'演示已暂停'}`;
  feedback.textContent = closed ? `今天到这里，辛苦了。估算 ${amount(value.minor)}${value.overtimeSeconds ? `，晚收工 ${Math.floor(value.overtimeSeconds/60)} 分钟` : ''}。` : state.atDayBoundary ? '演示只覆盖当日；不会生成第二天记录。' : '';
}

function animateConversation() {
  for (const element of [message,mascot]) {
    element.getAnimations().forEach(animation => animation.cancel());
    if (!reducedMotion.matches) element.animate([{opacity:.35,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'ease-out'});
  }
}

function renderConversation(animate=false) {
  const scene = conversation.scene;
  document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button => {
    const selected = button.dataset.scene === scene.id;
    button.setAttribute('aria-pressed',String(selected)); button.classList.toggle('selected',selected);
  });
  required('scene-facts').textContent = scene.facts.map(factText).join('');
  message.textContent = conversation.result ?? scene.opening;
  const chosen = required('scene-chosen');
  chosen.hidden = !conversation.selectedReply;
  chosen.textContent = conversation.selectedReply ? `你说：${conversation.selectedReply}` : '';
  mascot.src = `/assets/mascot/${conversation.pose}.svg`;
  replyActions.replaceChildren();
  skip.hidden = conversation.result !== null;
  skip.textContent = scene.skipLabel;
  if (conversation.result !== null) {
    const button = document.createElement('button');button.className='button outline';button.textContent='再聊一次';
    button.addEventListener('click',()=>{ conversation.restart();renderConversation(true);replyActions.querySelector('button')?.focus();announce('已重新开始当前对话。'); });
    replyActions.append(button);
  } else {
    scene.replies.forEach((reply,index)=>{
      const button=document.createElement('button');button.className=index===0?'button primary':'button outline';button.textContent=reply.label;
      button.addEventListener('click',()=>{conversation.answer(index);renderConversation(true);replyActions.querySelector('button')?.focus();announce(conversation.result!);});
      replyActions.append(button);
    });
  }
  if (animate) animateConversation();
}

play.addEventListener('click',()=>{
  if (clock.read().playback==='running') {clock.pause();announce('演示已暂停。');}
  else if (!document.hidden && inViewport) {clock.play();announce('演示已开始，按一倍速度播放。');}
  pausedByEnvironment=false;renderDemo();
});
finish.addEventListener('click',()=>{clock.finish();renderDemo();reset.focus();announce(privateAmounts?'演示已收工，金额已隐藏。':`演示已收工，当前估算 ${money(derive(clock.read().second).minor)} 元。`);});
reset.addEventListener('click',()=>{clock.reset();pausedByEnvironment=false;renderDemo();play.focus();announce('首屏演示已重置为14:30，其他区域保持原状。');});
document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.addEventListener('click',()=>{
  conversation.select(button.dataset.scene!);renderConversation(true);announce(conversation.scene.opening);
}));
skip.addEventListener('click',()=>{conversation.skip();renderConversation(true);replyActions.querySelector('button')?.focus();announce(conversation.result!);});
document.querySelectorAll<HTMLButtonElement>('[data-privacy]').forEach(button=>button.addEventListener('click',()=>{
  privateAmounts=!privateAmounts;
  document.querySelectorAll<HTMLButtonElement>('[data-privacy]').forEach(control=>{
    control.setAttribute('aria-pressed',String(privateAmounts));
    if(control.hasAttribute('aria-label'))control.setAttribute('aria-label',privateAmounts?'显示演示金额':'隐藏演示金额');
    const label=control.querySelector('.privacy-label');if(label)label.textContent=privateAmounts?'显示演示金额':'隐藏演示金额';
  });
  renderDemo();renderConversation();announce(privateAmounts?'演示金额已隐藏。':'演示金额已显示。');
}));

function pauseForEnvironment() {
  if(clock.read().playback!=='running')return;
  clock.pause();pausedByEnvironment=true;renderDemo();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseForEnvironment();});
window.addEventListener('pagehide',pauseForEnvironment);
const observer=new IntersectionObserver(entries=>{
  inViewport=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.3);
  if(!inViewport)pauseForEnvironment();
},{threshold:[0,.3]});
observer.observe(required('salary-demo'));
renderDemo();renderConversation();
document.querySelectorAll<HTMLButtonElement>('button:disabled').forEach(button=>button.disabled=false);
// No wall-clock catch-up: this interval only renders a derivation of the monotonic clock.
window.setInterval(()=>{if(clock.read().playback==='running')renderDemo();},200);

if (qa) {
  const panel=document.createElement('aside');
  panel.setAttribute('aria-label','本地验收时钟');
  panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:100;background:#343143;color:#fff;padding:8px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:12px';
  panel.append('仅本地验收：注入单调时钟');
  for(const [label,target] of [['18:00 样例',18*3600],['18:47 样例',18*3600+47*60],['当日边界',86399]] as const){
    const button=document.createElement('button');button.textContent=label;button.className='scene-tab';
    button.addEventListener('click',()=>{clock.reset();clock.play();qaNow+=(target-14.5*3600)*1000;clock.pause();renderDemo();});panel.append(button);
  }
  document.body.append(panel);
}
