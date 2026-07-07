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

| 模块 / 字段 | 迁移优先级 | 算法类型 | 状态风险 | CPU 仍需保留 | 验证方式 |
|---|---:|---|---|---|---|
| `map2d` elevation coloring | P0 | render shader / fragment | 只读渲染 | 是 | snapshot diff |
| `updateIsostasy` | P1 | dense formula | 派生字段写回 | 是 | field RMSE / maxAbs |
| `rebuildGeologyElevation` | P1 | dense formula | 派生高程写回 | 是 | `elev / baseElev / relief / boundaryRelief` compare |
| slope / local relief / ruggedness | P2 | stencil | 派生诊断 | 是 | terrain derived compare |
| `smoothMarginFields` | P2 | stencil | 派生地貌写回 | 是 | margin field compare |
| sediment capacity | P2 | dense + stencil | 半状态字段 | 是 | capacity / sink share compare |
| sediment transport passes | P4 / 实验 | multi-pass scatter | 长期状态写回 | 是 | mass budget + visual debug + long-run compare |
| inactive fracture suppression | P3 | dense + local smooth | 高程写回 | 是 | relief correlation compare |
| debug dense metrics | P3 | reduction kernels | 只读诊断 | 是 | metric compare |
| external sea BFS | 延后 | graph | 拓扑状态 | 是 | 暂不迁移 |
| closed basin id | 延后 | connected components | 拓扑状态 | 是 | 暂不迁移 |
| hydrology flow accumulation | 延后 | graph / scan | 水文状态 | 是 | 暂不迁移 |

### 4.1 代码证据映射

| 当前代码位置 | 当前职责 | GPU 改造判断 | 建议落点 |
|---|---|---|---|
| `src/render/map2d.js:createMapRenderer` | Canvas 2D 逐像素 `ImageData` 着色与边界 overlay | 低风险，只读渲染，适合作为第一条 GPU 管线 | `renderMap.wgsl` 或 WebGL2 fragment renderer，CPU renderer 保留 |
| `src/sim/geology/isostasy.js:updateIsostasy` | 壳厚、密度、洋壳年龄、沉积负载到等静力项 | dense formula，首批 compute kernel | `isostasy.wgsl`，先 GPU experimental |
| `src/sim/geology/elevation.js:rebuildGeologyElevationV2` | 组合等静力、构造 feature、沉积、被动边缘得到 `elev` | dense formula，但每步多次调用，必须控制上传下载 | `elevation.wgsl`，与 isostasy 尽量批处理 |
| `src/sim/geology/pipeline.js:runGeologyV2Step` | geology-v2 调度与阶段计时 | 不整体迁移，只作为 CPU orchestration | 后端只替换局部 stage |
| `src/sim/geology/margins.js:updatePassiveMargins` | 距离场、陆架/陆坡/陆隆/深海平原、平滑 | 拆分迁移：BFS 留 CPU，分类/平滑可 GPU | CPU distance + GPU classify/smooth |
| `src/sim/geology/sediment.js:updateSedimentBudget` | 侵蚀源、容量、搬运、沉积、诊断 | capacity 可早迁，transport scatter 延后 | `sedimentCapacity.wgsl` 先做，transport 仅实验 |
| `src/sim/geology/rift.js:deriveOceanConnectivity` | external sea / closed basin 连通性 | connected components，不做第一批 GPU | CPU 保留 |
| `src/sim/hydrology.js:deriveHydrology` | 流向、汇流、流域、湖泊候选 | 图算法和排序传播，不做第一批 GPU | CPU 保留 |
| `src/sim/derived/terrain.js:measureTerrainShape` | slope / aspect / ruggedness 派生 | stencil，适合 GPU | `localFields.wgsl` |
| `tools/perf-profile.mjs` | geology-v2 stage profiling | GPU 性能工具应复用其 seed/resolution 参数习惯 | 扩展 `gpu-perf-profile.mjs` |

### 4.2 首批 kernel 字段读写草案

