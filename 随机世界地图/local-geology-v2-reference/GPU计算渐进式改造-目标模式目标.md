# 目标模式目标：自主完成 GPU 计算渐进式改造

## 1. 总目标

在 `D:\盒子\HTML\随机世界地图` 项目中，以
`GPU计算渐进式改造计划.md` 为技术路线和范围基准，自主、连续、分阶段完成
GPU 计算改造。

目标不是一次性重写模拟核心，而是逐个迁移适合 GPU 的渲染、密集逐格计算和
小半径 stencil 模块；每个模块均须经历：

```text
CPU baseline
  -> GPU candidate
  -> CPU/GPU field compare
  -> browser validate
  -> experimental writeback
  -> multi-seed performance gate
  -> eligible default path
```

任何未通过正确性、浏览器功能、Console 健康、性能和长期漂移门禁的模块，都必须
继续保持 experimental 或 CPU-only。CPU 路径始终保留为可靠 fallback。

## 2. 自主执行要求

- 不需要为每个阶段等待人工确认；完成一个阶段并提交后，自动进入下一个阶段。
- 每次恢复任务时，先读取本文、`GPU计算渐进式改造计划.md`、Git 状态和最近提交，
  从现有断点继续，不重复已经验收完成的工作。
- 先检查现有实现和测试，不根据文档中的旧状态盲目重做。
- 每次只推进一个边界清楚、可独立验证和回退的改造切片。
- 每个切片必须完成：实现、打包、后台检查、浏览器检查、文档更新、干净提交。
- 不允许只凭 Node 工具、静态检查或离屏渲染宣布阶段完成。
- 浏览器是产品真实运行环境；页面功能和 Console 验收是硬门槛。
- 遇到失败时先定位根因并修复，最多自行重试三轮。
- 同一外部 blocker 连续三轮仍无法绕过时，记录完整证据和可恢复断点后暂停。
- 不因为时间长、性能暂时不佳或上下文切换而提前宣布总目标完成。

## 3. 不可破坏的约束

- 保持 `index.html` 使用普通 classic script，不改成 `type="module"`。
- 保持直接双击 `file://.../index.html` 可运行。
- 每次修改源码后重新生成 `src/app.js`。
- 打包后的 `src/app.js` 不得残留顶层 `import` 或 `export`。
- 不整体重写 `stepWorld`、`runGeologyV2Step` 或 geology-v2 调度核心。
- 不同时引入 Worker 重构和 GPU compute 重构。
- CPU world TypedArray 在迁移期间仍是权威状态。
- GPU 初始化、shader 编译、设备丢失、验证失败或性能不达标时自动 fallback CPU。
- 不把 WebGPU 可用性作为 `file://` 运行的前提。
- 不迁移或改写地质规则本身；GPU kernel 必须尽量等价于已校准的 CPU 规则。
- external sea BFS、closed basin、connected components、flow accumulation、
  watershed 等图算法在专门评估通过前继续留在 CPU。
- 不提交临时 PPM、浏览器截图、debug 输出、性能日志或无关资源。
- 不改动或提交工作区外层 `../asset/img`、`../asset/song` 等无关文件。

## 4. 当前恢复断点

开始执行本目标时，先核实以下状态是否仍然成立：

- `local-fields` WebGPU candidate 已实现重叠式执行与 readback。
- 普通浏览器 validation 使用 `timingMode: "overlapped"`。
- 专用 `gpu-perf-profile` 保留 `timingMode: "split"`，可分别观察 kernel/download。
- 已增加 `submitMs`、`executeAndDownloadMs`、`warmGpuExecuteDownloadMs`、
  `warmGpuTimingModes` 等指标。
- `龙骨海-纪元7` 和 `artifact-seed-3` 的 `256x128` 浏览器矩阵正确性通过，
  Console 项目错误为 0。
- warm GPU total 已明显下降，但仍不足以证明可以默认启用。

当前可能存在尚未提交的相关文件：

```text
src/gpu/localFieldsCompute.js
src/main.js
src/app.js
tools/gpu-perf-profile.mjs
tools/browser-gpu-perf-matrix.mjs
tools/gpu-default-readiness-check.mjs
```

