# geology-v2 后续系统接口预留清单

## 1. 目标

geology-v2 不应只输出一张好看的高度图，而应输出一组能被气候、水文、生物圈和资源系统读取的物理解释接口。后续系统应通过这些接口理解“为什么这里是海、为什么这里有山、为什么这里容易积水、为什么这里适合某类生态”，而不是重新用随机噪声或贴图决定结果。

核心原则：

- 地质层负责提供稳定的地形、海陆、构造、沉积和盆地解释。
- 气候、水文、生物圈只读取地质派生接口，不直接改写地质状态。
- 后续系统如需反作用地形，应通过明确的反馈通道，例如侵蚀、沉积、湖泊填充，而不是任意写 `elev`。
- 接口应尽量是 derived 字段，可重复计算；长期状态仍保留在 geology-v2 state 中。

## 2. 接口分层

建议把地质输出分为三层：

1. **核心状态层 state**
   板块、地壳类型、壳厚、壳龄、密度、弱带、造山根、沉积物、盆地等长期状态。

2. **地形派生层 terrain derived**
   海陆、相对海拔、坡度、坡向、海岸距离、海洋连通性、大陆架、山脉屏障等从 state 和 `elev / seaLevel` 派生的字段。

3. **系统输入层 inputs**
   为气候、水文、生物圈、资源系统整理好的稳定输入对象，例如 `climateInputs`、`hydrologyInputs`、`biosphereInputs`、`resourceInputs`。

## 3. 通用地形接口

这些字段应优先预留，所有后续系统都会使用。

| 字段 | 类型 | 来源 | 用途 |
|---|---|---|---|
| `elev` | Float32Array | geology-v2 final elevation | 最终统一高程 |
| `seaLevel` | number | water volume solver | 海平面 |
| `relativeElevation` | Float32Array | `elev - seaLevel` | 气候、水文、生物圈共同使用 |
| `landMask` | Uint8Array | `elev >= seaLevel` | 陆地判断 |
| `seaMask` | Uint8Array | `elev < seaLevel` | 海洋判断 |
| `shallowSeaMask` | Uint8Array | `relativeElevation` 接近 0 且为海 | 大陆架、珊瑚/浅海候选 |
| `deepOceanMask` | Uint8Array | 深海阈值 | 洋流、深海平原、海底生态 |
| `slope` | Float32Array | 高程梯度 | 水流、侵蚀、生态坡度限制 |
| `aspect` | Float32Array | 高程梯度方向 | 迎风坡、背风坡、日照 |
| `ruggedness` | Float32Array | 局部高程方差 | 山地、栖息地破碎、通行难度 |
| `coastDistance` | Float32Array | 距海岸距离 | 海洋性气候、湿地、沿海地貌 |
| `distanceToOcean` | Float32Array | 到外海距离 | 大陆性、降水衰减 |
| `landmassId` | Int32Array | 陆地连通域 | 岛屿、大陆、生物扩散 |
| `islandId` | Int32Array | 小型陆地连通域 | 岛屿生态、孤立演化 |

优先级最高的是：

1. `relativeElevation`
2. `landMask / seaMask`
3. `slope / aspect / ruggedness`
4. `coastDistance / distanceToOcean`
5. `landmassId / islandId`

## 4. 气候系统输入

气候系统需要知道海陆热力差异、纬度、高程、山脉屏障、距海距离和海洋深浅。

### 4.1 推荐字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `latitude` | Float32Array 或按 y 派生 | 基础太阳辐射、温度带 |
| `relativeElevation` | Float32Array | 高海拔降温 |
| `landMask / seaMask` | Uint8Array | 海陆热力差异 |
| `oceanDepth` | Float32Array | 海洋热容量、洋流候选 |
| `shallowSeaMask` | Uint8Array | 浅海、陆架、暖湿源 |
| `coastDistance` | Float32Array | 海洋性气候 |
| `distanceToOcean` | Float32Array | 内陆性、降水衰减 |
| `orographicBarrier` | Float32Array | 地形抬升降水、雨影 |
| `mountainAxis` | Float32Array / vector | 山脉主轴，用于迎风/背风判断 |
| `mountainHeight` | Float32Array | 屏障强度 |
| `prevailingWindExposure` | Float32Array | 可由气候层根据风向回填 |

### 4.2 `orographicBarrier` 建议公式

```js
orographicBarrier =
  max(0, relativeElevation - localLowlandBase)
  * ruggednessWeight
  * mountainContinuity;
```

或简单版：

```js
orographicBarrier =
  smooth(max(0, relativeElevation), radius = 3..8)
  * clamp(ruggedness * 2, 0, 1);
```

### 4.3 气候层使用方式

```js
temperature = latitudeTemperature(latitude)
  - elevationLapseRate * max(0, relativeElevation);

moistureSource =
  seaMask * oceanHumidity
  + shallowSeaMask * shelfHumidityBonus
  - distanceToOcean * inlandDrying;

precipitation =
  baseMoisture
  + windwardLift(prevailingWind, slope, aspect, orographicBarrier)
  - leewardRainShadow(orographicBarrier);
```

### 4.4 气候接口验收

- 高山背风侧应比迎风侧干。
- 内陆区域应比近海区域更大陆性。
- 高海拔区域温度更低。
- 大陆架和浅海可作为湿润海洋边界条件，但不直接生成生物群系。

## 5. 水文系统输入

水文系统不能直接在视觉高程上跑，否则小噪声会制造乱流、死坑和碎湖。应预留一个专门的 `hydroElevation / flowElevation`。

