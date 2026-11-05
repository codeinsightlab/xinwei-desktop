# macOS Apple Silicon 适配记录

## 2026-11-04 范围与源码事实

用户要求在 Windows 实现基础上增加仅供 M 系列芯片使用的 macOS 版本。已检索 `docs/`；`doc/` 和 `knowledge/` 不存在。既有 PRD 的第 12 节说明平台边界，旧的 Windows 验证记录保留。本记录补充本次 macOS 证据。

- 复用 Vue 界面、计薪核心、Rust Store 互斥事务、revision 检查、备份及配置恢复；不修改收入、开工、扣减、跨日、补算规则。
- `src-tauri/tauri.macos.conf.json` 由 Tauri 按平台合并，覆盖打包目标为 APP / DMG，并使用已有 ICNS 图标；Windows NSIS 配置保留。macOS 最低版本配置为 12.0，最低版本机器未实测。
- 专用命令 `desktop:dev:mac` / `desktop:build:mac` 固定 `aarch64-apple-darwin`。打包时优先使用 `/usr/bin` 等 macOS 系统工具，避免本机 `/usr/local/bin/perl` 的旧 Intel 可执行文件阻塞 ARM64 打包；不修改系统 PATH。Rust 编译条件拒绝 macOS 非 aarch64 构建，不提供 Intel 或 Universal 包。
- macOS 使用时钟形单色 template 菜单栏图标，左键打开菜单；菜单共用显示、隐藏、置顶、隐私、设置和退出事务。Windows 保留左键唤起小窗、右键菜单行为。
- 保留系统默认应用菜单（含编辑快捷键和 Cmd+Q），通过 `RunEvent::ExitRequested` 与显式退出共用退出准备逻辑。窗口关闭仍走原有确认与隐藏；`RunEvent::Reopen` 从 Dock 重新显示和聚焦正确窗口。
- 小窗初始化及屏幕边界恢复按 monitor work area 定位，避开菜单栏、Dock。跨屏、全屏空间和外接屏缩放仍需实测。
- 登录启动显式选择官方插件的 LaunchAgent，默认关闭。数据目录由 Tauri 的 `app_data_dir()` 提供，正式应用为 `~/Library/Application Support/io.xinwei.desktop/`。没有新增系统权限或远程业务请求。
- 关闭提示按平台说明菜单栏或托盘。浏览器测试在 macOS 使用 Chrome，Windows 保留 Edge。

回滚方式：还原本次平台代码、配置和文档；未改变存储 schema，无需数据迁移。生成包不提交源码仓库。未执行提交、推送或公开发布。

## 自动验证

环境：Apple Silicon / arm64，macOS 27.0（26A428），Node.js 22.23.1，Rust 目标 `aarch64-apple-darwin`。

| 验证层级 | 命令或范围 | 结果 |
| --- | --- | --- |
| 前端单元测试 | `npm test` | 3 个测试文件、67 项通过 |
| Rust 持久化测试 | `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked` | 5 项通过 |
| 前端类型及构建 | `npm run build` | TypeScript / Vite 通过 |
| 浏览器工作流 | `npm run test:e2e` | Chrome 8 项通过，覆盖普通金额、隐私跨窗口同步、失败保留草稿、补算及撤销 |
| 代码格式 | `rustfmt --edition 2021 --config skip_children=true --check src-tauri/src/lib.rs` | 通过；全量 cargo fmt 检出未触及 config.rs 中的既有格式差异 |

首次依赖下载受沙箱缓存写权限限制，在获准环境重试成功；首次浏览器运行受沙箱限制导致 8 项未进入用例，沙箱外重跑全部通过。浏览器测试使用隔离的 localStorage 数据，不能作为 WKWebView 或原生菜单的证据。

## 原生打包与交付

