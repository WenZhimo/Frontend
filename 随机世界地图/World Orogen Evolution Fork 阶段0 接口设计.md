# World Orogen Evolution Fork 阶段 0 接口设计

> 日期：2026-07-15  
> 状态：阶段 0 完成稿  
> 关联文档：`世界生成与文明演化开发总纲.md`、`World Orogen Evolution Fork 技术审计.md`  
> 授权边界：本文是自有接口设计文档；只参考外部项目的思想、接口语义和组织方式，不复制 GPL 实现。

## 0. 目标模式提示词

本阶段的执行目标如下：

```text
完成 World Orogen Evolution Fork 阶段 0：在现有审计基础上补齐 EvolutionState、PlateMotionModel、快照/时间轴接口、授权边界与阶段 1 实施入口的自有设计文档；只读参考 external-references，不修改或提交外部仓库内容。
```

执行原则：

- 保持 World Orogen 为后续主产品底座，本地 geology-v2 只作为深时地质规则和诊断参考。
- 阶段 0 不改运行时代码，不扩展 `local-geology-v2-reference/`，不提交 `external-references/`。
- 阶段 1 先做可保存、切换、播放的快照时间轴，不先重写地形、气候或文明模拟。
- GPL 项目只参考概念、数学接口和数据组织，具体实现必须在自有代码中重写。

## 1. 阶段 0 完成定义

阶段 0 的目标不是实现功能，而是把后续实现边界定清楚。完成标准：

- 已形成 World Orogen 技术审计，覆盖 repo 结构、生成 pipeline、数据结构、UI、渲染、外部参考和授权风险。
- 已明确 `EvolutionState` 的最小字段、生命周期、不变量和与 `state.curData` / worker `W` 的关系。
- 已明确 `PlateMotionModel` 的最小字段、球面速度接口、边界分类接口和未来 finite rotation 扩展点。
- 已明确 `WorldSnapshot` / `SnapshotCache` / timeline 命令接口。
- 已明确阶段 1 的最小改动面、浏览器验收标准和不能提前做的复杂工作。

## 2. 已确认的接入锚点

World Orogen 当前结构适合做渐进式演化扩展，关键锚点如下：

| 锚点 | 位置 | 阶段 1 用途 | 阶段 2+ 用途 |
|---|---|---|---|
| 主线程状态 | `js/state.js` 的 `state` | 添加 timeline / snapshot UI 状态 | 添加演化播放、比较视图、文明层显示状态 |
| 当前世界数据 | `state.curData` | 当前快照的唯一渲染输入 | 挂载 `evolutionState`、`plateMotion`、文明输入字段 |
| worker 保留状态 | `planet-worker.js` 的 `W` | 保留当前生成世界供 reapply / climate / snapshot 使用 | 保留地质演化状态、plate motion、diagnostics |
| worker 消息面 | `generate.js` / `planet-worker.js` | 新增 `snapshotCurrent`、`loadSnapshot`、`stepEvolution` | 新增地质 step、环境输入、文明 step |
| 调试图层 | `debugLayers` | 快照比较和时间层显示 | plate velocity、boundary kind、crust age、rift stage 等 |
| 板块速度种子 | `plateVec = { pole, omega }` | 作为 `PlateMotionModel` v1 的输入 | 升级为 stage / finite rotation |
| 渲染层 | `planet-mesh.js` | 继续只读 `state.curData` | 新增图层颜色映射，不承载演化逻辑 |

约束：

- `state.curData` 必须继续是渲染、导出、hover、inspect 的单一数据表面。
- snapshot 切换必须通过一个入口更新 `state.curData`，避免散落更新 `mesh`、arrows、hover backup、climate flag。
- worker `W` 当前会克隆部分 TypedArray 来避免 transfer 后失效；快照设计必须尊重这一点。

## 3. 核心决策

### 3.1 阶段 1 先做状态时间轴，不做真实地质演化

决策：阶段 1 只证明世界状态可以被捕获、恢复、切换和播放；不要求板块跨时间连续运动，也不要求重建 terrain。

理由：

- World Orogen 视觉质量来自静态 pipeline，先重写地形会带来大面积回归风险。
- 时间轴会放大主线程状态污染问题，必须先建立 `applySnapshot()` 这种单一入口。
- 后续所有地质和文明演化都依赖快照基础设施。

### 3.2 `PlateMotionModel` 从现有 `plateVec` 包装开始

