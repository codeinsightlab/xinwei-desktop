# 薪慰：Codex 互动迭代交接包

这是可交给Codex的实现说明与素材契约，不是应用源码或已完成的美术资产。

## 内容

- `CODEX_ITERATION_PROMPT.md`：完整迭代任务，明确替换自动开工规则，避免做成考勤。
- `content/interaction-catalog.zh-CN.json`：31个场景、93条主文案、13组可选接话；含变量和隐私替代文案。
- `assets/MASCOT_ASSET_SPEC.md`：一个母版、八个动作的制作与投递规格。
- `assets/mascot.manifest.json`：待制作资源映射，所有sourceFile为null，不是现成插画。
- `references/`：三张旧概念参考图及用途说明，便于追溯，不能照搬所有页面和数字。

## 推荐使用方式

把整个文件夹放到当前仓库 `docs/iteration-engagement/`（或同类文档目录），然后告诉Codex：

```text
请先读取当前仓库AGENTS.md，再执行 docs/iteration-engagement/CODEX_ITERATION_PROMPT.md 的完整迭代任务。同步读取同目录content/、assets/、references/README.md。先核对现有实现，然后直接增量实现、测试并交付回执。正式角色素材尚未齐全时，按文档使用统一占位，不阻塞业务，不伪称美术完成。
```

视觉上下文可额外附 `references/01-dark-reference.png`；另外两张只在需要组件/手绘细节时附上，并解释用途。不要给Codex无法访问的本地旧路径；当前仓库中必须能实际读到文件。

推荐先跑通交互，再替换正式角色素材。最终美术素材进入项目 `src/assets/mascot/`，不要让运行时去读取docs中的概念图。

## 注意

本包没有运行用户仓库、没有修改应用、没有执行Windows实机验收。文字中的业务边界与阈值是本次方案，旧图仍可能有已经否定的业务内容；以Prompt为准。源码兼容性需要Codex读取仓库后确认。