### 5.1 推荐字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `hydroElevation` | Float32Array | 水文求流用高程 |
| `flowElevation` | Float32Array | 可与 `hydroElevation` 合并 |
| `externalSeaMask` | Uint8Array | 与外海连通的海 |
| `oceanConnectivity` | Uint8Array / Int32Array | 水体连通性 |
| `closedBasinId` | Int32Array | 内流盆地 |
| `drainageBasinId` | Int32Array | 流域 |
| `watershedId` | Int32Array | 与 `drainageBasinId` 同步的流域接口别名 |
| `depressionMask` | Uint8Array | 局地洼地 |
| `flowDirection` | Int8Array | D8 或类似流向 |
| `flowTarget` | Int32Array | 下游格点 index，无法外排为 -1 |
| `flowAccumulation` | Float32Array | 汇流累积 |
| `flowSlope` | Float32Array | 到下游格点的有效坡降 |
| `riverMask` | Uint8Array | 主河道候选 |
| `riverStrength` | Float32Array | 连续河流强度 |
| `riverOrder` | Uint8Array | 近似 Strahler 等级 |
| `riverOutlet` | Uint8Array | 入外海口候选 |
| `outletId` | Int32Array | 外海出口或内流终点编号 |
| `endorheicBasin` | Uint8Array | 内流盆地区域 |
| `endorheicSink` | Uint8Array | 内流汇水终点 |
| `lakeCandidate` | Uint8Array | 湖泊候选，不是完成态湖泊 |
| `wetlandCandidate` | Float32Array | 湿地候选 |
| `sedimentSink` | Float32Array | 沉积汇 |
| `erodibility` | Float32Array | 可侵蚀性 |
| `permeability` | Float32Array | 渗透性、地下水候选 |

### 5.2 `hydroElevation` 建议

```js
hydroElevation =
  smooth(elev, radius = 1..3)
  - removeTinyNoiseArtifacts
  + sedimentFill
  + lakeOutletCorrections;
```

原则：

- 大型山脉、盆地、陆架必须保留。
- 单像素构造噪声、海底旧边界残影不应主导河流。
- 后续湖泊填充可以修改 `hydroElevation` 或生成 `lakeSurfaceElevation`，但不要随意改 geology-v2 的 `elev`。

### 5.3 海洋连通性

水文前就应有最小版本：

```js
externalSeaMask = floodFillFromMapBoundaryOrGlobalOcean(seaMask);
inlandWaterCandidate = seaMask && !externalSeaMask;
```

用途：

- 区分外海、内陆湖盆、低于海平面的封闭盆地。
- 防止大陆裂谷刚低于海平面就直接变成规则海。
- 给后续湖泊系统提供候选盆地。

### 5.4 水文接口验收

- 河流总体沿 `hydroElevation` 下行。
- 外海和内陆湖候选能区分。
- 大型封闭盆地能被识别。
- 小噪声不应生成大量碎湖。
- 沉积汇集中在盆地、低地、被动边缘和河口附近。

### 5.5 Hydrology MVP 当前实现

当前已新增 topology 驱动的 Hydrology MVP。`getHydrologyInputs(world)` 只读当前地形派生状态，不推进模拟、不写回 geology-v2。实现范围：

- `hydroElevation`：基于 topology 半径邻域的轻量平滑高程，保留大型山脉、盆地和陆缘，降低单格噪声对流向的支配。
- `flowDirection / flowTarget / flowSlope`：D8 最陡下降，允许陆地流向更低陆地、外海邻格或 `inlandWaterCandidate`，不允许穿过外海再回陆地。
- `flowAccumulation`：统一 runoff 占位权重的汇流面积，用于主河候选，不代表真实降水或径流量。
- `drainageBasinId / watershedId / outletId`：追踪最终入外海出口或内流终点。
- `riverMask / riverStrength / riverOrder / riverOutlet`：主河道、连续强度、近似等级和入海口候选。
- `endorheicBasin / endorheicSink / lakeCandidate / wetlandCandidate`：内流盆地、汇水终点、湖泊候选和湿地候选；仍不是完整湖泊水量系统。

MVP 诊断字段：

- `hydrologyValid`
- `flowAssignedShare`
- `flowCycleCount`
- `orphanFlowShare`
- `depressionShare`
- `endorheicBasinCount`
- `endorheicLandShare`
- `lakeCandidateShare`
- `riverCellShare`
- `riverContinuityScore`
- `riverOutletCount`
- `coastalOutletShare`
- `externalSeaDrainageShare`
- `closedBasinDrainageShare`
- `largestWatershedShare`
- `flowAccumulationP95`
- `flowAccumulationMax`
- `riverResolutionDrift`

明确不在本轮实现：气候降水、蒸发、地下水、湖面高度、真实水量收支、priority-flood 填洼、三角洲和水文反作用侵蚀。这些应进入 Hydrology Phase 2。

## 6. 生物圈系统输入

生物圈应由气候、水文、土壤和地貌稳定性共同派生，不应直接读随机噪声决定群系。

### 6.1 推荐字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `biomeBaseElevation` | Float32Array | 生物圈使用的平滑高程 |
| `soilParentMaterial` | Int8Array | 土壤母质，来自地质类型 |
| `soilDepthPotential` | Float32Array | 土层厚度潜力 |
| `sediment` | Float32Array | 冲积/沉积土 |
| `slope` | Float32Array | 陡坡限制植被和土壤 |
| `ruggedness` | Float32Array | 栖息地破碎度 |
| `waterAvailability` | Float32Array | 水文层输出 |
| `groundwaterPotential` | Float32Array | 地下水潜力 |
| `floodplainPotential` | Float32Array | 河漫滩、湿地候选 |
| `coastalWetlandPotential` | Float32Array | 沿海湿地候选 |
| `volcanicSoilPotential` | Float32Array | 火山土候选 |
| `disturbance` | Float32Array | 构造、火山、侵蚀扰动 |
| `landmassId / islandId` | Int32Array | 生物扩散和隔离 |
| `connectivityToLandmass` | Float32Array | 岛屿隔离程度 |

### 6.2 生物圈派生逻辑

```js
soilDepthPotential =
  sediment * sedimentSoilBonus
  + lowSlopeBonus
  + climateWeatheringBonus
  - steepSlopePenalty
  - activeTectonicDisturbance;

waterAvailability =
  precipitation
  + groundwaterPotential
  + floodplainPotential
  - drainageLoss
  - aridity;

biome = classifyBiome(
  temperature,
  precipitation,
  waterAvailability,
  soilDepthPotential,
  slope,
  relativeElevation,
  disturbance
);
```

