<p align="center"><img src="src/assets/mascot-work.svg" width="112" alt="薪慰的桌面伙伴" /></p>
<h1 align="center">薪慰 Xinwei</h1>
<p align="center"><strong>每一秒，都算数。</strong></p>
<p align="center">Windows 桌面工资进度小玩具 · 本地运行 · 无需账号 · 深浅主题</p>

填好月薪和作息，每天在小窗点一次 **开工**，看今天的工资估算一点点滚动。收工时，薪慰会把今天的金额和多待的时间记下来。想接一句梗就接，不想聊也可以直接关掉。

## 看看薪慰

以下界面使用虚构工资和固定的北京时间。小窗为 304 × 250 逻辑像素。

| 今天还没开张 | 开工后，金额开始滚动 |
| :---: | :---: |
| ![等待用户点击开工](docs/iteration-engagement/screenshots/01-not-started.png) | ![深色小窗显示今日估算](docs/iteration-engagement/screenshots/11-working-dark.png) |

| 晚来，默认不扣款 | 按自己的约定扣减 |
| :---: | :---: |
| ![不扣款开工互动](docs/iteration-engagement/screenshots/02-late-free.png) | ![扣减一次后的事实与接话](docs/iteration-engagement/screenshots/03-late-paid.png) |

| 晚收工 47 分钟 | 收工回顾 |
| :---: | :---: |
| ![工资封顶并显示晚收工时长](docs/iteration-engagement/screenshots/05-overtime.png) | ![收工回顾卡](docs/iteration-engagement/screenshots/06-close-card.png) |

[更多实际界面，包括午休、回归、开工约定与隐私模式](docs/iteration-engagement/screenshots/)

## 一天怎样计算

- **开工**。启用当天的展示，补齐已经过的计划内工资。首次开工后，当天使用的工资、作息与扣减规则固定下来。
- **晚来**。默认不扣款。可以自行约定每分钟金额和 0～60 分钟宽限。午休排除在晚来时间外，超过宽限后的不足一分钟按一分钟计算。
- **收工**。提前收工会停在点击时的估算。晚收工只记录时长。当天点错可以继续，跨天漏点也能轻量收尾。
- **回归**。本月遗漏的计划日可先看预览，再选择补算。补算可以整批撤销。
- **显示**。金额默认连续滚动，可在桌面偏好中切回直接更新。隐私模式遮挡金额和对话里的扣减数字。趣味反馈可关闭。

例如月薪 ¥16,800，当月计划 168 小时，09:10 点击开工时，计划内累积为 ¥16.66。若约定每分钟扣 ¥1 且无宽限，扣减一次 ¥10.00，净估算为 ¥6.66。金额以整数分和工作秒数精确计算，最后向零截断到分。日期使用北京时间。

**本月已记录估算**只合计已经开工或主动补算的日期。数据保存在本机，可通过托盘和置顶小窗查看。工资数字用于个人趣味估算。

## 项目状态

Windows x64 可构建直接运行程序和 NSIS 安装包。前端使用 Vue 3 和 TypeScript，原生能力由 Tauri 2 提供，macOS 尚待适配。角色暂时复用一个本地 SVG，八个动作已预留独立素材入口。本轮规则、验证及审查入口见[互动迭代记录](docs/PRD-ENGAGEMENT-DELTA.md)。

## 本地运行

Windows 桌面开发需要 Node.js（本项目使用 22.14）、Rust MSVC 工具链、Visual Studio C++ 构建工具及 Windows SDK、WebView2。

```powershell
git clone https://github.com/codeinsightlab/xinwei-desktop.git
cd xinwei-desktop
npm ci
npm run desktop:dev
```

仅查看前端运行 `npm run dev`，浏览器打开 `http://127.0.0.1:1420/`。

开发模式提供隔离的演示状态，例如 `?preview=working&theme=light`、`?preview=lunch`、`?preview=privacy&theme=dark`；固定时间与演示配置只用于开发，不写入个人配置。

金额默认采用逐位连续滚动效果，可在「设置 → 桌面偏好 → 金额滚动动画」关闭，恢复直接跳变；选择即时保存。查看动态演示可打开 `?preview=working&theme=light&motion=live`；系统开启“减少动画”时直接更新数字。

## 测试与构建

```powershell
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run build
npm run desktop:build
```

Windows 产物：

```text
src-tauri/target/release/xinwei-desktop.exe
src-tauri/target/release/bundle/nsis/薪慰_1.0.0_x64-setup.exe
```

本地试用副本及校验和保存在 `releases/windows-x64/`，生成产物不提交到源码仓库。缺少 WebView2 的机器在安装时可能需要联网获取运行环境。

## 文档与代码

- [互动规则增量与验收记录](docs/PRD-ENGAGEMENT-DELTA.md)
- [原始产品需求文档 PRD 1.1](docs/PRD.md)
- [交叉审查记录](docs/PRD-cross-review.md)
- [统一视觉系统](docs/design/VISUAL_SYSTEM.md)
- [视觉复查记录](design-qa.md)
- [本轮交付与验证边界](docs/design/DELIVERY.md)
- [参考与实际界面对照页](docs/design/compare.html)：在本地服务打开可查看，GitHub 展示 HTML 源码。

```text
src/domain/         计薪规则与输入校验
src/application/    应用状态与配置流程
src/features/       设置等界面
src/shared/         金额、状态、进度与角色组件
src/platform/       桌面平台适配
src/styles/         视觉变量与全局样式
src-tauri/          Rust 桌面能力与打包配置
docs/               PRD、设计规范与产品截图
```
