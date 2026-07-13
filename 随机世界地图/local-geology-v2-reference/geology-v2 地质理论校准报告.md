# geology-v2 地质理论校准报告

## 1. 摘要

- `crustAge` 不应长期作为“被平流的贴图”。更合理的是由 active ridge 新生、扩张方向、距离/时间传播派生，再允许局部扰动和扩散。
- 洋底深度主控项应是：洋壳年龄冷却下沉 + 壳厚/密度浮力 + 沉积物填平；不要让旧边界 feature 直接决定深浅。
- 大陆裂谷应是阶段机：`continental -> thinned continental -> transitional -> hyperextended -> oceanic`，中间形成裂谷谷地和沉积盆地，只有低于海平面且连通外海时才成为海盆。
- 被动大陆边缘应生成宽大陆架、陆坡、陆隆和沉积楔，所以海岸线通常不贴板块边界。
- 新山带来自当前汇聚；旧山带应进入 `orogeny`，再侵蚀、扩宽、断续化，并把物质转入 `sediment / basin`。
- 板块边界和山脉轴线应沿 `weakness`、旧缝合线、裂谷带、转换断层分段发展，而不是 Voronoi 直线。
- 水文/气候前最该先落地：洋壳年龄派生、裂谷阶段机、被动边缘/大陆架、造山生命周期、边界分段弯曲。

## 2. 资料来源

访问日期均为 2026-06-30。

- NOAA Ocean Exploration, “What is a mid-ocean ridge?”：新洋壳在洋中脊生成，扩张速率影响海岭形态。
  https://oceanexplorer.noaa.gov/ocean-fact/mid-ocean-ridge/
- NOAA Science On a Sphere, “Age of the Seafloor”：洋底年龄、磁异常、老洋壳被俯冲消耗。
  https://sos.noaa.gov/catalog/datasets/age-of-the-seafloor/
- USGS, “This Dynamic Earth: Understanding plate motions”：转换断层、洋中脊错断、断裂带残迹。
  https://pubs.usgs.gov/gip/dynamic/understanding.html
- Parsons & Sclater, 1977, “An analysis of the variation of ocean floor bathymetry and heat flow with age,” JGR. DOI: 10.1029/JB082i005p00803。
  https://topex.ucsd.edu/geodynamics/parsons_sclater77.pdf
- Hillier & Watts, 2006, “The relationship between depth, age and gravity in the oceans,” GJI。
  https://academic.oup.com/gji/article/166/2/553/562527
- NOAA/NCEI, “Total Sediment Thickness of the World’s Oceans & Marginal Seas”：全球海洋沉积厚度数据。
  https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.geophysics%3AG01065
- NPS, “Divergent Plate Boundary: Passive Continental Margins”：大陆裂谷、新洋盆、成熟被动边缘。
  https://www.nps.gov/subjects/geology/plate-tectonics-passive-continental-margins.htm
- LibreTexts, “Continental Margins”：大陆架、陆坡、陆隆、深海平原形态。
  https://geo.libretexts.org/Bookshelves/Oceanography/Introduction_to_Oceanography_%28Webb%29/01%3A_Introduction_to_the_Oceans/1.02%3A_Continental_Margins
- LibreTexts, “Rifting in the Basin and Range”：张裂导致伸展、减薄、Wilson Cycle 阶段。
  https://geo.libretexts.org/Bookshelves/Geology/Geology_of_California/08%3A_Basin_and_Range/8.02%3A_Rifting_in_the_Basin_and_Range
- Columbia/Rutgers teaching material, “Rift Basin Architecture & Evolution”：半地堑、正断层、裂谷盆地沉积。
  https://www.ldeo.columbia.edu/~polsen/nbcp/breakupintro.html
- NPS, “Collisional Mountain Ranges”：Appalachian 例子，裂谷、被动边缘、闭合、碰撞和长期侵蚀。
  https://www.nps.gov/subjects/geology/plate-tectonics-collisional-mountain-ranges.htm
- LibreTexts, “Mountain Building”：洋陆俯冲造山、大陆碰撞造山、前弧盆地和增生楔。
  https://geo.libretexts.org/Courses/Chabot_College/Introduction_to_Physical_Geology_%28Shulman%29/17%3A_Geological_Structures_and_Mountain_Building/17.04%3A_Mountain_Building
- Malavieille et al., 2021, “Deformation partitioning in mountain belts,” Geological Magazine. DOI: 10.1017/S0016756819000645。
  https://www.cambridge.org/core/journals/geological-magazine/article/89B2EC0881CC98EE0BA77D85255ABA39
- Dumont et al., 2024, “The Western Alpine arc: a review and new kinematic model”：山带常呈弧形，受岩石圈结构与动力学控制。
  https://comptes-rendus.academie-sciences.fr/geoscience/articles/10.5802/crgeos.253/
- LibreTexts, “Isostasy, Eustasy, and Sea Level”：海平面受海水体积和洋盆体积共同控制，快速扩张和年轻洋壳会降低洋盆容量。
  https://geo.libretexts.org/Courses/American_Meteorological_Society/Introduction_to_Ocean_Sciences_%28Segar%29/17%3A_Critical_Concepts/17.02%3A_Isostasy_Eustasy_and_Sea_Level
- Müller et al., 2008, “Long-Term Sea-Level Fluctuations Driven by Ocean Basin Dynamics,” Science. DOI: 10.1126/science.1151540。
  https://pubmed.ncbi.nlm.nih.gov/18323446/
- Wright et al., 2020, “Sea-level fluctuations driven by changes in global ocean basin volume following supercontinent break-up,” Earth-Science Reviews。
  https://www.earthbyte.org/sea-level-fluctuations-driven-by-changes-in-global-ocean-basin-volume-following-supercontinent-break-up/
- LibreTexts, “Isostasy”：岩石圈因密度、厚度和载荷变化发生等静力响应。
  https://geo.libretexts.org/Courses/Chabot_College/Introduction_to_Physical_Geology_%28Shulman%29/04%3A_Earths_Interior/4.05%3A_Isostasy
- WHOI, “Isostacy” handout：等静力是岩石圈柱质量与浮力平衡的近似。
  https://www.whoi.edu/cms/files/PS1_1_2_27503.pdf
- Kansas Geological Survey, “Simulation of the sedimentary fill of basins”：盆地模拟需要考虑沉积压实和沉积负载等静力响应。
  https://www.kgs.ku.edu/Publications/Bulletins/233/Kendall/
- USGS, SIR 2005-5051, “Porosity-Depth Trends and Regional Uplift”：沉积盆地孔隙度随埋深因压实和胶结而下降。
  https://pubs.usgs.gov/sir/2005/5051/sir2005-5051.pdf
- USGS, “Introduction to Subduction Zones”：俯冲带是一块板片下插到另一块板片之下，产生强震、火山和海沟等非对称系统。
  https://www.usgs.gov/special-topics/subduction-zone-science/science/introduction-subduction-zones-amazing-events
- NPS, “Convergent Plate Boundaries: Subduction Zones”：较薄、低浮力洋壳俯冲，形成海沟、增生楔和火山弧。
  https://www.nps.gov/subjects/geology/plate-tectonics-subduction-zones.htm
- NOAA National Ocean Service, “How did the Hawaiian Islands form?”：热点形成海山/岛链，年龄沿板块运动方向递增。
  https://oceanservice.noaa.gov/facts/hawaii.html
- NPS, “Oceanic Hotspots”：热点火山离开热点后活动减弱、岛屿侵蚀并下沉。
  https://www.nps.gov/subjects/geology/plate-tectonics-oceanic-hotspots.htm
- NOAA Fisheries, “Shallow Coral Reef Habitat”：浅水珊瑚礁依赖清澈、温暖、有光的水体。
  https://www.fisheries.noaa.gov/national/habitat-conservation/shallow-coral-reef-habitat
- OpenGeology, “Glaciers”：峡湾等海岸地貌依赖冰川侵蚀和寒冷气候。
  https://opengeology.org/textbook/14-glaciers/

## 3. 洋壳年龄与海底深度

理论要点：洋中脊生成新洋壳；洋壳离开海岭后冷却、增密、热沉降。经典经验关系是年轻洋壳深度近似随 `sqrt(age)` 增加；老洋壳会趋于平台模型，不应无限加深。沉积物会逐渐覆盖并填平局部起伏，尤其靠近大陆边缘。

工程规则：

```js
ageMa = crustAge * 180; // 可先把 0..1 映射到 0..180 Ma
young = Math.min(ageMa, 80);
old = Math.max(0, ageMa - 80);

thermalSubsidence =
  A * Math.sqrt(young / 80) +
  B * (1 - Math.exp(-old / 90));

ridgeUplift = ridge * 0.05;
thicknessBuoyancy = (crustThickness - oceanicRefThickness) * 0.18;
sedimentFill = sediment * 0.06; // 填浅，不是造山
oceanElev = ridgeBase + ridgeUplift - thermalSubsidence + thicknessBuoyancy + sedimentFill;
```

推荐状态：

- `crustAge`：由海岭新生和扩张传播派生。
- `crustThickness`：控制浮力，厚洋壳/海山/高原更浅。
- `sediment`：填平深海平原、被动边缘、老洋壳洼地。
- `trench`：只在活动俯冲带局部加深，快速衰减。

验证指标：

- `depthAgeCorrelation`：oceanic cells 中 `relativeDepth` 与 `sqrt(crustAge)` 正相关。
- `ridgeAgeResetShare`：active ridge 附近 `crustAge < threshold` 的比例。
- `oldOceanDepthMean`：老洋壳应比新洋壳深，但不无限深。
- `sedimentFlattening`：高 sediment 区域局部高程方差降低。

结论：应该把 `crustAge` 从“平流贴图”改为“海岭出生 + 扩张年龄场”。平流可以保留为短期 advection hint，但不应是主来源。

## 4. Wilson Cycle 与裂谷-洋盆演化

阶段模型：

