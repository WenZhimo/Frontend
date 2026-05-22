# SNAKE_AI

本项目用于个人网站页面动态背景中的 Snake AI 运行、训练、评估与模型管理。

当前仓库已经收敛到一套统一结构：
- `apps/`：可直接访问的页面与本地服务入口
- `src/`：浏览器运行与 Python 训练源码
- `data/`：浏览器运行时读取的默认模型
- `artifacts/`：训练、评估、checkpoint、长跑日志等产物

如果工作区里还能看到 `snake_core/`、`snake_inference/`、`snake_strategy/` 这类顶层目录，请把它们视为本地残留兼容目录；当前主流程和入口不依赖它们。

---

## 文档索引

根目录下已经补充了几份中文说明文档，建议按需要查阅：

- [01-新手开始说明](01-新手开始说明.md)
- [02-目录结构说明](02-目录结构说明.md)
- [03-模型管理页说明](03-模型管理页说明.md)
- [04-运行测试台说明](04-运行测试台说明.md)
- [05-手动训练说明](05-手动训练说明.md)
- [06-长期自动训练说明](06-长期自动训练说明.md)
- [07-评估模型说明](07-评估模型说明.md)
- [08-Checkpoint与恢复训练说明](08-Checkpoint与恢复训练说明.md)

---

## 一、主要入口

### 1. 本地管理服务

```bash
python apps/model_manager/server.py
```

启动后会：
- 在本地启动 HTTP 服务，默认地址 `http://127.0.0.1:8000`
- 自动打开模型管理页面
- 提供模型管理页所需的本地 API

### 2. 模型管理台

```text
http://127.0.0.1:8000/apps/model_manager/index.html
```

用途：
- 查看当前默认模型（PC / phone / tablet）
- 浏览候选模型
- 触发单模型评估或批量评估
- 打开训练报告 / 评估报告
- 查看 checkpoint 与恢复训练提示
- 将候选模型设为默认模型

### 3. 浏览器运行测试台

```text
http://127.0.0.1:8000/apps/runtime/index.html
```

用途：
- 观察贪吃蛇运行效果
- 切换策略（A* SAFE / HAMILTONIAN / HAMILTONIAN+ / SNAKEAI 各设备模型）
- 调整速度与显示参数
- 查看实时 telemetry

### 4. 批量种子训练入口

```bash
python src/train/snake_nn/trainer.py
```

用途：
- 对某个设备档位（PC / phone / tablet）做一轮或多轮固定种子训练
- 自动导出候选模型
- 自动评估候选模型与当前默认模型
- 自动生成本轮排行榜与 `best-of-batch.json`

这是最适合手动调参、手动观察训练结果的入口。

### 5. 长期自动训练入口

```bash
python src/train/snake_nn/long_run_trainer.py
```

用途：
- 优先恢复未完成试训的 checkpoint
- 在 warmup / trial / full train / hybrid 之间自动切换
- 自动批量评估候选模型
- 根据 top-N 规则清理弱模型与旧 checkpoint
- 持续积累并重排候选模型池

这是最适合长期后台跑模型筛选的入口。

---

## 二、当前目录结构

### `apps/`
运行入口。

- `apps/model_manager/index.html`：模型管理台
- `apps/model_manager/server.py`：本地服务与 API
- `apps/runtime/index.html`：浏览器运行测试台

### `src/runtime/`
浏览器侧运行源码。

- `core/`：贪吃蛇引擎
- `strategy/`：策略实现
- `inference/`：神经网络推理与特征构造

### `src/train/snake_nn/`
Python 训练与评估源码。

- `trainer.py`：批量种子训练主入口
- `long_run_trainer.py`：长期自动训练主入口
- `headless_train.py`：核心训练循环、checkpoint、训练报告
- `evaluate_models.py`：模型评估与评估报告生成
- `export_model.py`：导出入口
- `browser_export_adapter.py`：浏览器模型导出
- `paths.py`：训练侧 canonical 路径定义
- `profiles.py`：设备档位与默认模型路径定义
- `scoring.py`：训练/评估打分逻辑
- `vendor/chrispresso/`：第三方遗传算法基础实现
- `requirements.txt`：训练侧最小依赖说明

