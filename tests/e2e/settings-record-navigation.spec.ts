import { test, expect, type Page } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';
import { newLedger, ruleSnapshot } from '../../src/domain/engagement-money';

async function nativeFixture(page:Page, pending:'today'|'records'|null){
  const c=defaultConfig();c.profile=defaultProfile();c.preferences.privacyMode=true;
  c.engagement=newLedger(Date.parse('2026-11-05T09:00:00+08:00'));
  c.engagement.days['2026-11-05']={workDate:'2026-11-05',firstStartedAt:Date.parse('2026-11-05T09:10:00+08:00'),endedAt:null,state:'ACTIVE',source:'USER',snapshot:ruleSnapshot(c,'2026-11-05',c.engagement.policy),lateSeconds:600,chargedMinutes:0,deductionMinor:0,estimatedEnd:false,revision:1};
  await page.addInitScript(({c,pending})=>{
    let destination=pending,sequence=0;const callbacks=new Map<number,(event:unknown)=>void>();
    const listeners:{event:string;handler:number}[]=[];const writes:string[]=[];
    Object.assign(window,{
      __TAURI_INTERNALS__:{metadata:{currentWindow:{label:'settings'},currentWebview:{label:'settings'}},
        transformCallback:(fn:(event:unknown)=>void)=>{callbacks.set(++sequence,fn);return sequence;},
        invoke:async(command:string,args?:any)=>{
          if(command==='get_config')return {config:c,notice:null,recoveryRequired:false,trayAvailable:true};
          if(command==='plugin:app|version')return '1.2.0';
          if(command==='platform_info')return {os:'macos',backgroundEntry:'菜单栏',recovery:{statusItem:true,dock:true,relaunch:true,otherWindow:true},canHide:true,backgroundLaunch:false};
          if(command==='report_window_context'||command==='plugin:event|unlisten')return;
          if(command==='plugin:event|listen'){listeners.push(args);return listeners.length;}
          if(command==='take_settings_page'){const page=destination;destination=null;return page;}
          if(command.startsWith('save_'))writes.push(command);
          throw Error('Unexpected fixture command: '+command);
        }},
      __TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}},
      navigationFixture:{writes,request:(page:'today'|'records')=>{destination=page;for(const listener of listeners.filter(x=>x.event==='settings-page-requested'))callbacks.get(listener.handler)?.({event:listener.event,payload:null,id:1});}}
    });
  },{c,pending});
  await page.clock.setFixedTime(new Date('2026-11-05T14:30:00+08:00'));
  await page.goto('/?view=settings');
}
const request=(page:Page,target:'today'|'records')=>page.evaluate(target=>(window as any).navigationFixture.request(target),target);

test('a destination queued before Settings mounts is consumed without income writes',async({page})=>{
  await nativeFixture(page,'today');
  await expect(page.getByRole('heading',{name:'今日明细',exact:true})).toBeVisible();
  await expect(page.locator('.day-facts')).toContainText('今日估算');
  await request(page,'records');
  await expect(page.getByRole('heading',{name:'本月记录',exact:true})).toBeVisible();
  await expect(page.locator('.record-entry')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).navigationFixture.writes)).toEqual([]);
});

test('routing reuses Settings drafts and waits for an existing confirmation to finish',async({page})=>{
  await nativeFixture(page,null);
  await page.getByRole('button',{name:'编辑工资',exact:true}).click();
  await page.locator('#salary').fill('20000');
  await request(page,'today');
  await expect(page.getByRole('heading',{name:'今日明细',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'工资与作息',exact:true}).click();
  // Privacy mode conceals the field on navigation; reveal the same unsaved draft.
  await page.getByRole('button',{name:'编辑工资',exact:true}).click();
  await expect(page.locator('#salary')).toHaveValue('20000');
  await page.getByRole('button',{name:'预览修改',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('确认新设置');
  await request(page,'records');
  await expect(page.getByRole('dialog')).toContainText('确认新设置');
  await page.getByRole('button',{name:'继续修改',exact:true}).click();
  await expect(page.getByRole('heading',{name:'本月记录',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'工资与作息',exact:true}).click();
  await page.getByRole('button',{name:'编辑工资',exact:true}).click();
  await expect(page.locator('#salary')).toHaveValue('20000');
  expect(await page.evaluate(()=>(window as any).navigationFixture.writes)).toEqual([]);
});
