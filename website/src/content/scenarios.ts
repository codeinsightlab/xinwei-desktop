export type Pose = 'working' | 'resting' | 'offduty' | 'welcome' | 'quiet' | 'hero';
export type FactPart = string | { money: string };
export interface Scene {
  id: string; label: string; pose: Pose; facts: FactPart[]; opening: string;
  replies: { label: string; response: string; pose?: Pose }[];
  skipLabel: string; skipped: string;
}

export const scenes: readonly Scene[] = [
  { id:'late-free',label:'晚来不扣钱',pose:'working',facts:['09:10 开工 · 晚来 10 分钟 · 不扣减'],
    opening:'碰上好人家了，迟到还不扣钱。',
    replies:[{label:'低调低调',response:'懂了，这事不写进年终总结。'},{label:'也就这点好了',response:'懂，优点已经介绍完了。'}],
    skipLabel:'跳过',skipped:'今天从这里开始。' },
  { id:'late-paid',label:'按分钟扣',pose:'quiet',facts:['09:10 开工 · 晚来 10 分钟 · 无宽限；每分钟 ',{money:'1.00'},' 元。计划内估算 ',{money:'16.66'},' 元，扣减一次 ',{money:'10.00'},' 元，净估算 ',{money:'6.66'},' 元。'],
    opening:'班还没上，计价器先开了。',
    replies:[{label:'这班非上不可吗',response:'我支持你，账单暂时持保留意见。'},{label:'先把钱挣回来',response:'行，计数器开了，我陪你盯着。'}],
    skipLabel:'跳过',skipped:'今天的约定记下了，接着来。' },
  { id:'on-time-off',label:'准点收工',pose:'offduty',facts:['18:00 收工 · 今日 ',{money:'800.00'},' 元 · 进度 100% · 晚收工 0 分钟'],
    opening:'电脑可以下班，你也可以。',
    replies:[{label:'溜了溜了',response:'今天的营业到此结束。'},{label:'明天见',response:'行，明天的事明天再说。'}],
    skipLabel:'跳过',skipped:'今天到这里，辛苦了。' },
  { id:'overtime',label:'多待一会儿',pose:'quiet',facts:['18:47 收工 · 晚收工 47 分钟 · 今日仍 ',{money:'800.00'},' 元，不增加加班工资。'],
    opening:'今天又多待了47分钟。记下了，不拿它当勋章。',
    replies:[{label:'终于能走了',response:'那就合上电脑，剩下的时间归你。'},{label:'最近有点累',response:'那今天不贫了。先歇会儿。',pose:'quiet'}],
    skipLabel:'跳过',skipped:'收工，今天已经够了。' },
  { id:'return',label:'好几天没来',pose:'welcome',facts:['几个计划日没来 App 碰面，不代表现实缺勤；不罚款，也不推测原因。'],
    opening:'好几天没碰面，最近还好吗？',
    replies:[{label:'最近有点忙',response:'看来不是没上班，是忙得没空看自己赚了多少。'},{label:'忘了打开',response:'还以为你发财了，不用看这点工资了。'},{label:'状态不太好',response:'那今天不贫了。你按自己的节奏来。',pose:'quiet'}],
    skipLabel:'今天直接开始',skipped:'欢迎回来，今天从这里开始。' },
];
