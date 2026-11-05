# 2026-11-05 应用行为整改验收

版本：1.1.0；环境：Apple Silicon/macOS，本地隔离原生debug容器和生产窗口配置；范围：正常可控退出、独立窗口、激活和恢复。不是Windows实机报告，也不是签名/公证报告。规则入口及实施证据见[行为契约](../PRD-ENGAGEMENT-DELTA.md#2026-11-05-集中整改实施与验证)。

## 已运行证据

| 层级 | 操作 | 结果 |
| --- | --- | --- |
| 前端单元 | npm test | 88项通过；退出重入/取消/写入、原生平台信息、既有计薪与今日设置等 |
| Rust单元 | cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1 | 12项通过；退出状态机、恢复能力及激活策略等 |
| 浏览器夹具 | npm run test:e2e | 完整50项通过；含退出保存/放弃/取消、普通与隐私预览、无效输入、写失败、revision冲突、等待写入、工资及约定草稿组合 |
| 类型/前端构建 | npm run build | 版本一致性、vue-tsc、Vite通过 |
| Mac原生 | 隔离应用真实按键、菜单、NSWindow/NSApplication状态与进程退出码 | 下表逐项；不能替代未执行系统入口 |

原生测试应用为`/tmp/XinweiBehaviorSmoke.app`、identifier `io.xinwei.desktop.behavior-smoke`。只用虚构数据；正式`/Applications/薪慰.app`及其数据目录没有替换。观测使用原生AX、真实按键、原生状态日志和隔离JSON比对，不使用网页截图证明系统行为。

| 原生场景 | 观测 | 状态 |
| --- | --- | --- |
| 小窗⌘W | 只隐藏widget，settings草稿仍存在 | 通过 |
| 设置⌘W/关闭按钮 | 有草稿确认，取消保持草稿；无草稿只隐藏settings，widget仍显示 | 通过 |
| ⌘Q及原生应用菜单Quit | 共同进入三选一；连续3次Q同一请求ID，只一次review | 通过 |
| 保存并退出 | 原日期/金额预览可取消；确认提交后两窗就绪、持久化完成、进程退出0 | 通过 |
| 放弃/取消 | 放弃仅草稿，配置与基线一致并退出0；取消可继续编辑、再次退出重新检查 | 通过 |
| ⌘, | 打开/复用唯一设置，草稿不重置 | 通过 |
| ⌘H | NSApplication.hidden=true，两窗不可见，没有退出或提交 | 通过 |
| 最小化/恢复 | settings minimized=true，草稿不丢；二次启动恢复settings，widget保持隐藏 | 通过 |
| 用户二次启动 | 第二进程0退出，主实例恢复草稿设置，不强行选择widget | 通过 |
| --autostart | showWidget=false时两窗隐藏；重复后台启动无show/focus；无新增开工与回执 | 通过 |
| 正常退出再打开 | 配置与隐私恢复，无伪造收工；跨日未知结束仍待收尾 | 通过 |
| 当前恢复能力 | 状态项初始化成功；实际Regular策略有Dock；单实例链路真实接通 | 能力观测通过，图标点击见待验 |

最初仅靠ExitRequested的原生Quit试验失败，已修复AppKit代理接入后重跑通过；不得删除该失败历史。锁定Tao代理新增可选方法，升级Tao/objc2/muda后必须重新验收。系统强制结束、崩溃或强制关机不承诺草稿提示。

本机忽略的夹具证据：`artifacts/behavior-smoke-initial.json`、`behavior-smoke-after-save.json`、`behavior-smoke-recovery-baseline.json`、`behavior-smoke-after-discard.json`、`native-application-behavior-acceptance.json`。它们不含个人工资，不提交。11月5日自然恢复后的PENDING_END是既有跨日规则，后续比较以recovery-baseline为准。

## 待执行的Mac原生清单

以下均标为未实机验证，不能把初始化成功、策略mock或程序Reopen回调当作实际图标点击通过。

1. **菜单栏实际入口**：设置编辑未保存的工作日；隐藏小窗；点击菜单栏时钟→显示小窗，应仅恢复widget且草稿仍在。再从菜单栏打开设置，编辑不重置。点击菜单栏退出，应出现保存/放弃/取消，取消后可继续编辑，放弃后进程真正结束。当前自动化访问SystemUIServer超时。
2. **Dock物理重开**：设置留草稿，⌘H；点击Dock图标，应恢复设置草稿，不强制弹小窗。关闭设置且无草稿后，点Dock按有效上下文恢复，不在每次焦点变化时重选窗口。当前自动化访问Dock超时。
3. **无Dock发行分支**：当前发行Regular策略有Dock；若未来提供Accessory/无Dock发行配置，在独立identifier测试，不改正式偏好。验证只报告实际入口，菜单栏正常时可隐藏；菜单栏失败时仍需接通单实例恢复或保留可操作窗口。当前未提供该发行分支，只有策略测试。
4. **全部恢复入口失效**：在专用故障注入构建同时关闭状态项/Dock/单实例且无其他可操作窗口，点击隐藏应保留当前窗、显示说明和显式退出入口；有设置草稿时不破坏草稿。正式应用不添加永久故障开关。目前仅策略mock通过。
5. **首次未激活拖动**：保留已有AppKit拖动方案；切到其他应用后，第一次从小窗顶部空白拖动，应该立即移动且不触发按钮。此次退出整改不重新宣称该场景已实测；仍需安装后手验。

## Windows原生清单（全部未实机验证）

需Windows x64/WebView2及Rust MSVC环境。`npm ci`、`npm test`、`cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`、`npm run build`、`npm run desktop:build`。实际运行打包APP，不用浏览器替代。

| 编号 | 操作 | 应有结果 |
| --- | --- | --- |
| W01 | 同时打开两窗，在设置留工资或约定草稿；分别点击widget关闭、设置关闭、Alt+F4 | 只处理当前窗；widget不触及设置草稿；设置取消后保留草稿；不退出/不收工 |
| W02 | 托盘退出，连续请求；依次取消、无效值保存、放弃、有效保存 | 一轮确认；失败不退出；工资日期/金额预览不能绕过；最终写入完成才真正退出 |
| W03 | 设置草稿最小化，切应用，再次启动程序 | 原单实例恢复有效设置上下文，草稿未提交未丢弃，不强行切widget |
| W04 | 托盘左击/显示小窗/设置菜单 | 显式显示目标窗口；草稿、隐私、置顶保留；不重复开工/扣减/互动 |
| W05 | 打开三点菜单、明细、确认弹层后Esc | 只收起当前局部界面，事件不继续冒泡导致额外关闭；无弹层时Esc不新增整窗隐藏 |
| W06 | 查看任务栏 | widget跳过任务栏，settings是普通窗口；不把两窗都做成工具窗 |
| W07 | 登录启动并选择不显示小窗；已运行时再次--autostart | 后台偏好生效，不抢编辑焦点，不开工或主动互动；未配置可进入引导 |
| W08 | 故障注入托盘创建失败/全部恢复入口失败 | 有实际其他路径仍可找回；全部失效保留最后操作窗口，说明准确，显式退出仍可用 |
| W09 | 退出后重开并检查配置/隐私/业务事实 | 配置和遮罩一致，无额外收工/扣减/回执；未知跨日结束仍待收尾 |

Windows跨虚拟桌面不在本次实现范围，不宣称等同macOS Space。正常退出以进程已结束和数据落盘确认，不能以窗口消失代替。

## 安装、数据与回退

安装包交由用户手动拖入应用程序；先显式退出旧版，避免仍在运行的旧进程使版本识别混淆。小窗和关于页应显示1.1.0。正式数据仍在`~/Library/Application Support/io.xinwei.desktop/`，退出后可备份整个目录；不要删除配置“修复”问题。

本轮不迁移schema，无新增权限、服务器或遥测。回退使用先前安装包；本轮大范围未提交工作区不能使用git reset/clean回退，应按文件与变更块审查。旧版本可能仍有已知退出草稿缺陷。

## 1.1.0 构建回执

原生关键关闭/退出验收后运行`npm run desktop:build:mac`，release构建及APP/DMG打包成功；版本检查、类型检查及Vite前置构建均通过。包内CFBundleShortVersionString/CFBundleVersion均为1.1.0，identifier为`io.xinwei.desktop`，lipo仅arm64，hdiutil verify通过。临时原生验收进程已正常退出。未运行正式安装包，交由用户手动安装；安装后的首次未激活拖动及待验原生入口仍按上述清单验收。

- 安装包：`src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/薪慰_1.1.0_aarch64.dmg`
- SHA-256：`d3f9cff6c7f8b2d0bc988039da78525c7f84ebc8aed16028ed7af2f52f8cf225`
- 本地开发包未完成Developer ID签名/公证，不代表正式分发完成。未自动安装、未提交推送。
