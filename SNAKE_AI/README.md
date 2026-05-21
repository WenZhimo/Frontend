# SNAKE_AI

本项目用于个人网站页面动态背景中的 Snake AI 运行、训练、评估与模型管理。

当前仓库已经统一为“运行入口 / 源码 / 默认配置 / 训练产物”四层结构，建议只使用本文档里列出的 canonical 路径。

---

## 一、主要入口

### 1. 本地管理服务

```bash
python apps/model_manager/server.py
```

启动后会：
- 在本地启动 HTTP 服务，默认地址 `http://127.0.0.1:8000`
- 自动打开模型管理页面

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

---

## 二、目录语义

### `apps/`
运行入口。

- `apps/model_manager/index.html`：模型管理台
- `apps/model_manager/server.py`：本地服务与 API
- `apps/runtime/index.html`：浏览器运行测试台

### `src/`
项目源码。

#### `src/runtime/`
浏览器侧运行源码：
- `core/`：贪吃蛇引擎
- `strategy/`：策略实现
- `inference/`：NN 推理与特征构造

#### `src/train/snake_nn/`
Python 训练与评估源码：
- `trainer.py`：批量训练主入口
- `headless_train.py`：训练循环、checkpoint、训练报告
- `evaluate_models.py`：模型评估与评估报告生成
- `long_run_trainer.py`：长跑训练流程
- `browser_export_adapter.py`：浏览器模型导出
- `paths.py`：训练侧 canonical 路径定义
- `profiles.py`：设备档位与默认模型路径定义
- `vendor/chrispresso/`：第三方遗传算法基础实现

### `data/models/profiles/`
默认模型配置。

- `pc.json`
- `phone.json`
- `tablet.json`

这些文件是浏览器运行时直接读取的默认模型入口。

### `artifacts/models/exports/<profile>/`
候选模型导出与评估报告。

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

### `artifacts/models/long-run/<profile>/`
长跑训练日志。

常见内容：
- `run-log.jsonl`

---

## 三、训练、评估、上线的推荐流程

1. 启动本地服务
   ```bash
   python apps/model_manager/server.py
   ```
2. 在模型管理页查看候选模型
3. 评估当前模型或评估全部候选模型
4. 打开评估报告比较分数
5. 将合适候选模型设为默认模型
6. 打开运行测试台观察实际表现

---

## 四、训练脚本

训练入口：

```bash
python src/train/snake_nn/trainer.py
```

训练参数主要在 `src/train/snake_nn/trainer.py` 的 `BASE_IDE_CONFIG` 中调整。

### 从 checkpoint 恢复训练
示例：

```python
resume_from_checkpoint='artifacts/models/checkpoints/pc/23-latest'
```

注意：
- `generations` 表示目标总代数上限，不是“再训练多少代”
- 恢复训练时，默认模型仍然写回 `data/models/profiles/<profile>.json`
- 候选模型导出到 `artifacts/models/exports/<profile>/`
- 整群 checkpoint 写入 `artifacts/models/checkpoints/<profile>/`

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

### 批量评估总报告

```text
artifacts/models/exports/<profile>/evaluation-report.html
```

---

## 七、注意事项

1. 模型管理页依赖本地 API，不要直接用纯静态服务器打开，应通过：
   ```bash
   python apps/model_manager/server.py
   ```
2. 浏览器侧 `SNAKEAI` 策略始终从 `data/models/profiles/*.json` 加载默认模型。
3. 训练、评估、checkpoint、长跑日志都应只写入本文档中列出的 canonical 目录。
4. 若发现旧目录残留，请以 `apps/`、`src/`、`data/`、`artifacts/` 这四层结构为准。