1. `stable_continent`：厚陆壳，弱带低或旧缝合线潜伏。
2. `incipient_rift`：张裂边界/弱带激活，`weakness` 上升，`crustThickness` 下降，`rift` 增长。
3. `rift_basin`：形成正断层低地、半地堑、内陆盆地；`basin / sediment` 增长，仍是陆内低地。
4. `transitional_margin`：陆壳显著减薄，`crustType = transitional`，可出现狭长浅海或盐湖候选。
5. `proto_ocean`：持续张裂、新生洋壳、低海拔且连通外海，才变成狭长海盆。
6. `mature_ocean`：洋中脊稳定产壳，边缘成为被动大陆边缘。
7. `declining_ocean`：俯冲消耗老洋壳。
8. `collision_orogen`：洋盆闭合，大陆碰撞造山，旧海盆沉积进入山带。

程序规则：

```js
riftPower = divergent * boundaryInfluence * weakness;
if (crustType === CONTINENTAL && riftPower > 0.4) {
  crustThickness -= 0.002 * riftPower;
  basin += 0.004 * riftPower;
  sediment += erosionSupply * 0.3;
}

if (crustThickness < 0.48 && weakness > 0.6 && riftAge > T1) {
  crustType = TRANSITIONAL;
}

if (
  crustType === TRANSITIONAL &&
  crustThickness < 0.30 &&
  riftAge > T2 &&
  connectedToOcean &&
  elev < seaLevel - margin
) {
  crustType = OCEANIC;
  crustAge = 0;
}
```

关键点：裂谷是否进海，不只看 `elev < seaLevel`，还要看 `connectedToOcean`。在没有水文/连通性系统前，至少用 flood-fill sea connectivity 区分“外海海盆”和“内陆低地候选”。

验证指标：

- `riftStageHistogram`
- `continentalRiftToOceanicConversionRate`
- `unconnectedBelowSeaRiftShare`
- `transitionalCrustContinuity`
- `protoOceanConnectedShare`

## 5. 被动大陆边缘与大陆架

地质依据：被动边缘不是当前板块边界，常表现为低海岸平原、宽大陆架、较陡陆坡、缓陆隆、深海平原；沉积物在陆缘形成厚沉积楔。NPS 与 LibreTexts 都强调这种海陆过渡来自壳厚变化与沉积，不是板块边界硬切。

工程规则：

```js
margin = transitionalCrust || nearContinentOceanTransition;
shelfTargetDepth = -0.02 .. -0.08;
slopeTargetDepth = -0.10 .. -0.18;

shelfFactor = smoothstep(continentalThickness, transitionalThickness);
sedimentWedge = sediment * marginProximity * (1 - activeBoundary);

elev += shelfFactor * 0.05;
elev += sedimentWedge * 0.08;
elev -= slopeFactor * 0.06;
```

建议新增 derived：

- `passiveMargin`
- `shelf`
- `slope`
- `rise`
- `abyssalPlain`

视觉效果：

- 海岸附近有浅海带，不是突然掉入深海。
- 被动边缘海岸与板块边界脱钩。
- 沉积多的老边缘更平、更浅。

验证指标：

- `shelfWidthMean`
- `passiveMarginCoastShare`
- `coastBoundaryCorrelation`
- `nearCoastDepthGradient`

## 6. 造山带生命周期

新山带：

- 当前汇聚边界 + 陆壳/过渡壳 + 高应力。
- 写入 `mountainBelt` 和少量 `orogeny`。
- 洋陆俯冲：海沟 + 岛弧/陆弧 + 前弧盆地。
- 陆陆碰撞：宽山带 + 高 `orogeny` + 壳厚增加，火山性弱。

旧山带：

- 离开活动边界后不应保持锐利线。
- `mountainBelt` 快速衰减。
- `orogeny` 慢速侵蚀、扩散、断续化。
- 侵蚀物转入 `sediment`，优先填充相邻 `basin / passiveMargin / forelandBasin`。

规则：

```js
activeOrogenyGain = convergent * continentalFactor * boundaryInfluence;
orogeny += activeOrogenyGain * dt;
crustThickness += activeOrogenyGain * 0.02;

inactive = 1 - boundaryInfluence;
erosion = orogeny * (0.002 + slope * 0.004) * inactive;
orogeny -= erosion;
sediment += erosion * sedimentRoutingWeight;

orogeny = anisotropicDiffuse(orogeny, alongWeaknessOrOldSuture);
orogeny *= segmentNoiseMask; // 让旧山带断续
```

山脉轴线避免长直：

- 用 `weakness` 的梯度控制山带扩散方向。
- 沿边界切成 segment，不连续写整条线。
- 对汇聚边界使用弧形 offset：海沟、岛弧、山带彼此平行但错位。
- 旧山带用 `orogeny` 的低频扩散，不再读取单像素 `boundaryDistance=0`。

验证指标：

- `activeOrogenyBoundaryShare`
- `inactiveOrogenyWidth`
- `oldOrogenyMax / newMountainMax`
- `orogenySedimentBudget`
- `mountainAxisCurvature`
- `mountainSegmentLengthDistribution`

## 7. 板块边界几何与自然形态

真实板块边界常沿弱带、旧缝合线、裂谷带发展。洋中脊被转换断层错断，形成 zig-zag ridge-transform 系统；转换断层可留下断裂带和年龄差，但活动性只在板块边界段，远离海岭的旧 fracture zone 不应长期作为强高程线。

工程规则：

```js
boundaryCost =
  baseDistance
  - weakness * 0.6
  - oldSuture * 0.3
  - riftMemory * 0.25
  + crustThicknessContrast * 0.15;

ridgeSegments = splitBoundaryByLengthAndWeakness(boundary);
for each segment:
  applyCurvedAxis(domainWarp(segment, weaknessNoise));
  addTransformOffsetsAtSegmentEnds();
```

岛弧/海沟关系：

- `trench` 在下沉洋壳侧，窄而深。
- `islandArc` / volcanic arc 在 overriding plate 上，距 trench 有 offset。
- `forearcBasin` 在 trench 与 arc 之间。
- `backarcBasin` 可在弧后张裂时出现。

验证指标：

- `ridgeSegmentCount`
- `transformOffsetCount`
- `fractureZoneInactiveRelief`
- `arcTrenchOffsetMean`
- `boundaryCurvatureMean`
- `boundaryVoronoiStraightness`

## 8. 对当前 geology-v2 的新版工程路线图

这版路线图把第 11 章补充的海平面、等静力、沉积预算和俯冲非对称纳入优先级。顺序按“先修基础状态场，再修派生高程，再修构造阶段，再修形态细节”的原则排列。

1. **洋壳年龄出生场**
   为什么先做：当前长时程 `crustAge / sediment / basin` 宽域色带，本质上来自年龄场被半拉格朗日平流成贴图。
   解决问题：海底深浅贴图化、旧边界年龄残影、分辨率长跑不稳定。
   涉及字段/模块：`crustAge`, `ridge`, `boundaryKind`, `pvx/pvy`, `geology/plates.js`, `geology/crust.js`。
   验证：`depthAgeCorrelation`, `ridgeAgeResetShare`, `ageBandStraightness`, `ageRmseVsBaseline`。

2. **洋底高程公式 + 等静力基础层**
   为什么先做：海陆后置必须让大陆、洋壳、过渡壳的高低由壳厚、密度、年龄和载荷解释。
   解决问题：海底深浅像旧 feature 残影，过渡壳和洋壳高度边界硬。
   涉及字段/模块：`crustThickness`, `crustDensity`, `crustAge`, `sediment`, `ridge`, `trench`, `geology/elevation.js`。
   验证：新洋壳浅、老洋壳深、厚洋壳/热点区偏浅、沉积区局部方差降低。

3. **沉积预算与压实/负载规则**
   为什么先做：`sediment` 如果只是局部增长或平流，会变成新贴图；预算化后才能服务盆地、陆架、深海平原。
   解决问题：沉积块状色带、浅海被无限填陆、盆地缺少物质来源。
   涉及字段/模块：`orogeny`, `mountainBelt`, `sediment`, `basin`, `passiveMargin`, `geology/pipeline.js`, `geology/elevation.js`。
   验证：`sedimentBudgetError`, `sedimentCompactionMean`, `sedimentSinkDistribution`, `sedimentOverfillRisk`。

4. **裂谷阶段机 + 海洋连通性**
   为什么先做：大陆裂谷到洋盆是当前“规则海/内陆湖”问题的核心。
   解决问题：陆内板块反向移动后立刻出现规则海，裂谷没有盆地和过渡壳阶段。
   涉及字段/模块：新增 `riftStage`, `oceanConnectivity`，复用 `rift`, `basin`, `weakness`, `crustThickness`, `crustType`。
   验证：`riftStageHistogram`, `unconnectedBelowSeaRiftShare`, `protoOceanConnectedShare`, `continentalRiftToOceanicConversionRate`。

5. **被动边缘 / 大陆架 / 陆坡 / 陆隆派生层**
   为什么先做：海岸和浅海形态需要由陆壳到洋壳的宽过渡和沉积楔解释。
   解决问题：海岸线硬切、浅海带不足、海岸贴板块边界。
   涉及字段/模块：新增 `passiveMargin`, `shelf`, `slope`, `rise`，复用 `transitional crust`, `sediment`, `crustThickness`。
   验证：`shelfWidthMean`, `passiveMarginCoastShare`, `coastDepthGradient`, `coastBoundaryCorrelation`。

6. **俯冲非对称与板片消耗**
   为什么先做：汇聚边界两侧不应对称造山/造沟，俯冲侧和上覆侧必须分开。
   解决问题：海沟、岛弧、山带位置混乱；老洋壳不能被合理消耗。
   涉及字段/模块：新增 `subductionPolarity` 或 `subductingSide`, `forearcBasin`，复用 `crustDensity`, `crustAge`, `trench`, `islandArc`, `orogeny`。
   验证：`trenchOceanicSideShare`, `arcTrenchOffsetMean`, `subductedOldOceanShare`, `collisionTrenchSuppression`。

