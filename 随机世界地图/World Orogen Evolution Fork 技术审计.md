# World Orogen Evolution Fork 技术审计

> 日期：2026-07-14  
> 范围：只读审计 `external-references/world-orogen/`、`external-references/gplately/`、`external-references/worldengine/`、`external-references/civs/` 与本地 `local-geology-v2-reference/`。  
> 结论类型：阶段 0 审计与接口设计建议；本文不代表已经 fork、复制或修改外部 GPL 代码。

> 2026-07-15 状态更新：阶段 0 接口设计已补齐，见 `World Orogen Evolution Fork 阶段0 接口设计.md`。后续可进入阶段 1：时间轴与快照系统。

## 0. 总结

当前路线判断是正确的：**World Orogen 适合作为“看见星球”的浏览器端主底座**，因为它已经具备球形网格、板块、地形、侵蚀、气候、洋流、Koppen、生物群系式渲染、检查图层、地图/球体双视图和导出能力。它的最大缺口不是视觉外壳，而是**缺少真实时间轴、可重建构造要素、可保存快照、演化状态和文明输入层**。

最重要的技术发现：

- World Orogen 不是二维矩形主模拟，而是基于 Fibonacci sphere + Delaunay/Voronoi 的球面 region graph；这比本地 geology-v2 早期 cylindrical 路径更接近主线需求。
- 现有 `plateVec` 已经使用 `pole + omega` 的形式表达板块球面旋转，适合升级为 `PlateMotionModel`，但当前只服务单次静态生成和边界分类，不是跨时间的 finite rotation / feature reconstruction 系统。
- 现有 `state.curData` 与 worker 内部 `W` 是演化和快照的主要插入面；渲染层几乎都从 `state.curData` 和 `debugLayers` 读取数据。
- 现有海陆逻辑仍以 `plateIsOcean` 和目标 land coverage 先验塑形，再由高程零点显示海陆；后续若吸收 geology-v2 的“海陆后置”，应渐进引入 crust type / crust age / sea level / ocean connectivity，而不是第一步推翻整条地形 pipeline。
- `external-references/` 已在 `.gitignore` 中；审计和后续自有实现应只提交根目录文档或自有代码，不提交参考仓库内容。

阶段 0 后续接口已在 `World Orogen Evolution Fork 阶段0 接口设计.md` 中补齐；下一步应进入阶段 1 的浏览器可验收时间轴 MVP。

## 1. World Orogen Repo 结构

World Orogen 是无构建步骤的原生 ES module 浏览器项目，入口由 `index.html` 的 import map 加载 Three.js 与 Delaunator CDN，再加载 `js/main.js`。

主要结构：

```text
external-references/world-orogen/
  index.html                 生成页 UI、控件、检查图层、导出弹窗、importmap
  import.html                高度图导入页
  styles.css                 共享 UI 样式
  README.md                  项目哲学、功能、pipeline、结构说明
  LICENSE                    GPL-3.0
  plans/WIND_SIMULATION_PLAN.md
  tuning/climate/            气候调参套件
  js/
    main.js                  UI wiring、生成按钮、图层切换、动画循环、导出
    state.js                 全局 mutable app state
    generate.js              主线程 worker dispatcher 与 fallback
    planet-worker.js         纯计算 worker，保留生成状态 W
    sphere-mesh.js           Fibonacci sphere / Delaunay / SphereMesh
    planet-mesh.js           3D 球体、2D 地图、颜色、检查图层、导出
    scene.js                 Three.js renderer/cameras/controls/water/atmosphere
    plates.js                板块生成，含随机 Euler pole + omega
    coarse-plates.js         固定粗网格板块生成与高分辨率投影
    ocean-land.js            大陆/海洋板块分配
    plate-physics.js         对 pole/omega 施加拖曳、地幔流、slab pull、ridge push
    elevation.js             碰撞、应力、距离场、地形骨架、火山/热点、debug layers
    terrain-post.js          domain warp、平滑、冰川/水力/热侵蚀、细节噪声
    wind.js                  季节风场、压力场、ITCZ
    ocean.js                 表层洋流
    precipitation.js         降水
    temperature.js           温度
    koppen.js                Koppen 分类
    color-map.js             地形与生物群系配色
    planet-code.js           分享码编码/解码
    edit-mode.js             Ctrl-click / mobile edit mode
```

结构特征：

