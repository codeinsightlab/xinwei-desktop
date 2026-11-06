# 2026-11-06 Windows 安装包 CI 换行故障修复

## 证据与原因

失败任务：https://github.com/codeinsightlab/xinwei-desktop/actions/runs/42168883436 。版本检查输出前五项1.2.1、最后一项为空，退出1；不是六处版本实际不一致。scripts/version.mjs原Cargo.lock正则硬编码LF，而Windows检出可使用CRLF，导致本应用package块无法匹配。Cargo.toml匹配跨行使用通用字符，故仍能读出版本。之前的版本脚本测试只构造LF，没有覆盖Windows换行。

仓库已有e077ab7先在checkout前设置core.autocrlf=false；其任务42169004484已通过版本检查和前端测试，完整构建仍需观察。这是CI环境层缓解，脚本本身仍应支持Windows本地工作区。本轮不覆盖其他人正在维护的工作流。

## 修改范围

- Cargo.lock解析兼容LF、CRLF及混合换行，版本递增保持原锁文件其他内容和行尾。
- .gitattributes仅对两个Rust版本元数据文件指定LF，避免新检出产生平台差异；不批量重写已有源码或官网文件。
- 新增CRLF/混合行尾的check、patch、再次check、依赖内容保留及真实不一致仍拒绝的回归测试。

本地90项前端/脚本单元通过，version:check通过，diff检查通过。未改变桌面计薪、窗口行为、应用版本或依赖；未打包新macOS安装包。官网并行改动和未提交的性能审查文档不纳入此提交。完整Windows CI及安装产物验证结果后续追加；不能由本地Mac单元推称Windows编译或原生交互已通过。

## 触发范围说明

当前Windows工作流只有workflow_dispatch，要求固定源码SHA和期望版本，并非每次push自动构建；自动push工作流是官网。近期列表里Windows有一次失败、一次取消和一次正在执行，不能把取消或其他工作流泛称同一Windows失败。

## 第二层失败：跨平台功能准备顺序

版本检查通过后，任务42169004484在cargo test的build.rs失败，原文为tauri dependency features不匹配allowlist，要求运行tauri dev/build或移除macos-private-api。Windows配置不启用Mac私有API，而源码Cargo.toml含此功能；Tauri CLI负责结合目标平台配置同步托管功能，直接Cargo调用未做该准备。查阅本机锁定tauri-build 2.6.3的src/manifest.rs确认该一致性检查。不是Rust测试断言失败，也不是Windows原生交互失败。

并行提交63b156e已把Tauri CLI的Windows安装包构建放到直接Cargo测试之前，二者成功后才收集/上传产物。任务42169396281使用该工作流提交，但构建回执sourceRevision实际为固定桌面源码f2beaf6，而非工作流headSha 63b156e。该任务已完整成功（88项前端、15项Rust、NSIS及上传），安装包SHA256已核对；它验证工作流顺序修复，但不能声称已在Windows测试本轮新增的2项换行用例。现另以当前完整源码提交调度最终验收。本轮没有覆盖并行工作流修改。

调度记录：代理曾误填一次测试任务的source_ref，产生42169301999的checkout失败，此次为调度输入错误，不归入产品构建根因；后续使用已验证存在的完整Git SHA。当前以42169396281为有效验收任务，不能把误调度任务说成已取消或成功。

## Mac与Windows开发约定

共用源码和锁文件；版本脚本直接兼容两种换行，Git属性对元数据约束LF。平台原生功能通过Tauri CLI准备后再直接Cargo验证，不把Mac本机通过推称Windows通过，也不移除Mac所需能力来回避Windows错误。安装包构建、单元测试、上传与原生交互分别验收。

## 产物回执及最终验证任务

42169396281的Windows安装包已下载并按回执SHA256核对通过：4d907e23d81ee76496a954a531471b3a1a6333d2bed47249f03aa3147dd99252。该任务sourceRevision为f2beaf6，证明工作流修复；不把headSha当作实际构建源码。为覆盖本轮脚本/换行回归，用git rev-parse HEAD取得真实完整SHA 63b156e51fc6133ef28639a151b45933e8e4d295后调度42170261326，避免手填SHA。最终任务结果随后追加。

平台说明和正确测试顺序已补入README“测试与构建”。本机旧脚本+CRLF复现了CI相同的第六项版本为空错误；相同文件交由修复后的脚本则校验通过。

## 最终验收通过

https://github.com/codeinsightlab/xinwei-desktop/actions/runs/42170261326 全部成功。构建回执sourceRevision为63b156e51fc6133ef28639a151b45933e8e4d295，明确包含本轮换行修复和回归测试；Windows runner前端/脚本90项、Rust15项通过，NSIS安装包构建、收集和上传均成功。下载后计算SHA256与回执一致：07dd670d89dff56238993425ffc84cf45cd7ba294cbd36c2059e2505481ca73e。本机忽略目录artifacts/windows-ci-42170261326保留安装包、回执和校验值。

现存upload-artifact动作运行时弃用提示属于非失败警告，runner已强制Node24并成功上传；本次未为消除提示升级Action主版本。原生Windows交互仍未实机验收，签名仍为unsigned，不能将CI构建通过说成安装运行或系统交互通过。没有更改桌面业务逻辑、版本或个人数据。

## 2026-11-06 双平台持续检查扩展

用户要求每次推送自动检查macOS和Windows。新增desktop-checks.yml：push（所有分支/标签）、pull_request、workflow_dispatch均触发；矩阵为macos-15的真实arm64和windows-2022的x64，Mac步骤明确断言uname架构。选择依据GitHub官方runner-images当前标签表，macos-15为arm64，不使用已经退役的macos-14或误用镜像内部名称macos-15-arm64。来源：https://github.com/actions/runner-images 。

工具链固定Node22.23.1和本机已验证的Rust1.98.0；每端执行npm ci、版本检查、前端单元、Tauri CLI原生debug/no-bundle构建及指定target的Cargo锁定/串行测试。保留CLI先于Cargo顺序；不打安装包、签名或发布。Rust缓存采用官方actions/cache v5固定提交caa296126883cff596d87d8935842f9db880ef25（已核对Node24），按OS/target/Rust/依赖和配置键隔离。任务超时30分钟，fail-fast=false，同ref旧检查可取消。原有固定源码安装包和官网发布工作流保持原样。

本节仅改CI及文档，不改业务代码、依赖或应用版本。实际远端两平台结果随后追加。