7. **造山生命周期与旧山带退化**
   为什么先做：山脉是气候雨影、水文源区和沉积预算的上游。
   解决问题：旧山带太新、太直、太窄，新旧山带无法区分。
   涉及字段/模块：`orogeny`, `mountainBelt`, `sediment`, `crustThickness`, `boundaryInfluence`。
   验证：`inactiveOrogenyWidth`, `oldOrogenyMax / newMountainMax`, `orogenySedimentBudget`, `mountainSegmentLengthDistribution`。

8. **转换断层寿命与 fracture zone 衰减**
   为什么先做：它直接对应 739 Myr 长直海底残影。
   解决问题：非活动转换断层长期作为海底高程线保留。
   涉及字段/模块：新增 `transformMemory`，复用 `boundaryKind=TRANSFORM`, `weakness`, `crustAge`, `elev`。
   验证：`inactiveTransformReliefMean`, `fractureZoneElevationContribution`, `oceanicStraightReliefDecay`。

9. **板块边界分段弯曲与轴线生成**
   为什么后做：需要前面状态场稳定后，才能判断弯曲/分段是否改善真实问题。
   解决问题：Voronoi/网格直线感，山脉和海岭轴线过长过直。
   涉及字段/模块：`weakness`, `boundaryInfluence`, `boundaryKind`, `mountainBelt`, `ridge`, `trench`。
   验证：`boundaryCurvatureMean`, `ridgeSegmentCount`, `transformOffsetCount`, `segmentLengthDistribution`。

10. **诊断指标与 debug-render 升级**
    为什么贯穿执行：每个新规则都要能被图层和数值解释，否则会回到“看起来像”的调参。
    解决问题：`longStraightFeatureSignal` 误伤自然山带，缺少 age/sediment/isostasy 分项解释。
    涉及字段/模块：`tools/long-run-check.mjs`, `tools/resolution-check.mjs`, `tools/geology-debug-render.mjs`。
    验证：新增指标能定位失败症状，并在 200 Myr / 739 Myr 样例中稳定输出。

## 9. 字段设计变更表

| 字段 | 类型 | 必要性 | 存储方式 | 用途 | 可先替代方案 |
|---|---|---:|---|---|---|
| `riftStage` | enum/int | 必须 | state | 记录大陆裂谷到洋盆的阶段 | 可先由 `crustType + rift + crustThickness` derived |
| `ridgeBirthAge` | float | 必须 | derived/debug，后续 state | 标记洋中脊新生年龄源 | 可先用 `ridge` 与 `crustAge < threshold` |
| `oceanConnectivity` | uint8/enum | 必须 | derived | 区分外海、内陆低地、封闭水体候选 | 每步/每 N 步 flood-fill |
| `passiveMargin` | float | 必须 | derived | 被动边缘强度，驱动陆架/沉积楔 | `transitional crust + inactive boundary` 近似 |
| `shelf` | float | 建议 | derived/debug | 大陆架浅海带 | 可先并入 `passiveMargin` |
| `slope` | float | 建议 | derived/debug | 陆坡梯度带 | 可先由 `crustThickness` 梯度推断 |
| `rise` | float | 可延后 | derived/debug | 陆隆/沉积楔末端 | 可先不渲染 |
| `subductionPolarity` / `subductingSide` | int/enum | 建议 | derived，必要时 state | 区分下沉板片与上覆板块 | 由 `crustDensity + crustAge + crustThickness` 临时推断 |
| `forearcBasin` | float | 建议 | state/derived | 海沟与岛弧之间的沉积盆地 | 可先写入 `basin` |
| `transformMemory` | float | 建议 | state | 转换断层弱带记忆，快速衰减高程贡献 | 可先只进入 debug |
| `hotspot` | object/list | 可延后 | state | 热点源位置和强度 | 暂不实现 |
| `seamount` | float | 可延后 | derived/state | 海山链/洋底高原高程项 | 暂不实现 |
| `sedimentBudget` | object/metrics | 必须 | debug/diagnostic | 追踪侵蚀扣除、沉积分配、预算误差 | 可先只在检查工具中计算 |
| `tectonicSeaLevelSignal` | float | 只诊断 | debug/diagnostic | 洋盆容量对海平面的地质压力 | 不直接进入渲染 |
| `isostaticBase` | float | 建议 | debug-render | 等静力基础高程分项 | 可先不存，只导出分项图 |
| `sedimentLoadSubsidence` | float | 建议 | derived/debug | 沉积负载下沉项 | 初期可合并进 elevation 公式 |

## 10. 最小可行实现版本

MVP 目标是先消除最严重的“贴图化、硬切、规则海”问题，而不是一次性模拟完整地质学。

必做：

1. `crustAge` 洋中脊出生场：active ridge 重置年龄，年龄沿扩张方向/距离增长。
2. 洋底高程公式：`age subsidence + thickness buoyancy + sediment fill/load + ridge/trench active relief`。
3. 沉积预算最小版：从 `orogeny / mountainBelt` 扣除，按 `basin / passiveMargin / lowland` 分配，加入递减收益。
4. 裂谷阶段机：陆壳减薄、过渡壳、裂谷盆地、新洋壳分阶段转换。
5. `oceanConnectivity`：区分外海与低于海平面的内陆盆地候选。

可延后：

- 热点、海山链、洋底高原。
- 碳酸盐台地、珊瑚礁、冰川峡湾、蒸发岩。
- 完整 flexural loading；MVP 用平滑负载下沉近似。
- 完整 subduction polarity state；MVP 可用 derived 推断。
- 复杂边界路径搜索；MVP 先做分段与 domain warp。

只诊断不渲染：

- `tectonicSeaLevelSignal`
- `sedimentBudgetError`
- `transformMemory`
- `isostaticBase`
- `sedimentLoadSubsidence`
- `oceanCapacityAtSeaLevel`

MVP 验收：

- 200 Myr 分辨率检查继续收敛。
- 739 Myr 不出现大片矩形海底色带。
- `seaMask` 与 `crustType` 不重合。
- 内陆裂谷低地不会在未连通外海时直接成为规则海。
- 高沉积区更平、更浅，但不会无限填成陆地。

## 11. 关键规则失败症状

| 规则 | 失败症状 | 首要检查图层 | 首要指标 |
|---|---|---|---|
| 洋壳年龄出生场 | 海底出现平流矩形色带、年龄边界跟旧板块块同步 | `crustAge`, `ridgeBirthAge` | `ageBandStraightness`, `ridgeAgeResetShare` |
| 洋底高程公式 | 深浅仍沿旧边界画线，新老洋壳深度差不明显 | `oceanDepthModelTerms`, `finalElevation` | `depthAgeCorrelation`, `oldOceanDepthMean` |
| 等静力基础层 | 厚陆壳不高、老洋壳不低、沉积只填高不下沉 | `isostaticBase`, `sedimentLoadSubsidence` | `isostaticResidualRmse` |
| 沉积预算 | 浅海被无限填成大片陆地，或 sediment 变成贴图块 | `sediment`, `basin` | `sedimentBudgetError`, `sedimentOverfillRisk` |
| 裂谷阶段机 | 陆内裂谷瞬间变规则海或矩形湖 | `riftStage`, `oceanConnectivity`, `seaMask` | `unconnectedBelowSeaRiftShare` |
| 海洋连通性 | 低于海平面的内陆低地都被当成海 | `oceanConnectivity` | `protoOceanConnectedShare` |
| 被动边缘/陆架 | 海岸直接贴板块边界，近岸缺少浅海带 | `passiveMargin`, `shelf` | `shelfWidthMean`, `coastBoundaryCorrelation` |
| 俯冲非对称 | 海沟和岛弧对称生效，陆陆碰撞仍生成深海沟 | `subductionPolarity`, `trench`, `islandArc` | `trenchOceanicSideShare`, `collisionTrenchSuppression` |
| 造山生命周期 | 旧山带仍像新鲜直线，新山带不清晰 | `orogeny`, `mountainBelt` | `inactiveOrogenyWidth`, `oldOrogenyMax / newMountainMax` |
| 转换断层寿命 | 739 Myr 出现长直海底残影 | `transformMemory`, `finalElevation` | `inactiveTransformReliefMean` |
| 边界分段弯曲 | 山脉、海岭、海沟轴线过长过直 | `boundaryKind`, `boundaryInfluence` | `boundaryCurvatureMean`, `segmentLengthDistribution` |
| 热点/海山链 | 所有海底岛链都被误归因到旧边界 | `hotspot`, `seamount` | `boundaryIndependentIslandShare` |

## 12. 推荐新增诊断指标

long-run-check：

- `depthAgeCorrelation`
- `ridgeAgeResetShare`
- `oldOceanDepthMean`
- `sedimentFlattening`
- `riftStageHistogram`
- `protoOceanConnectedShare`
- `passiveMarginShelfWidth`
- `oldOrogenyWidth`
- `orogenySedimentBudget`
- `boundaryCurvatureMean`

resolution-check：

- `ageRmseVsBaseline`
- `shelfMismatchVsBaseline`
- `riftStageMismatchVsBaseline`
- `depthAgeCorrelationByResolution`
- `coastDepthGradientByResolution`

debug-render：

- `riftStage`
- `passiveMargin / shelf / slope / rise`
- `oceanDepthModelTerms`：age term、thickness term、sediment term 分图
- `ridgeBirthAge`
- `oceanConnectivity`
- `oldOrogeny`
- `activeVsInactiveFeature`

## 13. 剩余不确定性

- 真实海底深度受动态地形、地幔温度、海山/洋底高原影响；游戏模型可先忽略，但要留 `dynamicTopographyNoise` 或 `hotspot` 扩展位。
- 沉积物真实分布强依赖水文、气候、生物生产力和大陆剥蚀量；水文前只能用地形低地、被动边缘、老洋壳年龄近似。
- 洋壳年龄传播若做精确最短路径/特征线会更贵；可先用 active ridge distance transform + plate velocity 投影近似。
- 裂谷进海需要海洋连通性；没有水文时不要把所有低于海平面的内陆盆地都渲染成真实湖海。
- 山带弯曲与分段需要边界几何缓存；只靠逐格 `boundaryDistance` 很难彻底摆脱网格直线感。