### 6.3 生物圈接口验收

- 群系分布由温度、降水、水分和土壤解释。
- 高山、陡坡、贫瘠岩地限制森林。
- 河漫滩、冲积平原、三角洲区域更适合湿地或高生产力生态。
- 岛屿生态可根据 `islandId` 和隔离程度单独处理。

## 7. 资源系统输入

资源系统虽然不是当前问题重点，但它强依赖地质成因，建议同步预留。

| 字段 | 类型 | 用途 |
|---|---|---|
| `crustType` | Uint8Array | 基础地壳环境 |
| `crustAge` | Float32Array | 洋壳年龄、沉积盆地年龄 |
| `crustThickness` | Float32Array | 大陆根、盆地、矿化环境 |
| `orogeny` | Float32Array | 造山带、变质矿带 |
| `volcanicArc` / `islandArc` | Float32Array | 火山弧矿化 |
| `riftStage` | Int8Array | 裂谷资源、盆地发育 |
| `passiveMargin` | Float32Array | 油气/沉积盆地候选 |
| `sedimentaryBasin` | Float32Array | 沉积资源 |
| `metamorphicBelt` | Float32Array | 变质带 |
| `igneousProvince` | Float32Array | 岩浆省、火成矿 |
| `hydrothermalPotential` | Float32Array | 热液矿化 |
| `mineralProvince` | Int16Array | 资源分区 |

资源派生示例：

```js
hydrothermalPotential =
  volcanicArc * 0.5
  + ridge * 0.3
  + transformWeakness * 0.2;

sedimentaryResourcePotential =
  sedimentaryBasin
  * sediment
  * basinAge
  * burialDepth;
```

## 8. 统一查询接口

建议不要让后续模块直接散读 geology-v2 内部字段，而是提供稳定查询接口。

```js
getTerrainDerived(world)
getClimateInputs(world)
getHydrologyInputs(world)
getBiosphereInputs(world)
getResourceInputs(world)
```

### 8.1 `getTerrainDerived(world)`

```js
{
  relativeElevation,
  landMask,
  seaMask,
  shallowSeaMask,
  deepOceanMask,
  slope,
  aspect,
  ruggedness,
  coastDistance,
  distanceToOcean,
  landmassId,
  islandId
}
```

### 8.2 `getClimateInputs(world)`

```js
{
  latitude,
  relativeElevation,
  landMask,
  seaMask,
  oceanDepth,
  shallowSeaMask,
  coastDistance,
  distanceToOcean,
  orographicBarrier,
  mountainAxis,
  mountainHeight
}
```

### 8.3 `getHydrologyInputs(world)`

```js
{
  hydroElevation,
  externalSeaMask,
  oceanConnectivity,
  closedBasinId,
  depressionMask,
  slope,
  erodibility,
  permeability,
  sedimentSink
}
```

### 8.4 `getBiosphereInputs(world)`

```js
{
  biomeBaseElevation,
  soilParentMaterial,
  soilDepthPotential,
  slope,
  ruggedness,
  waterAvailability,
  groundwaterPotential,
  floodplainPotential,
  coastalWetlandPotential,
  volcanicSoilPotential,
  disturbance,
  landmassId,
  islandId,
  connectivityToLandmass
}
```

### 8.5 `getResourceInputs(world)`

```js
{
  crustType,
  crustAge,
  crustThickness,
  orogeny,
  volcanicArc,
  riftStage,
  passiveMargin,
  sedimentaryBasin,
  metamorphicBelt,
  igneousProvince,
  hydrothermalPotential,
  mineralProvince
}
```

## 9. 最小优先实现顺序

建议按以下顺序预留和实现：

1. `relativeElevation`
2. `landMask / seaMask`
3. `slope / aspect / ruggedness`
4. `coastDistance / distanceToOcean`
5. `oceanConnectivity / externalSeaMask`
6. `hydroElevation / flowElevation`
7. `closedBasinId / drainageBasinId`
8. `orographicBarrier / mountainAxis`
9. `passiveMargin / shelf / shallowSea`
10. `sedimentSink / erodibility`
11. `landmassId / islandId`
12. `soilDepthPotential / waterAvailability`
13. `resourceInputs`

其中前 8 项应在气候和水文正式接入前完成。第 9 到第 13 项可以随被动边缘、水文和生物圈逐步补全。

## 10. 不建议提前硬编码的内容

以下内容依赖气候、水文或生物圈，不应在 geology-v2 阶段直接贴图生成：

- 河流路径
- 湖泊最终面积
- 沼泽、湿地
- 冰川、峡湾
- 珊瑚礁、碳酸盐台地
- 三角洲
- 沙漠、雨林、草原、苔原
- 生物群系
- 土壤类型最终分类

geology-v2 应只提供这些地貌的候选条件，例如浅海、低地、封闭盆地、河漫滩潜力、沿海湿地潜力、冰川可侵蚀的高纬高山条件等。

## 11. 验证指标建议

### 11.1 气候接口诊断

- `orographicBarrierCoverage`
- `mountainRainShadowPotential`
- `coastDistanceDistribution`
- `highElevationAreaRatio`
- `landmassContinentalityRange`

### 11.2 水文接口诊断

- `externalSeaShare`
- `inlandWaterCandidateShare`
- `closedBasinCount`
- `hydroDepressionCount`
- `flowSinkCount`
- `sedimentSinkCoverage`

### 11.3 生物圈接口诊断

- `soilDepthPotentialMean`
- `steepLandShare`
- `floodplainPotentialShare`
- `coastalWetlandPotentialShare`
- `islandCount`
- `habitatRuggednessDistribution`

### 11.4 资源接口诊断