- **计算与展示分离较好**：`planet-worker.js` 运行主 pipeline，`generate.js` 负责消息转发与 fallback，`planet-mesh.js` 只读 `state.curData` 渲染。
- **状态中心清楚**：主线程状态集中在 `state.curData`，worker 侧保留状态集中在局部变量 `W`。
- **检查图层系统成熟**：`debugLayers` 已经是各地质/气候/洋流/速度场诊断的统一出口。
- **没有本地构建系统**：后续改动需要直接浏览器验证，不能只跑 Node。

## 2. 生成 Pipeline 审计

### 2.1 当前静态生成主流程

`planet-worker.js` 的 `handleGenerate` 是权威主流程：

```text
UI sliders / planet code
  -> generate.js postMessage(cmd="generate")
  -> buildSphere(N, jitter)
  -> computeNeighborDist / triangle centers
  -> generateCoarsePlates(seed, P, continents, landCoverage)
  -> projectCoarsePlates(coarse -> high-res)
  -> smoothAndReconnectPlates
  -> plateIsOcean + plateDensity
  -> applyPlatePhysics(plateVec)
  -> buildSuperPlates + super plate physics
  -> assignElevation(...)
  -> terrain post-processing
  -> expand plate physics debug layers
  -> computeWind
  -> computeOceanCurrents
  -> computePrecipitation
  -> computeTemperature
  -> classifyKoppen
  -> compute triangle elevations
  -> retain W
  -> transfer result to main thread
  -> state.curData
  -> buildMesh / buildMapMesh
```

### 2.2 板块生成

关键文件：

- `js/plates.js`
- `js/coarse-plates.js`
- `js/ocean-land.js`
- `js/plate-physics.js`
- `js/elevation.js`

当前逻辑：

- `generatePlates` 在固定粗网格上用 farthest-point seed placement + round-robin growth 生成板块。
- `plateId` 实际上是 plate seed region id，不是紧凑的 `0..P-1` 编号。
- 每个板块在生成末尾得到 `plateVec[plateId] = { pole, omega }`。
- `applyPlatePhysics` 会基于面积、海陆、边界相对速度、地幔流、slab pull、ridge push 修改 `pole/omega`。
- `findCollisions` / `plateVelocityAt` 使用 `cross(pole, position) * omega` 的球面切向速度来判断汇聚、张裂、转换。

机会点：

- 现有 `plateVec` 是 `PlateMotionModel` 的天然种子。
- 现有边界分类已经接近 GPlates/GPlately 的“相对速度推导边界类型”思想。
- 后续不要先重写板块生成，而应把 `plateVec` 包装为显式的 motion model，并增加 `timeMyr`、stage rotation、finite rotation 和可重建 feature。

风险点：

- `plateVec` 当前是生成期随机速度和一次性物理 bias，不保证跨时间连续、可逆或可重建。
- `plateId` 与 mesh region seed id 绑定，序列化/快照时需要稳定映射。
- `plateIsOcean` 仍是地形塑形的重要先验；这与长期目标“海陆后置”不完全一致。

### 2.3 地形与高程

关键文件：

- `js/elevation.js`
- `js/terrain-post.js`
- `js/terrain-config.js`
- `js/terrain-metrics.js`

`assignElevation` 内部分层很明确：

```text
computeTectonicState
  -> findCollisions / propagateStress / boundary type / subduction factor
computeSpatialFields
  -> mountain/ocean/coast/rift/backarc/margin distance fields
classifyTerrain
  -> basin / tectonic activity / fold belt / craton / noise amplitude
buildSkeleton
  -> base / tectonic / interior / coastal / ocean / margins / backArc
applyPhasorRidges
applyIslandArcs
applyVolcanicArcs
applyHotspotsAndLIPs
applyTectonicBandNoise
applyDetailTexture
applyCoastalDetail
applyUniformLandNoise
applyDynamicTopography
applyFinalShaping
fixupTopology
```

后处理：

- `warpTerrain`：球面 tangent-plane domain warp。
- `smoothElevation`：保边界的 bilateral smoothing。
- `erodeComposite`：priority flood、glacial、hydraulic、thermal 组合侵蚀。
- `sharpenRidges`：山脊强化。
- `applyDetailNoise`：km 空间细节噪声。
- `applySoilCreep`：陆地扩散。

适合插入演化的点：