最核心的下一步判断：应该先把 `crustAge` 从贴图式平流改成“海岭出生年龄场”。这是 geology-v2 下一轮最值得做的基础改造，因为它会同时改善海底深浅、沉积分布、旧边界残影和长时程分辨率收敛。

## 14. 补充：海平面、水体体积、等静力与沉积预算

### 11.1 海平面与洋盆容量的地质耦合

`elev >= seaLevel` 是正确的后置切分形式，但 `seaLevel` 不应被理解为独立滑条。更好的工程解释是：水体总量给定或缓慢变化，地质过程改变洋盆容量，求解器再从当前高程场中求出能容纳该水量的海平面。这样海平面仍由 `measureWaterVolume(elev, seaLevel)` 求解，但海岭体积、年轻洋壳比例、老洋盆深度、沉积填充都会通过高程场改变容量。

地质依据：长期 eustatic sea level 可由海水体积和洋盆体积共同控制；快速扩张时，年轻、热、浮力大的洋壳分布更广，洋盆平均变浅，海平面相对升高；慢扩张或老洋壳面积增加时，深洋盆容量变大，海平面相对降低。Müller 等和 Wright 等都把长期海平面变化与 ocean basin volume 联系起来；LibreTexts 也明确把海底扩张速率和洋盆容量列为海平面变化因素。

工程规则：

```js
// seaLevel 仍由固定或缓慢变化的 waterMass 求解。
waterMass = baseWaterMass + climateWaterDelta + volatileDelta;
seaLevel = solveSeaLevel(elev, waterMass);

// 但 elev 必须包含能改变洋盆容量的地质项。
oceanBasinCapacityIndex =
  oldOceanicShare * oldOceanDepth -
  youngOceanicShare * ridgeBuoyancy -
  sedimentDisplacement -
  hotspotPlateauDisplacement;

tectonicSeaLevelSignal =
  youngOceanicShare * 0.04
  + ridgeVolumeIndex * 0.05
  - oldOceanicShare * 0.03
  + sedimentDisplacement * 0.02;
```

建议不要直接把 `tectonicSeaLevelSignal` 加到 `seaLevel` 上，除非只是调试。更稳的做法是让它改变 `elev` 的洋底项，然后用水量方程求 `seaLevel`。如果需要艺术控制，可把 `tectonicSeaLevelSignal` 作为慢变量影响 `waterVolume` 的目标值，但要在文档中标明这是简化的 eustatic forcing。

可用字段：

- `crustAge`：年轻洋壳多，洋盆容量小。
- `ridge` / `boundaryKind=DIVERGENT`：活跃海岭体积。
- `crustThickness` / `crustDensity`：等静力浮沉。
- `sediment`：局部填浅并排水。
- `seaLevel` / `elev`：最终水体切分。

验证指标：

- `oceanCapacityAtSeaLevel`: 当前海平面下可容纳水量。
- `youngOceanShare` 与 `seaLevel` 的长期正相关。
- `oldOceanShare` 与平均深海容量的正相关。
- `sedimentDisplacementShare`: 沉积填充造成的容量减少量。
- `tectonicSeaLevelDelta`: 用于诊断的地质海平面信号，不一定直接进入渲染。

### 11.2 等静力均衡与地壳浮力近似

等静力的工程意义是：地表高度不是“壳厚直接加高度”，而是岩石圈柱体的浮力结果。厚而轻的陆壳通常高；冷、老、密的洋壳低；沉积和火山负载一方面填高表面，另一方面会压沉岩石圈。Airy 模型可简化为“厚壳有根、整体浮高”，Pratt 模型可简化为“低密度柱更高”。

推荐基础公式：

```js
thicknessBuoyancy =
  (crustThickness - refThicknessByType[crustType]) * thicknessWeight;

densityPenalty =
  (crustDensity - refDensityByType[crustType]) * densityWeight;

coolingPenalty =
  isOceanic ? Math.sqrt(crustAge) * ageWeight : 0;

surfaceLoad =
  sediment * sedimentLoadWeight
  + mountainBelt * tectonicLoadWeight
  + hotspotLoad * hotspotLoadWeight;

loadSubsidence =
  surfaceLoad * loadSubsidenceWeight * flexuralResponse;

isostaticBase =
  typeBase[crustType]
  + thicknessBuoyancy
  - densityPenalty
  - coolingPenalty
  - loadSubsidence;

elev = isostaticBase + sedimentFill + orogenyRelief + activeFeatureRelief;
```

关键约束：

- `sedimentFill` 和 `loadSubsidence` 同时存在：沉积会填高海底或盆地表面，但厚沉积负载也会造成局部下沉。
- `loadSubsidence` 应平滑、宽域，不应形成单像素坑。
- `crustDensity` 不应只是渲染字段；它应参与洋壳俯冲倾向和基础高程。
- old oceanic lithosphere 的下沉应主要由 `crustAge` 与 `crustDensity` 体现，而不是旧 `boundaryRelief`。

推荐归一化范围：

- `crustAge`: 0..1 对应 0..180 或 0..200 Ma。现代洋壳多数小于约 200 Ma，可用 180 Ma 作为先验。
- `crustThickness`: oceanic 0.18..0.35，transitional 0.30..0.58，continental 0.52..1.20。
- `crustDensity`: continental 0.38..0.52，transitional 0.52..0.66，oceanic 0.66..0.86。
- 洋壳热沉降贡献：建议占最终相对高程范围的 0.07..0.14。
- 壳厚浮力贡献：continental 可到 0.10..0.18，oceanic 通常 0.02..0.06。
- 沉积表面填高：单步小、总贡献 0.00..0.08；厚沉积的负载沉降可抵消 20%..50% 的表面填高。

### 11.3 沉积物预算与搬运规则

当前报告说“侵蚀物转为 sediment”，还需要补质量预算。沉积不能凭空平均增长，否则会变成贴图；也不能无限填海，否则会把所有边缘海抬成陆地。建议把 `sediment` 当作可压实、有容量上限、受地形和构造分配的质量库。

沉积预算：

```js
erosionAmount =
  orogeny * oldOrogenErosionRate
  + mountainBelt * activeMountainErosionRate
  + max(0, elev - localBaseLevel) * slopeProxy * reliefErosionRate;

orogeny -= erosionFromOrogeny;
mountainBelt -= erosionFromActiveMountain;

sedimentSupply = erosionAmount * routingEfficiency;

sinkWeight =
  basin * basinSinkWeight
  + passiveMargin * marginSinkWeight
  + trenchForearc * forearcSinkWeight
  + lowland * lowlandSinkWeight
  + abyssalPlain * abyssalSinkWeight;

sediment += sedimentSupply * sinkWeight / totalSinkWeight;
```

沉积压实与递减收益：

```js
effectiveSediment = 1 - Math.exp(-sediment / compactionScale);
sedimentFill = effectiveSediment * maxSedimentFill;
sedimentLoadSubsidence = effectiveSediment * loadWeight;
```

推荐参数：

- `maxSedimentFill`: 0.05..0.10。
- `compactionScale`: 0.15..0.35，越小越早递减。
- `routingEfficiency`: 水文前 0.25..0.55；水文后可由河流汇流替代。
- 盆地、被动边缘、前弧盆地的 sink 权重应高于普通深海。
- 高 `sediment` 区域应降低局部高程方差，形成深海平原、陆隆、陆架沉积楔。

验证指标：

- `sedimentBudgetError`: 侵蚀扣除量与沉积增加量的差。
- `sedimentCompactionMean`: 原始沉积和有效沉积的比值。
- `sedimentSinkDistribution`: basin/passive margin/trench/abyssal 的分配比例。
- `sedimentFlattening`: 高沉积区域的局部高程方差下降。
- `sedimentOverfillRisk`: 高 sediment 且高出海平面的海域比例，防止无限填海。

### 11.4 俯冲带非对称性

俯冲带不是边界两侧对称隆起/下陷。下沉板片侧通常是更老、更冷、更密的洋壳，产生海沟、外隆起、洋壳消耗；上覆板块侧形成增生楔、前弧盆地、岛弧/陆弧和更宽的造山响应。若两侧都是大陆壳，应减少海沟和岛弧，转为宽陆陆碰撞造山。

推断 `subductingSide`：

```js
subductionScore(cell) =
  oceanicBias
  + crustDensity * densityWeight
  + crustAge * ageWeight
  - crustThickness * buoyancyWeight;

if (boundaryKind === CONVERGENT) {
  sideA = samplePlateSide(A);
  sideB = samplePlateSide(B);
  subductingSide = subductionScore(sideA) > subductionScore(sideB) ? A : B;
  overridingSide = otherSide;
}
```

非对称写入：

```js
if (subductingSide.oceanic && overridingSide.continentalOrTransitional) {
  trench[subductingSide] += trenchGain;
  crustThickness[subductingSide] -= slabConsumption;
  crustAge[subductingSide] = consumeOrArchiveAge(crustAge);

  forearcBasin[overridingSideNearTrench] += forearcGain;
  islandArc[overridingSideOffset] += arcGain;
  orogeny[overridingSide] += arcOrogenyGain;
}

if (bothContinental) {
  trench *= 0.25;
  islandArc *= 0.3;
  orogeny += broadCollisionGain;
  crustThickness += crustalShorteningGain;
}
```

推荐新增字段：

- `subductingSide` 或 `subductionPolarity`
- `forearcBasin`
- `volcanicArc`，可先复用 `islandArc`
- `slabConsumption`

验证指标：

- `trenchOceanicSideShare`: 海沟是否主要在更密/更老洋壳侧。
- `arcTrenchOffsetMean`: 弧和海沟的平均偏移距离。
- `collisionTrenchSuppression`: 陆陆碰撞时 trench 是否降低。
- `subductedOldOceanShare`: 老洋壳在汇聚边界被消耗比例。

### 11.5 转换断层与 fracture zone 寿命

转换断层可以产生线性地貌，但其高程贡献应是局部、短寿命、低幅度的。离开 active transform 后，海底 fracture zone 可以保留年龄差或弱带记忆，但不应长期作为强烈高程线或海岸线。它可以影响 `weakness`、`crustAge` discontinuity 和少量粗糙度，而不应直接长期写入 `elev`。