决策：第一版 `PlateMotionModel` 不引入真实 GPlates rotation table，只包装当前 `pole + omega`，并增加稳定查询接口。

理由：

- World Orogen 已经用 Euler pole 和 angular velocity 表达球面板块速度。
- 现有 `findCollisions()` 已经基于相邻板块相对速度推断 convergent / divergent / transform。
- 先稳定接口，再替换内部实现，能降低 GPL 参考项目的复制风险。

### 3.3 调试图层优先于最终地形影响

决策：阶段 2 的地质演化字段优先进入 `debugLayers` 和 `terrainMetrics`，不要立即强改 `r_elevation`。

理由：

- `debugLayers` 是当前 UI 已成熟支持的观察面。
- 地质规则可先验收连续性、可复现性和诊断结果，再进入地形塑形。
- 这样能避免“看起来变了，但变坏了”的不可控回归。

## 4. `EvolutionState` 规格

### 4.1 数据结构

```js
const EvolutionStateV1 = {
  schema: "world-orogen-evolution-state",
  version: 1,

  mode: "static",              // "static" | "geology" | "civilization"
  seed: "string",

  time: {
    scale: "static",           // "static" | "geology" | "civilization"
    timeMyr: 0,                // geology mode: million years before/after reference
    timeYear: 0,               // civilization mode: calendar-like local year
    stepIndex: 0,
    dtMyr: 1,
    dtYear: 100
  },

  snapshot: {
    id: "snap_...",
    parentId: null,
    label: "0 Myr",
    createdAt: "2026-07-15T00:00:00.000Z",
    source: "generate"         // "generate" | "reapply" | "edit" | "evolution-step" | "import"
  },

  dependencies: {
    plateMotionModelId: null,
    climateComputed: false,
    environmentInputsComputed: false,
    civilizationComputed: false
  },

  diagnostics: {
    warnings: [],
    metricsVersion: 1
  }
};
```

### 4.2 字段职责

| 字段 | 职责 | 阶段 |
|---|---|---|
| `schema` / `version` | 支持未来迁移 | 1 |
| `mode` | 区分静态、地质、文明时间轴 | 1 |
| `seed` | 快照复现和 UI 标识 | 1 |
| `time.scale` | 防止 Myr 与 Year 混用 | 1 |
| `time.timeMyr` | 地质演化主时间 | 1 |
| `time.timeYear` | 文明演化主时间 | 4 |
| `snapshot` | 快照谱系、标签和来源 | 1 |
| `dependencies.climateComputed` | 替代全局 `state.climateComputed` 的长期方向 | 1 |
| `diagnostics` | 长时程检查和警告 | 2 |

### 4.3 不变量

- `mode === "static"` 时，`time.timeMyr` 和 `time.timeYear` 可为 0，但仍必须存在。
- 每个 `state.curData` 必须最多挂载一个当前 `evolutionState`。
- `state.climateComputed` 在阶段 1 可继续保留，但切换快照时必须从 `curData.evolutionState.dependencies.climateComputed` 同步。
- `snapshot.id` 在一个运行会话中必须唯一。
- `snapshot.parentId` 只记录直接来源，不试图在阶段 1 建完整 DAG 编辑器。

## 5. `WorldSnapshot` 与缓存规格

### 5.1 快照对象

```js
const WorldSnapshotV1 = {
  schema: "world-orogen-snapshot",
  version: 1,
  id: "snap_...",
  label: "0 Myr",
  evolutionState: EvolutionStateV1,
  params: {},
  payload: {
    curData: null
  },
  availability: {
    terrain: true,
    climate: false,
    debugLayers: []
  },
  metrics: {
    terrainMetrics: null
  }
};
```

### 5.2 payload 策略

阶段 1 使用内存快照缓存，先不做 IndexedDB、压缩或分享码扩展。

- `curData.mesh` 可以复用或重建，但 `triangles` / `halfedges` 的生命周期要清晰。
- TypedArray 必须通过显式 clone 保存，避免 worker transfer 导致 buffer 失效。
- `Set` 字段保存为数组，恢复时再转回 `Set`。
- `plateVec` 保存为 plain object，不保存函数。
- `debugLayers` 中的 TypedArray 也必须 clone；缺失图层以 `availability.debugLayers` 为准，不写假 0。

建议工具函数：

