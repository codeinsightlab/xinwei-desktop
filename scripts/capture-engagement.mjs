// Run against npm run dev. Each screenshot uses an isolated, fictional working day.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('../docs/iteration-engagement/screenshots/', import.meta.url));
await mkdir(dir, { recursive:true });
const browser = await chromium.launch({channel:'msedge'});
try {
  const cases = [
    ['01-not-started','not-started'],
    ['02-late-free','late-free','开工'],
    ['03-late-paid','late-paid','开工'],
    ['04-lunch','lunch'],
    ['05-overtime','overtime'],
    ['06-close-card','overtime','收工'],
    ['07-return','return'],
    ['08-policy','late-paid','开工约定'],
    ['09-save-failure','save-failure','开工'],
    ['10-privacy','privacy'],
    ['11-working-dark','working'],
    ['12-working-light','working'],
  ];
  for (const [file,mode,action] of cases) {
    const settings=file==='08-policy';
    const page=await browser.newPage({viewport:settings?{width:620,height:740}:{width:580,height:450}, reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:1420/?preview='+mode+'&theme='+(file==='11-working-dark'?'dark':'light')+(settings?'&view=settings':''));
    const region=page.locator(settings?'.settings-app':'.widget');
    if(mode==='return') await page.getByRole('button',{name:/欢迎回来，聊两句/}).click();
    if(action) await page.getByRole('button',{name:action,exact:true}).click();
    if(['02-late-free','03-late-paid','06-close-card'].includes(file)) await page.getByRole('dialog').waitFor();
    if(file==='09-save-failure') await page.getByRole('alert').waitFor();
    if(!action) await page.waitForFunction(()=>!document.body.textContent.includes('正在打开薪慰'));
    await page.evaluate(()=>document.fonts.ready);
    const framed=await page.getByRole('dialog').count()?page.getByRole('dialog'):region;
    await framed.screenshot({path:path.join(dir,file+'.png'),animations:'disabled'});
    if(errors.length) throw Error(file+': '+errors.join('; '));
    console.log(file);
    await page.close();
  }
} finally { await browser.close(); }