- `sedimentaryBasinCoverage`
- `orogenicBeltCoverage`
- `volcanicArcCoverage`
- `riftResourceProvinceCoverage`
- `hydrothermalPotentialCoverage`

## 12. 结论

地形层必须为后续系统预留接口。推荐优先完成通用地形 derived、水文专用高程、海洋连通性、山脉屏障、海岸距离和陆地连通域。这样气候、水文和生物圈才能继续遵守成因链：气候由海陆、海拔和山脉解释；水文由可流动地形和盆地解释；生物圈由气候、水分、土壤和地貌稳定性解释。

一句话：geology-v2 的输出不应只是 `elev`，而应是一套“地球系统底座 API”。

## 13. 当前实现状态（接口骨架）

本轮新增 `src/sim/derived/terrain.js`，以只读派生方式提供以下稳定入口：

```js
getTerrainDerived(world)
getClimateInputs(world)
getHydrologyInputs(world)
getBiosphereInputs(world)
getResourceInputs(world)
```

接口层不推进时间、不写回 `world`，也不实现气候、水文、生物圈或资源生成逻辑；它只把当前 `elev / seaLevel / geology-v2 state` 整理为后续系统可读的输入对象。海陆仍严格由 `relativeElevation = elev - seaLevel`、`landMask = elev >= seaLevel`、`seaMask = elev < seaLevel` 派生，保持“海陆后置”。

已实现的真实派生字段：

- `relativeElevation / landMask / seaMask / shallowSeaMask / deepOceanMask`
- `slope / aspect / ruggedness`
- `coastDistance / distanceToOcean`
- `landmassId / islandId`
- `externalSeaMask / oceanConnectivity / closedBasinId / depressionMask`
- `latitude / oceanDepth / orographicBarrier / mountainAxis / mountainHeight`
- `hydroElevation / erodibility / permeability / sedimentSink`
- `soilParentMaterial / soilDepthPotential / groundwaterPotential / floodplainPotential / coastalWetlandPotential / volcanicSoilPotential / disturbance / connectivityToLandmass`
- `volcanicArc / riftStage / passiveMargin / sedimentaryBasin / metamorphicBelt / igneousProvince / hydrothermalPotential`

当前 placeholder 或近似字段：

- `waterAvailability` 暂时返回 0，等待气候和水文产出降水、蒸发、径流后回填。
- `mineralProvince` 暂时返回 0 编号，等待资源分区模型。
- `riftStage / passiveMargin / hydrothermalPotential` 是由现有字段近似推断的派生候选，不代表完整 Wilson Cycle、被动陆缘或热液系统。
- `closedBasinId` 标记低于海平面但不属于最大外海连通域的水体候选；它不是最终湖泊系统。

新增验证工具：

```powershell
node .\tools\interface-check.mjs '龙骨海-纪元7' 0 geology-v2 512x256
node .\tools\interface-check.mjs '龙骨海-纪元7' 20 geology-v2 512x256
```

工具会创建指定世界、调用所有 getter、检查字段存在、TypedArray 类型、数组长度是否等于 `grid.size`，并输出 `landRatio / seaRatio / shallowSeaShare / deepOceanShare / landmassCount / islandCount / externalSeaShare / inlandWaterCandidateShare / closedBasinCount / averageSlope / averageRuggedness / orographicBarrierCoverage / sedimentSinkCoverage` 等接口诊断统计。

后续系统约束：气候、水文、生物圈和资源模块应优先读取这些 getter 的输出，不应直接依赖 geology-v2 的内部临时字段；如需反作用地貌，应通过明确反馈通道（侵蚀、沉积、湖泊填充等）进入地质层。

## 14. 裂谷阶段机与海洋连通性接口

本轮新增 `riftStage` 状态字段和海洋连通性派生字段，用于区分外海、内陆低地、闭合盆地、裂谷盆地和新生洋盆候选。海陆仍由 `elev >= seaLevel` 派生；这些字段只解释水体/裂谷的地质状态，不取代海陆后置原则。

`RiftStage` 阶段：

```js
NONE: 0
INCIPIENT_RIFT: 1
RIFT_BASIN: 2
TRANSITIONAL_RIFT: 3
PROTO_OCEAN_CANDIDATE: 4
CONNECTED_YOUNG_OCEAN: 5
```

新增/增强字段：

- `riftStage`：geology-v2 state，记录裂谷演化阶段。
- `riftAge`：阶段推进用的持续张裂记忆。
- `protoOceanCandidate`：新生洋盆候选 debug mask。
- `externalSeaMask`：低于海平面且属于最大连通海域的外海。
- `inlandWaterCandidate`：低于海平面但不连通外海的候选内陆水体/闭合盆地。
- `oceanConnectivity`：`0=非水体/陆地`，`1=内陆候选水体`，`2=外海`。
- `closedBasinId`：内陆候选水体连通域编号。

接口层变化：

- `getTerrainDerived(world)` 现在返回 `inlandWaterCandidate`。
- `getHydrologyInputs(world)` 返回统一的 `externalSeaMask / oceanConnectivity / inlandWaterCandidate / closedBasinId`。
- `getResourceInputs(world)` 返回真实 `grid.riftStage`，不再用临时近似推断。

注意：`inlandWaterCandidate` 和 `closedBasinId` 不是完整湖泊系统；它们只表示“低于海平面但未连通外海”的候选状态。后续水文仍需要判断补给、蒸发、溢流和湖面高度。

## 15. 被动陆缘与大陆架接口补充

本轮新增被动大陆边缘、陆架、陆坡、陆隆、深海平原和沉积楔派生字段。它们服务于后续气候、水文、生物圈和资源系统，但不替代 `elev / seaLevel` 的海陆后置切分。

新增/增强字段：

- `passiveMargin`：Float32Array，非活动陆缘和陆洋过渡带强度。
- `continentalShelf`：Float32Array，近岸浅海外海陆架强度，可供气候层判断浅海热容和湿润源。
- `continentalSlope`：Float32Array，陆架外侧较陡下降带。
- `continentalRise`：Float32Array，陆坡外侧沉积缓坡，可供水文层作为沉积汇候选。
- `abyssalPlain`：Float32Array，老洋壳、低活动、高沉积的平缓深海区域。
- `sedimentWedge`：Float32Array，陆缘沉积楔，表示沉积填浅和平滑潜力。