### `data/models/profiles/`
浏览器运行时直接读取的默认模型。

- `pc.json`
- `phone.json`
- `tablet.json`

当你在模型管理页点击“设为默认”时，目标就是这里。

### `artifacts/models/exports/<profile>/`
候选模型导出与按档位保存的评估产物。

常见内容：
- `<profile>-<generations>-<seed>-<serial>.json`
- `best-of-batch.json`
- `*.eval-report.json`
- `*.eval-report.html`
- `evaluation-report.json`
- `evaluation-report.html`

### `artifacts/models/checkpoints/<profile>/`
训练过程产物与恢复训练用 checkpoint。

常见内容：
- `best.json`
- `best-so-far.json`
- `<seed>-latest/`
- `training-history.json`
- `training-report.html`

说明：
- `training-history.json` / `training-report.html` 属于**每代训练历史**，会按代连续更新。
- `<seed>-latest/` 属于**整群 checkpoint**，其覆写频率由 `population_checkpoint_interval` 控制；这和 history 的更新频率不是一回事。

### `artifacts/models/long-run/<profile>/`
长期自动训练日志。

常见内容：
- `run-log.jsonl`

---

## 三、推荐工作流

如果你只是想完成“训练 -> 评估 -> 选模型 -> 浏览器测试”，推荐流程如下：

1. 启动本地服务
   ```bash
   python apps/model_manager/server.py
   ```
2. 打开模型管理台，浏览当前候选模型
3. 对当前模型或全部候选模型执行评估
4. 打开评估报告比较分数
5. 将表现最好的候选模型设为默认模型
6. 打开浏览器运行测试台观察真实运行效果

如果你想手动调训练参数：
1. 修改 `src/train/snake_nn/trainer.py` 中的 `ACTIVE_PROFILE`、`SEED_BATCH`、`BASE_IDE_CONFIG`
2. 运行：
   ```bash
   python src/train/snake_nn/trainer.py
   ```
3. 到 `artifacts/models/exports/<profile>/` 查看候选模型
4. 到 `artifacts/models/checkpoints/<profile>/` 查看训练历史和 checkpoint

如果你想长期后台筛模型：
1. 修改 `src/train/snake_nn/long_run_trainer.py` 中的 `LongRunConfig`
2. 运行：
   ```bash
   python src/train/snake_nn/long_run_trainer.py
   ```
3. 到 `artifacts/models/long-run/<profile>/run-log.jsonl` 查看运行日志
4. 到 `artifacts/models/exports/<profile>/` 查看自动留下的 top 模型

长期训练当前额外具备这些行为：
- 会优先恢复所有“未完成试训”的 backlog checkpoint，处理完后才会创建新 seed
- trial / full 比较使用的是目标代数对应的**最终已评估代历史快照**，而不是直接用目标代数数字本身
- backlog 清空且历史候选池足够大时，会优先尝试跨种群 hybrid 融合，再决定是否创建新 seed
- `training-history.json` 是每代写；`population_checkpoint_interval` 只控制整群 checkpoint 覆写频率

---

## 四、两个训练入口怎么用

### 1. `trainer.py`：批量种子训练

入口：

```bash
python src/train/snake_nn/trainer.py
```

最常改的三个位置：
- `ACTIVE_PROFILE`：当前要训练的设备档位
- `SEED_BATCH`：本轮要跑的随机种子列表
- `BASE_IDE_CONFIG`：代数、种群规模、评分权重、恢复训练参数等

运行后会做这些事：
1. 按设备档位绑定棋盘尺寸、默认模型路径、导出目录、checkpoint 目录
2. 针对 `SEED_BATCH` 中的每个种子分别训练
3. 把每个种子的最佳模型导出到 `artifacts/models/exports/<profile>/`
4. 用同一组 episode seed 评估候选模型与当前默认模型
5. 生成本轮排行
6. 把第一名复制成 `best-of-batch.json`

从 checkpoint 恢复训练时，直接在 `BASE_IDE_CONFIG` 里设置：

