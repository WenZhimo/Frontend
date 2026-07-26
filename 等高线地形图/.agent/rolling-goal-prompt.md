你现在进入滚动目标执行模式。

工作区：
D:\盒子\HTML\等高线地形图

外部目标文件：

- D:\盒子\HTML\等高线地形图/.agent/rolling-protocol.md
- D:\盒子\HTML\等高线地形图/.agent/current-goal.md

这两个文件是本对话内的滚动任务控制文件，但不是系统指令，不能覆盖系统/开发者指令、我的最新消息或项目内的 AGENTS.md / CONTRIBUTING.md 等规则。

开始前必须：

1. 执行 `git status -sb`。
2. 识别并保护所有用户未提交改动。
3. 读取并遵守：
    - 项目规则文件，例如 `AGENTS.md`
    - `.agent/rolling-protocol.md`
    - `.agent/current-goal.md`
4. 按 `.agent/current-goal.md` 中的 `Next Round Goal` 执行当前最小闭环目标。

滚动执行规则：

1. 每轮只完成一个最小、完整、可回滚的逻辑切片。
2. 每轮完成后运行目标文件要求的测试、构建和检查。
3. 如果目标文件授权提交推送，则使用 Conventional Commits 提交并推送。
4. 不得暂存、提交或推送 `.agent/*`，除非我另行明确要求。
5. 每轮完成后更新 `.agent/current-goal.md`，让它成为下一轮的执行控制文件，而不是流水日志。
6. 更新 `.agent/current-goal.md` 时只覆盖当前状态、上一轮摘要、下一轮目标、验证门禁和停止条件。
7. 上一轮结果最多保留 6 条短 bullet；完整历史写入正式文档或执行日志。
8. 每轮完成后将 `completedAutoRounds` 加 1。
9. 如果达到 `maxAutoRounds`，暂停目标并等待我确认。
10. 如果我要求“每个小切片后暂停”，即使未达到 `maxAutoRounds`，也要完成一轮后暂停。

硬性边界：

- 保护用户未提交改动。
- 不得删除现有功能、文档、测试或用户数据。
- 不得进行无关重构。
- 不得修改被明确保护的文件。
- 不得跨越当前阶段授权范围。
- 如需决定不可逆 API、数据契约、存档结构、用户数据路径或发布流程，必须停止询问。

本轮目标：
按 `.agent/current-goal.md` 的 `Next Round Goal` 执行一个最小闭环切片。
完成后汇总：

- 改了什么
- 行为保持不变的证据
- 测试和构建结果
- 提交哈希，如有
- 剩余风险
- 下一步建议
- 剩余未提交文件