getter 变更：

- `getTerrainDerived(world)` 返回 `passiveMargin / continentalShelf / continentalSlope / continentalRise / abyssalPlain / sedimentWedge`。
- `getClimateInputs(world)` 返回 `continentalShelf`。
- `getHydrologyInputs(world)` 返回 `continentalRise`。
- `getResourceInputs(world)` 的 `passiveMargin` 现在读取真实网格字段，不再用临时近岸过渡壳规则推断。

诊断指标新增：

- `passiveMarginCoverage`
- `passiveMarginBoundaryShare`
- `nearCoastShallowSeaShare`
- `shelfWidthMean`
- `coastDepthGradient`
- `continentalSlopeCoverage`
- `continentalRiseCoverage`
- `abyssalPlainCoverage`
- `abyssalPlainFlatness`
- `sedimentWedgeCoverage`
- `closedBasinMisclassifiedAsMarginShare`
- `activeBoundaryMisclassifiedAsPassiveMarginShare`

约束：

- `passiveMargin` 必须靠近 `externalSeaMask`，闭合盆地和内陆候选水体不应被分类为被动陆缘。
- 活动 `ridge / trench / boundaryInfluence` 附近应抑制被动陆缘。
- 字段可以影响高程，但只能作为温和的地质派生项，不能直接画海岸或破坏海陆后置原则。

## 16. 转换断层寿命与旧 fracture zone 接口补充

本轮新增 active transform 与 inactive fracture zone 的诊断字段。它们默认不作为气候/水文输入；资源系统或后续构造演化可读取 transform memory 与 weakness，但不能把它们当作海岸、水体或气候直接成因。

新增字段：

- `activeTransform`：当前活动转换边界。
- `transformMemory`：转换断层长期弱带记忆。
- `fractureZoneMemory`：海洋旧转换断层/海岭错断带记忆。
- `inactiveBoundaryRelief`：旧边界高程残余强度。
- `oldBoundaryCorrelation`：旧边界记忆与高程/深浅色带相关度。
- `ageBandStraightnessRisk`：远离 active ridge 的直线年龄条带风险。

getter 变更：

- `getTerrainDerived(world)` 返回 `activeTransform / transformMemory / fractureZoneMemory`，主要用于诊断和可视化。
- `getResourceInputs(world)` 返回 `activeTransform / transformMemory / fractureZoneMemory`，供后续资源和构造弱带逻辑使用。
- `getClimateInputs(world)` 与 `getHydrologyInputs(world)` 不读取这些字段。

约束：

- old fracture zone 可以保留 `weakness`、少量 `crustAge` 差异和低幅纹理。
- old fracture zone 不应保留强高程线、规则深浅带、长期海底山脊或沟槽。
- active ridge/trench/islandArc/mountainBelt 不应被旧边界衰减规则抹掉。
## 17. 造山带生命周期接口补充

本轮新增造山带生命周期字段，目标是让后续气候、水文、生物圈和资源系统读取稳定的地形解释层，而不是直接把活动板块边界当作长期山脉。

新增/增强字段：

- `activeOrogeny`：活动汇聚造山强度，主要用于新山带和活动构造扰动。
- `oldOrogeny`：旧造山根，低缓、宽、断续，可作为资源和长期地形背景。
- `orogenyAge`：造山年龄归一化记忆，用于区分新旧山带。
- `orogenyErosion`：本步侵蚀释放量。
- `orogenicSedimentSupply`：造山物源，可供水文沉积 sink 使用。
- `forelandBasin`：造山前缘盆地候选，兼具沉积汇和低缓地形解释。
- `mountainAxis / mountainHeight / orographicBarrier`：气候和水文读取的山脉接口字段。

getter 变更：

- `getTerrainDerived(world)` 返回 `forelandBasin / orogenicSedimentSupply`。
- `getClimateInputs(world)` 返回并优先使用网格中的 `orographicBarrier / mountainAxis / mountainHeight`。
- `getHydrologyInputs(world)` 返回 `forelandBasin / orogenicSedimentSupply`，并把二者纳入 `sedimentSink`。
- `getBiosphereInputs(world)` 用 `orogenicSedimentSupply / forelandBasin / activeOrogeny / oldOrogeny` 修正土壤潜力和扰动。
- `getResourceInputs(world)` 返回 `orogenicBelt / activeOrogeny / oldOrogeny / forelandBasin`，`metamorphicBelt` 读取长期造山根。

接口约束：

- getter 只读，不推进模拟，不写回 `world`。
- `mountainBelt / activeOrogeny` 代表新山带，不能替代长期山地背景。
- `oldOrogeny` 可影响资源和缓坡地形，但不应直接生成单像素活动边界山脉。
- `forelandBasin` 是地质沉积盆地候选，不是完整水文湖泊或河流沉积系统。

## 18. 构造轴线自然化接口补充

本轮新增 naturalized axis 字段，用于把 raw plate boundary 和最终地质 feature 解耦。后续系统应优先读取自然化轴线与山脉接口，而不是直接使用 `activeBoundary` 推断山脉、海岭、海沟或裂谷。

新增字段：

- `tectonicAxis`：综合构造轴线诊断层。
- `mountainAxisSeed`：山脉/造山轴线种子自然化结果。
- `ridgeAxis`：洋中脊轴线自然化结果。
- `trenchAxis`：海沟/俯冲轴线自然化结果。
- `riftAxis`：裂谷轴线自然化结果。
- `axisSegmentId`：轴线连通段编号。
- `axisCurvature`：轴线弯曲程度。
- `axisContinuity`：轴线连续性。
- `axisBoundaryDependency`：轴线对 raw active boundary 的依赖度。
- `mountainHeightBlockiness`：山高字段块状/条纹风险。
- `orographicBarrierContinuity`：雨影屏障连续性。