第一个动作应是复核这些改动，补充计划文档中的 timing mode 和性能证据，执行完整
后台及浏览器验证，然后只提交上述相关改动。建议提交信息：

```text
perf: overlap local fields gpu readback
```

若 Git 状态与这里不同，以实际工作区为准，禁止覆盖用户已有改动。

## 5. 每阶段通用验收契约

### 5.1 后台基础门禁

每个代码阶段提交前至少运行：

```powershell
node .\tools\bundle-app.mjs
node --check .\src\app.js
Select-String -Path .\src\app.js -Pattern '^\s*export\s|^\s*import\s'
Get-ChildItem -Recurse -File .\src,.\tools |
  Where-Object { $_.Extension -in '.js','.mjs' } |
  ForEach-Object { node --check $_.FullName }
node .\tools\interface-check.mjs '龙骨海-纪元7' 20 geology-v2 256x128
git diff --check
```

要求：

- 所有命令退出码为 0。
- `Select-String` 无匹配。
- `interface-check` 输出 `valid: true`。
- 不出现 NaN、Infinity、空关键字段或接口字段缺失。

涉及长期状态或最终高程写回时，额外运行：

```powershell
node .\tools\long-run-check.mjs '龙骨海-纪元7' 200 geology-v2 256x128
node .\tools\long-run-check.mjs 'artifact-seed-3' 200 geology-v2 256x128
node .\tools\resolution-check.mjs '龙骨海-纪元7' 200 geology-v2 256x128,512x256
```

写回长期演化状态时还必须增加 739 Myr 检查，并比较 CPU/GPU 漂移。

### 5.2 `file://` 浏览器硬门禁

每个阶段均须实际打开：

```text
file:///D:/盒子/HTML/随机世界地图/index.html
```

可以用自动化浏览器执行，但必须检查真实页面，而不是只检查生成文件。

必须验证：

1. 页面加载完成，地图 canvas 非黑屏、非空白。
2. 默认种子与当前参数正确显示。
3. 播放按钮可推进模拟。
4. 单步、暂停、重置可用。
5. 任意字符种子可重新生成。
6. 分辨率切换后地图仍可绘制。
7. 板块边界开关可用且边界完整。
8. 圆柱和球面投影相关控件未因本阶段改动失效。
9. Console 中项目自身错误数为 0。
10. 页面在验证结束时仍可继续操作，不是仅首帧成功。

至少运行一次自动化 smoke：

```powershell
node .\tools\browser-smoke-check.mjs --mode file --steps 1 --wait-ms 8000 --query "renderBackend=cpu" --require-perf-summary
```

### 5.3 localhost WebGPU 浏览器硬门禁

凡是修改 WebGPU capability、context、buffer、kernel、candidate、validate、
experimental writeback 或 GPU 性能工具，必须启动本地 HTTP 服务并验证：

```powershell
python -m http.server 8000
```

打开：

```text
http://localhost:8000/index.html
```

必须验证：

1. WebGPU capability 信息与 secure context 状态正确。
2. 目标 GPU kernel 被真实触发，不是 silent skip。
3. runtime state 中 seed、resolution、topology、projection 与测试参数一致。
4. CPU/GPU compare 结果存在且 `valid: true`。
5. GPU validation 后播放仍继续推进。
6. canvas 非空，颜色范围正常。
7. Console 项目自身错误数为 0。
8. fallback、throttle 或 skip 必须有明确原因。
9. 若测试 experimental writeback，必须验证写回发生且门禁失败时能回退 CPU。

示例命令：

```powershell
node .\tools\browser-smoke-check.mjs --mode http --steps 1 --wait-ms 30000 --post-validation-wait-ms 3000 --query "topology=cylindrical&projection=equirectangular&resolution=256x128&gpuCompute=validate&gpuValidateInterval=1&gpuValidateReports=1&gpuKernel=local-fields&renderBackend=cpu" --require-validation --require-perf-summary --require-reused-gpu-setup-zero
```