| Kernel | 输入字段 | 输出字段 | 同步策略 | 备注 |
|---|---|---|---|---|
| `renderMap` | `elev`, `seaLevel`, `btype`, `activeBoundary`, `boundaryDensity`, `boundaryCoherence`, `plateCheckerboard` | framebuffer / texture | CPU authoritative，不回写模拟 | 第一阶段可先只做 elevation coloring，overlay 保留 CPU |
| `isostasy` | `crustType`, `crustThickness`, `crustAge`, `crustDensity`, `sediment`, `sedimentLoadSubsidence`, `ridge`, `trench` | `isostaticBase`, `crustBuoyancy`, `densitySubsidence`, `lithosphereCooling`, `ageSubsidence`, `thicknessBuoyancy`, `sedimentFill`, `ridgeUplift`, `trenchDepression`, `oceanDepthTerms`, `isostaticReliefSupply` | 临时 GPU 计算后下载字段 | 先不在 GPU 上跑 diagnostics correlation |
| `elevation` | `crustType`, `orogeny`, `activeOrogeny`, `oldOrogeny`, `orogenyAge`, `sediment`, `sedimentLoadSubsidence`, `sedimentFill`, `ridgeUplift`, `trenchDepression`, `isostaticBase`, `passiveMargin`, `continentalShelf`, `continentalSlope`, `continentalRise`, `abyssalPlain`, `sedimentWedge`, `forelandBasin`, `activeTransform`, `transformMemory`, `fractureZoneMemory`, `inactiveBoundaryRelief`, `geologyBroadNoise`, `geologyMicroNoise`, `mountainBelt`, `trench`, `ridge`, `rift`, `islandArc`, `basin` | `baseElev`, `relief`, `boundaryRelief`, `elev` | 与 `isostasy` 合批优先，减少 readback | 当前 pipeline 多次调用，单独迁移不一定有收益 |
| `localFields` | `elev`, `width`, `height`, topology flags | `slope`, `aspect`, `ruggedness`, `localRelief` | 派生结果可下载给 terrain/hydrology | 必须严格匹配 x wrap、y no-wrap |
| `marginSmooth` | `passiveMargin`, `continentalShelf`, `continentalSlope`, `continentalRise`, `sedimentWedge`, `abyssalPlain` | 同名字段 ping-pong | GPU temporary buffer | 只替代 `smoothMarginFields`，不替代距离场 BFS |
| `sedimentCapacity` | `elev`, `seaLevel`, `crustType`, `basin`, `forelandBasin`, `riftAxis`, `trench`, `trenchAxis`, `ridge`, `ridgeAxis`, `islandArc`, `inlandWaterCandidate`, `externalSeaMask`, `passiveMargin`, `continentalShelf`, `continentalRise`, `sedimentWedge`, `abyssalPlain`, `boundaryInfluence`, `axisCurvature`, `weakness` | `sedimentCapacity` | 先 GPU experimental | transport pass 仍 CPU |

### 4.3 字段类别与迁移 gate

GPU 迁移时按字段类别分级验收：

| 字段类别 | 示例 | 允许首批 GPU 默认启用 | 额外 gate |
|---|---|---:|---|
| 只读渲染 | color buffer, debug texture | 是 | snapshot diff |
| 纯派生诊断 | slope, ruggedness, straightness risk | 是 | 单步 field compare |
| 派生高程写回 | `isostaticBase`, `baseElev`, `elev` | 谨慎 | 单步 compare + 20 step compare |
| 长期状态写回 | `sediment`, `crustAge`, `crustThickness`, `basin` | 否，先实验 | 200 / 739 Myr long-run compare |
| 拓扑 / 图状态 | `externalSeaMask`, `closedBasinId`, `flowAccumulation` | 否 | 暂留 CPU |

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

### 5.3 Buffer 布局与对齐

当前 CPU 侧字段混用 `Float32Array / Uint8Array / Int8Array / Int32Array`。WebGPU storage buffer 实现时不要简单假设所有 typed array 都能按原样无成本映射：

- `Float32Array` 字段可优先一字段一 buffer，便于调试和 field compare。
- `Int32Array` 字段可按 `i32 / u32` buffer 映射。
- `Uint8Array / Int8Array` mask 字段建议先提升为 `u32` buffer，或集中打包到 mask buffer；不要在第一版追求极限压缩。
- `seaLevel / width / height / timeScaleFactor / topology flags` 这类 scalar 应进入 uniform buffer 或小型 params buffer。
- 字段顺序应由 `fieldLayout.js` 统一声明，避免 WGSL 与 JS 两边手写重复列表。

建议先采用“可调试优先”的朴素布局：

```text
one simulation field -> one GPUBuffer
small mask fields -> u32 mask buffer
params -> uniform buffer
temporary fields -> named ping-pong buffers
```

等 CPU/GPU 结果稳定后，再考虑把多个 hot fields 合并为 struct-of-arrays buffer，减少 bind group 数量。

### 5.4 Scratch 与临时缓冲区策略

现有 CPU 代码大量复用 `grid.scratch / scratch2 / scratch3`，例如 sediment、margin、transform、surface aging 都会临时写这些数组。GPU 路径不能直接复刻这种隐式共享语义，否则很容易出现 kernel 间数据覆盖。

建议新增 GPU 临时区池：

