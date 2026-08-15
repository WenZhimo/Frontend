# 吃豆人终端

同“类终端游戏”系列风格的本地静态 Pac-Man inspired 小游戏。

- 渲染方式：固定字符缓冲区 + canvas 字符绘制。
- 迷宫：每局由 100 位 ASCII 种子生成随机迷宫，同一种子可复现同一张地图。
- 视觉：墙体、豆子、能量豆、吃豆人、幽灵、拖尾、吞噬爆裂、恐惧波纹均由 Braille / block glyph 拼接。
- 模式：`AI DEMO` 自动吃豆，`HUMAN` 支持键盘/指针控制。
- AI：`SURVIVAL` / `LOOKAHEAD` 使用多步生存规划，幽灵采用 Blinky/Pinky/Inky/Clyde 风格目标追击；`CLASSIC` 保留旧版轻量策略。
- 操作：`WASD` 或方向键移动，`Space` 暂停，`R` 重开，`1-4` 调速，`C` 返回总入口。

启动：

```bat
start.bat
```
