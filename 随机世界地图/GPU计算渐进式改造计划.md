# GPU 计算渐进式改造计划

## 1. 摘要

- 当前项目的模拟核心仍是 CPU TypedArray 主循环，`src/worker.js` 仍是预留占位，说明 GPU 化应从“可回退、可比对、可逐项替换”的后端能力开始，而不是直接重写 `stepWorld`。
- `src/sim/grid.js` 已采用 SoA typed array 字段布局，天然适合映射为 GPU storage buffer / texture buffer；这是后续 WebGPU compute 的最大优势。
- 第一批 GPU 目标应选择 dense per-cell 或小半径 stencil：地图着色、等静力、地质高程重建、局部 slope / relief / ruggedness、margin / sediment 的平滑与容量场。
- 暂不建议优先 GPU 化 closed basin、external sea BFS、距离场、流域编号、汇流累积等图算法；这些算法状态依赖强，先保留 CPU 更稳。
- 推荐技术主线是 WebGPU compute + CPU fallback。项目需要保持直接双击 `index.html` 可运行，因此 GPU 必须是可选加速层，不能成为基本运行条件。
- GPU 改造要先建验证工具：同 seed / 同分辨率 / 同 step 下比较 CPU 与 GPU 字段误差，再谈替换默认路径。
- 渲染可以先于模拟迁移。`src/render/map2d.js` 当前逐像素写 `ImageData`，适合作为低风险 GPU / WebGL2 / Canvas fallback 的第一阶段。
- geology-v2 主循环是长期性能主战场；hydrology 已有独立 profiling，但当前证据显示它不是首要瓶颈。

## 2. 当前代码证据

### 2.1 数据布局

`src/sim/grid.js` 中的世界状态主要由 `Float32Array / Uint8Array / Int32Array` 组成，例如：

- 高程与基础地形：`elev / baseElev / relief / boundaryRelief`
- 等静力与洋底高程项：`isostaticBase / crustBuoyancy / densitySubsidence / lithosphereCooling / ageSubsidence / thicknessBuoyancy / sedimentFill / oceanDepthTerms`
- 沉积预算：`erosionSource / sedimentFlux / sedimentSink / sedimentCapacity / sedimentLoadSubsidence / depositionRate / erosionRate`
- 构造字段：`boundaryInfluence / boundaryKind / ridge / trench / rift / mountainBelt / activeTransform / transformMemory / fractureZoneMemory`
- 派生地貌：`passiveMargin / continentalShelf / continentalSlope / continentalRise / abyssalPlain / sedimentWedge`

这类 SoA 布局非常适合 GPU：

```text
fieldA: Float32Array(size) -> GPUBuffer A
fieldB: Float32Array(size) -> GPUBuffer B
fieldC: Uint8Array(size)   -> packed GPUBuffer C 或 u32 buffer
```

GPU kernel 可以用 `global_id.x` 对应 cell id，按 `width / height / wrapX` 推导邻域索引。相比对象数组，这里几乎不需要重排模拟状态。

### 2.2 主要 CPU 热点

从现有 pipeline 结构看，geology-v2 每步包含多次密集遍历：

- `updateSedimentBudget`
- `rebuildGeologyElevation:initial`
- `rebuildGeologyElevation:rift`
- `rebuildGeologyElevation:aging`
- `updatePassiveMargins`
- `suppressInactiveFractureRelief`
- `deriveOceanConnectivity`
- `updateSurfaceContinuityDiagnostics`
- `updateReliefBudgetDiagnostics`

其中最适合 GPU 的不是整条 pipeline，而是这些子类：

| 类型 | 当前示例 | GPU 适配度 | 说明 |
|---|---|---:|---|
| dense formula | `updateIsostasy`, `rebuildGeologyElevation` | 高 | 每个 cell 独立或弱依赖，最容易验证 |
| 小半径 stencil | slope / local relief / margin smoothing | 高 | 邻域固定，适合 compute shader |
| 渲染着色 | `src/render/map2d.js` | 高 | 逐像素颜色映射，低风险 |
| 局部沉积容量 | `sedimentCapacity`, soft capacity smoothing | 中高 | 公式密集，但需拆出运输逻辑 |
| 多 pass 搬运 | sediment transport passes | 中 | 可 GPU 化，但质量验证更复杂 |
| BFS / connected components | external sea, closed basin, distance field | 低 | 不适合作为第一批 GPU 目标 |
| 水文流域图算法 | flow accumulation, drainage basin | 低 | 依赖拓扑排序/传播，先保留 CPU |

### 2.3 运行环境约束

项目目前支持直接打开 `index.html` 运行。WebGPU 通常需要安全上下文，浏览器与本地文件策略也会变化。因此：