```js
class GpuTempPool {
  acquireFloat(name, size) {}
  acquireUint(name, size) {}
  release(name) {}
  resetFrame() {}
}
```

使用规则：

- 每个 kernel 的临时 buffer 必须在 kernel spec 中声明。
- 多 pass stencil 使用 ping-pong buffer，不复用 CPU `scratch`。
- CPU fallback 与 GPU experimental 不共享 scratch 生命周期。
- debug compare 时应能下载每个 pass 的关键临时字段，例如 `capacityRaw / capacitySmoothed / marginSmoothPass1`。

这一步虽然偏工程基础，但对 sediment、margin、fracture suppression 这类多 pass 逻辑非常关键。

### 5.5 Worker 与 GPU 的关系

`src/worker.js` 当前说明 Phase 1 单线程以保持直接打开文件可运行。GPU 改造不应强依赖 Worker。

推荐顺序：

1. 主线程 CPU + 可选 GPU render。
2. 主线程 CPU + 可选 GPU compute。
3. Worker CPU 后台模拟。
4. Worker 内 GPU compute 作为实验项。

这样可以避免同时引入 Worker 消息同步、GPU buffer 生命周期和浏览器安全上下文三类风险。

### 5.6 运行模式矩阵

| 运行方式 | 默认后端 | GPU 可用时 | 约束 |
|---|---|---|---|
| 直接双击 `index.html` / `file://` | CPU simulation + CPU render | 可尝试 WebGL2 render；WebGPU 不作为假设 | 必须无报错运行 |
| 本地 dev server / `localhost` | CPU simulation + optional GPU render | 可启用 WebGPU experimental | 适合人工视觉验证 |
| Node 工具链 | CPU only | 未来可选 headless GPU，但不作为默认 | `interface-check / long-run-check / resolution-check` 不依赖 GPU |
| Debug render | CPU field source | 可选 GPU field compare | 输出必须可复现 |
| Profiling | CPU baseline | GPU profile 作为独立命令 | 必须拆分 upload / kernel / download |

文档中的 GPU 路线是长期加速路线，不代表下一轮地质调参必须先完成 GPU 工程。地质质量规则仍可先在 CPU 路径落地，稳定后再迁移到 GPU。

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

当前落地状态：

- 已新增 `src/gpu/capability.js`：只读检测 secure context、WebGPU、WebGL2，并给出 `cpu / webgl-render-available / webgpu-experimental-available` 建议模式；本阶段不请求 GPU device。
- 已新增 `src/gpu/gpuContext.js`、`src/gpu/fieldLayout.js`、`src/gpu/gpuWorld.js`：只提供 CPU authoritative 的后端骨架、字段分组与未来同步意图，不执行 WGSL kernel。
- 已在 `src/main.js` 中记录 capability，并在 `tools/bundle-app.mjs` 中纳入 `src/gpu/capability.js`，保持 `src/app.js` 可直接由 `index.html` 加载运行。
- 已新增 `tools/gpu-field-compare.mjs`：当前为 CPU baseline vs CPU candidate 框架，供后续 GPU kernel 接入后复用。
- 已新增 `tools/gpu-perf-profile.mjs`：当前输出 CPU baseline 与 GPU capability，`uploadMs / kernelMs / downloadMs / totalGpuPathMs` 仍为 `null`。
- 当前没有任何 GPU compute kernel；CPU fallback 仍是默认路径和权威模拟路径。

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

当前落地状态：

- 已拆分 `src/render/cpuMapRenderer.js`、`src/render/gpuMapRenderer.js`、`src/render/renderBackend.js`，`src/render/map2d.js` 只负责选择后端并暴露统一 `render(world)` 接口。
- CPU Canvas renderer 仍是默认可靠路径；WebGL2 GPU renderer 仅在 URL 显式 opt-in（`?gpuRender=1` 或 `?renderBackend=webgl2`）且能力探测允许时启用。
- WebGL2 renderer 当前只读取 `grid.elev` 与 `world.seaLevel` 做基础 elevation coloring，不写回 `world` 或任何模拟字段；板块边界 overlay 暂由 CPU Canvas 完整路径保留。
- 已新增 `tools/gpu-render-check.mjs`，在 Node/headless 环境下生成 CPU reference PPM，并安全报告 GPU render skipped/fallback。
- 当前仍没有任何默认接入主模拟的 GPU compute kernel；Phase 2A 已开始把 `updateIsostasy` 做成显式 experimental compare/profile 路径，CPU 仍是权威模拟路径。

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

Phase 2A 当前落地状态：

