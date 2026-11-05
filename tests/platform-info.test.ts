import {describe,it,expect} from 'vitest';
import {backgroundHelp,platformInfo} from '../src/platform/info';
describe('platform copy reflects successful recovery routes',()=>{
  it('Mac status-item failure with Dock recovery never advertises a working status item',()=>{
    platformInfo.value={os:'macos',backgroundEntry:'菜单栏',recovery:{statusItem:false,dock:true,relaunch:false,otherWindow:false},canHide:true,backgroundLaunch:false};
    expect(backgroundHelp.value).toContain('Dock');expect(backgroundHelp.value).not.toContain('菜单栏');
  });
  it('no route keeps the window and provides an explicit quit alternative',()=>{
    platformInfo.value={...platformInfo.value,recovery:{statusItem:false,dock:false,relaunch:false,otherWindow:false},canHide:false};
    expect(backgroundHelp.value).toContain('没有可用的找回入口');expect(backgroundHelp.value).toContain('退出');
  });
  it('Windows uses its native entry name and does not invent Dock support',()=>{
    platformInfo.value={os:'windows',backgroundEntry:'通知区域',recovery:{statusItem:true,dock:false,relaunch:true,otherWindow:false},canHide:true,backgroundLaunch:false};
    expect(backgroundHelp.value).toContain('通知区域');expect(backgroundHelp.value).toContain('再次打开薪慰');expect(backgroundHelp.value).not.toContain('Dock');
  });
});