- CPU 路径必须一直存在。
- GPU 路径必须能力探测后启用。
- 无 GPU / 非安全上下文 / 浏览器不支持时，应自动回退 CPU。
- 所有调试和验证工具应默认可在 Node / CPU 下运行；GPU 验证作为附加工具。

## 3. GPU 技术路线选择

### 3.1 推荐主线：WebGPU

推荐使用 WebGPU 作为长期计算后端：

- 支持 compute shader，适合 dense field 和 stencil。
- 与 TypedArray / GPUBuffer 模型契合。
- 可以把渲染和计算共享同一 GPU 字段，减少 CPU 像素写入。
- 适合后续做 ping-pong buffers、多 pass kernel、debug field blit。

推荐新增目录：

```text
src/gpu/
  capability.js
  gpuContext.js
  fieldLayout.js
  gpuWorld.js
  kernels/
    renderMap.wgsl
    isostasy.wgsl
    elevation.wgsl
    localFields.wgsl
    sedimentCapacity.wgsl
```

### 3.2 兼容路径：CPU fallback + 可选 WebGL2 render

GPU 计划不应破坏当前最重要的可用性：直接打开网页可以运行。

建议策略：

```js
const gpuMode = await detectGpuMode();

if (gpuMode.webgpuCompute) {
  backend = new WebGpuBackend();
} else if (gpuMode.webgl2Render) {
  backend = new CpuSimWebGlRenderBackend();
} else {
  backend = new CpuBackend();
}
```

WebGL2 可以作为渲染加速候选，但不建议作为主计算方案。若只为地图着色，WebGL2 fragment shader 可以先替代 `ImageData` 写像素；若要计算字段，WebGPU 更合适。

## 4. 任务适配矩阵

| 模块 / 字段 | 迁移优先级 | GPU 类型 | CPU 仍需保留 | 验证方式 |
|---|---:|---|---|---|
| `map2d` elevation coloring | P0 | render shader / fragment | 是 | snapshot diff |
| `updateIsostasy` | P1 | compute dense formula | 是 | field RMSE / maxAbs |
| `rebuildGeologyElevation` | P1 | compute dense formula | 是 | `elev / baseElev / relief / boundaryRelief` compare |
| slope / local relief / ruggedness | P2 | compute stencil | 是 | terrain derived compare |
| `smoothMarginFields` | P2 | compute stencil | 是 | margin field compare |
| sediment capacity | P2 | compute dense + stencil | 是 | capacity / sink share compare |
| sediment transport passes | P3 | multi-pass compute | 是 | mass budget + visual debug |
| inactive fracture suppression | P3 | dense + local smooth | 是 | relief correlation compare |
| debug dense metrics | P3 | reduction kernels | 是 | metric compare |
| external sea BFS | 延后 | graph | 是 | 暂不迁移 |
| closed basin id | 延后 | connected components | 是 | 暂不迁移 |
| hydrology flow accumulation | 延后 | graph / scan | 是 | 暂不迁移 |

## 5. 目标架构

### 5.1 后端抽象

建议新增最小后端接口，不改变现有 `world.grid` 作为权威状态的事实：

```js
class SimulationBackend {
  supports(featureName) {}
  uploadWorld(world, fields) {}
  runKernel(name, params) {}
  downloadFields(world, fields) {}
  dispose() {}
}
```

第一阶段不要把所有字段常驻 GPU。先只上传需要的字段，运行 kernel，下载结果回 CPU TypedArray。等字段稳定后再考虑持久 GPU mirror。

### 5.2 字段同步策略

推荐三档同步：

1. **CPU authoritative**：默认状态。GPU 只做临时计算，结果下载回 CPU。
2. **Mirrored hot fields**：`elev / isostaticBase / sedimentCapacity` 等热点字段在 GPU 和 CPU 都存在，按 dirty flag 同步。
3. **GPU authoritative experimental**：只在开发 flag 下启用，不作为默认行为。

字段同步元数据示例：

```js
const FieldSyncMode = {
  CPU_ONLY: 0,
  GPU_MIRROR: 1,
  GPU_EXPERIMENTAL: 2,
};
```

### 5.3 Worker 与 GPU 的关系

`src/worker.js` 当前说明 Phase 1 单线程以保持直接打开文件可运行。GPU 改造不应强依赖 Worker。

推荐顺序：

1. 主线程 CPU + 可选 GPU render。
2. 主线程 CPU + 可选 GPU compute。
3. Worker CPU 后台模拟。
4. Worker 内 GPU compute 作为实验项。

这样可以避免同时引入 Worker 消息同步、GPU buffer 生命周期和浏览器安全上下文三类风险。

