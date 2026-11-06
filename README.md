<p align="center"><img src="src/assets/mascot-work.svg" width="112" alt="薪慰的桌面伙伴" /></p>
<h1 align="center">薪慰 Xinwei</h1>
<p align="center"><strong>每一秒，都算数。</strong></p>
<p align="center">带工资估算和轻幽默互动的桌面搭子 · Windows / macOS · 本地运行 · 无需账号</p>

填好月薪和作息，每天在小窗点一次 **开工**，看今天的工资估算一点点滚动。收工时，薪慰会把今天的金额和多待的时间记下来。想接一句梗就接，不想聊也可以直接关掉。

不是考勤软件，不参与公司薪资结算。显示金额用于个人趣味估算，不代表实际到账；晚收工只记时间，不增加工资。

## 下载与官网

[1.2.1 预览版](https://github.com/codeinsightlab/xinwei-desktop/releases/tag/v1.2.1)已公开发布，官网提供两个平台的下载入口。

- [Windows x64 安装包](https://github.com/codeinsightlab/xinwei-desktop/releases/download/v1.2.1/Xinwei_1.2.1_windows-x64-setup.exe)
- [macOS Apple Silicon DMG](https://github.com/codeinsightlab/xinwei-desktop/releases/download/v1.2.1/Xinwei_1.2.1_macos-arm64.dmg)
- [SHA-256 校验值与构建回执](https://github.com/codeinsightlab/xinwei-desktop/releases/tag/v1.2.1)

Windows未代码签名；macOS未完成Developer ID签名与公证，系统可能提示未知发布者或阻止打开。请先阅读Release中的安装与验证范围说明。

- [App 项目仓库](https://github.com/codeinsightlab/xinwei-desktop)：桌面应用源码、产品说明与问题反馈入口。
- 官网：[xinwei.learnaiwithcode.com](https://xinwei.learnaiwithcode.com)，提供虚构工资与轻互动演示。
- 平台：Windows x64 需要 WebView2；macOS 面向 Apple Silicon（M 系列），最低 macOS 12，不支持 Intel。

官网仅提供虚构数据和互动演示，与桌面记录隔离。官网源码位于 [`website/`](website/README.md)，有独立依赖和构建。每次推送 `main` 会由 GitHub Actions 检查并部署到 Cloudflare Workers，不触发桌面打包。

已提交的官网修改随 `git push origin main` 自动发布。需要重新发布远端 `main` 时，在仓库根运行一条命令：

```sh
npm run website:deploy
```

该命令使用已登录的 GitHub CLI 触发发布并等待结果，不上传本地未提交内容。Cloudflare 凭据只配置在 GitHub Actions Secrets，详见[官网运行与发布说明](website/README.md)。以下运行、测试和构建命令针对桌面应用。

## 看看薪慰

以下界面使用虚构工资和固定的北京时间。小窗为304 × 250逻辑像素；今日明细和本月记录在独立设置窗口查看。

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

- **开工**。启用当天的展示，补齐已经过的计划内工资。首次开工后保存当天快照；今天尚未收工的工资与作息可通过“预览修改”确认更新，首次开工与已确定扣减保留。
- **晚来**。默认不扣款。可以自行约定每分钟金额和 0～60 分钟宽限。午休排除在晚来时间外，超过宽限后的不足一分钟按一分钟计算。
- **收工**。提前收工会停在点击时的估算。晚收工只记录时长。当天点错可以继续，跨天漏点也能轻量收尾。
- **回归**。本月遗漏的计划日可先看预览，再选择补算。补算可以整批撤销。
- **显示**。金额默认连续滚动，可在桌面偏好中切回直接更新。隐私模式遮挡金额和对话里的扣减数字。趣味反馈可关闭。
- **时间互动**。已开工时，午休开始、午休结束和约定下班可在小窗内短暂提醒。每节点每天最多一次，两次自动互动至少间隔30分钟，8秒后自动收起。关闭趣味反馈、隐藏或最小化小窗时跳过，错过不补弹，也不会自动收工或改变计薪。

例如月薪 ¥16,800，当月计划 168 小时，09:10 点击开工时，计划内累积为 ¥16.66。若约定每分钟扣 ¥1 且无宽限，扣减一次 ¥10.00，净估算为 ¥6.66。金额以整数分和工作秒数精确计算，最后向零截断到分。日期使用北京时间。

**本月已记录估算**只合计已经开工或主动补算的日期。数据保存在本机，可通过托盘和置顶小窗查看。工资数字用于个人趣味估算。

## 项目状态

Windows x64 可构建直接运行程序和 NSIS 安装包；macOS 版本仅面向 Apple Silicon（M 系列），构建原生 ARM64 `.app` 和 `.dmg`，最低系统配置为 macOS 12。前端使用 Vue 3 和 TypeScript，原生能力由 Tauri 2 提供。角色暂时复用一个本地 SVG，八个动作已预留独立素材入口。本轮规则、验证及审查入口见[互动迭代记录](docs/PRD-ENGAGEMENT-DELTA.md)。

## 本地运行

Windows 桌面开发需要 Node.js（本项目使用 22.14）、Rust MSVC 工具链、Visual Studio C++ 构建工具及 Windows SDK、WebView2。

```powershell
git clone https://github.com/codeinsightlab/xinwei-desktop.git
cd xinwei-desktop
npm ci
npm run desktop:dev
```

仅查看前端运行 `npm run dev`，浏览器打开 `http://127.0.0.1:1420/`。

macOS 开发需要 M 系列 Mac、Node.js 22.13+、Rust 和 Xcode Command Line Tools（`xcode-select --install`）。使用系统 WKWebView，无需安装 WebView2。

```sh
npm ci
rustup target add aarch64-apple-darwin
npm run desktop:dev:mac
```

macOS 点击顶部菜单栏的时钟图标可显示小窗、打开设置或退出；关闭窗口后保留后台运行，也可通过 Dock 图标重新唤起。标准应用菜单和 `Cmd+Q` 退出应用。登录启动由用户在设置中主动开启；应先把应用放入固定位置，再开启。

开发模式提供隔离的演示状态，例如 `?preview=working&theme=light`、`?preview=lunch`、`?preview=privacy&theme=dark`；固定时间与演示配置只用于开发，不写入个人配置。

金额默认采用逐位连续滚动效果，可在「设置 → 桌面偏好 → 金额滚动动画」关闭，恢复直接跳变；选择即时保存。查看动态演示可打开 `?preview=working&theme=light&motion=live`；系统开启“减少动画”时直接更新数字。

## 测试与构建

```powershell
npm test
npm run build
npm run desktop:build
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib -- --test-threads=1
```

跨macOS/Windows开发统一使用Node.js 22.23.1、`npm ci`和已提交的锁文件。先通过对应平台的Tauri CLI构建，再直接执行Cargo测试：CLI会按平台配置同步原生功能，避免Windows误带macOS私有API。不要靠删除Mac功能或跳过测试规避平台差异。版本脚本兼容LF/CRLF，Rust版本元数据另由`.gitattributes`固定LF。Windows安装包CI使用固定源码SHA，完整构建和测试通过后才上传；构建通过不代表原生交互已验收。

Windows 产物：

```text
src-tauri/target/release/xinwei-desktop.exe
src-tauri/target/release/bundle/nsis/薪慰_<version>_x64-setup.exe
```

本地试用副本及校验和保存在 `releases/windows-x64/`，生成产物不提交到源码仓库。缺少 WebView2 的机器在安装时可能需要联网获取运行环境。

macOS Apple Silicon 构建（在 Mac 上执行）：

```sh
npm run desktop:build:mac
```

产物位于 `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/薪慰.app` 和同级 `dmg/` 目录。将 DMG 中的应用拖入“应用程序”即可安装。不生成 Intel 或 Universal 包；源码也拒绝 macOS x86_64 构建。当前公开包属于预览版，未完成 Developer ID 签名和公证，不能视为已完成正式签名分发。

macOS 配置位于 `~/Library/Application Support/io.xinwei.desktop/`，共用原有版本检查、原子保存和备份流程，不迁移或生成 Windows 历史记录。[macOS 适配与验证记录](docs/reviews/2026-11-04-macos-apple-silicon-review.md)列出实测与待验收范围。

## 版本与本机数据

每次交付新迭代都升级版本：修复使用 `patch`（如1.0.0→1.0.1），小功能使用 `minor`（如1.0.1→1.1.0），大迭代使用 `major`（如1.1.0→2.0.0）。同一迭代的重复构建不额外升级，但交付后有代码变化必须使用新版本。

```sh
npm run version:bump -- patch
npm run version:check
```

脚本同步package、Tauri、Cargo及各自锁文件；`npm run build` 会拒绝版本不一致的构建，不自动创建提交或标签。小窗顶部和“关于薪慰”可核对版本；原生界面从当前运行应用读取，浏览器预览读取当前源码构建版本。更新内容见 [CHANGELOG](CHANGELOG.md)。

macOS 正式版的数据目录是 `~/Library/Application Support/io.xinwei.desktop/`：`config.json` 保存设置、工资、每日记录和互动回执，`config.backup.json` 保留最近有效备份，`window.json` 保存小窗位置。应用文件位于 `/Applications/薪慰.app`，替换应用不需要删除数据目录。备份个人数据时，应先退出应用，再复制整个数据目录。

## 保存作息并让今天生效

今天已开工但尚未收工时，工资与作息的“预览修改”默认勾选“同时更新今天”，列出日期、原/新计薪时段和当前估算金额变化。确认“保存新设置”后，新设置与今天的计薪快照一次保存，小窗同步倒计时；午休时段仍不计薪，首次开工、已确定扣减和互动回执保留。可取消勾选，仅保存后续设置；已收工、补算及历史日期不追溯。

升级不会自动修改已保存记录。如果之前设置已是16:30而今天仍按14:30，安装新版后直接点击“预览修改”，保留“同时更新今天”勾选并保存即可，无须先改成其他时间再改回来。并发修改或跨日后必须重新预览。

## 查看今日与本月记录

点击小窗“今日明细”或“本月记录”，打开已有设置窗口的对应页面；也可直接从设置侧栏进入。今日明细展示当天快照、扣减、估算及开收工时间；本月记录展示合计和逐日展开明细，补算预览、估算收尾、撤销最近补算继续可用。隐私遮罩和已保存数据跨窗口一致，查看不会自动开工或收工。跳转保留工资/作息/约定草稿，已有确认框优先处理。

## 窗口、恢复与退出

小窗与设置独立。关闭只处理当前窗口；设置草稿可取消关闭。显式退出统一等待必要写入，有草稿时选择“保存并退出 / 放弃修改并退出 / 取消”。保存工资与作息仍需确认原有日期与金额预览，失败或版本冲突保留草稿。退出不等于收工；强制结束、崩溃与系统强制终止不在正常退出确认的保障范围内。

macOS使用原生⌘W关闭当前窗口、⌘H隐藏应用、⌘,打开设置、⌘Q请求退出。Windows保留窗口关闭及托盘习惯，Esc只处理局部菜单/弹层，不新增整窗隐藏。菜单栏/托盘的“显示小窗”明确恢复小窗；应用再次启动则优先恢复确认、设置草稿与有效窗口上下文。后台登录启动遵循显示偏好，不主动开工或制造互动。

平台返回当前实际恢复能力；没有可靠入口时拒绝主动隐藏最后一个可操作窗口并显示原因。此保护不替代系统隐藏/最小化。共享协调见 `src-tauri/src/app_behavior.rs`，系统菜单、窗口参数、AppKit适配见 `src-tauri/src/window_platform.rs`；前端生命周期与草稿参与者位于 `src/application/`，业务组件不通过UA猜系统。

[行为契约与实施证据](docs/PRD-ENGAGEMENT-DELTA.md#2026-11-05-集中整改实施与验证) · [原生验收及待验步骤](docs/reviews/2026-11-05-application-behavior-review.md)。浏览器测试验证流程，不证明系统菜单或任务栏行为。

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

## 双平台自动CI

`Desktop checks`在每次push、PR和手动触发时，并行检查macOS Apple Silicon（macos-15）和Windows x64（windows-2022）；所有分支均检查，没有路径过滤。两端固定Node.js 22.23.1与Rust 1.98.0，依次验证版本、执行前端单元测试、通过Tauri CLI完成原生debug构建/前端类型检查，再执行对应目标的Rust测试。原生构建和测试均使用`--locked`，依赖不一致时失败而非悄悄更新Cargo.lock。原生构建不生成安装包、不签名或发布，也不替代窗口交互实机验收。

同一分支的新推送取消过期检查，两端失败互不取消；Rust依赖和编译缓存按系统/目标/工具链隔离。按固定源码SHA生成正式Windows安装包仍使用独立的`Build Windows installer`工作流。