```python
resume_from_checkpoint='artifacts/models/checkpoints/pc/23-latest'
```

注意：
- `generations` 表示目标总代数上限，不是“再训练多少代”
- 恢复训练后，默认模型仍然写回 `data/models/profiles/<profile>.json`
- 整群 checkpoint 仍然写入 `artifacts/models/checkpoints/<profile>/`

### 2. `long_run_trainer.py`：长期自动训练

入口：

```bash
python src/train/snake_nn/long_run_trainer.py
```

它适合长期跑，因为会自动决定“先做试训还是直接做完整训练”，并优先处理未完成的试训 checkpoint。

核心阶段：
- **resume backlog 模式**：若目录中存在 `< trial_generations` 的 checkpoint，优先恢复这些中断 trial
- **warmup 模式**：候选模型数量还不够时，直接完整训练，先把候选池堆起来
- **trial 模式**：先短代数试训，看这个新 seed 值不值得继续
- **full train 模式**：trial 达标后，再从 trial checkpoint 继续跑满总代数
- **hybrid 模式**：backlog 清空且候选池足够大时，优先尝试跨种群融合，再继续训练

最常改的配置：
- `profile_id`：当前设备档位
- `trial_generations`：试训目标代数
- `full_generations`：完整训练目标代数
- `warmup_seed_count`：候选池少于多少时直接走 warmup
- `keep_top_n`：最后保留多少个最好模型
- `cleanup_interval_runs`：候选池达到多少个后触发一次清理检查
- `population_checkpoint_interval`：整群 checkpoint 的覆写频率
- `resume_strict`：恢复训练时是否严格校验 checkpoint 参数一致性
- `dry_run`：只演练流程，不真的训练

运行后会做这些事：
1. 先扫描现有候选模型和 checkpoint
2. 若存在未完成试训的 checkpoint，则优先恢复它们，而不是立刻创建新 seed
3. backlog 清空后，若候选池规模达到阈值，则优先尝试 hybrid 融合训练
4. 若不触发 hybrid，再进入普通新 seed 的 warmup 或 trial 流程
5. 如有必要，从 trial checkpoint 继续跑完整训练
6. 对当前候选池重新生成汇总评估报告
7. 超过阈值时删除非 top-N 模型和对应 checkpoint
8. 把运行事件写入 `artifacts/models/long-run/<profile>/run-log.jsonl`

---

## 五、评估脚本

评估单个模型：

```bash
python src/train/snake_nn/evaluate_models.py artifacts/models/exports/pc/best-of-batch.json
```

评估一个目录：

```bash
python src/train/snake_nn/evaluate_models.py artifacts/models/exports/pc
```

输出位置：
- 单模型：`<model>.eval-report.json` / `<model>.eval-report.html`
- 目录汇总：`artifacts/models/exports/<profile>/evaluation-report.json` / `.html`

模型管理页中的“评估全部候选模型”还会额外写入一份服务端汇总报告：
- `artifacts/models/exports/evaluation-report.json`
- `artifacts/models/exports/evaluation-report.html`

---

## 六、报告位置

### 训练报告

```text
artifacts/models/checkpoints/<profile>/training-report.html
```

例如：

```text
artifacts/models/checkpoints/pc/training-report.html
```

### 单模型评估报告

```text
artifacts/models/exports/<profile>/<model>.eval-report.html
```

### 档位内评估汇总报告

```text
artifacts/models/exports/<profile>/evaluation-report.html
```

### 管理页全量评估总报告

```text
artifacts/models/exports/evaluation-report.html
```

---

## 七、注意事项

1. 模型管理页依赖本地 API，不要直接用纯静态服务器打开，应通过：
   ```bash
   python apps/model_manager/server.py
   ```
2. 浏览器侧 `SNAKEAI` 策略始终从 `data/models/profiles/*.json` 加载默认模型。
3. 训练、评估、checkpoint、长跑日志都应只写入本文档列出的 canonical 目录。
4. 如果你在清理仓库或调目录结构，请优先以 `apps/`、`src/`、`data/`、`artifacts/` 这四层为准。