getter 变更：

- `getTerrainDerived(world)` 返回 `tectonicAxis / axisCurvature / axisContinuity / axisBoundaryDependency / mountainHeightBlockiness / orographicBarrierContinuity`。
- `getClimateInputs(world)` 继续返回 `mountainAxis / mountainHeight / orographicBarrier`，但这些字段现在来自自然化轴线。
- `getResourceInputs(world)` 返回 `tectonicAxis`，可供后续资源分带使用。

接口约束：

- getter 只读，不推进模拟，不写回状态。
- raw `activeBoundary` 只能作为构造 seed 或诊断来源，不应被后续系统当作最终山脉/海岭/海沟。
- `axisBoundaryDependency` 和 `axisNoisyBoundaryShare` 应作为长期质量门，防止回归到 Voronoi/棋盘格边界。

## 19. 行星地形起伏预算接口补充

本轮新增 planetary relief budget 诊断层。它是 geology-v2 的质量约束和 debug 解释层，不是完整水文、气候或随机起伏系统；海陆仍由 `elev >= seaLevel` 派生。

新增字段：

- `planetaryRelief`
- `tectonicReliefSupply`
- `isostaticReliefSupply`
- `erosionFlatteningPressure`
- `sedimentSmoothingPressure`
- `reliefDeficit`
- `seaLevelSensitivity`
- `flatLandMask`
- `largePlainMask`

getter 变更：

- `getTerrainDerived(world)` 返回 `planetaryRelief / reliefDeficit / seaLevelSensitivity / flatLandMask / largePlainMask`。
- `getClimateInputs(world)` 返回标量 `hypsometricSpread / landReliefSpread / orographicReliefPotential`，供后续气候系统判断雨影和全球起伏质量。
- `getHydrologyInputs(world)` 返回标量 `drainageGradientPotential`，并返回 `flatLandMask / largePlainMask`，供后续河网和低坡平原逻辑使用。
- `getResourceInputs(world)` 暂不直接读取起伏预算；资源分带仍优先读取构造、造山、裂谷和沉积字段。

接口约束：

- getter 只读；budget 写入只发生在 geology-v2 pipeline 末尾。
- `flatLandMask / largePlainMask` 是候选诊断，不等于“错误地形”。
- `reliefDeficit` 初版只诊断，不自动修改 `elev` 或 `seaLevel`。
- 后续反馈必须调节已有地质过程，不应直接加入随机噪声。

## 20. 全球相对海平面与洋盆容量接口补充

本轮新增 geology-v2 地质海平面耦合接口。最终海陆仍由 `elev >= seaLevel` 派生，但 `seaLevel` 现在拆成：

```js
seaLevel = baseSeaLevel + geologicSeaLevelOffset;
```

字段职责：

- `baseSeaLevel`：基础 waterLevel / 总水量切线，不含地质偏移。
- `geologicSeaLevelOffset`：由全球洋盆容量平衡推导出的单一 global scalar。
- `seaLevel`：最终全局海平面，所有海陆、水体连通、陆架、被动陆缘和渲染逻辑统一读取它。
- `geologicSeaLevelDiagnostics`：只读诊断对象，记录子信号、归一化值、容量平衡、变化率和陆海敏感性。

新增 grid 诊断字段：

- `ridgeVolumeSignal`
- `oldOceanCapacitySignal`
- `sedimentDisplacementSignal`
- `trenchCapacitySignal`
- `coastalSensitivity`
- `isYoungOcean`

接口层变更：

- `getTerrainDerived(world)` 返回 `baseSeaLevel / geologicSeaLevelOffset / coastalSensitivity / ridgeVolumeSignal / oldOceanCapacitySignal / sedimentDisplacementSignal / trenchCapacitySignal`。
- `getClimateInputs(world)` 返回 `seaLevel / baseSeaLevel / geologicSeaLevelOffset / coastalSensitivity`，供未来气候或冰量模块读取，但当前不实现气候 offset。
- `getHydrologyInputs(world)` 返回 `seaLevel / baseSeaLevel / geologicSeaLevelOffset / coastalSensitivity`，并继续返回 `externalSeaMask / oceanConnectivity / inlandWaterCandidate / closedBasinId`。
- `getResourceInputs(world)` 不直接依赖地质海平面偏移；资源系统仍优先读取构造、裂谷、造山和沉积字段。

诊断约束：

- `geologicSeaLevelOffset` 是 global scalar，不是 field。
- 不新增 `geologicSeaLevelOffsetField`。
- `youngOceanShare` 是由 `isYoungOcean` 和 oceanic cells 统计得到的 global scalar，不是 field。
- `oceanBasinCapacitySignalMean / capacityBalance` 是组合诊断值，不维护独立 `oceanBasinCapacitySignal` grid field。
- getter 只读，不推进 offset，不写回 `world`，不重新派生 `seaMask`。

诊断指标新增：

- `baseSeaLevel / finalSeaLevel / geologicSeaLevelOffset / targetGeologicSeaLevelOffset / seaLevelChangeRate`
- `youngOceanShare / oldOceanShare`
- `ridgeVolumeSignalMean / oldOceanCapacitySignalMean / sedimentDisplacementSignalMean / trenchCapacitySignalMean`
- `ridgeVolumeNormalized / youngOceanNormalized / oldOceanCapacityNormalized / sedimentDisplacementNormalized / trenchCapacityNormalized`
- `capacityBalance / oceanBasinCapacitySignalMean`
- `coastalSensitivityMean / coastalFlipRisk / seaLevelCouplingStrength`
- `landShareBeforeGeologicOffset / landShareAfterGeologicOffset / geologicSeaLevelLandShareDelta`

debug 图层新增：

- `ridgeVolumeSignal`
- `oldOceanCapacitySignal`
- `sedimentDisplacementSignal`
- `trenchCapacitySignal`
- `coastalSensitivity`

