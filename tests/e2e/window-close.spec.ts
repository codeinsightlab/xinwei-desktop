import { test, expect, type Page } from '@playwright/test';
import { defaultConfig, defaultProfile } from '../../src/domain/model';
import { newLedger } from '../../src/domain/engagement-money';

// Explicit native IPC fixture: emulate Tauri's target filtering, not OS shortcuts.
test('a native close request reaches only its target; settings drafts still require confirmation',async({context})=>{
  const config=defaultConfig();config.profile=defaultProfile();
  config.engagement=newLedger(Date.parse('2026-11-04T10:00:00+08:00'));
  config.engagement.lastSeenDate='2026-11-04';
  await context.addInitScript(config=>{
    const label=new URLSearchParams(location.search).get('view')==='settings'?'settings':'widget';
    const callbacks=new Map<number,(event:unknown)=>void>();
    const registrations:{event:string;target:{kind:string;label?:string};handler:number}[]=[];
    const hidden:string[]=[];let sequence=0;
    const bridge={metadata:{currentWindow:{label},currentWebview:{label}},
      transformCallback:(fn:(event:unknown)=>void)=>{callbacks.set(++sequence,fn);return sequence;},
      invoke:async(command:string,args?:Record<string,unknown>)=>{
        if(command==='get_config')return {config,notice:null,recoveryRequired:false,trayAvailable:true};
        if(command==='plugin:app|version')return '1.0.3';
        if(command==='platform_info')return {os:'macos',backgroundEntry:'菜单栏',recovery:{statusItem:true,dock:true,relaunch:true,otherWindow:false},canHide:true,backgroundLaunch:false};
        if(command==='report_window_context')return;
        if(command==='take_settings_page')return null;
        if(command==='plugin:event|listen'){registrations.push(args as typeof registrations[number]);return registrations.length;}
        if(command==='hide_window'){hidden.push(args!.label as string);return;}
        if(command==='is_widget_visible')return true;
        if(command==='plugin:event|unlisten')return;
        throw Error(`Unexpected fixture IPC: ${command}`);
      }};
    Object.assign(window,{__TAURI_INTERNALS__:bridge,__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:()=>{}},
      closeFixture:{hidden,registrations,emitTo:(target:string)=>{
        for(const r of registrations.filter(r=>r.event==='request-close')){
          if(r.target.kind==='Any' || r.target.label===target)callbacks.get(r.handler)?.({event:r.event,payload:null,id:1});
        }
      }}});
  },config);
  const widget=await context.newPage(),settings=await context.newPage();
  for(const page of [widget,settings])await page.clock.setFixedTime(new Date('2026-11-04T10:00:00+08:00'));
  await widget.goto('/');await settings.goto('/?view=settings');
  for(const page of [widget,settings])await expect.poll(()=>page.evaluate(()=>
    (window as any).closeFixture.registrations.filter((r:any)=>r.event==='request-close').length)).toBe(1);
  const hidden=(page:Page)=>page.evaluate(()=>(window as any).closeFixture.hidden);
  const emit=async(label:string)=>Promise.all([widget,settings].map(page=>page.evaluate(label=>(window as any).closeFixture.emitTo(label),label)));
  await emit('settings');
  await expect.poll(()=>hidden(settings)).toEqual(['settings']);expect(await hidden(widget)).toEqual([]);
  await emit('widget');
  await expect.poll(()=>hidden(widget)).toEqual(['widget']);expect(await hidden(settings)).toEqual(['settings']);
  await settings.locator('#salary').fill('20000');
  await emit('settings');
  await expect(settings.getByRole('dialog')).toContainText('放弃未保存的修改');
  expect(await hidden(settings)).toEqual(['settings']);expect(await hidden(widget)).toEqual(['widget']);
  await settings.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
  await expect(settings.locator('#salary')).toHaveValue('20000');
});