规则：

```js
if (boundaryKind === TRANSFORM && boundaryInfluence > activeThreshold) {
  faultRelief = transformStress * localFaultReliefGain;
  weakness += transformStress * weaknessGain;
  transformMemory = max(transformMemory, transformStress);
}

if (boundaryKind !== TRANSFORM || boundaryInfluence < activeThreshold) {
  transformMemory *= oceanic ? fastOceanDecay : slowerContinentalDecay;
}

if (oceanic && inactive) {
  elev += transformMemory * 0.005; // 只能是弱纹理
  weakness += transformMemory * 0.02;
}
```

推荐参数：

- active transform 高程贡献：0.005..0.025。
- inactive oceanic transform 半衰期：10..40 Myr。
- inactive continental shear memory 半衰期：80..200 Myr，但主要保留在 `weakness`，不是 `elev`。
- fracture zone 对 crustAge 可保留 discontinuity，但应被沉积和热扩散软化。

验证指标：

- `inactiveTransformReliefMean`
- `fractureZoneAgeContrast`
- `fractureZoneElevationContribution`
- `oceanicStraightReliefDecay`

### 11.6 热点、洋底高原与海山链

热点是低优先级，但能解决一个重要表达问题：不是所有海底高地和岛链都来自板块边界。NOAA 和 NPS 都用 Hawaii/Emperor seamount chain 说明热点可在板块内部形成随板块运动排列的海山/岛链，年龄沿链条变化。

建议在 geology-v2 稳定后加入少量 `hotspot`：

```js
for each hotspot:
  plateLocalPosition = worldToPlateLocal(hotspot.position, plateMotion);
  ageAlongTrack = distanceAlongPlateMotion / plateSpeed;
  intensity = hotspotStrength * exp(-ageAlongTrack / hotspotDecayMyr);

  if (crustType === OCEANIC) {
    seamount += intensity;
    crustThickness += intensity * 0.03;
    elev += intensity * hotspotRelief;
  }
```

规则：

- 新热点附近可形成岛屿；旧热点链逐渐侵蚀、沉降，成为海山或平顶海山。
- hotspot relief 不应贴板块边界。
- 数量应少，默认 0..4 个，避免所有海底高地都被热点解释。

验证指标：

- `intraplateHighlandShare`
- `hotspotChainAgeGradient`
- `boundaryIndependentIslandShare`

### 11.7 暂缓模拟的气候/生物依赖地貌

进入气候/水文/生物前，不应硬编码以下地貌：

- 冰盖侵蚀、冰川槽谷、峡湾：依赖纬度、温度、降水、冰盖动力学。OpenGeology 明确将峡湾归因于冰川侵蚀后被海水淹没。
- 珊瑚礁、碳酸盐台地、生物礁：依赖温暖、浅水、清澈、有光和生物生产力。NOAA Fisheries 强调浅水珊瑚需要清澈、温暖、流动的透光海水。
- 碳酸盐沉积与礁体筑台：依赖海水化学、纬度、光照、营养盐和生物群。
- 强气候控制的三角洲、风成沙海、蒸发岩盐湖：需要降水、径流、蒸发和流域。

工程策略：在地质阶段只留下“可容纳这些地貌的地形条件”，例如浅海大陆架、低纬占位、封闭盆地候选；真正的 reef/fjord/delta/salt flat 等标签等气候和水文层接入后再派生。

### 11.8 参数标定建议

初始可用标定范围：

| 项 | 推荐范围 | 说明 |
|---|---:|---|
| `crustAge` 映射 | 0..180 Ma 或 0..200 Ma | 先用 180 Ma，减少极老洋壳占比 |
| 洋壳热沉降 | 0.07..0.14 elev | 随 `sqrt(age)` 增加，老洋壳平台化 |
| ridge uplift | 0.03..0.08 elev | 只在 active ridge 和年轻洋壳附近 |
| oceanic thickness buoyancy | 0.02..0.06 elev | 厚洋壳/洋底高原更浅 |
| continental thickness buoyancy | 0.10..0.18 elev | 厚陆壳高，但受侵蚀限制 |
| sedimentFill 最大值 | 0.05..0.10 elev | 用递减收益，避免无限填海 |
| sediment load subsidence | fill 的 20%..50% | 宽域下沉，非单像素坑 |
| active feature 半衰期 | 2..20 Myr | ridge/trench 最快，mountainBelt 稍慢 |
| old orogeny 半衰期 | 100..400 Myr | 旧山带低缓化，但可长期保留 |
| inactive oceanic transform 半衰期 | 10..40 Myr | 避免长直海底残影 |
| continental shear weakness 半衰期 | 80..200 Myr | 保留弱带，不保留强高程线 |

推荐用指标驱动标定，而不是肉眼调参：

- 200 Myr：`landMismatchVsBaseline < 0.05`，海岸贴边低，洋壳年龄与深度相关。
- 739 Myr：陆海比不极端，inactive transform relief 接近 0，旧山带宽而低。
- 任意长跑：沉积预算不爆炸，`sedimentOverfillRisk` 低，海底深浅能由 age/thickness/sediment 三项解释。

## 12. 工程落地补充：裂谷阶段机与海洋连通性

本轮 geology-v2 已将大陆裂谷从单一 `rift` 强度扩展为显式 `riftStage` 状态机，用来约束“陆内张裂何时只是裂谷盆地，何时才可能成为年轻洋盆”。这服务于海陆后置原则：`seaMask` 仍由 `elev < seaLevel` 派生，但地质解释层会进一步区分外海、内陆候选水体、闭合盆地、新生洋盆候选。

### 12.1 阶段定义

```js
RiftStage = {
  NONE: 0,
  INCIPIENT_RIFT: 1,
  RIFT_BASIN: 2,
  TRANSITIONAL_RIFT: 3,
  PROTO_OCEAN_CANDIDATE: 4,
  CONNECTED_YOUNG_OCEAN: 5
}
```

- `INCIPIENT_RIFT`：陆内离散边界与弱带开始张裂。
- `RIFT_BASIN`：壳厚下降，盆地和沉积增长；可形成低地，但不是外海。
- `TRANSITIONAL_RIFT`：壳厚、弱化和持续张裂达到阈值后转为过渡壳。
- `PROTO_OCEAN_CANDIDATE`：年轻海盆候选，可能低于海平面，但未连通外海时仍是闭合/内陆候选。
- `CONNECTED_YOUNG_OCEAN`：低于海平面、连通外海且持续张裂后，才允许转为年轻洋壳。

### 12.2 连通性定义

- `externalSeaMask`：从 `elev < seaLevel` 中取最大连通海域；x 方向 wrap，y 方向不 wrap。
- `inlandWaterCandidate`：低于海平面但不属于 `externalSeaMask` 的区域。
- `closedBasinId`：`inlandWaterCandidate` 的连通域编号。
- `oceanConnectivity`：`0=陆地/非水体`，`1=内陆候选水体`，`2=外海`。

这些字段是 derived/diagnostic，不是完整水文。它们不能决定最终湖泊面积，只用于阻止地质层把未连通裂谷盆地解释成外海。

### 12.3 程序规则

```js
riftPower = max(
  divergentBoundary * boundaryInfluence * stress * weakness,
  riftFeature * weakness
)
```

阶段推进由 `riftPower / crustThickness / weakness / riftAge / relativeElevation / externalSeaMask` 控制。旧的 transitional crust 直接转 oceanic crust 规则已收紧：只有 `CONNECTED_YOUNG_OCEAN` 阶段才允许稳定转为年轻洋壳并重置 `crustAge`。

停止张裂时，早期裂谷缓慢衰退；旧裂谷保留为弱带、低地、沉积盆地，而不是永久直线海。

### 12.4 新增诊断与 debug

新增诊断：

- `riftStageHistogram`
- `continentalRiftToTransitionalRate`
- `transitionalToOceanicRate`
- `protoOceanConnectedShare`
- `unconnectedBelowSeaRiftShare`
- `closedBasinCount`
- `inlandWaterCandidateShare`
- `riftCoastBoundaryShare`

新增 debug 图层：

- `riftStage`
- `externalSeaMask`
- `inlandWaterCandidate`
- `closedBasinId`
- `protoOceanCandidate`

### 12.5 剩余风险

当前 `externalSeaMask` 使用最大海域作为外海近似，足够用于 geology-v2 阶段诊断，但还不是完整湖泊/海峡/潮汐/溢流模型。后续水文阶段仍需根据降水、河流补给、蒸发和溢流口决定闭合盆地是否形成真实湖泊。
## 13. 工程落地补充：被动陆缘、大陆架与深海平原

本轮把第 5 章的被动大陆边缘规则落到 geology-v2 字段和诊断中。目标是让海岸附近从陆壳、过渡壳、沉积楔、大陆架、陆坡、陆隆到深海平原形成连续解释，减少“海岸突然掉入深海”和“边界像硬切贴图”的视觉问题。

### 13.1 新增字段

- `passiveMargin`：非活动陆缘和陆洋过渡带强度，主要由外海邻近、过渡壳、低活动边界、陆洋过渡距离、沉积和盆地共同派生。
- `continentalShelf`：靠近外海、近岸、相对浅水、沉积支撑较强的大陆架。
- `continentalSlope`：大陆架外侧较陡的陆坡带。
- `continentalRise`：陆坡外侧由沉积楔塑造的缓坡陆隆。
- `abyssalPlain`：老洋壳、低活动边界、高沉积的平缓深海平原。
- `sedimentWedge`：陆缘沉积楔，对陆架和陆隆有填浅、平滑作用。

### 13.2 程序规则

```js
passiveMargin =
  nearExternalSea
  * lowBoundaryInfluence
  * lowRidgeTrenchActivity
  * notInlandWaterCandidate
  * (transitionalCrust + continentOceanTransition + sedimentBasinSupport);

continentalShelf =
  passiveMargin
  * externalSeaMask
  * nearCoast
  * shallowDepth
  * sedimentSupport;

continentalRise =
  passiveMargin
  * sedimentWedge
  * outerShelfBand;

abyssalPlain =
  oceanicCrust
  * externalSeaMask
  * oldCrustAge
  * lowBoundaryInfluence
  * sedimentSupport;
```

