# 贪吃蛇终端

同“类终端游戏”系列风格的本地静态贪吃蛇游戏。

- 渲染方式：固定字符缓冲区 + canvas 字符绘制，蛇、苹果、轨迹、涟漪和爆裂均由 Braille / block glyph 拼接。
- AI 来源：`D:\盒子\HTML\SNAKE_AI` 的浏览器运行时源码。
- 已接入模型：仅 `SnakeAI PC`，忽略尚未训练的 phone / tablet 模型。
- 可用策略：SnakeAI PC、A* SAFE、Hamiltonian+、BFS、Flood Fill、Dijkstra、Voronoi、Greedy。

启动：

```bat
start.bat
```