- `npm run desktop:build:mac` 的 Release 编译及 APP 打包成功；`file` / `lipo -archs` 确认产物是 Mach-O thin arm64，不含 x86_64。Info.plist 中 identifier 为 `io.xinwei.desktop`、最低系统版本为 12.0。
- 独立标识 `io.xinwei.desktop.macos-smoke`、名称「薪慰测试」的 debug APP 构建成功，并在真实 WKWebView 中显示初始设置页。
- 原生小窗显示计数及操作入口，点击「隐藏金额」后 AX 树中金额变为 `••••••`；小窗菜单的「设置」可以显示原生设置窗口。设置页和小窗共用 Rust Store。原生 UI 验证期间检测到用户操作，未继续争抢窗口，未据此宣称完成关闭、重启及全部生命周期验收。
- `codesign -dv` 显示本地链接器 ad hoc 签名，无 TeamIdentifier，尚未完成 Developer ID 签名及公证。
- 首次 DMG 创建被沙箱限制；沙箱外重试定位到旧版 Intel Perl，调整当前进程 PATH 使用系统工具后成功生成 `薪慰_1.0.0_aarch64.dmg`（约 1.65 MiB），`hdiutil verify` 校验通过。此项证明映像完整，不能替代安装、覆盖升级及外部机器启动验收。
- 修正 PATH 后，最终再次执行 `npm run desktop:build:mac`，退出码 0，同时保留 APP（3.43 MiB）与 DMG（1.65 MiB）。再次检查 APP 架构为 `arm64`。

正式产物位于 `src-tauri/target/aarch64-apple-darwin/release/bundle/`；隔离测试应用位于 `src-tauri/target/debug/bundle/macos/薪慰测试.app`。正式数据目录与隔离测试目录分开。

## 尚待验收

菜单栏图标和菜单的完整操作、关闭隐藏、Dock 唤起、第二实例唤起、Cmd+Q 和后台退出、登录启动的注销/重登、多屏与不同 Retina 缩放、全屏空间、最低系统版本、长时间运行、安装替换后的数据连续性；Windows 原生回归本轮未执行。Developer ID 签名、公证及外部分发另行验收。

## 实现参考

检索日期：2026-11-04。依据官方文档并结合本地依赖源码检查：