### 5.4 Console 判定

以下可视为环境或扩展噪声，但应记录并过滤：

- React DevTools 提示。
- 浏览器扩展 `content.js` 日志。
- 被广告拦截器阻止的第三方请求。
- favicon 404。
- 单独的 `[Violation]` 提示。

以下任一出现即不合格：

- `Uncaught TypeError`
- `Uncaught ReferenceError`
- `Uncaught SyntaxError`
- `Unexpected token export`
- `Cannot read properties of null`
- shader compilation/validation 未处理异常
- device lost 未 fallback
- 关键字段出现 NaN/Infinity
- 页面黑屏
- 播放按钮无反应
- validation 完成后页面停止推进
- 持续 1000ms 以上 pointermove 长任务导致球面无法拖动

### 5.5 证据要求

每个阶段的提交说明或计划文档中记录：

- 执行的命令和结果。
- 浏览器 URL、seed、resolution、topology、projection。
- 目标 kernel 和 compute mode。
- canvas 是否非空。
- 页面推进到的 step。
- Console 项目错误数。
- CPU/GPU 字段误差。
- upload、submit、kernel、download、execute-and-download、total candidate 时间。
- GPU/CPU step、render 和 long-task 比率。
- 是否启用或继续禁止默认 GPU。

## 6. 阶段 A：收尾当前 local-fields 重叠 readback 切片

### 实现目标

- 保持普通 validation 使用 overlapped timing。
- 保持专用 profile 使用 split timing。
- 修正缺失 timing 不得被汇总为虚假的 0。
- 更新 `GPU计算渐进式改造计划.md`，记录前后性能和仍未达到默认启用条件。

### 后台验收

- 通用基础门禁全部通过。
- `gpu-field-compare` 的 local-fields 字段全部通过。
- `gpu-perf-profile` 能输出 split timing。
- `browser-gpu-perf-matrix` 能输出 overlapped timing。
- readiness check 仍应诚实报告 `ready: false`，除非全部严格门禁真实通过。

### 浏览器验收

- `file://` CPU fallback smoke 通过。
- localhost 下至少运行两个 seed 的 local-fields matrix。
- `warmGpuTimingModes` 包含 `overlapped`。
- reused context 的 `setupMs` 为 0。
- Console 项目错误数为 0。

### 完成标准

- 六个相关项目文件和计划文档形成一个干净 commit。
- 不提交 `../asset` 无关文件。

## 7. 阶段 B：稳定 GPU 上下文、pipeline 与持久 buffer

### 实现目标

- GPU device、pipeline、bind group layout 和可复用 buffer 生命周期清晰。
- 同尺寸重复运行时不重复创建昂贵资源。
- 使用字段 dirty/version 信息避免无意义的重复上传。
- 为 local-fields 优先实现持久输入、输出和 staging/readback buffer。
- 正确处理分辨率变化、world 重置、device lost 和 dispose。

### 后台验收

- 连续多次 candidate 的 `reusedContext: true`。
- reused run 的 `setupMs: 0`。
- buffer 尺寸变化后无越界、旧数据或资源泄漏。
- local-fields 字段误差继续满足既有阈值。
- 运行多个分辨率后显存资源可释放或复用。

### 浏览器验收

- localhost 连续触发至少 5 次 validation。
- 在 `256x128` 和 `512x256` 间切换后再次触发 GPU validation。
- 重置 world、切换 seed 后字段仍正确。
- 页面持续播放，Console 无 validation、device、buffer 错误。

### 完成标准

- 多次运行不发生 setup 退化。
- 实际浏览器 warm cost 比阶段 A 稳定下降；若没有下降，保留实现价值判断并不得默认启用。
- 完成独立 commit。

## 8. 阶段 C：完成 dense per-cell candidate

### 实现目标

逐个完善：

1. `isostasy`
2. `elevation`

每次只处理一个 kernel，CPU 仍是权威。

每个 candidate 必须具备：

- 能力检测与 safe skip。
- 明确输入输出字段。
- field compare。
- selective readback。
- split 与 overlapped timing。
- context/pipeline/buffer 复用。
- 失败 fallback。