- 已新增 `src/gpu/kernels/isostasyKernel.js`，以 WGSL compute shader 对齐 CPU `updateIsostasy` 的逐 cell dense formula。
- 已新增 `src/gpu/isostasyCompute.js`，只在显式 experimental compare/profile 调用时申请 WebGPU device；默认不写回 `world.grid`，只返回 candidate 字段对象。
- `tools/gpu-field-compare.mjs` 已支持 `--candidate=webgpu-isostasy`；默认不带 candidate 时仍是 CPU-vs-CPU，预期误差为 0。
- `tools/gpu-perf-profile.mjs` 已支持 `--kernel=isostasy`，并拆分 `uploadMs / kernelMs / downloadMs / totalGpuPathMs`；WebGPU 不可用时安全 `skipped`。
- CPU `updateIsostasy` 仍是生产路径；`stepWorld`、`runGeologyV2Step`、`rebuildGeologyElevation` 均未接入 GPU isostasy。
- 当前仍未把 GPU isostasy 串入生产 pipeline，也未迁移 sediment、rift、hydrology、passive margin、closed basin 或任何图算法。

Phase 2B 当前落地状态：

- 已新增 `src/gpu/kernels/elevationKernel.js`，以 WGSL compute shader 对齐 CPU `rebuildGeologyElevationV2` 的核心逐 cell 公式。
- 已新增 `src/gpu/elevationCompute.js`，只在显式 experimental compare/profile 调用时申请 WebGPU device；默认不写回 `world.grid`，只返回 `baseElev / relief / boundaryRelief / elev` candidate 字段。
- `elevation` candidate 已改为单 packed input storage buffer + 单 output storage buffer，避免浏览器实机因过多 storage buffer 绑定导致 shader 输出全 0；这是 Phase 2B 浏览器 parity 的关键修复。
- `tools/gpu-field-compare.mjs` 已支持 `--candidate=webgpu-elevation`；默认不带 candidate 时仍是 CPU-vs-CPU，`--candidate=webgpu-isostasy` 继续保持 Phase 2A 行为。
- `tools/gpu-perf-profile.mjs` 已支持 `--kernel=elevation`，并拆分 `uploadMs / kernelMs / downloadMs / totalGpuPathMs`；WebGPU 不可用时安全 `skipped`。
- `tools/browser-smoke-check.mjs` 已验证浏览器实机 `gpuKernel=elevation&gpuFields=baseElev,relief,boundaryRelief,elev`；当前 `baseElev / relief / boundaryRelief / elev` 均通过运行时阈值，且 CPU 仍保持权威。
- CPU `rebuildGeologyElevation` 仍是生产路径；`stepWorld`、`runGeologyV2Step`、生产 `updateIsostasy` 均未接入 GPU elevation。
- 当前仍未把 Phase 2A isostasy kernel 与 Phase 2B elevation kernel 合批接入 pipeline。
- 下一步可进入 Phase 2C（isostasy + elevation combined profile / batching experiment）或 Phase 3（local terrain stencil experimental），具体取决于 Phase 2B compare/profile 结果。

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

当前落地状态：

