# SNAKE_AI

本项目用于[个人网站](https://www.wenzhimo.xyz/)的页面动态背景上。

项目最初参考了 [Chrispresso 的 SnakeAI 项目](https://github.com/Chrispresso/SnakeAI)，目前已经扩展出：
- 浏览器里的贪吃蛇运行测试台
- 本地模型管理台
- 遗传算法训练与 checkpoint / resume
- 模型评估与 HTML 报告生成

---

# 一、项目主要入口

## 1. 运行本地管理服务
本项目当前的统一本地入口是：

```bash
python apps/model_manager/server.py
```

启动后会：
- 在本地启动 HTTP 服务（默认 `http://127.0.0.1:8000`）
- 自动打开模型管理页面

如果你使用 Claude Preview / launch 配置，项目当前默认服务入口也已经指向：
- `apps/model_manager/server.py`

---

## 2. 模型管理台（推荐入口）
地址：

```text
http://127.0.0.1:8000/apps/model_manager/index.html
```

用途：
- 查看当前默认模型（PC / phone / tablet）
- 浏览候选模型
- 触发单模型评估或全部候选模型评估
- 打开训练报告 / 评估报告
- 查看 checkpoint 与恢复训练提示
- 将候选模型设为默认模型

如果你是第一次使用项目，建议优先从这个页面进入。

---

## 3. 浏览器运行测试台
地址：

```text
http://127.0.0.1:8000/apps/runtime/index.html
```

用途：
- 直接观察贪吃蛇运行效果
- 切换策略（A* SAFE / HAMILTONIAN / HAMILTONIAN+ / SNAKEAI 各设备模型）
- 调整速度、棋盘尺寸显示参数
- 查看运行中的实时 telemetry

适合用来：
- 直观看某个默认模型的实际表现
- 验证“设为默认模型”后的效果

---

# 二、目录结构说明

当前结构按“入口 / 源码 / 数据 / 产物”分层：

## 1. `apps/`
存放可直接运行的页面和本地服务。

- `apps/runtime/index.html`
  - 浏览器运行测试台
- `apps/model_manager/index.html`
  - 模型管理台
- `apps/model_manager/server.py`
  - 本地模型管理服务与 API

## 2. `src/`
存放核心源码。

### `src/runtime/`
浏览器侧运行源码：
- `core/`：贪吃蛇引擎
- `strategy/`：策略实现
- `inference/`：NN 推理与特征构造

### `src/train/snake_nn/`
Python 训练与评估源码：
- `trainer.py`：训练参数入口、批量种子实验
- `headless_train.py`：核心训练循环、checkpoint、训练报告
- `evaluate_models.py`：模型评估与评估报告生成
- `scoring.py`：评分函数
- `browser_export_adapter.py`：导出浏览器可用模型格式

## 3. `data/`
存放轻量、可版本化的数据配置。

- `data/models/profiles/pc.json`
- `data/models/profiles/phone.json`
- `data/models/profiles/tablet.json`

这些文件是**当前默认模型**，浏览器运行时会直接读取它们。

## 4. `artifacts/`
存放训练和评估产生的输出。

- `artifacts/models/exports/`
  - 候选模型、批量评估报告、单模型评估报告
- `artifacts/models/checkpoints/`
  - `best.json`
  - `best-so-far.json`
  - `<seed>-latest/`
  - `training-history.json`
  - `training-report.html`

## 5. `vendor/` / 第三方代码
目前遗传算法基础实现仍位于：
- `src/train/snake_nn/vendor/chrispresso/`

---

# 三、模型管理台怎么用

## 1. 看当前默认模型
管理页顶部会显示：
- PC 默认模型
- phone 默认模型
- tablet 默认模型

这几个默认模型实际对应：
- `data/models/profiles/*.json`

浏览器运行测试台里的 SNAKEAI 策略也会读取这里的模型。

---

## 2. 选择候选模型并设为默认
在“候选模型”列表里：
1. 点击某个候选模型
2. 右侧会显示模型详情
3. 在左侧选择目标 profile（PC / phone / tablet）
4. 点击：
   - `设为默认`

效果：
- 会把当前候选模型复制到：
  - `data/models/profiles/<profile>.json`

之后：
- 管理页显示的默认模型会更新
- 运行测试台读取到的也是新的默认模型

---

## 3. 评估模型
管理页支持两种评估：

### 评估当前模型
点击：
- `评估当前`

作用：
- 重新评估当前选中的候选模型
- 会生成：
  - `<model>.eval-report.json`
  - `<model>.eval-report.html`
- 评估完成后自动打开 HTML 报告

### 评估全部候选模型
点击：
- `评估全部候选模型`

作用：
- 重新评估当前所有候选模型
- 会生成总报告：
  - `artifacts/models/exports/evaluation-report.json`
  - `artifacts/models/exports/evaluation-report.html`
- 完成后自动打开总评估报告

### 评估时的保护
评估进行中：
- 评估按钮会自动变成“评估中…”
- 会禁止重复点击，避免并发重复评估

---

## 4. Checkpoint 与恢复训练
管理页会显示最新的 checkpoint，例如：

```text
artifacts/models/checkpoints/pc/23-latest
```

同时会给出：
- `resumePath`
- `resumeExample`

例如：

```python
resume_from_checkpoint='artifacts/models/checkpoints/pc/23-latest'
```

你可以点击：
- `复制 resume 配置`

如果浏览器不允许自动复制，页面会自动回退为：
- 在文本框中填入这行配置
- 自动选中文本框内容
- 你手动 `Ctrl+C` 即可

---

# 四、训练怎么用

训练主入口：

```bash
python src/train/snake_nn/trainer.py
```

> 训练参数主要在 `src/train/snake_nn/trainer.py` 的 `BASE_IDE_CONFIG` 里修改。

## 1. 从头训练
把：

```python
resume_from_checkpoint=None
```

然后运行：

```bash
python src/train/snake_nn/trainer.py
```

---

## 2. 从 checkpoint 恢复训练
把：

```python
resume_from_checkpoint='artifacts/models/checkpoints/pc/23-latest'
```

再运行：

```bash
python src/train/snake_nn/trainer.py
```

### 注意
`generations` 表示：
- **目标总代数上限**
- 不是“再训练多少代”

例如：
- checkpoint 是第 1000 代
- 你想继续跑到第 3000 代
- 那么就应设：

```python
generations=3000
```

而不是 2000。

---

## 3. 训练过程中会产出什么
在训练过程中，会持续更新：

### 滚动 checkpoint
- `artifacts/models/checkpoints/<profile>/best.json`
- `artifacts/models/checkpoints/<profile>/best-so-far.json`

### 整群 checkpoint
- `artifacts/models/checkpoints/<profile>/<seed>-latest/`

### 训练历史与训练报告
- `artifacts/models/checkpoints/<profile>/training-history.json`
- `artifacts/models/checkpoints/<profile>/training-report.html`

训练报告会记录并展示：
- 每代最佳 selection score
- 每代最佳 avg score
- 每代最佳 avg frames
- 每代稳定性相关指标

---

# 五、评估脚本怎么用

评估入口：

```bash
python src/train/snake_nn/evaluate_models.py <目标路径>
```

示例：

## 1. 评估单个模型
```bash
python src/train/snake_nn/evaluate_models.py artifacts/models/exports/pc/best-of-batch.json
```

输出：
- 控制台摘要
- `best-of-batch.json.eval-report.json`
- `best-of-batch.json.eval-report.html`

## 2. 评估一个目录下的多个模型
```bash
python src/train/snake_nn/evaluate_models.py artifacts/models/exports/pc
```

输出：
- 控制台摘要
- `artifacts/models/exports/pc/evaluation-report.json`
- `artifacts/models/exports/pc/evaluation-report.html`

## 3. 评估参数
可选参数：

```bash
--episodes-per-board 2
--starvation-scale 1.0
```

### 当前评估规则
如果模型 metadata 中已经带有：
- `boardSizePool`

那么评估默认会使用**模型自己的棋盘尺寸**，而不是再跑一套 8x8 ~ 16x16 的通用棋盘。

这更适合当前的“专用模型”训练方式。

---

# 六、报告在哪里打开

## 1. 训练报告
一般位置：

```text
artifacts/models/checkpoints/<profile>/training-report.html
```

例如 PC：

```text
artifacts/models/checkpoints/pc/training-report.html
```

浏览器访问：

```text
http://127.0.0.1:8000/artifacts/models/checkpoints/pc/training-report.html
```

## 2. 单模型评估报告
一般位置：

```text
<model>.eval-report.html
```

例如：

```text
artifacts/models/exports/pc/best-of-batch.json.eval-report.html
```

## 3. 批量评估总报告
一般位置：

```text
artifacts/models/exports/evaluation-report.html
```

---

# 七、当前推荐使用流程

如果你只是想“训练 -> 评估 -> 选模型 -> 上线测试”，推荐流程是：

1. 启动本地服务
   ```bash
   python apps/model_manager/server.py
   ```
2. 在模型管理页里查看候选模型
3. 点击：
   - `评估当前`
   - 或 `评估全部候选模型`
4. 打开评估报告，比较分数
5. 选择一个候选模型，点击：
   - `设为默认`
6. 打开运行测试台：
   - `http://127.0.0.1:8000/apps/runtime/index.html`
7. 观察实际运行效果

---

# 八、注意事项

1. 评估报告与训练报告都是单文件 HTML，可直接浏览器打开。
2. 管理页依赖本地 API，**不要**用纯静态服务器直接打开它，应使用：
   ```bash
   python apps/model_manager/server.py
   ```
3. 如果“复制 resume 配置”失败，通常是浏览器剪贴板权限问题，页面会提供手动复制文本框。
4. 当前项目已经做了结构优先重构，但仍然可能保留部分旧目录作为过渡兼容，请优先使用 README 中列出的新路径。