```js
function captureSnapshot(label, source = "manual") {}
function cloneCurDataForSnapshot(curData) {}
function restoreCurDataFromSnapshot(snapshot) {}
function applySnapshot(snapshotId) {}
function deleteSnapshot(snapshotId) {}
function listSnapshots() {}
```

### 5.3 SnapshotCache

```js
const SnapshotCacheV1 = {
  currentId: null,
  order: [],
  byId: new Map(),
  maxSnapshots: 24,
  memoryPolicy: "manual-prune"
};
```

阶段 1 不做自动淘汰，除非浏览器内存明显成为问题。若需要限制，优先提示用户而不是静默删除。

## 6. `PlateMotionModel` 规格

### 6.1 数据结构

```js
const PlateMotionModelV1 = {
  schema: "world-orogen-plate-motion-model",
  version: 1,
  id: "pmm_...",
  timeMyr: 0,

  plateIds: [],                // stable logical plate ids
  plateIdByCell: null,         // Int32Array; v1 can alias r_plate
  anchorPlateId: null,

  rotations: {
    type: "stage-euler",
    poleByPlateId: {},         // plateId -> [x, y, z]
    omegaByPlateId: {},        // plateId -> angular speed
    units: "world-orogen-v1"
  },

  diagnostics: {
    velocityScale: 1,
    source: "plateVec",
    warnings: []
  }
};
```

### 6.2 查询接口

```js
function createPlateMotionModelFromPlateVec({
  plateVec,
  r_plate,
  plateSeeds,
  timeMyr,
  anchorPlateId
}) {}

function velocityAtPoint(model, position3, plateId, timeMyr = model.timeMyr) {}

function velocityAtCell(model, mesh, r_xyz, cellId, timeMyr = model.timeMyr) {}

function classifyBoundary(model, mesh, r_xyz, r_plate, edgeRef, timeMyr = model.timeMyr) {}

function reconstructPoint(model, position3, plateId, fromTimeMyr, toTimeMyr) {}

function reconstructFeature(model, feature, fromTimeMyr, toTimeMyr) {}
```

### 6.3 边界分类输出

```js
const BoundaryClassificationV1 = {
  kind: "unknown",             // "convergent" | "divergent" | "transform" | "passive" | "unknown"
  plateA: -1,
  plateB: -1,
  normalSpeed: 0,
  shearSpeed: 0,
  relativeSpeed: 0,
  confidence: 0,
  midpoint: [0, 0, 1],
  tangentNormal: [1, 0, 0]
};
```

分类规则：

- 法向闭合速度高于阈值：`convergent`。
- 法向张开速度高于阈值：`divergent`。
- 切向速度主导且法向速度较低：`transform`。
- 速度低、边界不活跃或同板块：`passive`。
- 输入不足或几何退化：`unknown`。

### 6.4 与 GPlates/GPlately 的关系

可参考的概念：

- plate ID
- anchor plate
- Euler pole
- stage rotation
- finite rotation
- reconstructable point / line / polygon
- motion path / flowline
- velocity field
- relative velocity based boundary classification

不能直接复制：

- GPlates / pyGPlates / GPlately 的 GPL 源码实现。
- GPlately 中 reconstruction、velocity tools、ridge/transform split 等具体函数逻辑。
- 真实地球数据集作为默认游戏内容。

自有实现要求：

- 球面向量、四元数、great-circle、velocity continuity 等数学工具必须重写。
- 每个关键函数至少用小规模合成数据测试：同一板块内部速度连续、极区不爆炸、跨经线接缝连续、相邻板块分类稳定。

## 7. 时间轴与 worker 消息接口

### 7.1 主线程 API

```js
function captureCurrentSnapshot({ label, source }) {}
function applySnapshotById(snapshotId) {}
function stepTimeline(direction) {}
function playTimeline({ fps = 2, loop = false }) {}
function pauseTimeline() {}
function compareSnapshots(beforeId, afterId, layer = "terrain") {}
```

主线程状态建议：

```js
state.evolution = {
  enabled: false,
  playing: false,
  timelineMode: "geology",
  currentSnapshotId: null,
  compare: {
    enabled: false,
    beforeId: null,
    afterId: null,
    layer: "terrain"
  },
  snapshotCache: SnapshotCacheV1
};
```

### 7.2 worker command

阶段 1 最小命令：

```js
{ cmd: "snapshotCurrent" }
{ cmd: "loadSnapshot", snapshotId }
```

阶段 2 预留命令：