- 已新增 `src/gpu/kernels/localFieldsKernel.js` 与 `src/gpu/localFieldsCompute.js`，实现 `slope / aspect / ruggedness / localRelief` 的矩形网格 WebGPU candidate。
- `tools/gpu-field-compare.mjs` 已支持 `webgpu-local-fields` / `local-fields`，输出 `rmse / maxAbs / p95Abs`，并在 WebGPU 不可用时 safe skip。
- `tools/gpu-perf-profile.mjs` 已支持 `local-fields`，继续拆分 `uploadMs / kernelMs / downloadMs / totalGpuPathMs`。
- `src/gpu/computeValidate.js` 已接入 `gpuKernel=local-fields` 浏览器 validate，并为 `slope / aspect / ruggedness / localRelief` 构建 CPU snapshot baseline；浏览器实机验证使用 `topology=cylindrical&projection=equirectangular` 显式走矩形网格路径。
- `localFields` 浏览器实机曾暴露 Chrome WebGPU 不支持 WGSL `isNan/isInf` 的问题；现已改为 `value != value || abs(value) > 3.3e38` 的兼容检查，并为 pipeline / bind group / dispatch 加入 error scope，避免 shader 失败被误判为全 0 输出。
- `localFields` 输入已改为 packed `vec4<f32>` storage buffer，和已验证的 dense kernels 保持一致；当前浏览器实机 `local-fields` validate 结果为真执行、非 skip，`slope / aspect / ruggedness / localRelief` 均通过阈值。
- `localFields` WebGPU candidate 已开始复用 device / pipeline，并输出 `adapterInfo / deviceInfo / setupMs / totalCandidateMs / reusedContext`；浏览器实机两次连续 validate 已确认第二次 `reusedContext: true` 且 `setupMs: 0`。
- `localFields` 复用修复曾暴露 classic bundle 作用域中的同名 `withCandidateTiming` 函数覆盖问题；当前已改用 `withLocalFieldsCandidateTiming`，后续新增 GPU candidate 时应避免跨模块顶层 helper 同名，或在 bundler 中隔离模块作用域。
- 该 candidate 仍是只读实验路径，不写回 `world.grid`，也不接入 `stepWorld` / `runGeologyV2Step`。
- 当前只覆盖矩形网格；真实球面 / cubed-sphere 图拓扑会安全跳过，后续需按图邻域重新设计权重。
- 已新增 `src/gpu/kernels/marginSmoothKernel.js` 与 `src/gpu/marginSmoothCompute.js`，实现 `passiveMargin / continentalShelf / continentalSlope / continentalRise / sedimentWedge / abyssalPlain` 的一次四邻域平滑 WebGPU candidate。
- `tools/gpu-field-compare.mjs` 已支持 `webgpu-margin-smooth` / `margin-smooth`，并用 CPU 同等一次平滑结果作为 baseline；`tools/gpu-perf-profile.mjs` 已支持 `margin-smooth`。
- `src/gpu/computeValidate.js` 已接入 `gpuKernel=margin-smooth` 浏览器 validate，并为 `passiveMargin / continentalShelf / continentalSlope / continentalRise / sedimentWedge / abyssalPlain` 构建 CPU 同等一轮四邻域平滑 baseline；浏览器实机 `margin-smooth` validate 结果为真执行、非 skip，所有字段均通过阈值。
- `marginSmooth` candidate 只覆盖矩形网格上的 `smoothMarginFields` 平滑候选，不替代距离场、BFS、`clampMarginFields` 或任何 CPU 生产路径；真实球面 / cubed-sphere 图拓扑会安全跳过。
- `tools/bundle-app.mjs` 已纳入 Phase 3 的 `localFields` 与 `marginSmooth` candidate 文件，确保浏览器 bundle 不遗漏新增 GPU 实验模块。
- 已新增 `src/gpu/kernels/sedimentCapacityKernel.js` 与 `src/gpu/sedimentCapacityCompute.js`，实现 `sedimentCapacity` 的种子容量公式和两轮 8 邻域 softening WebGPU candidate。
- `tools/gpu-field-compare.mjs` 已支持 `webgpu-sediment-capacity` / `sediment-capacity`，以 CPU `sedimentCapacity` 字段为权威 baseline；`tools/gpu-perf-profile.mjs` 已支持 `sediment-capacity`。
- `sedimentCapacity` 浏览器实机 validate 已完成同 checkpoint 对齐：`src/gpu/computeValidate.js` 会用 CPU 同等容量公式与两轮 softening 生成 snapshot baseline，不再拿沉积流程后续改写过的 step-end `grid.sedimentCapacity` 做错位比较。
- `sedimentCapacity` 浏览器实机曾暴露 `layout: "auto"` 会按 WGSL entry point 裁剪未使用 binding，导致 `seed_capacity` / `smooth_capacity` bind group 不一致；现已改为显式 bind group layout，确保 binding 0..8 在两个入口中一致可用。
- 当前浏览器实机 `gpuKernel=sediment-capacity&gpuFields=sedimentCapacity` validate 结果为真执行、非 skip，`sedimentCapacity` 通过阈值；Node 工具链在无 WebGPU/非 secure context 下仍 safe skip。
- `sedimentCapacity` candidate 只覆盖容量场计算与 softening，不迁移沉积搬运、沉积写回、闭合盆地、外海连通、BFS 或水文图算法；真实球面 / cubed-sphere 图拓扑会安全跳过。

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

当前落地状态：