## 6. 渐进式路线图

### Phase 0：基线与能力探测

目标：不改变画面和模拟，只建立 GPU 能力识别、字段比较和性能基线。

任务：

- 新增 `src/gpu/capability.js`，检测 WebGPU / WebGL2 / secure context。
- 新增 `tools/gpu-field-compare.mjs`，同 seed / resolution / step 比较 CPU 与 GPU 字段。
- 新增 `tools/gpu-perf-profile.mjs`，记录 kernel 时间、upload 时间、download 时间。
- 在 UI 或 debug 输出中显示 `backend: cpu | webgl-render | webgpu-experimental`。

验收：

- 无 WebGPU 时应用行为完全不变。
- `index.html` 直接打开仍可运行。
- `perf-profile` 仍可在 CPU-only 环境下使用。

### Phase 1：GPU 渲染，不碰模拟

目标：先迁移地图着色路径，降低风险，验证 GPU 管线和 fallback。

当前 `src/render/map2d.js` 每帧循环 `grid.size` 并写入 `ImageData`。该逻辑可以改为：

- CPU 保持原 `ImageData` renderer。
- 新增 GPU renderer，根据 `elev - seaLevel` 着色。
- 边界 overlay 暂可继续 CPU 或作为第二步 GPU overlay。

验收：

- 同 seed 下 GPU render 与 CPU render 主色带一致。
- snapshot diff 只允许小范围插值差异。
- 没有 GPU 时自动使用 CPU renderer。

### Phase 2：GPU 派生高程与等静力

目标：迁移最高确定性的 dense formula。

优先 kernel：

- `updateIsostasy`
- `rebuildGeologyElevation`

理由：

- 公式清晰，每个 cell 基本独立。
- 输入输出字段明确。
- 误差可数值量化。
- 失败不会影响拓扑状态，只需回退 CPU。

建议阈值：

| 字段 | RMSE | maxAbs |
|---|---:|---:|
| `isostaticBase` | <= 0.001 | <= 0.006 |
| `ageSubsidence` | <= 0.001 | <= 0.006 |
| `thicknessBuoyancy` | <= 0.001 | <= 0.006 |
| `oceanDepthTerms` | <= 0.002 | <= 0.01 |
| `elev` | <= 0.002 | <= 0.01 |
| `boundaryRelief` | <= 0.003 | <= 0.015 |

### Phase 3：GPU 局部 stencil 与 debug/diagnostics

目标：迁移固定邻域、局部平滑和 dense diagnostics。

候选：

- slope / local relief / ruggedness。
- `smoothMarginFields`。
- sediment capacity softening。
- inactive fracture zone 小半径平滑。
- debug 图层中的逐 cell field normalization。

注意：

- wrapX 必须和 `topologyOptions: { wrapX: true, wrapY: false }` 一致。
- y 方向不能 wrap。
- 极区附近后续如果迁移球面拓扑，需要重新校准邻域权重。

### Phase 4：Hybrid GPU simulation

目标：把 geology-v2 中一部分高频字段常驻 GPU，但仍由 CPU 控制 pipeline。

候选：

- `isostaticBase / elev / baseElev / relief / boundaryRelief`
- `sedimentCapacity / sedimentSink / sedimentFill`
- `passiveMargin / shelf / slope / rise / abyssalPlain`

风险：

- 上传下载可能吞掉 kernel 收益。
- 多次 `rebuildGeologyElevation` 之间字段依赖复杂。
- debug / check tools 仍需要 CPU 字段。

原则：

- 只有当 `gpu-perf-profile` 证明 upload + compute + download 明显快于 CPU 时，才默认启用。
- 否则作为实验 backend 保留。

### Phase 5：高级 GPU 图算法评估

目标：只在前几阶段稳定后评估图算法 GPU 化。

可研究但不急做：

- parallel BFS / jump flooding 距离场。
- connected components for closed basin。
- flow accumulation scan / iterative relaxation。

这些算法对正确性和调试成本要求高，不应阻塞下一阶段地质质量改造。

## 7. 近期优先级清单

1. 建立 `gpu capability + fallback`，不改变现有模拟结果。
2. 建立 `gpu-field-compare`，能比较指定字段误差。
3. 将地图着色抽象为 renderer backend，先做 GPU render 实验。
4. 把 `updateIsostasy` 改成 CPU/GPU 双实现。
5. 把 `rebuildGeologyElevation` 改成 CPU/GPU 双实现。
6. 增加 `gpu-perf-profile`，拆分 upload / kernel / download。
7. 迁移 slope / relief / margin smoothing 等 stencil。
8. 评估 sediment capacity 和 inactive fracture suppression 的 GPU 化收益。
9. 暂缓 BFS、closed basin、hydrology graph 类 GPU 化。