- **轻量阶段**：先不拆 `assignElevation`，只在其输入前准备 `evolutionState` / `plateMotionModel`，并在输出 `debugLayers` 中增加演化诊断层。
- **中期阶段**：将 `computeTectonicState` 的边界分类改为读取 `PlateMotionModel.classifyBoundary(edgeId, timeMyr)`。
- **长期阶段**：为 `assignElevation` 增加 `geologyMemory` 输入，包括 crustAge、riftStage、oldOrogeny、transformMemory、sediment、passiveMargin 等。

### 2.4 气候、洋流、生物群系

关键文件：

- `js/wind.js`
- `js/ocean.js`
- `js/precipitation.js`
- `js/heuristic-precip.js`
- `js/temperature.js`
- `js/koppen.js`
- `js/climate-config.js`
- `js/color-map.js`

当前顺序：

```text
terrain
  -> wind / pressure / ITCZ
  -> ocean currents
  -> precipitation
  -> temperature
  -> Koppen class
  -> biome/satellite color
```

优点：

- 已有季节夏/冬字段，适合文明层读取极值、季节性和风险。
- 已有 `climateComputed` 与 `computeClimateViaWorker`，适合在时间轴中做按需气候重算。
- 已有 `continentality`、降水、温度、洋流 warmth，可直接派生 `habitability` 等文明输入字段。

限制：

- 气候是当前地形快照的静态响应，不含长期冰量、海平面、碳循环或气候记忆。
- 生物群系主要由 Koppen/satellite color 表达，还没有面向文明的稳定数值接口。

### 2.5 导出

关键文件：

- `js/planet-mesh.js`
- `js/main.js`
- `index.html`

当前导出：

- Color terrain
- Satellite / biome
- Koppen climate
- full heightmap
- land heightmap
- land mask
- batch export

未来需要新增：

- snapshot export：按 `timeMyr` / `timeYear` 命名。
- diagnostic export：演化图层如 crustAge、riftStage、plateVelocity、boundaryKind、habitability。
- narrative export：文明历史摘要、迁徙路径、语言/文化谱系。

## 3. 数据结构审计

### 3.1 `state`

`js/state.js` 是主线程共享 mutable object。关键字段：

```text
state.curData
state.debugLayer
state.climateComputed
state.mapMode
state.pendingToggles
state.planetMesh / state.mapMesh
state.windArrowGroup / state.oceanCurrentArrowGroup
```

建议新增：

```js
state.evolution = {
  enabled: false,
  playing: false,
  timelineMode: "geology" | "civilization",
  currentSnapshotId: null,
  selectedTimeMyr: 0,
  selectedTimeYear: 0,
  snapshotIndex: [],
};
```

### 3.2 `state.curData`

当前 `curData` 是渲染与 UI 的主要读取面，包含：

- `mesh`
- `r_xyz`
- `t_xyz`
- `r_plate`
- `plateSeeds`
- `plateVec`
- `plateIsOcean`
- `plateDensity`
- `r_elevation`
- `t_elevation`
- `mountain_r`
- `coastline_r`
- `ocean_r`
- `r_stress`
- wind / ocean / precipitation / temperature arrays
- `debugLayers`
- `terrainMetrics`

建议新增：

```js
curData.evolutionState = {
  snapshotId,
  seed,
  timeMyr,
  timeYear,
  stepIndex,
  geologyVersion,
  plateMotionVersion,
  climateVersion,
  sourceSnapshotId,
};

curData.plateMotion = {
  plateIds,
  plateIdByCell,       // can alias r_plate initially
  plateRotations,
  velocityEast,
  velocityNorth,
  boundaryKind,
  boundaryNormalSpeed,
  boundaryShearSpeed,
};
```

### 3.3 Worker retained `W`

`planet-worker.js` 内部变量 `W` 是 reapply、edit recompute、on-demand climate 的 retained state。它是阶段 1 最关键插入点之一。

建议：

- 将 `W` 的保存逻辑抽成 `retainWorldState(...)`。
- 增加 `W.evolutionState`、`W.snapshotCacheMeta`、`W.plateMotion`.
- 新增 worker command：
  - `snapshotCurrent`
  - `loadSnapshot`
  - `stepEvolution`
  - `evolveTo`
  - `computeCivilizationInputs`

### 3.4 Mesh / graph 表示

World Orogen 的 `SphereMesh` 是 region/triangle/side graph：