### 后台验收

每个 kernel 至少运行：

```powershell
node .\tools\gpu-field-compare.mjs webgpu-isostasy '龙骨海-纪元7' 20 geology-v2 256x128
node .\tools\gpu-field-compare.mjs webgpu-elevation '龙骨海-纪元7' 20 geology-v2 256x128
node .\tools\gpu-perf-profile.mjs isostasy '龙骨海-纪元7' 20 geology-v2 256x128
node .\tools\gpu-perf-profile.mjs elevation '龙骨海-纪元7' 20 geology-v2 256x128
```

初始数值门槛：

- `rmse <= 1e-4`
- `maxAbs <= 5e-3`
- 若某字段必须使用不同阈值，需记录量纲和理由，不能仅为通过测试而放宽。

### 浏览器验收

- localhost 中分别真实触发 isostasy 和 elevation validation。
- 每个 kernel 至少用两个 seed、两个连续 validation。
- 页面在 validation 后继续播放。
- 正确记录 adapter/device、requestedFields、downloadedPacks 和 timing。
- Console 项目错误数为 0。

### 完成标准

- 两个 dense kernel 均可 compare、profile、safe skip 和复用。
- 性能未达标时继续 experimental。
- 每个 kernel 使用独立 commit 或边界清楚的阶段 commit。

## 9. 阶段 D：完成局部 stencil 与半状态派生 candidate

### 实现顺序

1. `local-fields`
2. `margin-smooth`
3. `sediment-capacity`
4. 必要时 `inactive-fracture-suppression`

不在本阶段迁移 sediment transport scatter 或图算法。

### 正确性验收

- slope、aspect、ruggedness、localRelief 逐字段 compare。
- margin 字段逐字段 compare。
- sedimentCapacity 数值、范围和自然 sink 分布合理。
- 不新增棋盘、网格直线、板块边界残影或边缘条纹。
- 默认 CPU long-run 结果不变。

### 浏览器验收

- 每个 kernel 均在 localhost 真执行。
- 至少验证 `龙骨海-纪元7` 和 `artifact-seed-3`。
- 使用 `256x128` 和 `512x256`。
- 切换相应 debug layer，视觉确认没有异常条带和黑屏。
- 播放到至少 200 Myr；可以用自动化步进，但必须在浏览器页面观察最终 canvas 和 Console。
- Console 项目错误数为 0。

### 完成标准

- 正确性通过的 kernel 才能进入 validate 模式。
- 性能不足的 kernel继续保留低频 candidate。
- 每个模块完成独立 commit。

## 10. 阶段 E：统一 GPU validate 调度与慢路径保护

### 实现目标

稳定运行模式：

```text
gpuCompute=off
gpuCompute=candidate
gpuCompute=validate
```

要求：

- `off` 不创建不必要的 WebGPU 计算资源。
- `candidate` 只在显式操作时运行。
- `validate` 按间隔双跑，CPU 写回权威结果。
- validation 支持字段选择、报告次数、间隔、预算、冷却和 throttle。
- validation 超预算不能阻塞后续页面交互。

### 后台验收

- `gpu-drift-check` 支持 20、200、739 Myr checkpoint。
- 输出 comparedSteps、field RMSE/maxAbs、driftOverTime、failedFields、skip reason。
- 默认 `gpuCompute=off` 与改造前 CPU 结果一致。
- WebGPU 不可用时 safe skip 且页面不崩溃。

### 浏览器验收

- 默认模式播放正常。
- `?gpuCompute=validate` 播放至少 20 steps。
- validation 成功、失败、throttle 和 skip 四类状态均有可解释输出。
- 慢 candidate 被 cooldown 后，页面能够继续推进。
- Console 项目错误数为 0。

### 完成标准

- validate 模式能够长期留在开发工具链中。
- 不因 validate 模式存在而拖慢默认 off 模式。
- 完成独立 commit。

## 11. 阶段 F：低风险模块 experimental GPU 写回

### 选择原则

优先从以下模块中选择正确性最稳定、性能最接近收益门槛者：