高程层只加入温和项：

```js
marginElevation =
  continentalShelf * shelfLift
  + continentalRise * riseFill
  + sedimentWedge * wedgeFill
  - continentalSlope * slopeDrop
  - abyssalPlain * abyssalSoftening;
```

这仍然服从海陆后置：`seaMask` 继续由 `elev < seaLevel` 派生，陆架和陆缘字段只解释并轻微塑造高程，不直接决定海陆。

### 13.3 验证指标

- `passiveMarginCoverage`：被动陆缘覆盖率，应有合理分布，不能全空或铺满。
- `passiveMarginBoundaryShare`：被动陆缘贴活动边界比例，应保持较低。
- `closedBasinMisclassifiedAsMarginShare`：闭合盆地误判为被动陆缘比例，应接近 0。
- `activeBoundaryMisclassifiedAsPassiveMarginShare`：活动 ridge/trench/边界误判为被动陆缘比例，应接近 0。
- `nearCoastShallowSeaShare`：近岸浅海比例，应能体现大陆架改善。
- `coastDepthGradient`：海岸深度梯度，不应过陡。
- `abyssalPlainFlatness`：深海平原局部粗糙度，应低于普通海底。

### 13.4 剩余限制

当前模型没有模拟波浪、沿岸流、河口三角洲、碳酸盐台地和生物礁；这些依赖气候、水文和生物圈。地质层只提供“可容纳这些地貌”的陆缘、浅海、沉积和深海平原条件，不提前硬编码最终海岸类型。

## 14. 工程落地补充：转换断层寿命与 fracture zone 衰减

本轮把第 7 章关于转换断层和 fracture zone 寿命的规则落到 geology-v2。核心分流是：active transform 是当前构造边界，可以有局部线性地貌；inactive oceanic fracture zone 是旧记忆，只能弱保留年龄差、纹理和弱带，不能长期支配高程。

### 14.1 状态字段

- `activeTransform`：当前活动 transform 强度。
- `transformMemory`：转换断层弱带记忆，continental 区域保留较久，oceanic 区域较快衰减。
- `fractureZoneMemory`：旧海岭错断/转换断层在洋壳上的记忆，衰减慢于高程贡献。
- `inactiveBoundaryRelief`：旧边界仍残留为高程线的风险强度。
- `oldBoundaryCorrelation`：旧边界记忆与海底高程/深浅色带的相关度。
- `ageBandStraightnessRisk`：远离 active ridge 的年龄条带直线风险。

### 14.2 程序规则

```js
if (boundaryKind === TRANSFORM && boundaryInfluence > activeThreshold) {
  activeTransform = boundaryInfluence * stress;
  transformMemory = max(transformMemory, activeTransform);
  weakness += activeTransform * weaknessGain;
  if (oceanic || transitional) fractureZoneMemory = max(fractureZoneMemory, activeTransform);
} else {
  activeTransform = 0;
}

transformMemory *= halfLife(crustType);      // oceanic 快，continental 慢
fractureZoneMemory *= slowerHalfLife;
inactiveBoundaryRelief *= fastReliefHalfLife;
```

高程层：

```js
activeTransformRelief = activeTransform * smallRelief;
inactivePenalty = (transformMemory + fractureZoneMemory + inactiveBoundaryRelief)
  * oceanic
  * inactive
  * sedimentOrAbyssalFlattening;
```

另外增加 `suppressInactiveFractureRelief`，只在远离 active ridge/trench/boundary 的 oceanic cells 上做小半径条件平滑。旧 fracture zone 还会低频软化 `crustAge / crustThickness / sediment` 源场，让后续洋底高程公式不再反复从同一条旧直线年龄带派生深浅色带。这样可以压制旧直线高程残影，同时不抹掉海岭、海沟、岛弧和新山带。

### 14.3 诊断与 debug

新增诊断：`activeTransformCoverage / transformMemoryCoverage / fractureZoneMemoryCoverage / inactiveTransformReliefMean / fractureZoneElevationContribution / oceanicStraightReliefDecay / oldBoundaryReliefCorrelation / activeVsInactiveBoundaryReliefRatio / ageBandStraightnessNearRidge / ageBandStraightnessInactive / ageBandStraightnessFractureZone / abyssalPlainFractureSuppression`。

新增 debug 图层：`activeTransform / transformMemory / fractureZoneMemory / inactiveBoundaryRelief / oldBoundaryCorrelation / ageBandStraightnessRisk`。

### 14.4 剩余限制

当前 fracture zone 模型仍是栅格记忆场，不是真正的 plate-relative transform segment tracker。它能降低旧边界残影，但还不能完整表达洋中脊分段、转换断层错断几何和 fracture-zone 年龄差条纹。后续如果继续改善边界弯曲与分段，应把 transform segment 生命周期和 ridge offset 一起建模。

## 15. 工程落地补充：板块棋盘格边界伪影

本轮处理的是板块挤压区短暂出现的红蓝棋盘格边界伪影。它不是地质现象，而是 plate rasterization 与 boundary detection 的数值伪影：当 plate 栅格归属出现 A/B/A/B 的交替小块时，`activeBoundary` 会从线状边界变成面状噪声，随后被 convergent/divergent/transform 着色和构造 feature 放大。

### 15.1 修复规则

plate rasterization：

```js
diagonalCost = Math.SQRT2;
orthogonalCost = 1;
```

对角扩张不再比正交扩张更便宜。栅格归属完成后执行一轮局部 majority cleanup：

```js
if (majorityCount >= 5 && sameCount <= 2) {
  plate = majorityPlate;
}

if (is2x2Checkerboard && majorityCount >= 4 && sameCount <= 3) {
  plate = majorityPlate;
}
```

该清理只针对孤立格和棋盘格，不针对真实长条边界。

boundary coherence：

```js
boundaryDensity = activeBoundary cells in 3x3 / cells;
plateCheckerboard = local 2x2 A/B/B/A risk;
boundaryCoherence = 1 - highDensityPenalty - checkerPenalty - islandPenalty;
noisyBoundaryPatch = boundaryDensity > 0.66 || plateCheckerboard > 0.4 || islandNoise;
```

feature gating：

```js
coherenceFactor = noisyBoundaryPatch ? 0.12 : 0.35 + boundaryCoherence * 0.65;
signal *= coherenceFactor;
```

这样不是在渲染层隐藏颜色，而是在构造 feature 写入前阻断数值噪声。

### 15.2 新增字段与诊断

新增 grid 字段：

- `boundaryDensity`
- `boundaryCoherence`
- `noisyBoundaryPatch`
- `plateCheckerboard`

新增指标：

- `plateCheckerboardScore`
- `activeBoundaryCoverage`
- `localBoundaryDensityMean`
- `noisyBoundaryPatchCoverage`
- `plateIslandNoiseShare`
- `featureOnNoisyBoundaryShare`

新增 debug 图层：

- `plateId`
- `boundaryDensity`
- `boundaryCoherence`
- `noisyBoundaryPatch`
- `plateCheckerboard`

### 15.3 剩余限制

该方案仍是栅格后处理和局部 coherence 门控，目标是消除棋盘格数值伪影，而不是生成最终自然弯曲的板块边界。真实的弯曲、错断、分段边界还需要后续在 plate center、弱带、旧缝合线和 ridge-transform 几何上建模。
## 16. 工程落地补充：造山带生命周期

本轮实现把“新山带”和“旧造山带”拆成两个时间尺度。地质依据是：活动汇聚边界可形成清晰高山、岛弧或碰撞造山；一旦构造活动减弱，山带会在数千万到数亿年尺度上侵蚀、展宽、断续化，并把物质输送到前陆盆地、被动边缘和低地沉积汇。

### 16.1 可编码规则

活动造山：

```js
collisionPower = convergent * boundaryInfluence * stress * continentalFactor * coherence;
arcPower = convergent * boundaryInfluence * stress * subductionFactor * coherence;
activeOrogeny = max(activeOrogeny, collisionPower + arcPower);
mountainBelt += activeOrogeny * activeMountainGain;
orogeny += activeOrogeny * longTermRootGain;
orogenyAge = mix(orogenyAge, 0, activeOrogeny);
```

旧山带：

```js
inactive = 1 - boundaryInfluence;
oldOrogeny = max(oldOrogeny * oldDecay, orogeny * inactive * inactive);
oldOrogeny = broadenAlongWeakness(oldOrogeny, weakness) * segmentMask;
oldRelief = oldOrogeny * oldHeight * ageReduction(orogenyAge);
```

侵蚀和沉积：

```js
erosion = (activeOrogeny + oldOrogeny + orogeny)
  * (baseErosion + inactive + slopeOrHeightProxy);
orogeny -= erosion;
orogenyErosion = erosion;
orogenicSedimentSupply = persistence + erosion * supplyGain;
sediment += erosion * sinkWeight(forelandBasin, basin, passiveMargin, continentalRise);
```

前陆盆地：

```js
forelandBasin += nearby(activeOrogeny, oldOrogeny)
  * continentalOrTransitional
  * lowRelief
  * notActiveRidgeOrTrench;
```

### 16.2 字段职责

- `mountainBelt`：活动山带视觉特征，较清晰、较短寿。
- `activeOrogeny`：活动汇聚造山强度，解释新山带成因。
- `orogeny`：长期造山根和壳厚/构造记忆。
- `oldOrogeny`：旧山带残余，低缓、宽、断续。
- `orogenyAge`：旧山带降高和侵蚀阶段控制。
- `orogenyErosion / orogenicSedimentSupply`：沉积预算入口。
- `forelandBasin`：造山前缘沉降和沉积汇。
- `mountainAxis / mountainHeight / orographicBarrier`：气候、水文读取接口。

### 16.3 视觉与验证指标

期望视觉：