- region fields 用 `r_*` TypedArray。
- triangle fields 用 `t_*` TypedArray。
- adjacency 通过 `adjOffset / adjList`。
- 投影与渲染由 `planet-mesh.js` 将球面坐标映射到 globe/map。

这意味着后续不需要把 geology-v2 的 cubed-sphere 生产网格直接搬进 World Orogen。更合理的方向是：

- 保留 World Orogen 的 `SphereMesh` 作为主底座。
- 把 geology-v2 的“graph API、面积权重、连通性、诊断工具思想”迁移为适配 `SphereMesh` 的工具层。

## 4. UI / 状态管理 / 渲染层

### 4.1 UI 层

入口：`index.html` + `js/main.js`。

已有控件：

- world shape sliders：detail、irregularity、plates、continents、roughness、continent size variety、land coverage。
- terrain sculpting：terrain warp、smoothing、glacial、hydraulic、thermal、ridge sharpening。
- climate offsets：temperature、precipitation。
- map tabs：terrain、satellite、climate、heightmap。
- inspect dropdown：geology、atmosphere、ocean、climate、elevation。
- globe/map 切换、grid、wireframe、show plates、auto rotate。
- export modal。
- mobile bottom sheet / FAB。

阶段 1 UI 插入点：

- 在 Visual Options 附近增加 `Timeline` 轻量区域。
- 控件最小集合：
  - play / pause
  - step back / step forward
  - time slider
  - snapshot select
  - before/after compare toggle
- 初版不要加入复杂地质参数，避免 UI 先膨胀。

### 4.2 渲染层

入口：`js/planet-mesh.js`、`js/scene.js`。

渲染机制：

- `buildMesh()` 构建 globe mesh。
- `buildMapMesh()` 构建 equirectangular map mesh。
- `updateMeshColors()` 根据 `state.debugLayer` 更新颜色。
- `debugLayers` 中任意数组可自动作为检查图层绘制。
- `buildWindArrows()` / `buildOceanCurrentArrows()` 已提供矢量箭头先例。
- `exportMap()` / `exportMapBatch()` 支持离屏 tiled render。

演化图层最好沿现有 `debugLayers` 机制接入：

```text
debugLayers.plateVelocity
debugLayers.boundaryKind
debugLayers.crustAge
debugLayers.riftStage
debugLayers.oldOrogeny
debugLayers.transformMemory
debugLayers.oceanConnectivity
debugLayers.habitability
debugLayers.agriculturePotential
debugLayers.mobilityCost
```

### 4.3 状态风险

当前状态是全局 mutable object，适合小项目，但时间轴会放大风险：

- `state.curData` 被渲染、hover、edit、export、climate compute 多处读取。
- snapshot 切换必须保证所有派生 mesh、arrows、hover backups、pending toggles 同步清理。
- `climateComputed` 是全局布尔值，进入 snapshot 后应变成 per snapshot meta。

建议阶段 1 先建立 `applySnapshot(snapshot)` 单一入口，避免散落状态更新。

## 5. `EvolutionState` 插入设计

### 5.1 最小字段

第一版 `EvolutionState` 不应该试图装下完整地质历史。它只需要让世界状态可被保存、切换、播放和解释：

```js
EvolutionState = {
  version: 1,
  mode: "static" | "geology" | "civilization",
  seed,
  timeMyr: 0,
  timeYear: 0,
  stepIndex: 0,
  dtMyr: 1,
  dtYear: 100,
  snapshotId,
  parentSnapshotId,
  climateComputed,
  plateMotionModelId,
  notes: [],
};
```

### 5.2 快照对象

```js
WorldSnapshot = {
  id,
  label,
  evolutionState,
  params,
  curDataPayload,
  debugLayerAvailability,
  metrics,
};
```

`curDataPayload` 初版可以直接存可克隆 TypedArray；中期再做压缩/差分。

### 5.3 插入位置

建议按以下顺序插入：

1. `state.js`：新增 timeline 状态，不改变生成结果。
2. `generate.js`：在 worker `done/reapplyDone/editDone/climateDone` 后，将 `msg.evolutionState` 合并到 `state.curData`。
3. `planet-worker.js`：`W` 中保留 `evolutionState`。
4. `main.js`：新增 `applySnapshot`、`captureSnapshot`、timeline UI 事件。
5. `planet-mesh.js`：只读新增 debug layers，不参与演化逻辑。

### 5.4 初版不做的事