- 已新增 `tools/gpu-drift-check.mjs`，作为 Phase 4 validate / experimental 前置闸门；它按 checkpoint 采样当前 CPU 权威世界，并在 WebGPU candidate 可用时对比候选字段，不可用时安全输出 skipped reason 与零漂移 CPU 证据。
- `gpu-drift-check` 支持两种调用形态：计划文档形态 `seed pipeline resolution checkpoints fields`，以及 step-first 形态 `seed step pipeline resolution --gpu-compute validate --gpu-kernel ... --fields ...`。
- 当前工具输出 `comparedSteps / maxFieldRmse / maxFieldAbs / failedFields / diagnosticDrift / driftOverTime / fieldDrift / skippedReason`；离线 drift gate 仍保持 CPU 权威 checkpoint 对比，不把 GPU candidate 写回生产 pipeline。
- 已新增 `src/gpu/computeValidate.js` 与浏览器 URL 参数入口：`?gpuCompute=candidate/validate` 会每 N 步采样当前 CPU 权威 world，默认运行已通过浏览器实机采样的 `isostasy` WebGPU candidate，对比 `isostaticBase` 并在 Console 输出 `[gpu-compute-candidate]` 或 `[gpu-compute-validate]` 摘要；这两种模式都不写回 `world.grid`。
- `gpuCompute=validate` 的默认采样间隔为 20 步，可用 `gpuValidateInterval` 调整；可用 `gpuKernel` / `gpuKernels` 和 `gpuFields` 缩小验证范围。
- 浏览器运行时 `isostaticBase` validate 门槛使用 `rmse <= 0.001 / p95Abs <= 0.002 / maxAbs <= 0.0065`；其中 `maxAbs` 比离线候选门槛略宽，用于吸收浏览器 WebGPU f32 的单点边缘差异，不构成默认 GPU 写回许可。
- 浏览器实机 WebGPU 验证显示 `elevation` 已可作为显式 `gpuKernel=elevation&gpuFields=baseElev,relief,boundaryRelief,elev` validate 核触发；当前修复使用 validation snapshot 对齐 CPU 权威 checkpoint，并把 elevation 输入打包到单 storage buffer，避免多 storage buffer 绑定限制导致全 0 输出。
- 浏览器实机 WebGPU 验证显示 `sediment-capacity` 可以作为显式 `gpuKernel=sediment-capacity&gpuFields=sedimentCapacity` validate 核触发；当前已用同 checkpoint CPU 公式 baseline 校准，避免直接和沉积流程后续改写过的 step-end `grid.sedimentCapacity` 错位比较。它仍保留为显式实验项，不进入默认 GPU 写回。
- 已新增浏览器运行时 `gpuCompute=experimental`：目前只允许 `isostasy` 低风险派生字段写回，且写回前会先对同 checkpoint CPU baseline 与 WebGPU candidate 做误差门禁；若 WebGPU 不可用、candidate skipped、字段超阈值或请求字段不在 allowlist 内，会自动保留 CPU 字段并报告 `fallbackReason`。
- `gpuCompute=experimental&gpuKernel=isostasy` 当前允许写回 `sedimentFill / ridgeUplift / trenchDepression / crustBuoyancy / densitySubsidence / lithosphereCooling / isostaticBase / ageSubsidence / thicknessBuoyancy / oceanDepthTerms / isostaticResidual / isostaticReliefSupply`，仍不写回 `crustAge / sediment / basin / crustThickness` 等长期记忆字段。
- 浏览器 smoke gate 已增加 `--require-writeback`，用于确认 WebGPU experimental 不是 safe-skip 误报；实机验证中 `isostasy` 12 个写回字段均通过阈值，最大误差约 `2.98e-8`，Console 输出 `[gpu-compute-experimental]` 摘要且无项目错误。
- 当前 experimental writeback 仍不是默认生产路径；进入默认 GPU compute 前还必须补齐多 seed、多分辨率和更长程 20 / 200 / 739 Myr drift gate，并证明总路径性能收益高于 CPU。

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

### 8.4 `tools/gpu-drift-check.mjs`

用途：

- 检查 GPU 写回字段是否会在长期演化中放大微小浮点差异。
- 对比 CPU-only 与 GPU-experimental 在同 seed、同参数、同 step 下的核心诊断。
- 只在 GPU kernel 准备从 experimental 升级为默认路径前运行。
- 当前阶段先用于 CPU 权威 checkpoint 采样与 GPU candidate 对比；WebGPU 不可用时应 `valid: true` 并给出 safe-skip 原因。

建议参数：

```powershell
node .\tools\gpu-drift-check.mjs '龙骨海-纪元7' geology-v2 512x256 20,200,739 elev,isostaticBase,sedimentCapacity
node .\tools\gpu-drift-check.mjs '龙骨海-纪元7' 20 geology-v2 256x128 --gpu-compute validate --gpu-kernel sediment-capacity --fields sedimentCapacity
```

建议输出：

```json
{
  "seedText": "龙骨海-纪元7",
  "resolution": "512x256",
  "steps": [20, 200, 739],
  "valid": true,
  "diagnosticDrift": {
    "landRatio": 0.002,
    "seaRatio": 0.002,
    "depthAgeCorrelation": 0.018,
    "sedimentBudgetError": 0.011
  },
  "fieldDrift": {
    "elev": { "rmse": 0.0024, "maxAbs": 0.012 },
    "sedimentCapacity": { "rmse": 0.014, "maxAbs": 0.071 }
  }
}
```

### 8.5 `tools/browser-smoke-check.mjs`

用途：

