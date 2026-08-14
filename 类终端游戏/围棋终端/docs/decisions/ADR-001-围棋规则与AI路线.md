# ADR-001: 围棋第一版规则与 AI 路线

## Status

Accepted

## Date

2026-08-12

## Context

围棋终端项目需要在正式开发前确定规则和 AI 边界。项目延续类终端游戏总目录的视觉约束：所有可见棋盘、棋子和特效都应通过字符/Braille 点阵缓冲区表达，而不是自由 canvas 粒子。与此同时，围棋规则和 AI 比国际象棋/中国象棋更难直接依赖成熟强引擎，尤其是在纯本地静态网页中。

关键需求：

- 本地静态运行，不依赖后端。
- 规则层独立于渲染层。
- 支持确定性复现和测试。
- 第一版优先观赏性、稳定性、节奏，而不是顶级棋力。
- 后续可以逐步实验强引擎。

## Decision

第一版采用 `goban-engine` 规则核心 + 自研 seeded AI：

- 规则层明确使用 `goban-engine`，作为落子、提子、禁着、终局和计分的权威来源。
- 项目内只写薄适配层：负责静态加载验证、规则配置、move log、AI 输入输出转换、终端渲染事件转换。
- AI 层先实现 seeded heuristic personas，再实现低预算 seeded MCTS。
- 强引擎（KataGo WASM/WebGPU、GNU Go/Pachi/Leela Zero WASM）列为实验路线，不进入第一版主路径。
- 主线程只负责渲染和 UI，AI 通过异步接口或 Web Worker 隔离，并设置硬超时。
- Deterministic / Replay Mode 与 Full Engine / Live Mode 从一开始分开设计。
- `@sabaki/go-board` 降级为轻量 fallback 或测试对照，不进入主路径。

## Alternatives Considered

### `@sabaki/go-board`

- Pros：非常小，API 直接，容易做静态浏览器集成。
- Cons：需要项目内补 pass、终局、计分、move log 和更多规则边界。
- Outcome：不作为第一版规则核心，保留为 fallback 或测试对照。

### `jgoboard`

- Pros：board state、rules、SGF、renderer、player 覆盖完整。
- Cons：CC-BY-NC-4.0；renderer/player 与终端渲染目标重叠。
- Outcome：不作为默认依赖，只作参考。

### `goban`

- Pros：Online-Go 生态，功能丰富，维护较新。
- Cons：包体大，完整 UI/应用生态过重。
- Outcome：不进入第一版。

### KataGo WASM/WebGPU

- Pros：棋力强，观赏价值高。
- Cons：资源体积、初始化耗时、浏览器兼容和确定性都需要独立验证。
- Outcome：作为后续实验分支。

### 纯自研规则引擎

- Pros：完全可控，无依赖。
- Cons：围棋规则边界和测试成本高，容易在劫、提子、终局、计分上反复出错。
- Outcome：不作为第一选择；只在依赖无法满足时回退。

## Consequences

- 第一版可以很快进入视觉和玩法节奏实验。
- AI 棋力有限，但可通过 persona、开局模板和 seeded noise 做出有区分度的观赏局。
- `goban-engine` 的浏览器静态打包和规则配置需要先做 spike。
- 规则计分优先跟随 `goban-engine` 能稳定暴露的 scoring/ruleset；必要时在 wrapper 层补展示文本，而不是重写规则。
- 后续接强引擎时，需要新增资源加载、worker 复用、性能探针和兼容性测试。

## Follow-Ups

- 确认第一版默认棋盘尺寸：9x9、13x13、19x19，或三者可切换。
- 为 `goban-engine` 写最小 spike，验证浏览器静态打包、基础落子 API、规则配置、终局和得分读取。
- 确认第一版默认规则：优先选择 `goban-engine` 中最适合自动观赏局的配置。
- 设计围棋特效语言：落子脉冲、气脉、提子消散、地盘热度、终局定格。