```js
{ cmd: "stepEvolution", dtMyr, steps, options }
{ cmd: "evolveTo", timeMyr, options }
{ cmd: "computeEnvironmentInputs", snapshotId }
```

### 7.3 worker response

```js
{
  type: "snapshotDone",
  snapshot,
  transferListMeta
}

{
  type: "evolutionStepDone",
  evolutionState,
  plateMotion,
  debugLayers,
  terrainMetrics
}
```

阶段 1 可先在主线程实现 runtime snapshot cache，不强制 worker 参与；但接口命名应提前保留，避免阶段 2 再改 UI。

## 8. 阶段 1 最小实施面

推荐新增或修改：

```text
external-references/world-orogen/js/state.js
  + state.evolution

external-references/world-orogen/js/generate.js
  + 将 msg.evolutionState 合并进 state.curData
  + 切换快照时同步 state.climateComputed

external-references/world-orogen/js/main.js
  + timeline UI wiring
  + captureCurrentSnapshot()
  + applySnapshotById()
  + play / pause / step

external-references/world-orogen/js/planet-mesh.js
  + 只读 debugLayers，不写演化逻辑

新增自有模块（建议）
  js/evolution/evolution-state.js
  js/evolution/snapshot-cache.js
```

不建议阶段 1 做：

- 不改 `assignElevation()` 主体。
- 不改板块生成算法。
- 不接入 IndexedDB。
- 不扩展 planet-code 分享码格式。
- 不做文明模拟。
- 不把 geology-v2 的 cubed-sphere 架构搬进 World Orogen。

## 9. 阶段 2 预留字段

地质演化字段先作为 diagnostics：

```js
const GeologyMemoryV1 = {
  crustType: null,             // Int8Array: unknown/oceanic/continental/transitional
  crustAgeMyr: null,           // Float32Array
  riftStage: null,             // Int8Array
  oldOrogeny: null,            // Float32Array
  transformMemory: null,       // Float32Array
  fractureZoneMemory: null,    // Float32Array
  sediment: null,              // Float32Array
  oceanConnectivity: null      // Int8Array
};
```

推荐 debug layer 名称：

```text
plateVelocity
boundaryKind
boundaryNormalSpeed
boundaryShearSpeed
crustAge
riftStage
oldOrogeny
transformMemory
fractureZoneMemory
oceanConnectivity
habitability
freshwaterAccess
agriculturePotential
mobilityCost
```

## 10. 浏览器验收标准

阶段 1 改动凡影响网页运行，必须浏览器验证：

- 页面能打开。
- 初始生成能完成。
- globe / map 都能渲染。
- inspect layer 能切换。
- climate on-demand 图层不会串到错误快照。
- capture snapshot / switch snapshot / play / pause / step 正常。
- pending plate toggles、hover backup、wind arrows、ocean arrows 在快照切换后不残留错位。
- 控制台无关键错误。
- 如果后续触碰 WebGL/GPU/worker fallback，必须确认 CPU fallback 不被破坏。

## 11. 授权和提交边界

可提交：

- 根目录路线文档、审计文档、接口设计文档。
- 后续自有实现代码。
- 自有测试、诊断和验收说明。

不可提交：

- `external-references/` 内任何外部仓库内容。
- GPL 项目的源代码片段、函数实现、长段注释或结构性复制。
- 真实 GPlates 数据集作为默认产品资源。

可参考但需重写：

- World Orogen 的球面可视化和 pipeline 思路，若直接 fork 分发则按 GPL-3.0 处理。
- GPlates/GPlately 的 plate motion 术语、概念和接口语义。
- WorldEngine 的环境字段和静态管线。
- civs 的文明规则和状态机思想。

## 12. 阶段 0 结论

阶段 0 可以收束为以下技术路线：

```text
World Orogen static curData
  -> EvolutionState metadata
  -> WorldSnapshot runtime cache
  -> timeline applySnapshot()
  -> PlateMotionModel wrapper around plateVec
  -> geology diagnostics debugLayers
  -> environment inputs
  -> civilization state
```

下一阶段最小任务：

1. 在 World Orogen fork 或自有实验分支中新增 `state.evolution`。
2. 新增 `snapshot-cache.js`，实现 capture / restore / apply。
3. 在 UI 中加入 play / pause / step / snapshot select。
4. 浏览器验证 generate -> capture -> switch -> play/pause -> layer switch。
5. 阶段 1 验收通过后，再进入 `PlateMotionModel` debug layer。

