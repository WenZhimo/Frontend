# 代理操作说明

本仓库是世界造山演化 fork 的路线工作区。后续代理在修改前应先阅读本文件。

## 战略路线

- `world-orogen-evolution/` 是世界造山演化 fork 的可跟踪实现靶区。
- `local-geology-v2-reference/` 是深时地质参考实验室，不是主产品。
- `external-references/` 存放已忽略的第三方参考仓库，绝不能暂存或提交。
- 优先从参考项目学习概念、接口和数据结构，再在本仓库中重写实现。

## 许可证边界

- World Orogen 使用 GPL-3.0。除非以后做干净重写，否则应把 `world-orogen-evolution/` 视为 GPL 派生 fork 靶区。
- GPlates、pyGPlates、GPlately 属于 GPL 系列参考。不要把它们的源码复制进非 GPL 靶区。
- WorldEngine 使用 MIT，civs 使用 Apache-2.0；即使授权较宽松，也仍优先吸收思想而不是整段复制代码。

## 长期授权

用户已授权对实质相似的阶段切换类任务采用以下循环流程：

1. 实现一个边界清晰的阶段或切片。
2. 使用合适检查进行验证；若改动影响网页运行，必须做浏览器验证。
3. 工作树干净后，只提交相关的已跟踪文件。
4. 对同类、已授权的下一阶段可继续推进，无需重复询问。

以下情况仍必须先停下询问：破坏性操作、推送或发布、明显新增范围或风险、用户自有改动归属不清、许可证敏感的直接复制、用户意图发生变化。

## 预检与保护

开始实质工作前：

1. 运行 `git status -sb`。
2. 识别用户自有改动，避免暂存或覆盖。
3. 阅读当前路线文档：
   - `世界生成与文明演化开发总纲.md`
   - `World Orogen Evolution Fork 技术审计.md`
   - `World Orogen Evolution Fork 阶段0 接口设计.md`
4. 除非用户明确要求提交，否则把 `.agent/*` 作为本地代理状态保留。
5. 永远不要暂存或提交 `external-references/`。

## 默认验证

- 仅文档改动：提交前运行 `git diff --check`。
- 运行时 JavaScript 改动：对触及模块运行 `node --check`，并对受影响流程做浏览器烟测。
- WebGL、worker、导出或时间轴改动：验证页面加载、控制台/页面错误、渲染、控件、图层切换，以及相关的 CPU/worker fallback。