- 把每个 GPU 改造阶段的“真实浏览器验收”固化为可重复工具，而不是只依赖后台 Node 检查。
- 通过 Chrome DevTools Protocol 打开 `file://` 或本地 HTTP 页面，点击播放，确认 canvas 非空、步数推进、Console 无项目自身错误。
- 在涉及 WebGPU compute 时，可读取 `globalThis.__lastGpuComputeValidation`，确认浏览器实机 validate 结果。
- 过滤 React DevTools、浏览器扩展、拦截请求、favicon、`[Violation]` 等非项目噪声，但把 `Uncaught`、`SyntaxError`、`TypeError`、`ReferenceError`、`Cannot read properties`、`Unexpected token`、关键字段 `NaN/Infinity` 视为失败。

命令示例：

```powershell
node .\tools\browser-smoke-check.mjs --mode file --steps 1 --wait-ms 8000 --query "renderBackend=cpu"
node .\tools\browser-smoke-check.mjs --mode http --steps 1 --wait-ms 12000 --query "gpuCompute=validate&gpuValidateInterval=1&gpuValidateReports=1&gpuKernel=isostasy&gpuFields=isostaticBase&renderBackend=cpu" --require-validation
```

建议输出：

```json
{
  "valid": true,
  "mode": "http",
  "canvas": { "w": 512, "h": 256, "colorSpread": 425 },
  "step": 49,
  "gpuValidation": {
    "valid": true,
    "skipped": false,
    "kernels": ["isostasy"],
    "fields": [
      { "field": "isostaticBase", "valid": true, "rmse": 0.00064 }
    ]
  },
  "consoleSummary": {
    "projectErrors": 0
  }
}
```

阶段门禁：

- 每次修改渲染、浏览器入口、GPU validate、GPU candidate 或默认运行模式后，都必须至少跑一次 `file` 模式。
- 涉及 WebGPU compute 的阶段必须额外跑一次 `http` 模式并带 `--require-validation`。
- `browser-smoke-check` 通过不替代 `interface-check / long-run-check / resolution-check`，而是补足真实浏览器运行证据。
- `browser-smoke-check` 已可读取 `globalThis.__worldMapPerfSummary`；加 `--require-perf-summary` 时会要求浏览器实机产生 step/render 样本，并在输出中记录 step、render、projection render、GPU upload/kernel/download/total 和 Long Task 摘要。
- 浏览器 perf summary 与 `gpu-perf-profile` 现在同时记录 `setupMs` 和 `totalCandidateMs`；默认启用 GPU 时应优先看包含 setup 的 `totalCandidateMs`，连续运行时再看 setup 摊薄后的 `totalGpuPathMs`。
- `browser-smoke-check` 已禁用页面缓存，避免验证旧 bundle；新增 `--require-reused-gpu-setup-zero`，可要求所有 `reusedContext: true` 的 candidate 报告 `setupMs: 0`，用于防止 pipeline/device 复用退化或 bundle helper 覆盖造成计时误报。
- 涉及 WebGPU validate 的 smoke 会先等待 validation 结果，再用 `--post-validation-wait-ms` 给页面恢复一小段时间后探测 canvas 和 step；这样能区分“validation 没完成”和“validation 后页面无法继续推进”，避免长任务期间提前误报。
- 性能门禁可选参数：
- GPU compute 性能门禁可选参数：`--max-gpu-total-ms` 检查不含 setup 的 upload+kernel+download，`--max-gpu-candidate-ms` 检查包含 setup 的完整 candidate 成本；进入默认启用前应使用这两个阈值证明浏览器真实运行不退化。

```powershell
node .\tools\browser-smoke-check.mjs --mode file --steps 1 --wait-ms 8000 --query "renderBackend=cpu" --require-perf-summary
node .\tools\browser-smoke-check.mjs --mode http --steps 1 --wait-ms 30000 --query "gpuCompute=experimental&gpuValidateInterval=1&gpuValidateReports=1&gpuKernel=isostasy&renderBackend=cpu" --require-validation --require-writeback --require-perf-summary
```

当前浏览器实机性能观测：