- 不先做完整地质演化。
- 不先把旧 geology-v2 全量迁入。
- 不先改 `SphereMesh`。
- 不先引入 IndexedDB。
- 不先改变 planet-code 格式；阶段 1 可以只支持运行中快照，分享码后续再扩展。

## 6. `PlateMotionModel` 插入设计

### 6.1 与现有 `plateVec` 的关系

当前：

```js
plateVec[plateId] = {
  pole: [x, y, z],
  omega: number
}
```

建议包装为：

```js
PlateMotionModel = {
  version: 1,
  timeMyr,
  anchorPlateId,
  plateIds,
  plateIdByCell,
  eulerPoles,
  angularVelocity,
  finiteRotations,
  velocityAtCell(cellId, timeMyr),
  velocityAtPoint(position3, plateId, timeMyr),
  reconstructPoint(position3, plateId, fromTimeMyr, toTimeMyr),
  reconstructFeature(featureId, fromTimeMyr, toTimeMyr),
  classifyBoundary(edgeRef, timeMyr),
};
```

### 6.2 最小实现策略

阶段 1/2 不需要真实 finite rotation table。可以先用当前 `pole/omega` 构造固定 stage rotation：

```text
rotationAngle = omega * dtMyr * scale
axis = pole
```

然后逐步引入：

- per-plate `rotationPoles[plateId][timeIndex]`
- `finiteRotations[fromTime][toTime][plateId]`
- `anchorPlateId`
- reconstructable feature registry

### 6.3 边界分类升级

当前 `findCollisions` 已经读取相邻板块速度差。后续可改为：

```text
edge = { cellA, cellB, plateA, plateB, midpoint, tangentNormal }
vA = velocityAtPoint(midpoint, plateA, timeMyr)
vB = velocityAtPoint(midpoint, plateB, timeMyr)
relative = vB - vA
normalComponent = dot(relative, tangentNormal)
shearComponent = length(relative - normalComponent * tangentNormal)
```

分类：

- `normalComponent < -threshold`：convergent
- `normalComponent > threshold`：divergent
- `shearComponent` 主导：transform
- 低速或混合：passive / diffuse / uncertain

### 6.4 可重建 feature

建议新增独立数据层，不要把所有历史痕迹硬编码进 elevation：

```js
ReconstructableFeature = {
  id,
  type: "ridge" | "trench" | "rift" | "suture" | "hotspotTrail" | "orogen" | "fractureZone",
  birthTimeMyr,
  deathTimeMyr,
  plateId,
  conjugatePlateId,
  geometry: {
    kind: "point" | "polyline" | "polygon",
    points3,
  },
  strength,
  decay,
  metadata,
};
```

这些 feature 后续可投影成 `debugLayers.motionPath`、`debugLayers.flowline`、`debugLayers.oldBoundaryMemory`。

## 7. 从静态生成升级为时间轴 / 快照 / 播放

### 7.1 阶段 1 MVP：状态播放，不做复杂演化

目标：证明浏览器里世界状态可以按时间保存、切换和渲染。

最小功能：

- capture 当前 `state.curData` 为 snapshot。
- timeline slider 选择 snapshot。
- play/pause 在 snapshot 间播放。
- before/after compare 显示两个 snapshot 的 terrain 或 selected debug layer。
- climateComputed 随 snapshot 保存。

验收：

- 生成一次世界后可保存多个快照。
- 切换快照后 globe/map/inspect/export 仍读同一个 `state.curData`。
- 控制台无关键错误。
- 风/洋流箭头在 snapshot 切换后不会残留错位。

### 7.2 阶段 2 MVP：轻量地质 step

新增 worker command：

```text
stepEvolution({ dtMyr, steps, options })
```

初版每步可以只更新：

- `timeMyr`
- plate velocity / boundary classification debug layer
- ocean crust age debug layer
- old boundary / transform memory decay debug layer
- rift stage debug layer

不要立即改最终 `r_elevation`，或只做可开关的低幅影响。这样可以先验证状态场和诊断，而不破坏 World Orogen 的视觉质量。

### 7.3 阶段 3：演化重建 terrain

当状态场稳定后，再将其接入 `assignElevation` 输入：

- `crustAge` 影响 ocean floor profile。
- `riftStage` 影响 rift valley / proto ocean。
- `oldOrogeny` 影响低缓旧山带。
- `transformMemory` / `fractureZoneMemory` 只保留诊断和弱形态，不长期生成强直线高程。
- `oceanConnectivity` 影响 proto ocean 是否转为 ocean basin。

