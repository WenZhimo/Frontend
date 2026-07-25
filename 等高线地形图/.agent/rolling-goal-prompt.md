# Rolling Goal Startup Prompt

Copy this prompt into the main conversation when you want to start or resume rolling target execution mode:

```text
进入滚动目标执行模式。

工作区：D:\盒子\HTML\等高线地形图

请先执行 `git status -sb`，识别并保护所有用户未提交改动。
然后读取项目规则文件，以及：
- `.agent/rolling-protocol.md`
- `.agent/current-goal.md`

按协议执行：每轮只做一个最小、完整、可回滚的逻辑切片。完成该切片后，运行 `.agent/current-goal.md` 中定义的验证门禁，并更新 `.agent/current-goal.md`，记录已完成内容、验证结果、下一轮目标和自动轮数。

不得提交或推送 `.agent/*`。
不得覆盖用户未提交改动。
不得进行无关重构。
达到 `maxAutoRounds` 后停止。

如果遇到不可逆 API、数据契约、存档结构、用户数据路径、发布流程、用户数据删除、无法保护的未提交改动，或目标与项目规则/最新用户指令冲突，必须停止并询问我。
```