接口约束：

- 海陆后置不变，不直接绘制海岸线。
- `inlandWaterCandidate` 仍只是低于最终 `seaLevel` 但未连通外海的候选状态，不是完整湖泊系统。
- 本轮不是完整气候、冰盖、水文循环或风暴潮模型；未来若引入 `climateOffset / iceOffset`，应在全局 offset 层组合，而不是引入 per-cell sea level。

## 21. 沉积物预算与搬运闭环接口补充

本轮新增 geology-v2 初版沉积预算闭环。它是地质状态更新，不是水文河网，也不直接改变海陆派生原则。

新增 grid 字段：

- `erosionSource`：山地、旧造山带、高坡度陆地和裂谷肩部的产沙源。
- `sedimentFlux`：有限局部搬运通量。
- `sedimentSink`：实际沉积汇。
- `sedimentCapacity`：盆地、陆缘、陆架、陆隆、闭合盆地候选和海沟前缘等地貌容量。
- `sedimentCompaction`：沉积压实诊断。
- `sedimentLoadSubsidence`：沉积负载沉降弱项。
- `depositionRate / erosionRate`：本步速率诊断。
- `sedimentBudgetError`：本步产沙、沉积、残余耗散和剩余通量的运输闭合误差；压实作为存量变化由 `sedimentCompactionMean / sedimentMassDelta` 单独诊断。

新增 world 诊断：

- `world.sedimentBudgetStep`
- `world.sedimentBudgetDiagnostics`

`sedimentBudgetDiagnostics` 包含：

- `erosionSourceMean / erosionSourceTotal`
- `depositionTotal / sedimentFluxMean / sedimentSinkMean / sedimentCapacityMean`
- `sedimentCompactionMean / sedimentLoadSubsidenceMean / sedimentBudgetError / sedimentResidualDissipation / sedimentResidualFlux`
- `sedimentMassBefore / sedimentMassAfter / sedimentMassDelta`
- `mountainErosionShare / passiveMarginDepositionShare / basinDepositionShare / trenchForearcDepositionShare / inlandBasinDepositionShare`
- `sedimentOverfillShare / sedimentPatchiness / sedimentStraightnessRisk / sedimentSeaFillRisk`
- `sedimentShelfConcentration / sedimentAbyssalConcentration`

getter 变更：

- `getTerrainDerived(world)` 返回 `erosionSource / sedimentFlux / sedimentSink / sedimentCapacity / sedimentCompaction / sedimentLoadSubsidence / sedimentBudgetError / depositionRate / erosionRate`，并返回只读 `sedimentBudgetDiagnostics`。
- `getHydrologyInputs(world)` 返回 `sediment / sedimentSink / sedimentCapacity / basin`。这些是后续水文可读输入，不代表本轮已实现完整河流或湖泊系统。
- `getResourceInputs(world)` 返回 `sediment / sedimentSink / basin`，供沉积盆地、资源分带和弱带解释使用。

debug 图层新增：

- `erosionSource`
- `sedimentFlux`
- `sedimentSink`
- `sedimentCapacity`
- `sedimentCompaction`
- `sedimentLoadSubsidence`
- `sedimentBudgetError`
- `depositionRate`
- `erosionRate`

接口约束：

- getter 只读，不推进 `updateSedimentBudget`，不写回状态。
- `sediment` 是地质状态，不是水体 mask。
- `sedimentSink` 是沉积汇诊断，不是完整水文 sink。
- `sedimentLoadSubsidence` 可以影响高程，但幅度必须保持弱项，不能抹掉 active ridge / trench / islandArc / mountainBelt。
- `sedimentBudgetError`、`sedimentOverfillShare`、`sedimentStraightnessRisk` 和 `sedimentSeaFillRisk` 应进入 long-run / resolution / interface 检查。

## 22. 分层场测脚本接口补充

新增测试侧公共模块，不改变正式模拟接口：

- `tools/lib/world-runner.mjs`：`createCheckWorld` 与 `runToCheckpoints`，用于一次模拟采样多个 checkpoint。
- `tools/lib/metrics-summary.mjs`：`compactMetrics` 与 `assessArtifactRisk`，用于 compact 输出和早停判断。
- `tools/lib/snapshot-cache.mjs`：保存 / 读取测试快照，key 包含 seed、pipelineMode、resolution、step 和 git commit。
- `tools/lib/cli.mjs`：统一解析 `--checkpoints / --layers / --snapshot-dir / --out` 等参数。

新增命令：

```powershell
node .\tools\scenario-check.mjs '龙骨海-纪元7' geology-v2 512x256 --checkpoints 20,200,739
node .\tools\artifact-scan.mjs --mode geology-v2 --resolution 256x128 --steps 300 --seeds 30 --sample-every 5
node .\tools\perf-profile.mjs '龙骨海-纪元7' geology-v2 256x128 --steps 100
```

debug-render 新增参数：

```powershell
node .\tools\geology-debug-render.mjs _debug_fast --from-snapshot <snapshot-file> --layers sediment,sedimentSink,sedimentCapacity,basin,finalElevation
```

兼容性约束：

- 旧 `geology-debug-render.mjs seed steps outDir mode resolution` 参数顺序保持可用。
- 旧 `interface-check / long-run-check / resolution-check` 不降低输出和检查可信度。
- 快照只作为测试产物，不参与正式 world 初始化或演化。

## 16. 等静力 / 地壳浮力接口补充

本轮 geology-v2 已将轻量等静力基础层接入 terrain/resource/debug/diagnostics。所有 getter 仍保持只读，不推进模拟，不改变“海陆后置”原则。

`getTerrainDerived(world)` 新增：

```js
isostaticBase
crustBuoyancy
densitySubsidence
lithosphereCooling
sedimentLoadSubsidence
isostaticResidual
isostasyDiagnostics
```

`getResourceInputs(world)` 新增：

```js
crustBuoyancy
isostaticResidual
```

兼容别名：

