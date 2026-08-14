# 中国象棋终端

这是 `类终端游戏` 系列的第二个项目，目标是把中国象棋做成与 `点阵国际象棋终端` 同一套视觉语言的纯本地静态页面。

## 运行

```bat
start.bat
```

脚本会在当前目录启动本地 HTTP 服务，并自动打开页面。

## 当前实现

- 渲染：Canvas 模拟固定字符终端，棋盘、棋子、拖尾、涟漪和面板都经由字符缓冲区输出。
- 点阵：棋盘和棋子使用 Braille 字符 mask，不直接绘制圆点或 SVG 棋子。
- 规则：`ai-worker.js` 内置轻量中国象棋规则生成器，支持将/士/象/马/车/炮/兵基本合法走法、蹩马腿、塞象眼、九宫、过河兵、炮架、飞将与自将过滤。
- AI：选手池由多个启发式风格组成，每局按种子随机选红黑双方。
- 复现：Replay 模式使用 100 位 ASCII seed，配对和走法选择均走 seeded RNG。
- 性能：规则和 AI 在 Web Worker 内运行，主线程只负责动画和终端渲染。

## 引擎调研结论

### Pikafish

- 路线：最强实战路线，UCI + NNUE，源自 Stockfish。
- 优点：棋力强、生态成熟、适合作为 Full Engine / Live Mode 的强引擎。
- 代价：GPL-3.0；浏览器静态集成需要 WASM/worker/UCI 适配和 NNUE 文件加载，首版成本较高。
- 当前决策：作为后续强引擎适配目标，不直接放入首版静态页面。

### sl-wukong-engine

- 路线：TypeScript 中国象棋规则与搜索引擎，npm 包可打包到浏览器。
- 优点：API 覆盖 FEN、合法走法、搜索、重复/和棋状态，MIT。
- 实测问题：浏览器 worker 初始化和搜索开销对这个终端动画项目偏重；首步容易超过 10 秒超时。
- 当前决策：保留为候选研究方向，不在首版运行时加载。

### xiangqi.ts / xiangqii / zgxq

- 路线：轻量 JS/TS 规则库或算法包。
- 观察：部分 API 文档不完整，部分包维护状态和浏览器适配不够明确。
- 当前决策：首版用本地轻量规则 worker，避免把用户体验绑在不稳定外部包上。

## 后续建议

1. 把当前轻量规则 worker 拆成可测试的规则模块。
2. 增加 perft/固定局面测试，验证每类棋子的合法走法。
3. 为 Replay 模式补 determinism 测试脚本。
4. 单独实现 Pikafish adapter：UCI worker、NNUE 加载、固定 depth、超时终止。
5. 在 Live Mode 中接入 Pikafish 或 Wukong，在 Replay Mode 中继续使用轻量 deterministic AI。