## 8. 本地 geology-v2 可迁移经验

本地 geology-v2 现在是参考实验室，不是主产品。可迁移的是规则、字段职责、诊断思想，而不是直接搬代码。

### 8.1 海陆后置

目标思想：

- 海陆应由统一高程场 + 海平面切分。
- 不应先硬编码大陆/海洋再强迫地形服务该 mask。

映射到 World Orogen：

- 短期：保留 `plateIsOcean` 作为现有美术/生成约束。
- 中期：新增 `crustType / crustThickness / crustDensity / seaLevel / oceanConnectivity`。
- 长期：逐步降低 `plateIsOcean` 对最终海岸的决定权，让它更多表示初始 crust affinity。

### 8.2 洋壳年龄

目标思想：

- `crustAge` 应由 active ridge 出生和扩张距离派生。
- 洋底深度随年龄冷却沉降，老洋壳趋于平台，不无限加深。

映射到 World Orogen：

- 可从 divergent boundary / ridge debug layer 生成 `ridgeBirthAge`。
- `crustAge` 初版作为 debug layer。
- 中期接入 ocean floor elevation profile，替代部分静态 ocean distance field。

### 8.3 裂谷阶段机

目标思想：

```text
stable continent
  -> incipient rift
  -> rift basin
  -> transitional margin
  -> proto ocean candidate
  -> connected young ocean
  -> mature ocean
```

映射到 World Orogen：

- 使用 divergent continental boundary + weakness + crust thinning 推进 `riftStage`。
- `proto ocean` 必须检查是否连通外海，不能只看低于海平面。
- 初版可以只显示 `riftStage` debug layer，不改地形。

### 8.4 海洋连通性

目标思想：

- 区分 external ocean、closed basin、inland lowland、candidate water body。

映射到 World Orogen：

- 基于 `SphereMesh.adjOffset / adjList` 对 `r_elevation <= seaLevel` 做 connected components。
- 最大连通海域作为 external ocean。
- 未连通但低于海平面的区域标记为 inland basin candidate。

### 8.5 旧边界 / fracture zone 衰减

目标思想：

- 活动 transform 与 inactive fracture zone 要分开。
- 旧 fracture zone 可以保留年龄差/弱带记忆，但不应长期作为强高程线。

映射到 World Orogen：

- 新增 `transformMemory`、`fractureZoneMemory`、`inactiveBoundaryRelief`。
- `fractureZoneMemory` 主要进入 diagnostics / weak texture，不直接抬升。
- 长时程验收重点检查长直海底残影。

### 8.6 长时程诊断

应迁移的诊断思想：

- `depthAgeCorrelation`
- `ridgeAgeResetShare`
- `riftStageHistogram`
- `protoOceanConnectedShare`
- `inactiveTransformReliefMean`
- `oldBoundaryReliefCorrelation`
- `sedimentStraightnessRisk`
- `flatWorldRisk`
- `resolutionWeightedDrift`
- `seam / projection continuity risk`

World Orogen 对应出口应优先放在 `terrainMetrics` 和 `debugLayers`，并能在浏览器检查图层中看到。

## 9. GPlates / pyGPlates / GPlately 可参考思想

GPlately 是 GPL-2 系列，pyGPlates/GPlates 也是 GPL 侧。这里应只学习建模语言和接口，不直接复制实现。

可参考概念：

- `plateId`
- `anchorPlateId`
- Euler pole
- stage rotation
- finite rotation
- rotation model
- reconstructable point/line/polygon
- static polygon / topological boundary
- velocity field
- boundary classification from relative velocity
- motion path
- flowline
- ridge/transform segment split
- subduction convergence / spreading rate diagnostics

映射到 World Orogen：

```text
GPlates rotation model
  -> PlateMotionModel

pyGPlates reconstruct(point/feature)
  -> reconstructPoint / reconstructFeature

motion path / flowline
  -> feature trail debug layers + future narrative export

relative plate velocity
  -> classifyBoundary(edge, timeMyr)

static polygons / topologies
  -> plateIdByCell and boundary graph over SphereMesh
```

工程边界：