- `ageSubsidence = -lithosphereCooling`
- `thicknessBuoyancy = crustBuoyancy`
- `oceanDepthTerms` 仍作为洋底高程解释汇总项。

新增诊断指标：

```js
isostaticContinentalMean
isostaticOceanicMean
isostaticTransitionalMean
continentalOceanReliefGap
youngOldOceanDepthGap
sedimentLoadSubsidenceMean
isostaticResidualMean
isostaticResidualP95
isostasyElevationCorrelation
crustThicknessElevationCorrelation
crustAgeOceanDepthCorrelation
transitionalElevationBand
seaLevelDriftAfterIsostasy
landRatioDriftAfterIsostasy
```

新增 debug 图层：

```text
isostaticBase
crustBuoyancy
densitySubsidence
lithosphereCooling
sedimentLoadSubsidence
isostaticResidual
crustThickness
crustDensity
```

后续水文 / 气候可读取 `relativeElevation / seaMask / externalSeaMask / continentalShelf` 等派生结果；不应直接依赖 `isostaticBase` 做水体完成态判定。资源系统可读取 `crustBuoyancy / isostaticResidual` 作为构造背景参考。

## 23. Hydrology MVP 性能分档与验证策略

Hydrology MVP 现在按只读派生层运行，不推进 geology-v2 状态。为避免验证脚本把所有水文检查塞进同一次慢路径，`getHydrologyInputs(world, options)` 支持：

- `diagnostics: "none"`：只生成核心流向、汇流、流域和候选水体字段，适合只读 `flowAccumulation / riverMask` 的轻量调试。
- `diagnostics: "basic"`：默认检查档，输出 `hydrologyValid / flowCycleCount / orphanFlowShare / depressionShare / endorheicLandShare / lakeCandidateShare / riverCellShare / externalSeaDrainageShare / closedBasinDrainageShare` 等单 pass 指标。
- `diagnostics: "full"`：显式深度档，额外计算 `riverContinuityScore / coastalOutletShare / largestWatershedShare / flowAccumulationP95` 等较重或更细指标。
- `profile: true`：返回 `hydrologyProfile.timingsMs`，用于定位 `hydroElevation / assignFlowTargets / accumulateFlow / assignDrainage / buildRivers / diagnostics*` 阶段耗时。

同一 `world.step / world.ageYears` 内，`getTerrainDerived`、terrain base 与 `getHydrologyInputs` 会缓存派生结果；若先算 `full`，后续 `basic` 可复用；若先算 `basic` 后请求 `full`，会重新计算一次。缓存不跨 step 复用，避免演化后读取旧地形。

工具默认策略：

- `interface-check / long-run-check / resolution-check` 默认使用 `basic` hydrology；需要完整水文诊断时显式加 `--full-hydrology`。
- `geology-debug-render` 只有在请求水文图层或未指定图层全量输出时才计算 hydrology；纯地质 debug 图层不再预先计算水文。
- 新增 `tools/hydrology-profile.mjs` 用于单世界阶段耗时拆分。
- 新增 `tools/hydrology-benchmark.mjs` 用于对比多分辨率、多步数和缓存复用成本。
- 新增 `tools/hydrology-smoke-check.mjs` 用于快速确认字段完整性和 basic 诊断有效性。

当前 profiling 结论：短步数下主要耗时来自 geology-v2 `stepWorld` 演化本身，而不是 hydrology 派生；因此 hydrology 性能验证应单独报告 `simulation` 与 `hydrologyTotal`，避免把长期模拟成本误归因到水文诊断。

## 17. 统一拓扑 API 接口预留

新增模块：`src/sim/topology.js`。

默认行为：

```js
{
  kind: "cylindrical",
  wrapX: true,
  wrapY: false,
  polarMode: "cap"
}
```

公开 API：

```js
createTopology(width, height, options)
topologyForGrid(grid)
topology.index(x, y)
topology.xy(i)
topology.wrapX(x)
topology.wrapY(y)
topology.wrapCoord(x, y)
topology.isValidXY(x, y)
topology.inBoundsX(x)
topology.inBoundsY(y)
topology.forEachNeighbor4(i, fn)
topology.forEachNeighbor8(i, fn)
topology.forEachNeighborRadius(i, radius, fn)
topology.neighbors4(i)
topology.neighbors8(i)
topology.neighborsRadius(i, radius)
topology.distance(a, b)
topology.distanceXY(ax, ay, bx, by)
topology.floodFill(seedIndices, passableFn)
topology.connectedComponents(mask)
topology.componentIds(mask)
topology.forEachCell(fn)
topology.sample(field, x, y)
topology.sampleWrapped(field, x, y)
```

已迁移：

- `grid.indexOf / forEachNeighbor4`
- `deriveOceanConnectivity` 的 external sea 与 closed basin connected components
- sediment 预算中的 8 邻域搬运 / 平滑访问
- `interface-check / long-run-check / resolution-check / metrics-summary` 的高风险邻接统计与 topology diagnostics
- `getTerrainDerived(world).topologyDiagnostics` 只读输出
- `tools/topology-check.mjs` 的小尺寸自检

新增诊断：

```js
topologyKind
wrapXEnabled
wrapYEnabled
neighborConsistencyValid
neighbor4SymmetryValid
neighbor8SymmetryValid
distanceWrapValid
floodFillTopologyValid
connectedComponentTopologyValid
connectedComponentCount
seamContinuityRisk
polarBoundaryRisk
polarAccessRisk
topologyManualAccessRisk
topologyMigrationCoverage
topologyResolutionDrift
```

spherical-ready 预留：

```js
{
  kind: "spherical",
  wrapX: true,
  polarMode: "cap" | "pinch" | "reduced-neighbors"
}
```

后续迁移优先级：

1. 水文 `flow direction / catchment / basin fill`。
2. 气候 `wind fetch / latitude band neighbor sampling`。
3. 沉积和侵蚀中的八邻域搬运。
4. debug / diagnostic 中的 coast distance、component labeling 和局部连通统计。