1. local-fields
2. isostasy
3. sediment-capacity

一次只允许一个模块进入 experimental writeback。

### 实现目标

- 显式 URL/调试开关开启 GPU 写回。
- 写回前检查 validation gate。
- 误差超限、device lost、timeout 或异常时自动使用 CPU 结果。
- 对写回字段维护同步版本或 dirty state。
- 不允许 GPU 结果直接改写 crustAge、sediment transport、basin、hydrology 等高风险长期状态。

### 后台验收

- 20、200、739 Myr drift check。
- 两个以上 seed。
- 256x128、512x256 resolution check。
- 陆海比、海拔范围、关键 geology diagnostics 无异常漂移。
- CPU fallback 与 CPU-only baseline 一致。

### 浏览器验收

- 默认 CPU/off 模式正常。
- experimental 模式真实写回。
- 播放到至少 200 Myr。
- 中途切换 seed、分辨率和投影。
- 强制触发一次 fallback 并确认页面继续工作。
- Console 显示 mode、kernel、writeback、fallback 和误差摘要。
- Console 项目错误数为 0。

### 完成标准

- 至少一个低风险模块拥有可用 experimental writeback。
- 未满足性能门禁前不设为默认。
- 完成独立 commit。

## 12. 阶段 G：浏览器性能与默认启用 readiness

### 实现目标

- 性能判断覆盖完整浏览器体验，而非只看 WGSL kernel。
- 统计 setup、upload、submit、kernel、download、execute-and-download、
  candidate、step、render、projection render 和 Long Task。
- 使用多 seed、多分辨率和 CPU baseline。
- 区分 cold run 与 reused warm run。

### 必跑矩阵

至少覆盖：

```text
seeds:
  龙骨海-纪元7
  artifact-seed-3
  至少 2 个额外随机种子

resolutions:
  256x128
  512x256

topology/projection:
  cylindrical + equirectangular
  cubed-sphere + orthographic
```

适当时增加 `1024x512`，但不得以其耗时为由跳过 256/512 浏览器验收。

### 默认启用硬门槛

某个 GPU kernel 只有同时满足以下条件才可以成为默认路径：

- 所有字段正确性门禁通过。
- 至少两个 seed、两个分辨率无退化。
- Console 项目错误数为 0。
- reused setup 为 0。
- warm `totalGpuPathMs <= cpuBaselineMs * 0.8`。
- 浏览器 GPU/CPU 平均 step ratio `<= 0.8`。
- render ratio `<= 1.0`。
- Long Task 最大值和总量均不高于 CPU baseline。
- 200/739 Myr 无不可解释漂移。
- device lost、GPU 不可用和 validation 失败时 fallback 已在浏览器实测通过。

若只快 0% 到 20%、抖动过大或只在单个样本快，继续保持 experimental。

### 浏览器验收

- `browser-gpu-perf-matrix` 所有 case 有正确 runtime state。
- `gpu-default-readiness-check` 输出完整失败原因或 `ready: true`。
- 对 `ready: true` 的 kernel 还要人工式自动化操作页面 60 秒：
  - 播放；
  - 暂停和继续；
  - 切换分辨率；
  - 切换 projection；
  - 正射球面拖动和缩放；
  - 切换板块边界；
  - 切换 debug layer。
- Console 项目错误数为 0。

### 完成标准

- 只有 readiness 全通过的 kernel 才可默认启用 GPU。
- 默认 GPU 仍保留 CPU fallback 和关闭开关。
- 未通过的 kernel 有明确瓶颈记录并保持 experimental。
- 完成独立 commit。

## 13. 阶段 H：GPU 常驻热字段与跨 kernel 合批

仅在至少一个单 kernel readiness 接近或通过后执行。

### 实现目标

- 为真正的 hot fields 建立 GPU mirror。
- 使用 dirty/version 管理 CPU/GPU 同步。
- 合并连续 kernel，减少 upload/readback。
- 只在最终 CPU 消费点或 debug compare 点 readback。
- 保留单 kernel compare 和可观测中间字段。