- 不使用真实地球数据作为默认内容。
- 不复制 GPlately `reconstruction.py`、`velocity_tools.py`、`separate_ridge_transform_segments.py` 等 GPL 实现。
- 可用自写向量/四元数/旋转数学，且测试覆盖 Euler rotation、great-circle、velocity continuity。

## 10. WorldEngine 可参考思想

WorldEngine 是 MIT，授权风险较低。它的价值主要是静态环境管线与输出字段，而不是浏览器 UI。

可参考管线：

```text
terrain / plates
  -> erosion
  -> rain shadow
  -> precipitation
  -> temperature
  -> humidity
  -> permeability
  -> hydrology / irrigation
  -> Holdridge / biome
  -> serialized world + images
```

World Orogen 已有温度、降水、Koppen、洋流和 satellite color。需要补的是面向文明层的稳定环境字段：

```js
WorldInputsForCivilization = {
  habitability,
  freshwaterAccess,
  agriculturePotential,
  pastoralPotential,
  mobilityCost,
  riverTravel,
  seaTravel,
  resourceAttraction,
  isolation,
  naturalBarrier,
  harborPotential,
  floodplainPotential,
  disasterRisk,
};
```

建议阶段 3 优先实现：

- `habitability`
- `freshwaterAccess`
- `agriculturePotential`
- `mobilityCost`
- `naturalBarrier`
- `seaTravel`
- `riverTravel`

这些先作为 debug layers，不急着接文明模拟。

## 11. civs 可参考思想

civs 是 Apache-2.0，授权上适合参考规则。它的价值是文明历史层，而不是语言/平台技术。

可参考机制：

- bands / small groups 初始人群。
- migrate towards better lands。
- tribe / chiefdom / nation 演化。
- settlements 创建与毁灭。
- languages 发展与分裂。
- agriculture transition。
- nomadic / semi-sedentary / sedentary lifestyle。
- groups grow, split, perish。

映射到本项目：

```js
CivilizationState = {
  timeYear,
  populationGroups,
  settlements,
  cultures,
  languages,
  polities,
  migrationRoutes,
  eventLog,
};
```

第一版文明 MVP 不应做复杂战争 AI。优先：

1. 根据 `habitability + freshwaterAccess + mobilityCost` 放置若干人群。
2. 按环境梯度和人口压力迁徙。
3. 在高农业潜力区定居。
4. 距离/隔离/时间驱动 language/culture split。
5. 聚落成长到阈值形成 chiefdom/state。
6. 环境恶化、隔离、资源不足或迁徙压力导致 collapse/perish。

## 12. MVP 阶段计划与浏览器验收

### 阶段 0：审计与接口设计

产物：

- 本审计文档。
- `EvolutionState` 草案。
- `PlateMotionModel` 草案。
- 授权边界说明。

验收：

- 明确哪些模块可改、哪些只能参考。
- 明确第一批浏览器 UI 插入点。
- 不修改外部参考仓库。

### 阶段 1：时间轴与快照

目标：

- 不做复杂地质演化，先让状态可保存、切换、播放。

实现范围：

- `state.evolution`
- `curData.evolutionState`
- runtime snapshot cache
- play/pause/step/time slider
- `applySnapshot`
- `captureSnapshot`

浏览器验收：

- 页面能打开。
- 生成世界正常。
- snapshot capture / switch / play / pause 正常。
- globe/map/inspect layer 切换正常。
- 控制台无关键错误。
- climate on-demand 在 snapshot 中不串状态。

### 阶段 2：轻量地质演化

目标：

- 引入 `PlateMotionModel`、`crustAge`、`riftStage`、`transformMemory`、`oceanConnectivity` 的 debug layers。

实现范围：

- `js/evolution/plate-motion.js`
- `js/evolution/evolution-state.js`
- worker command `stepEvolution`
- 新增 debug layer options。

浏览器验收：

- 播放后时间增加。
- plate velocity / boundaryKind / crustAge / riftStage 图层可见。
- 同一种子可复现。
- 切 globe/map 无断裂。
- CPU fallback / worker fallback 不被破坏。

### 阶段 3：环境输入层

目标：

- 将地形 + 气候 + 生物群系转成文明稳定输入字段。

验收：

- `habitability`、`freshwaterAccess`、`agriculturePotential`、`mobilityCost` 至少四个 debug layer。
- 字段可从 `state.curData` 读取。
- 不直接依赖临时内部变量。

### 阶段 4：文明 MVP

目标：

- 从环境输入产生可观察的人群迁徙、聚落、语言/文化分裂。