- 200 Myr 新山带仍能追溯到 active convergent boundary。
- 739 Myr 旧山带更低、更宽、更断续，不像单像素板块边界。
- 前陆盆地出现在山带前缘低地，而不是随机色块或深坑。
- 山脉屏障字段能解释气候雨影和河源潜力。

诊断指标：

- `activeOrogenyCoverage`
- `oldOrogenyCoverage`
- `oldOrogenyWidth`
- `orogenyAgeMean`
- `orogenyErosionMean`
- `orogenicSedimentBudget`
- `forelandBasinCoverage`
- `newVsOldMountainReliefRatio`
- `mountainAxisCurvature`
- `orographicBarrierCoverage`
- `mountainBoundaryZeroShare`
- `oldOrogenyBoundaryShare`

### 16.4 剩余限制

当前实现仍是栅格场生命周期，不是完整连续造山带骨架模型。`segmentMask` 和 weakness 偏转可以减少直线感，但不能替代后续的边界分段、旧缝合线追踪和气候驱动侵蚀。沉积搬运也仍是局部 sink 规则；进入水文后应由河网、坡度、降水和盆地连通性决定更真实的输沙路径。

## 17. 工程落地补充：构造轴线自然化

真实山脉、海岭、海沟和裂谷通常受活动边界控制，但它们不会逐像素等同于 Voronoi 板块边界。边界会沿弱带、旧缝合线、裂谷带和 transform/fracture memory 偏转，并表现为有宽度、有断续、有弯曲的构造带。本轮把 raw boundary 降级为 seed，把最终 feature 写入改为读取 naturalized axis。

### 17.1 可编码规则

seed 生成：

```js
seedPower =
  boundaryInfluence
  * boundaryCoherence
  * stress
  * noisyBoundaryGate
  * checkerboardGate;
```

axis 自然化：

```js
bend =
  (weakness - 0.5)
  + oldOrogeny * suturePull
  + riftStage * riftPull
  + transformMemory * shearPull
  - fractureZoneMemory * oceanicReliefPenalty;

axis = localDiffuse(seed, bend, radius);
axis *= twoDimensionalSegmentMask(x, y, weakness);
axis = suppress(noisyBoundaryPatch, plateCheckerboard);
```

feature 写入：

```js
mountainBelt <- mountainAxisSeed;
ridge <- ridgeAxis;
trench <- trenchAxis;
rift <- riftAxis;
mountainAxis / mountainHeight / orographicBarrier <- naturalized mountain axis + final elevation;
```

### 17.2 字段职责

- `tectonicAxis`：综合构造轴线，用于诊断和资源系统。
- `mountainAxisSeed`：造山/山脉轴线，进入 `mountainBelt / activeOrogeny / mountainAxis`。
- `ridgeAxis`：洋中脊轴线，进入 ridge feature。
- `trenchAxis`：俯冲/海沟轴线，进入 trench 和 islandArc。
- `riftAxis`：大陆裂谷/过渡裂谷轴线，进入 rift 和 basin。
- `axisBoundaryDependency`：防止 axis 退化成 raw boundary 的质量指标。
- `mountainHeightBlockiness / orographicBarrierContinuity`：气候接口视觉与结构质量指标。

### 17.3 验证指标

- `axisBoundaryDependency` 不应接近 1。
- `axisNoisyBoundaryShare` 应低，noisy boundary 不应生成强轴线。
- `axisSegmentLengthMean` 应避免无限长直线。
- `axisCurvatureMean` 应显示适度弯曲。
- `mountainHeightBlockiness` 应低。
- `orographicBarrierContinuity` 应高，但不能来自硬直边界。
- `ridgeAxisBoundaryDependency / trenchAxisBoundaryDependency / riftAxisBoundaryDependency` 可高于旧山带，但不应等于 raw boundary。

### 17.4 剩余限制

当前 axis 是栅格场，不是显式折线网络。它能显著降低边界直线感和 blockiness，但还不能表达完整的 ridge-transform offset、弧形俯冲带拓扑或多期缝合线重激活。后续可在该层上增加 segment tracker 和 polyline skeleton。

## 18. 工程落地补充：行星地形起伏预算

含水类地行星不应在长时程后自动变成平板。构造、地壳厚度/密度差异、洋壳冷却沉降、山带生命周期会制造高差；侵蚀、沉积、深海平原和被动边缘会削平并重分配高差。geology-v2 需要把二者放进同一个预算诊断，避免单个合理过程叠加出不合理的全球结果。

### 18.1 可编码规则

构造起伏来源：

```js
tectonicReliefSupply =
  activeOrogeny * 1.0
  + oldOrogeny * 0.35
  + ridge * 0.45
  + rift * 0.25
  + trench * 0.25
  + islandArc * 0.35;
```

等静力和洋底来源：

```js
isostaticReliefSupply =
  abs(thicknessBuoyancy)
  + abs(ageSubsidence)
  + abs(oceanDepthTerms);
```

削平压力：

```js
erosionFlatteningPressure =
  sediment * 0.35
  + basin * 0.25
  + abyssalPlain * 0.35
  + sedimentWedge * 0.2
  + forelandBasin * 0.15;
```

全局风险：

```js
hypsometricSpread = p95(elev) - p05(elev);
landReliefSpread = p90(landElev) - p10(landElev);
globalElevationStd = std(elev);

flatWorldRisk =
  globalElevationStd < targetStd
  && hypsometricSpread < targetSpread
  && largePlainShare > maxPlainShare;
```

### 18.2 字段职责

- `planetaryRelief`：局部预算合成结果，用于 debug 和质量诊断。
- `reliefDeficit`：全局起伏不足风险映射到局部图层。
- `seaLevelSensitivity`：`abs(elev - seaLevel)` 小于阈值的海陆敏感区。
- `flatLandMask / largePlainMask`：局部平原候选，不能单独作为坏指标。
- `drainageGradientPotential`：水文前的陆地坡度与陆地起伏潜力。
- `orographicReliefPotential`：气候前的雨影屏障潜力。

### 18.3 验证指标

- `hypsometricSpread / landReliefSpread / globalElevationStd` 不应在 739 Myr 塌缩。
- `largePlainShare` 可以高，但不能和低 spread/std 同时触发 `flatWorldRisk`。
- `seaLevelSensitivity / coastInstabilityRisk` 不应长期过高，否则海陆后置会对微小海平面变化过敏。
- `tectonicReliefSupplyMean / isostaticReliefSupplyMean` 应解释起伏来源。
- `erosionFlatteningPressureMean / sedimentSmoothingPressureMean` 应解释沉积和深海平原的削平压力。

### 18.4 剩余限制

当前版本只诊断，不启用反馈。后续若要自动调节，应分散到已有地质过程，例如降低过度平滑、保留旧造山根、压缩沉积填平收益，而不是直接给高程加随机噪声。撞击坑、热点、冰川、完整河网侵蚀和生物礁仍暂缓。

## 19. 工程落地补充：全球相对海平面与洋盆容量耦合

geology-v2 的海陆后置原则保持不变：最终海陆仍由 `elev >= seaLevel` 派生。新增的是对 `seaLevel` 的解释层：

```js
seaLevel = baseSeaLevel + geologicSeaLevelOffset;
```

`baseSeaLevel` 是基础 waterLevel / 总水量切线；`geologicSeaLevelOffset` 是全球洋盆容量变化导致的相对海平面偏移。该 offset 必须是 global scalar，不能是逐格字段，也不能生成 `geologicSeaLevelOffsetField`。所有下游的 sea mask、海洋连通、被动陆缘、大陆架、海岸和渲染只读取最终 `world.seaLevel`。

### 19.1 容量信号

年轻洋壳与洋中脊体积：

```js
isYoungOcean = oceanic && crustAge < youngAgeThreshold;

ridgeVolumeSignal =
  oceanic * clamp01(
    ridgeUplift * 0.45
    + ridge * 0.30
    + ridgeAxis * 0.25
    + max(0, 1 - crustAge / youngAgeThreshold) * 0.35
  );
```

含义：年轻、热、低密度、浅的洋壳和活跃洋中脊会减少洋盆可用容量，使相对海平面升高。`youngOceanShare` 是 global scalar，由 `isYoungOcean` 在 oceanic cells 中统计得到，不是 field。

老洋壳深洋盆容量：

```js
oldOceanCapacitySignal =
  oldOceanic * clamp01(
    depth * depthWeight
    + max(0, -ageSubsidence) * ageWeight
    + max(0, -oceanDepthTerms) * oceanDepthWeight
  );
```

含义：老洋壳冷却、增密、下沉，深洋盆容量增加，使相对海平面降低。

沉积容量排挤：

```js
sedimentDisplacementSignal =
  clamp01(
    sedimentFill * 0.45
    + sedimentWedge * 0.35
    + continentalRise * 0.15
    + continentalShelf * 0.10
    + sediment * 0.15
  );
```

含义：沉积填平陆架、陆隆、边缘海和盆地，局部变浅，并小幅减少全球水体可用空间。它权重应低于 ridge / old ocean capacity，避免无限填海。

海沟容量：

```js
trenchCapacitySignal =
  oceanic * clamp01(
    max(0, -trenchDepression) * trenchWeight
    + trench * trenchFeatureWeight
    + trenchAxis * trenchAxisWeight
  );
```

含义：海沟增加局部深水容量，但面积小，不应主导全球海平面。

### 19.2 归一化与 offset 推进

子信号先做 centered normalization，再合成诊断值：

```js
capacityBalance =
  ridgeN * ridgeWeight
  + youngN * youngWeight
  + sedimentN * sedimentWeight
  - oldN * oldWeight
  - trenchN * trenchWeight;

targetGeologicSeaLevelOffset =
  clamp(capacityBalance * maxOffset * seaLevelCouplingStrength, -maxOffset, maxOffset);

geologicSeaLevelOffset =
  moveToward(previousOffset, targetGeologicSeaLevelOffset, maxOffsetStep);
```

`capacityBalance > 0` 表示洋盆偏浅或被沉积排挤，海平面倾向升高；`capacityBalance < 0` 表示老洋盆和海沟容量占优，海平面倾向降低。`oceanBasinCapacitySignalMean` 可以作为 `capacityBalance` 的诊断别名，但不要维护独立 `oceanBasinCapacitySignal` grid field。

