export const site = {
  name:'薪慰 Xinwei',
  title:'薪慰 Xinwei｜桌面工资估算工具与轻互动搭子',
  description:'薪慰 Xinwei 是 Windows 与 macOS Apple Silicon 桌面工资估算搭子。主动开工、午休暂停、收工记录，搭配可跳过的轻幽默互动。先体验虚构演示，再查看真实下载状态。',
  origin:'https://xinwei.learnaiwithcode.com',
  author:'https://github.com/codeinsightlab',
  repository:'https://github.com/codeinsightlab/xinwei-desktop',
  nav:[{href:'#hello',label:'试着聊两句'},{href:'#together',label:'一天的陪伴'},{href:'#download',label:'下载与问题'}],
  intro:['点一下开工，让工资估算慢慢累积。','准时收工，有人替你高兴；','多待了一会儿，也有人替你记着。'],
  steps:[
    {number:'01',pose:'working',title:'来碰个面，就开张。',text:'亲手点一下开工，今天才开始记录。'},
    {number:'02',pose:'working',title:'你忙你的，它安静累积。',text:'小窗陪着就好，不用一直和它说话。'},
    {number:'03',pose:'offduty',title:'今天到这里，辛苦了。',text:'点一下收工，把剩下的时间还给自己。'},
  ],
  faq:[
    {q:'这是考勤软件吗？',a:'不是。薪慰是个人使用的桌面工资估算小玩具，不承担公司考勤、绩效或薪资结算。'},
    {q:'显示的钱会真的到账吗？',a:'不会。这是按月薪、作息和个人约定计算的估算，不代表实际收入或到账。官网只用虚构样例，不要求填写真实工资。'},
    {q:'工资和记录会上传吗？',a:'当前桌面应用把设置和记录保存在本机，无需账号。官网演示与桌面数据隔离，对话选择和隐私开关只在当前页面内有效；没有添加埋点。网站托管服务仍会处理访问所需的网络请求。'},
    {q:'为什么要点击开工？',a:'这是主动碰面的桌面搭子。点击开工并保存成功后才激活当天记录，同时补齐当天已经过的计划内估算；打开页面或升级应用不会自动开工。'},
    {q:'晚收工会增加工资吗？',a:'不会。计划时段以外工资封顶，只记录晚收工时长；提前收工则停在当时的估算。跨日不知道结束时间时，留给用户主动收尾。'},
    {q:'会一直弹窗打扰我吗？',a:'互动可以跳过，也能关闭趣味反馈。已开工日的午休和约定下班互动，只会在小窗持续可见且趣味反馈开启时低频出现；错过不补弹，不唤起隐藏窗口，也不自动收工。'},
    {q:'支持哪些系统？',a:'当前源码面向 Windows x64 与 macOS Apple Silicon。macOS最低配置为12，不支持Intel；Windows需要WebView2。1.2.1预览版已提供公开安装包。Windows未代码签名，macOS未完成Developer ID签名与公证，系统可能显示未知发布者提示或阻止直接打开；详见发布说明。'},
  ],
};

export interface Download {
  platform: 'windows-x64' | 'macos-arm64'; label: string;
  status: 'pending' | 'available' | 'unavailable';
  version: string | null; url: string | null; checksum: string | null;
  requirements: string; checkedAt: string;
  notice?: string;
}
/** Anonymous GET and SHA-256 verified on 2026-11-06 against public v1.2.1 assets. */
export const downloads: readonly Download[] = [
  {platform:'windows-x64',label:'Windows x64',status:'available',version:'1.2.1',
    url:'https://github.com/codeinsightlab/xinwei-desktop/releases/download/v1.2.1/Xinwei_1.2.1_windows-x64-setup.exe',checksum:'4d907e23d81ee76496a954a531471b3a1a6333d2bed47249f03aa3147dd99252',
    requirements:'x64 · 需要 WebView2',notice:'预览版 · 未代码签名，Windows可能显示未知发布者提示。',checkedAt:'2026-11-06'},
  {platform:'macos-arm64',label:'macOS · Apple Silicon',status:'available',version:'1.2.1',
    url:'https://github.com/codeinsightlab/xinwei-desktop/releases/download/v1.2.1/Xinwei_1.2.1_macos-arm64.dmg',checksum:'b3e070279435348916b24f8b9bfa44fc48a8bd09164860fbbcaecca6bc95d0cd',
    requirements:'macOS 12+ · M 系列芯片',notice:'预览版 · 未完成Developer ID签名与公证，系统可能阻止直接打开。',checkedAt:'2026-11-06'},
];