验收：

- 地图/球体可显示迁徙路径或人群点。
- 时间轴能播放文明历史。
- 同一种子历史可复现。
- 有事件日志和基础摘要。

## 13. 授权风险与不能直接复制的边界

### 13.1 World Orogen

- 许可证：GPL-3.0。
- 若直接 fork、修改并分发，需遵守 GPL-3.0。
- 若只作为参考学习，主项目应避免复制 GPL 代码、函数实现、长段注释、文件结构的可版权表达。
- 本审计建议基于“可 fork 但清楚 GPL 义务”或“参考思想后自写实现”两条路径做决策。

### 13.2 GPlates / pyGPlates / GPlately

- GPlately 本地 LICENSE 为 GPL-2。
- 适合参考概念和接口语义：plate ID、Euler pole、finite rotation、motion path、flowline、velocity field。
- 不应直接复制 Python 实现到非 GPL 主项目。

### 13.3 WorldEngine

- 许可证：MIT。
- 可较自由参考世界生成管线、环境字段、输出格式。
- 仍建议重写实现以适配浏览器球面 `SphereMesh`。

### 13.4 civs

- 许可证：Apache-2.0。
- 可较自由参考文明规则。
- 建议只迁移规则思想和状态字段，不移植 Clojure 架构。

### 13.5 外部仓库提交边界

- `external-references/` 已在 `.gitignore`。
- 不提交外部参考仓库内容。
- 只提交根目录文档、自有 `src/js` 或未来 fork 目录中的自有实现。

## 14. 推荐下一步

建议下一轮继续做阶段 0 的接口设计文档或最小代码探针：

1. 新增 `EvolutionState` / `PlateMotionModel` 详细设计文档，明确字段、消息、快照格式。
2. 若进入代码，实现阶段 1 的 snapshot cache，不碰地形核心。
3. 在浏览器验证 `generate -> capture snapshot -> switch -> play/pause -> export`。
4. 再进入 plate motion debug layer，而不是重构完整地质 pipeline。

最小可执行顺序：

```text
docs: add evolution interfaces
feat: add runtime snapshot cache
feat: add timeline controls
feat: add plate velocity debug layer
feat: add crust age / rift stage diagnostic layers
```

## 15. 本次只读审计涉及的主要文件

World Orogen：

- `external-references/world-orogen/README.md`
- `external-references/world-orogen/index.html`
- `external-references/world-orogen/js/state.js`
- `external-references/world-orogen/js/main.js`
- `external-references/world-orogen/js/generate.js`
- `external-references/world-orogen/js/planet-worker.js`
- `external-references/world-orogen/js/plates.js`
- `external-references/world-orogen/js/coarse-plates.js`
- `external-references/world-orogen/js/ocean-land.js`
- `external-references/world-orogen/js/plate-physics.js`
- `external-references/world-orogen/js/elevation.js`
- `external-references/world-orogen/js/terrain-post.js`
- `external-references/world-orogen/js/wind.js`
- `external-references/world-orogen/js/ocean.js`
- `external-references/world-orogen/js/precipitation.js`
- `external-references/world-orogen/js/temperature.js`
- `external-references/world-orogen/js/koppen.js`
- `external-references/world-orogen/js/planet-mesh.js`
- `external-references/world-orogen/js/planet-code.js`
- `external-references/world-orogen/plans/WIND_SIMULATION_PLAN.md`

外部参考：

- `external-references/gplately/README.md`
- `external-references/gplately/gplately/reconstruction.py`
- `external-references/gplately/gplately/ptt/velocity_tools.py`
- `external-references/gplately/gplately/ptt/subduction_convergence.py`
- `external-references/gplately/gplately/ptt/ridge_spreading_rate.py`
- `external-references/gplately/gplately/ptt/separate_ridge_transform_segments.py`
- `external-references/gplately/gplately/lib/rotation.py`
- `external-references/worldengine/README.md`
- `external-references/civs/README.md`

本地 geology-v2 参考：

- `local-geology-v2-reference/geology-v2 地质理论校准报告.md`
- `local-geology-v2-reference/真实球面拓扑重构指南.md`
- `local-geology-v2-reference/设计与技术方案.md`
- `local-geology-v2-reference/src/sim/evolution.js`
- `local-geology-v2-reference/src/sim/geology/`
- `local-geology-v2-reference/src/sim/sphere/`