同一个 `world.step` 内如果多次调用海平面更新，只允许推进一次 offset；后续调用只重新应用当前 offset 并刷新诊断。这样可兼容 geology-v2 pipeline 中多次 `updateSeaLevel -> deriveOceanConnectivity` 的结构。

### 19.3 coastalSensitivity 与风险控制

`coastalSensitivity` 是静态地貌敏感性诊断，供当前 `coastalFlipRisk` 和未来 climate/hydrology 读取：

```js
coastalSensitivity =
  nearSeaLevel * 0.45
  + lowSlope * 0.20
  + lowRelief * 0.15
  + shelfFactor * 0.20;
```

其中 `shelfFactor` 来自 `continentalShelf / passiveMargin / sedimentWedge / basin`。`coastalFlipRisk` 只用于限制单步海平面变化，不直接绘制水体，也不改变海陆后置原则。

### 19.4 字段与诊断

world 字段：

- `baseSeaLevel`
- `geologicSeaLevelOffset`
- `geologicSeaLevelTargetOffset`
- `geologicSeaLevelPreviousOffset`
- `geologicSeaLevelStep`
- `geologicSeaLevelDiagnostics`

grid 诊断字段：

- `ridgeVolumeSignal`
- `oldOceanCapacitySignal`
- `sedimentDisplacementSignal`
- `trenchCapacitySignal`
- `coastalSensitivity`
- `isYoungOcean`

诊断指标：

- `baseSeaLevel / seaLevel / geologicSeaLevelOffset / targetGeologicSeaLevelOffset / seaLevelChangeRate`
- `youngOceanShare / oldOceanShare`
- `ridgeVolumeSignalMean / oldOceanCapacitySignalMean / sedimentDisplacementSignalMean / trenchCapacitySignalMean`
- `ridgeVolumeNormalized / youngOceanNormalized / oldOceanCapacityNormalized / sedimentDisplacementNormalized / trenchCapacityNormalized`
- `capacityBalance / oceanBasinCapacitySignalMean`
- `coastalSensitivityMean / coastalFlipRisk / seaLevelCouplingStrength`
- `landShareBeforeGeologicOffset / landShareAfterGeologicOffset / geologicSeaLevelLandShareDelta`

debug 图层：

- `ridgeVolumeSignal`
- `oldOceanCapacitySignal`
- `sedimentDisplacementSignal`
- `trenchCapacitySignal`
- `coastalSensitivity`

### 19.5 剩余限制

本轮不是完整水文、气候、冰量、风暴潮或局部湖面模型。`inlandWaterCandidate` 仍只是低于最终 `seaLevel` 但未连通外海的候选闭合盆地，不应被当成完成态湖泊。未来如引入 `climateOffset / iceOffset`，应与 `geologicSeaLevelOffset` 在全局海平面层组合，而不是引入 per-cell sea level。

## 20. 工程落地补充：沉积预算闭环初版

本轮已把报告中的“沉积物预算与搬运规则”落到 geology-v2 初版实现。核心变化是：`sediment` 不再主要由局部平流或背景老化直接累积解释，而是通过 `erosionSource -> sedimentFlux -> sedimentSink -> sedimentCapacity -> compaction/load subsidence -> diagnostics` 闭环解释。

### 20.1 已实现规则

产沙源：

```js
erosionSource = land * (
  activeOrogeny
  + mountainBelt
  + oldOrogeny
  + orogeny
  + mountainAxis
  + orographicBarrier
  + slopeRelief
  + riftShoulder
) * activeConstructiveDamping;
```

沉积容量：

```js
sedimentCapacity =
  shelfCapacity
  + basinCapacity
  + trenchForearcCapacity
  + deepOceanCapacity
  + nearOrBelowSeaCapacity
  - activeRidgeOrMountainPenalty;
```

搬运方式：

- 使用有限 8 邻域局部坡向搬运，x 方向 wrap，y 方向不 wrap。
- 邻域权重由下坡、盆地、前陆盆地、被动陆缘、陆架、陆隆、闭合盆地候选和深海平原吸引共同决定。
- 使用 deterministic jitter / weakness / axisCurvature 打散规则路径，保持同一种子可复现。
- 残余通量显式拆分为 `sedimentResidualDissipation` 与 `sedimentResidualFlux`，不无声丢失；`sedimentBudgetError` 只衡量当前步运输闭合，存量压实通过 `sedimentCompactionMean / sedimentMassDelta` 单独诊断。

压实与递减收益：

```js
sediment = min(maxSedimentByEnvironment, sediment + effectiveDeposit);
sedimentCompaction = sediment * sediment * compactionRate;
sedimentLoadSubsidence = sediment * loadWeight * crustTypeFactor;
sedimentFill = fillMax * (1 - exp(-sediment * fillScale));
```

### 20.2 已实现字段与诊断

新增字段：`erosionSource / sedimentFlux / sedimentSink / sedimentCapacity / sedimentCompaction / sedimentLoadSubsidence / depositionRate / erosionRate / sedimentBudgetError`。

新增诊断：`erosionSourceTotal / depositionTotal / sedimentBudgetError / sedimentResidualDissipation / sedimentResidualFlux / sedimentMassDelta / mountainErosionShare / passiveMarginDepositionShare / basinDepositionShare / trenchForearcDepositionShare / inlandBasinDepositionShare / sedimentOverfillShare / sedimentPatchiness / sedimentStraightnessRisk / sedimentSeaFillRisk / sedimentShelfConcentration / sedimentAbyssalConcentration`。

### 20.3 验收关注

- `sedimentBudgetError` 不应长期接近 1；它表示产沙、沉积、残余耗散和剩余通量的本步运输闭合误差，不直接把历史存量压实算作当前步产沙损失。
- `sedimentOverfillShare` 不应在 739 Myr 全图饱和。
- `sedimentSeaFillRisk` 不应显著偏高，避免大面积规则浅海被直接填成矩形或扇形陆地。
- `sedimentStraightnessRisk` 应帮助定位旧边界/网格/贴图式色带风险。
- `sedimentLoadSubsidence` 必须保持弱项，只解释厚沉积负载，不能抹掉活动构造地貌。

### 20.4 剩余限制

当前版本不是完整河网侵蚀，也没有真实降水、径流、三角洲、风暴搬运或生物碳酸盐平台。后续 hydrology 阶段可以读取本轮字段，但不应把 `sedimentSink` 当作完成态河流沉积系统。

## 21. 已落地：等静力 / 地壳浮力轻量高程校正

### 21.1 实现范围

本轮已把等静力基础层落到 geology-v2 主流程中。实现目标不是完整 Airy / flexural loading 物理模拟，而是把“厚陆壳较高、薄陆壳 / 过渡壳较低、年轻洋壳较浅、老冷洋壳较深、沉积既填平也负载下沉”的规律转为稳定的低频高程底座。

当前公式结构：

```js
crustBuoyancy = smoothThickness(crustThickness, crustType) * buoyancyScale;
densitySubsidence = densityNorm(crustDensity, crustType) * densityScale;
lithosphereCooling = oceanicOrTransitional * sqrt(crustAge) * coolingScale;
sedimentLoad = sedimentLoadSubsidence * loadScale * diminishingReturn;

isostaticBase =
  crustTypeBase
  + crustBuoyancy
  - densitySubsidence
  - lithosphereCooling
  - sedimentLoad
  + sedimentSurfaceFill;
```

兼容旧洋底分项：

```js
ageSubsidence = -lithosphereCooling;
thicknessBuoyancy = crustBuoyancy;
oceanDepthTerms =
  ageSubsidence
  + thicknessBuoyancy
  + sedimentSurfaceFill
  + ridgeUplift
  + trenchDepression
  - densitySubsidence
  - sedimentLoad;
```

### 21.2 字段与诊断

新增持久 / 派生字段：`isostaticBase / crustBuoyancy / densitySubsidence / lithosphereCooling / isostaticResidual`。既有 `sedimentLoadSubsidence / isostaticReliefSupply` 继续复用。

新增接口与工具诊断：`isostaticContinentalMean / isostaticOceanicMean / isostaticTransitionalMean / continentalOceanReliefGap / youngOldOceanDepthGap / isostaticResidualMean / isostaticResidualP95 / isostasyElevationCorrelation / crustThicknessElevationCorrelation / crustAgeOceanDepthCorrelation / transitionalElevationBand / seaLevelDriftAfterIsostasy / landRatioDriftAfterIsostasy`。

新增 debug 图层：`isostaticBase / crustBuoyancy / densitySubsidence / lithosphereCooling / sedimentLoadSubsidence / isostaticResidual / crustThickness / crustDensity`。

### 21.3 验证结果

`龙骨海-纪元7` 在 512x256 档的代表性结果：

- 200 Myr：`continentalOceanReliefGap ≈ 0.238`，`youngOldOceanDepthGap ≈ 0.078`，`isostaticResidualP95 ≈ 0.0159`。
- 739 Myr：`continentalOceanReliefGap ≈ 0.206`，`youngOldOceanDepthGap ≈ 0.073`，`isostaticResidualP95 ≈ 0.0191`，`sedimentStraightnessRisk ≈ 0.054`，`flatWorldRisk = false`。
- 200 Myr resolution-check：256x128 与 512x256 的 `continentalOceanReliefGap` 均约 0.218，`youngOldOceanDepthGap` 均约 0.077，说明等静力趋势在两档分辨率间保持一致。

### 21.4 剩余限制

- `seaLevelDriftAfterIsostasy / landRatioDriftAfterIsostasy` 当前主要用于监控重构后的跳变风险，并不是独立的地质海平面反演。
- `isostaticResidual` 低并不代表最终视觉必然自然；仍需结合 `oldBoundaryReliefCorrelation / sedimentStraightnessRisk / coastBoundaryShare` 判断旧边界残影。
- 沉积负载仍是轻量近似，未实现真实 flexural response。
- 等静力层只提供大尺度底座；山脉、海沟、岛弧、裂谷和被动边缘仍由对应构造模块解释。
