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