- `file:// + renderBackend=cpu` 可输出性能摘要，step 平均约 `252ms`，render 平均约 `44ms`，Console 无项目错误。
- `localhost + gpuCompute=experimental + gpuKernel=isostasy` 可真执行并写回，但 GPU 总路径约 `14s`，其中 download/readback 约 `8.9s`，明显慢于当前 CPU 路径；因此 `isostasy` GPU 写回必须继续保留为显式 experimental，不能默认启用。
- `localhost + gpuCompute=validate/experimental + gpuKernel=isostasy + gpuFields=isostaticBase` 已支持字段级 readback，只下载 `isostaticBase` 所在的 packed output buffer；浏览器 smoke 输出会记录 `requestedFields` 与 `downloadedPacks`，用于确认验证范围没有误报。
- 字段级 readback 的实机结果仍显示 GPU 总路径约 `15.7s`，download/readback 约 `9.8s`，说明当前瓶颈不只是输出字段数量，后续优化应优先评估 buffer map/readback 固定成本、Chrome/WebGPU 环境开销、kernel 合批和降低验证频率。
- 浏览器 smoke 现在会把 WebGPU candidate 的 `adapterInfo` / `deviceInfo` 一并带出，用来区分真实硬件路径、兼容/软件 fallback、设备 limits 或 feature 缺失造成的异常慢路径。
- `gpuFields=isostaticBase` 的最新浏览器 validate 显示 adapter 为 `nvidia / lovelace`，不是软件 fallback；单字段路径仍出现约 `20.3s` 总 GPU 路径，其中 kernel 约 `7.3s`、download 约 `12.9s`，因此下一轮应优先做“设备 / pipeline 复用 + 异步低频验证”，而不是继续细分单次 readback 字段。
- `isostasy` WebGPU candidate 已开始复用 device / pipeline；输出增加 `setupMs`、`totalCandidateMs` 与 `reusedContext`，后续应在多次 validation 或更低频 validation 中观察 setup 成本是否被摊薄。
- 两次连续浏览器 validate 已确认第二次 `reusedContext: true` 且 `setupMs: 0`，首次 setup 约 `19.2s` 已被消除；但复用后的单次 `totalGpuPathMs` 仍约 `13.6s`，kernel 与 readback 仍各约 `6-7s`，因此该路径继续保持 experimental，不进入默认。
- `local-fields` 两次连续浏览器 validate 已确认第二次 `reusedContext: true` 且 `setupMs: 0`，`slope / ruggedness / localRelief` 误差约 `1e-9` 到 `0`；但复用后 `totalGpuPathMs` 仍约 `12s`，kernel 约 `8s`、download 约 `4s`，因此它仍是 validate/candidate 证据路径，不应默认写回。
- 这组结果说明 Phase 6 的门禁已能捕获“正确但体验退化”的情况，下一步优化重点应是减少 readback、批量合并 kernel 或降低验证频率，而不是把该路径提升为默认。

## 9. GPU 化验收标准

### 正确性

- 同 seed / 同参数 / 同 step 下，CPU 与 GPU 字段误差低于阈值。
- GPU 路径不改变 legacy 模式。
- geology-v2 的关键诊断仍稳定：陆海比、ridge age reset、depth-age correlation、rift / margin / transform 指标不出现异常漂移。
- 只读渲染和纯派生诊断可以用单步 compare 验收；凡是写回长期状态的 GPU kernel，必须补跑 20 / 200 / 739 Myr drift check。
- CPU/GPU 差异应先按字段类别解释：渲染色差可以宽松，派生高程需要严格，长期状态写回必须证明不会造成陆海比、沉积预算或旧边界残影漂移。

### 可用性

- 无 WebGPU 时不报错。
- 直接打开 `index.html` 仍能进入 CPU fallback。
- debug-render / interface-check / long-run-check 默认不依赖 GPU。

### 性能

- 只在总路径更快时默认启用 GPU，包括 upload/download。
- 低分辨率下 GPU 不一定更快，允许继续 CPU。
- 高分辨率下应优先验证 512x256、1024x512 两档。
- 默认启用 GPU 的硬性门槛建议设为：`totalGpuPathMs <= cpuBaselineMs * 0.8`，且连续多 seed / 多分辨率不退化；若只快 0%-20%，保留为 experimental。
- 性能报告必须拆分 `uploadMs / kernelMs / downloadMs / totalGpuPathMs / cpuBaselineMs`，禁止只用 kernel 时间证明收益。
- 对 `rebuildGeologyElevation` 这类每步多次调用的 stage，应单独记录“合批前”和“合批后”两种 profile，避免单 kernel 快但整步更慢。

### 确定性与长期漂移

- 第一阶段优先迁移派生字段，避免直接改变 `crustAge / sediment / basin / crustThickness` 等长期记忆状态。
- 若 GPU kernel 写回长期状态，应同时比较字段误差、诊断漂移和 debug 图层；任何一项无法解释，都不能默认启用。
- 允许 CPU/GPU 之间存在极小浮点差异，但不允许差异在 200 / 739 Myr 形成新的海岸线、沉积色带、旧边界残影或陆海比漂移。
- 随机扰动、hash jitter、噪声采样必须继续由确定性 seed 驱动；不要引入依赖 GPU 执行顺序的非确定性。

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