- [Tauri macOS Application Bundle](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Tauri Autostart](https://v2.tauri.app/plugin/autostart/)
- [Tauri Tray API](https://tauri.app/reference/javascript/api/namespacetray/)

文档说明能力契约，实际通过项以上述测试和原生证据为准。

## 同日后续：共享窗口规则

用户后续确认悬浮窗跨应用置顶并跟随桌面/Space，设置保持普通独立窗口。本次进一步补齐圆角、直接隐私入口、点击收起、趣味反馈布局稳定和首次关闭只隐藏；这些是跨平台共享规则。macOS 专用配置启用透明背景所需的 Tauri 功能，AppKit 的窗口分组/Space 差异集中在 `window_platform.rs`。

后续测试、原生观察、重新打包及兼容性限制统一记录在 [互动迭代的共享窗口章节](../PRD-ENGAGEMENT-DELTA.md#2026-11-04-共享窗口与互动语义调整)，本节保留此前证据的时间顺序，不把此前未验证项追改为已通过。

## 同日后续：顶部拖动与系统辅助进程

悬浮窗顶部的命中区域、macOS首次鼠标点击和AppKit拖动事件已单独适配。源码发现、测试隔离端口问题及原生自动化限制见[顶部拖动修正](../PRD-ENGAGEMENT-DELTA.md#2026-11-04-悬浮窗顶部拖动修正)。原生拖动尚不能宣称完成实机验收。

用户同时询问活动监视器中的「薪慰 Graphics and Media」。只读检查当时的 PID 25883，实际可执行文件为 `/System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.GPU.xpc/Contents/MacOS/com.apple.WebKit.GPU`。这是系统 WebKit GPU 进程；PID 是当时快照，不作为长期身份。普通页面绘制也使用该进程，名称中的 Media 不能作为正在录音或播放音视频的证据。[WebKit 官方说明](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)说明页面绘制、Canvas和WebGL也在GPU进程中执行。未停止或修改该系统进程。

## 2026-11-05 WidgetKit 小组件可行性（调研，未实现）

用户提出扩大悬浮窗、精简弹层，并询问原生macOS小组件。用户随后收窄为仅调整尺寸；1.1.1保留原界面内容，不能将悬浮窗尺寸调整称为已提供WidgetKit小组件。本节仅官方资料及当前源码/工具链核查，没有创建扩展或完成签名/原生小组件验收。

结论：可以为现有Tauri主应用增加原生WidgetKit扩展，作为桌面摘要入口；不是把现有WebView转换为小组件，也不建议替代跨应用置顶悬浮窗。macOS Sonoma 14引入桌面小组件；现有应用最低12可保留，小组件桌面能力单独要求14及以上。M系列芯片不是主要障碍，主要是系统模型、原生构建和数据边界。

| 方面 | 官方能力与当前差距 | 对薪慰的方案判断（尚未实施） |
| --- | --- | --- |
| 展示技术 | WidgetKit用SwiftUI和独立Widget Extension target，不支持任意WebView/滚动列表/文本输入 | 另做金额/状态/下班时间摘要；详情、设置、补算预览打开主应用 |
| 实时性 | 扩展不持续运行，timeline刷新受系统预算与调度控制；常用组件典型40–70次每日reload并非固定保证。动态日期文本可特殊更新，不等于任意金额可每秒刷新 | 不承诺原样复刻每秒工资滚动、秒级互动或准点弹层；分段timeline表达午休/下班，标明更新时间，收入仍由已确认事实恢复 |
| 交互 | 支持AppIntent驱动的Button/Toggle和打开应用的Link/widgetURL，不是只能看不能点 | 初版用Link打开正确主应用上下文；后续如加开工/收工Intent，必须接入同一事务/幂等业务入口，不复制Swift计薪规则，不让显示即开工 |
| 窗口心智 | 桌面小组件由系统放置/管理，切到其他窗口时可退居桌面背景 | 不等同跨应用置顶、跟随Space的悬浮窗，也不承诺⌘W/拖动行为与普通应用窗相同 |
| 共享状态 | Widget扩展是独立进程，App Groups是官方共享路径；当前配置在主应用app_data_dir，Rust Store互斥锁仅进程内 | 不能两进程各自直接写config.json。建议主应用提供只读摘要快照，动作回到同一提交服务；主应用退出后组件只读最近快照，不自动收工 |
| 隐私 | 系统缓存timeline，原有两WebView即时偏好同步不等于扩展缓存即时刷新 | 第一版默认遮罩/状态摘要；建立快照最小化与刷新协议，不能仅加一个隐私开关就承诺撤回所有旧缓存金额 |
| 构建/签名 | 当前只有Tauri/Rust构建配置，未含Widget Extension/App Groups。当前激活目录为CommandLineTools，xcodebuild -version提示需要完整Xcode | 需配置完整Xcode、扩展target、嵌入appex、签名及共享能力，并验证直接分发安装后的注册；无需为此重写Windows或整套主应用 |

建议增量路线：保留现有浮窗→原生只读状态/遮罩摘要＋打开应用→验证签名、缓存与数据同步→再考虑安全接入AppIntent操作。此为方案建议，不把后续小组件开发计入已交付功能。

官方来源，检索于2026-11-05；网页的Markdown版本也已读取：

- [Creating a widget extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension)：SwiftUI、扩展target及支持视图。
- [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)：独立进程、timeline、预算与动态展示。
- [Adding interactivity](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)：AppIntent、Button、Toggle与Link。
- [Shared data](https://developer.apple.com/documentation/technologyoverviews/shared-data)与[Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)：主应用与扩展共享数据。
- [macOS Sonoma](https://www.apple.com/newsroom/2023/09/macos-sonoma-is-available-today/)：桌面小组件及其桌面表现。