### 验收

- 合批前后字段结果等价。
- 合批后的整步性能优于单 kernel 往返。
- 设备/缓冲复用稳定。
- 浏览器页面推进速度真实提升。
- 任何 readback 减少不得以失去调试能力或 fallback 能力为代价。
- 多 seed、多分辨率、长期 drift 和浏览器矩阵全部通过。

### 完成标准

- GPU 优势来自减少传输后的完整路径，而不是孤立 kernel benchmark。
- 完成独立 commit。

## 14. 阶段 I：高级图算法评估

本阶段先评估，不默认实施：

- external sea BFS
- closed basin connected components
- hydrology flow accumulation
- drainage basin ID
- watershed ID

产出 `GPU图算法评估报告.md`，逐项记录：

- 当前 CPU 算法和复杂度。
- 可行 GPU 算法。
- 同步、确定性、调试和维护风险。
- 预期性能收益。
- 浏览器验证方案。
- 建议迁移、暂缓或永久保留 CPU。

没有明确端到端收益时，保持 CPU 实现即视为正确结论。

## 15. Git 与文档规则

- 每个完成阶段至少一个聚焦 commit。
- 提交前检查 `git status --short` 和 `git diff --check`。
- 只 stage 当前阶段相关文件。
- 不覆盖或回滚不属于本阶段的用户改动。
- 自动生成的 `src/app.js` 与其源文件一并提交。
- 临时 HTTP server、Chrome 进程和测试产物在验证结束后清理。
- 每阶段更新 `GPU计算渐进式改造计划.md` 的当前落地状态、性能证据和下一步。
- 架构或运行模式变化时同步更新 `设计与技术方案.md`。
- 重要限制和 URL 参数需要在用户可查阅文档中记录。

提交信息使用：

```text
fix: ...
feat: ...
perf: ...
chore: ...
docs: ...
```

## 16. 自动决策规则

- 正确性失败：不得继续性能优化或默认启用，先修正确性。
- 浏览器失败但后台通过：阶段失败，优先修浏览器入口、生命周期或交互。
- Console 有项目错误：阶段失败。
- GPU 比 CPU 慢：保留 experimental，继续优化传输、复用或合批。
- GPU 正确但抖动大：增加样本和 warm-run 统计，不根据最好一次结果决策。
- GPU 不可用：验证 safe skip 和 CPU fallback，继续推进不依赖实机 GPU 的部分。
- 某 kernel 连续多轮无端到端收益：在计划中标记暂缓，转向更高收益模块。
- 默认 GPU 路径造成回归：立即恢复 CPU 默认，保留实验开关并记录原因。
- 球面渲染或拖动回归：先修复渲染与交互，不带着回归继续 compute 迁移。

## 17. 最终完成定义

只有同时满足以下条件，才能声明本目标完成：

1. 计划中 Phase 0 到性能/readiness 阶段全部有明确完成或有证据的暂缓结论。
2. `file:// index.html` 可直接打开，CPU fallback 完整可用。
3. localhost WebGPU capability、candidate、validate 和 experimental 路径均可运行。
4. 至少一个低风险 GPU compute 模块支持可靠写回和自动 fallback。
5. 所有被默认启用的 GPU kernel 均通过多 seed、多分辨率浏览器 readiness 硬门槛。
6. 未达到门槛的 kernel 保持 experimental，不以“代码已写完”冒充完成。
7. CPU/GPU compare、drift、perf、browser smoke、matrix 和 readiness 工具可重复使用。
8. 页面核心功能、投影切换、板块边界、球面拖动、播放和重置均经浏览器验证。
9. Console 项目自身错误数为 0。
10. 200/739 Myr 无新增 NaN、黑屏、棋盘、大面积直线残影或不可解释陆海漂移。
11. 文档准确说明每个 kernel 的状态：CPU-only、candidate、validate、
    experimental、default 或 deferred。
12. 工作区无本任务遗留的未提交改动和临时产物。

不得仅因为完成若干 GPU kernel、后台测试通过或 WebGPU 能被检测到，就提前宣布
整个目标完成。