## 8. 必须新增的验证工具

### 8.1 `tools/gpu-field-compare.mjs`

建议参数：

```powershell
node .\tools\gpu-field-compare.mjs '龙骨海-纪元7' geology-v2 512x256 200 elev,isostaticBase,oceanDepthTerms
```

输出：

```json
{
  "field": "elev",
  "rmse": 0.0014,
  "maxAbs": 0.007,
  "meanAbs": 0.0008,
  "valid": true
}
```

### 8.2 `tools/gpu-render-check.mjs`

用途：

- 生成 CPU render 与 GPU render snapshot。
- 比较像素差异。
- 确认边界 overlay、海岸线、debug 图层没有错位。

### 8.3 `tools/gpu-perf-profile.mjs`

用途：

- 分离 CPU baseline、upload、kernel、download、readback。
- 避免只看 kernel 时间导致误判。

建议输出：

```json
{
  "backend": "webgpu",
  "resolution": "512x256",
  "kernel": "elevation",
  "uploadMs": 1.2,
  "kernelMs": 0.4,
  "downloadMs": 1.5,
  "totalGpuPathMs": 3.1,
  "cpuBaselineMs": 5.8,
  "speedup": 1.87
}
```

## 9. GPU 化验收标准

### 正确性

- 同 seed / 同参数 / 同 step 下，CPU 与 GPU 字段误差低于阈值。
- GPU 路径不改变 legacy 模式。
- geology-v2 的关键诊断仍稳定：陆海比、ridge age reset、depth-age correlation、rift / margin / transform 指标不出现异常漂移。

### 可用性

- 无 WebGPU 时不报错。
- 直接打开 `index.html` 仍能进入 CPU fallback。
- debug-render / interface-check / long-run-check 默认不依赖 GPU。

### 性能

- 只在总路径更快时默认启用 GPU，包括 upload/download。
- 低分辨率下 GPU 不一定更快，允许继续 CPU。
- 高分辨率下应优先验证 512x256、1024x512 两档。

## 10. 风险与缓解

| 风险 | 表现 | 缓解 |
|---|---|---|
| WebGPU 可用性不足 | 用户双击文件或旧浏览器无法运行 | CPU fallback 必须保留 |
| readback 成本过高 | GPU kernel 快但整体慢 | 字段批量下载，减少每步 readback |
| 浮点差异影响长期演化 | 200 / 739 Myr 逐步偏离 | 先只迁移派生字段，再迁移状态写入 |
| Debug 难度增加 | 图像异常但字段来源不清 | 每个 GPU kernel 保留 CPU compare |
| Worker 与 GPU 同时引入复杂度 | 生命周期和同步错误 | GPU 与 Worker 分阶段推进 |
| 图算法 GPU 化过早 | closed basin / hydrology 错乱 | BFS / connected components 暂留 CPU |

## 11. 推荐实施顺序

```text
Phase 0: capability + compare tools
  ↓
Phase 1: GPU render backend
  ↓
Phase 2: updateIsostasy GPU experimental
  ↓
Phase 2: rebuildGeologyElevation GPU experimental
  ↓
Phase 3: local stencil fields
  ↓
Phase 3: margin / sediment capacity smoothing
  ↓
Phase 4: hot fields mirrored on GPU
  ↓
Phase 5: evaluate graph algorithms only if still necessary
```

不要先做：

- 整体 `stepWorld` GPU 化。
- closed basin / hydrology GPU 化。
- Worker + GPU 同时重构。
- 去掉 CPU fallback。

## 12. 与下一阶段的关系

进入下一阶段前，GPU 改造应服务于地质质量迭代，而不是替代地质规则本身。优先迁移的任务应满足：

- 不改变地质解释。
- 可用字段误差证明等价。
- 能减少 geology-v2 调参时的等待时间。
- 不让 debug / long-run / resolution-check 依赖不可用硬件。

下一阶段建议保持“质量优先，GPU 为加速层”的原则：

- 地质规则仍先用 CPU 版本实现和校准。
- 对稳定、密集、重复的字段再加 GPU backend。
- 每迁移一个 kernel，都保留 CPU compare 和 fallback。

## 13. 文档维护规则

- 每新增一个 GPU kernel，应在本文补充输入字段、输出字段、误差阈值和 fallback 状态。
- 每新增一个 GPU 验证工具，应记录命令示例和适用场景。
- 如果某个 GPU 任务被证明收益不足，应在矩阵中标为“暂缓”，不要反复尝试。
- 如果未来浏览器运行约束变化，需重新评估“直接打开 `index.html`”与 WebGPU 默认启用策略。
