# 围棋终端

终端风格围棋自动对局原型。页面使用 `<canvas>` 模拟固定尺寸字符终端，棋盘、棋子和特效均通过字符/Braille 点阵缓冲区输出，而不是直接绘制自由粒子。

## 当前状态

- 状态：Prototype
- 日期：2026-08-12
- 规则核心：`goban-engine` 8.3.x，本地 vendor 文件位于 `vendor/goban-engine.js`
- 对局方式：AI 自动对局，支持 9x9 / 13x13 / 19x19 切换
- AI：seeded heuristic personas，第一版优先观赏节奏和可复现性
- 视觉：落子脉冲、气脉呼吸、提子消散、终局地盘显影

## 运行

直接打开 `index.html` 即可运行；也可以双击 `start.bat` 启动本地 HTTP 并自动打开页面。

```text
围棋终端/
  index.html
  styles.css
  app.js
  start.bat
  vendor/goban-engine.js
  docs/
```

## 操作

- `9 / 13 / 19`：切换棋盘尺寸
- `RANDOM`：生成新 seed 并重开
- `COPY`：复制当前 100 位 ASCII seed
- `PLAY`：使用输入框中的 seed 重开
- `1 / 2 / 3 / 4`：播放速度 0.5x / 1x / 2x / 4x
- `Space`：暂停/继续
- `R`：reroll，新 seed 重开
- `P`：使用当前 seed 重开

## 架构

- 规则状态由 `goban-engine` 持有，前端只通过 `place()`、`computeLibertyMap()`、`computeScore()`、`computeScoringLocations()` 等 API 读取结果。
- 视觉状态独立于规则状态，落子、提子、气和终局只转成终端事件，不在渲染层重写围棋规则。
- 随机性集中在 seed RNG 和 AI persona 权重中，同一 seed、尺寸和版本应复现同一局。

## 文档

- `docs/开发前调研.md`：规则引擎、SGF、AI、实现阶段建议
- `docs/视觉特效方案.md`：围棋特效语言和当前实现
- `docs/decisions/ADR-001-围棋规则与AI路线.md`：规则与 AI 路线决策记录
- `../终端棋类视觉技术说明.md`：公共终端视觉技术基线
