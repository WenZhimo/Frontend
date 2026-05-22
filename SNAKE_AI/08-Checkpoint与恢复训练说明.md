# Checkpoint 与恢复训练说明

## 这份文档讲什么

这份说明专门解释：

- 什么是 checkpoint
- 什么是 training history
- 它们之间的区别
- 手动训练如何恢复
- 长期自动训练如何恢复
- `resume_strict` 的作用

---

## 1. checkpoint 是什么

在这个项目里，checkpoint 主要指：

```text
artifacts/models/checkpoints/<profile>/<seed>-latest/
```

它保存的是某个 seed 在某个训练阶段的：

- 整个人口
- 当前代数
- best_so_far
- 随机状态
- trainer 参数快照
- settings 快照

也就是说，checkpoint 不是“一个模型文件”，而是：

> **某次训练当时的完整种群状态快照**

---

## 2. training history 是什么

training history 主要指：

### profile 级 history

```text
artifacts/models/checkpoints/<profile>/training-history.json
artifacts/models/checkpoints/<profile>/training-report.html
```

### seed 级 history

```text
artifacts/models/checkpoints/<profile>/<seed>-latest/training-history.json
artifacts/models/checkpoints/<profile>/<seed>-latest/training-report.html
```

它记录的是：

- 每一代最佳个体的摘要
- 例如 `bestSelectionScore`、`bestAvgScore`、`bestAvgFrames`

它不是整个人口本身，而是：

> **每代训练结果的摘要历史**

---

## 3. checkpoint 和 history 的区别

### checkpoint

保存的是：

- 整个人口状态
- 可用于恢复训练

### history

保存的是：

- 每代最佳个体的摘要历史
- 可用于看曲线、做报告、做长期训练中的历史比较

### 一句话区别

- 想继续训练：看 **checkpoint**
- 想看训练过程表现：看 **history**

---

## 4. history 和 checkpoint 的更新频率不同

### history

`training-history.json` / `training-report.html` 是：

- **每代写**

### checkpoint

`<seed>-latest/` 是：

- 按 `population_checkpoint_interval` 覆写

所以如果你看到“每 5 代更新一次”：

- 说的是 checkpoint
- 不是 history

---

## 5. 手动训练如何恢复

在：

```text
src/train/snake_nn/trainer.py
```

里，设置：

```python
resume_from_checkpoint='artifacts/models/checkpoints/pc/23-latest'
```

然后再运行：

```bash
python src/train/snake_nn/trainer.py
```

### 注意

`generations` 表示：

- 目标总代数上限
- 不是“再训练多少代”

例如：

- checkpoint 当前在第 50 代
- 你想跑到第 200 代
- 那就设置 `generations=200`

---

## 6. 长期自动训练如何恢复

长期自动训练不会要求你手动填 `resume_from_checkpoint`。

它会自动扫描：

```text
artifacts/models/checkpoints/<profile>/*-latest/checkpoint_meta.json
```

如果发现：

- 当前代数 `< trial_generations`
- 且与当前长期训练参数兼容

就会优先恢复这些未完成试训的 checkpoint。

### 优先级

长期自动训练的顺序是：

1. backlog checkpoint
2. hybrid
3. new seed

所以只要 backlog 没清空，通常不会立刻创建新 seed。

---

## 7. `resume_strict` 是什么

`resume_strict` 控制：

- 恢复训练时，是否要求 checkpoint 参数与当前参数严格一致

### `resume_strict = True`

- 参数不一致就拒绝恢复
- 更安全
- 训练轨迹更连续

### `resume_strict = False`

- 允许带着旧 checkpoint 用新参数继续跑
- 更灵活
- 但训练轨迹可能不再和原始连续训练完全等价

---

## 8. 长期训练现在如何处理不兼容 checkpoint

长期自动训练现在不会再因为旧 checkpoint 不兼容而直接崩掉。

如果 backlog 里有：

- 代数符合要求
- 但参数与当前长期训练配置不兼容

它会：

- 记录日志
- 跳过这个 checkpoint
- 继续找下一个可恢复 checkpoint

也就是说：

> 不兼容 backlog 现在会被“跳过”，而不是直接把长期训练跑崩。

---

## 9. 什么时候应该保留 checkpoint

建议保留 checkpoint 的场景：

- 你想恢复手动训练
- 你想让长期自动训练优先续训 backlog
- 你想保留某些高价值种群，未来可能做 hybrid 融合

不建议随意清理 `<seed>-latest/`，除非你确认：

- 不再需要恢复
- 不再需要长期训练续训
- 不再需要它作为 hybrid 来源种群

---

## 10. 相关目录速查

### 恢复训练看这里

```text
artifacts/models/checkpoints/<profile>/<seed>-latest/
```

### 看每代历史看这里

```text
artifacts/models/checkpoints/<profile>/training-history.json
artifacts/models/checkpoints/<profile>/<seed>-latest/training-history.json
```

### 看候选模型看这里

```text
artifacts/models/exports/<profile>/
```

### 看长期训练调度日志看这里

```text
artifacts/models/long-run/<profile>/run-log.jsonl
```

---

## 11. 推荐理解方式

你可以把它们分成三类：

### 1. 候选模型

- 导出 JSON
- 用来评估、晋升默认模型

### 2. 训练历史

- 每代摘要
- 用来看趋势、做长期比较

### 3. 恢复点

- 整群 checkpoint
- 用来继续训练

只要把这三层分清，整个项目里的训练产物就会清楚很多。
