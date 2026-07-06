# GPU图算法评估报告

## 1. 结论摘要

- 当前不建议把 `externalSeaMask / closedBasinId / flowAccumulation / drainageBasinId / watershedId` 迁移为默认 GPU 路径；这些属于图遍历、连通分量、排序传播和水文拓扑问题，正确性风险高于 dense/stencil kernel。
- 近期 GPU 改造应继续优先优化已验证的 dense/stencil 路径，例如 `isostasy`、`elevation`、`local-fields`、`margin-smooth`、`sediment-capacity`，尤其是减少 readback 和合并 kernel。
- `distanceFromSources`、`marginDistanceFromSources` 可作为未来 GPU candidate 的第一类图算法，因为它们只输出距离场，比较容易与 CPU baseline 做 RMSE / mismatch 对比。
- `external sea / closed basin connected components` 可以研究 GPU connected components 或 jump flooding，但不应先改生产路径；它们直接影响海陆解释、裂谷阶段和被动边缘，错误会很显眼。
- `hydrology flow accumulation / drainage basin / watershed` 暂时必须保留 CPU；它依赖按高程排序的有向传播和出口/内流盆地解释，GPU 化会引入大量同步和调试成本。
- 浏览器验收必须保留：即使 Node 检查通过，图算法 GPU candidate 也必须通过 `browser-smoke-check` 的真实页面运行、Console 检查和 debug 图层解释。

## 2. 当前 CPU 图算法清单

| 模块 | 当前职责 | 主要字段 | 算法形态 | GPU 迁移建议 |
|---|---|---|---|---|
| `src/sim/topology.js` | 通用拓扑 flood fill / connected components | `componentId`, `componentAreas` | BFS / queue / 4-neighbor graph traversal | 暂缓默认迁移；可做独立 candidate |
| `src/sim/geology/rift.js` | 外海连通、闭合盆地、裂谷是否连通外海 | `externalSeaMask`, `oceanConnectivity`, `inlandWaterCandidate`, `closedBasinId` | connected components over sea mask | 高风险，CPU 保留 |
| `src/sim/geology/margins.js` | 海岸、陆壳、洋壳、外海距离场 | `marginCoastDistance`, `marginOceanDistance`, `marginExternalSeaDistance` | multi-source BFS distance field | 可作为未来 candidate |
| `src/sim/derived/terrain.js` | 海岸距离、陆块/岛屿编号、平滑邻域 | `coastDistance`, `distanceToOcean`, `landmassId`, `islandId` | BFS + connected components + radius smoothing | 距离场可研究；组件编号保留 CPU |
| `src/sim/hydrology.js` | 水文流向、汇流、流域、河网、内流盆地 | `flowTarget`, `flowAccumulation`, `drainageBasinId`, `watershedId`, `riverMask` | topological order propagation + basin assignment | 保留 CPU |

## 3. 候选算法评估

### 3.1 Multi-source distance field

**用途**：海岸距离、到外海距离、到陆壳/洋壳距离、被动边缘距离场。

**CPU 现状**：当前用队列 BFS，从 source mask 出发按拓扑邻接扩散，矩形网格和 graph-backed spherical grid 都已有拓扑抽象。

**GPU 可行方案**：

- Jump Flooding Algorithm（JFA）：适合近似最近源距离，pass 数约为 `log2(max(width,height))`。
- Iterative wavefront relaxation：每 pass 从邻居取最小距离 + 1，直到收敛；实现简单但 pass 数可能接近最大距离。
- Hybrid：CPU 生成低频 source / topology metadata，GPU 做局部矩形距离近似；真实球面仍需拓扑邻接 buffer。

**风险**：

- JFA 输出是欧氏近似，不一定等价当前拓扑步数距离。
- 被动边缘规则对距离阈值敏感，轻微误差可能改变 shelf/slope/rise 宽度。
- cubed-sphere 需要 graph adjacency buffer，不能继续用 x-wrap/y-no-wrap 假设。

**建议**：中优先级 candidate。先只输出 debug 距离场，不写回生产字段。

**验收**：

- CPU/GPU `distance` RMSE、p95Abs、maxAbs。
- 阈值带 mismatch：`distance <= maxShelf`、`distance <= maxRise` 的 mask mismatch。
- debug 图层对比：coastDistance、externalSeaDistance、passiveMargin。
- 浏览器：`browser-smoke-check --mode http --require-validation`，Console 无项目错误。

### 3.2 External sea / closed basin connected components

**用途**：区分外海、内陆低地/闭合盆地、裂谷是否能成为年轻洋盆。

**CPU 现状**：`deriveOceanConnectivity` 先生成 `seaMask`，再用 `topology.connectedComponents(seaMask)` 选最大海域作为外海，剩余海域标记 `closedBasinId / inlandWaterCandidate`。

**GPU 可行方案**：

- Parallel connected components：label propagation / union-find over grid graph。
- Flood-fill from selected external sea seed：反复扩张 frontier，适合只求外海 mask。
- CPU/GPU hybrid：CPU 仍选外海 seed 和最终 component id，GPU 只做可达性 mask candidate。

**风险**：

- 连通性错误会直接制造“凭空外海”“规则内陆湖”或误杀真实海盆。
- 最大水体不一定始终等同外海，后续若引入真实球面和海峡，外海定义还需更严谨。
- component id 的稳定编号在 GPU 并行 label propagation 中较难保证。

**建议**：暂缓默认迁移。未来可以先做 `externalSeaMask` candidate，不做 `closedBasinId` 写回。

**验收**：

- `externalSeaMask` exact mismatch <= 0.1% 才能进入 validate。
- `closedBasinCount`、`inlandWaterCandidateShare`、`protoOceanConnectedShare` 与 CPU 一致或差异可解释。
- 200/739 Myr long-run 不产生规则扇形湖、矩形海、外海误连通。
- 浏览器 debug 图：`externalSeaMask / inlandWaterCandidate / closedBasinId / riftStage`。

### 3.3 Landmass / island connected components

**用途**：陆块、岛屿编号，后续气候/生态/资源可能读取。

**CPU 现状**：`labelLandmasses` 使用 BFS 给 `landmassId / islandId` 编号，并按面积判断岛屿。

**GPU 可行方案**：与 connected components 相同，也可用 label propagation。

**风险**：

- 编号稳定性差会影响下游缓存、debug 和资源分区解释。
- 面积加权阈值在 cubed-sphere 上依赖 `metricArea`，GPU 需要 area buffer。

**建议**：低优先级。保留 CPU，除非后续生态/资源阶段证明它是性能瓶颈。

**验收**：component area distribution、largest landmass share、island count、ID stability。

### 3.4 Hydrology flow accumulation

**用途**：流向、汇流、河流强度、流域、内流盆地、湿地候选。

**CPU 现状**：先 assign flow target，再按 `hydroElevation` 排序，让高处向低处累积，随后分配 drainage / watershed / outlet / river order。

**GPU 可行方案**：

- Iterative relaxation：每轮把水量传给 flow target，直到稳定。
- Parallel prefix / topological levels：按高度 bucket 分层传播。
- GPU sorting + scatter/gather：复杂度高，WebGPU 实现和调试成本高。

**风险**：

- flow cycle、orphan flow、endorheic basin 解释很容易被并行误差破坏。
- 河流是用户视觉上极敏感的结构，错误会明显。
- 需要 atomic/scatter 或多 pass ping-pong，性能收益不确定。

**建议**：保留 CPU，不进入近期 GPU 路线。先继续用 `hydrology-profile.mjs` 监控是否真是瓶颈。

**验收**：

- `hydrologyValid: true`。
- `flowCycleCount = 0`、`orphanFlowShare = 0`。
- `riverCellShare / riverOutletCount / closedBasinDrainageShare` 稳定。
- 浏览器 debug 河网可解释，无断裂/棋盘。

### 3.5 Watershed / drainage basin labeling

**用途**：把每个陆地 cell 归属到出口、内流盆地或分水岭系统。

**GPU 可行方案**：沿 flowTarget 做 label propagation，直到所有 cell 收敛到 outlet/sink label。

**风险**：

- 需要处理 sink、lake candidate、endorheic basin、river outlet 的优先级。
- label propagation pass 数与最长流路相关，可能比 CPU 慢。
- label 稳定性和可调试性差。

**建议**：低优先级，只适合作为研究项。

## 4. 推荐路线

1. **继续保留 CPU 图算法默认路径**：`externalSeaMask / closedBasinId / flowAccumulation / drainageBasinId / watershedId` 不默认 GPU 化。
2. **先优化已验证 GPU dense/stencil 路径**：尤其是减少 `isostasy` experimental 的 readback，当前浏览器总 GPU 路径约 14s，不具备默认启用条件。
3. **第一批图算法 candidate 只选距离场**：`coastDistance / externalSeaDistance / marginDistance`，只读 compare，不写回。
4. **第二批才评估外海可达性 mask**：只做 `externalSeaMask` candidate，不做 `closedBasinId` 编号写回。
5. **水文图算法继续 CPU**：除非 profiling 证明它成为主瓶颈，并且已有可靠 debug/render 验收。

## 5. 浏览器验证要求

任何图算法 GPU candidate 至少需要：

```powershell
node .\tools\bundle-app.mjs
node --check .\src\app.js
Select-String -Path .\src\app.js -Pattern '^\s*export\s|^\s*import\s'
node .\tools\interface-check.mjs '龙骨海-纪元7' 20 geology-v2 256x128
node .\tools\browser-smoke-check.mjs --mode file --steps 1 --wait-ms 8000 --query "renderBackend=cpu" --require-perf-summary
node .\tools\browser-smoke-check.mjs --mode http --steps 1 --wait-ms 30000 --query "gpuCompute=validate&gpuKernel=<graph-candidate>&gpuValidateInterval=1&gpuValidateReports=1&renderBackend=cpu" --require-validation --require-perf-summary
```

图算法 candidate 额外要求：

- Console 无项目自身 `Uncaught / TypeError / SyntaxError / Cannot read properties / NaN / Infinity`。
- debug 图层能显示 CPU/GPU mismatch 或 risk mask。
- 20 / 200 Myr 至少两档检查；若影响海陆、水文或裂谷连通，必须加 739 Myr。
- cubed-sphere 未适配时必须 safe skip，不能复用矩形邻域。

## 6. 是否建议迁移汇总

| 算法 | 建议 | 优先级 | 进入条件 |
|---|---|---:|---|
| Margin/coast distance field | 做 candidate | P2 | CPU/GPU distance mask mismatch 很低，cubed-sphere 有 adjacency buffer |
| External sea reachable mask | 只做 candidate | P3 | 可解释外海 seed，mismatch 极低，debug 图完整 |
| Closed basin component id | 暂缓 | P4 | external sea candidate 稳定后再考虑 |
| Landmass/island id | 暂缓 | P4 | 资源/生态阶段证明瓶颈后再做 |
| Hydrology flow accumulation | 不建议近期迁移 | P5 | CPU profiling 证明瓶颈且有独立河网验收 |
| Watershed/drainage basin id | 不建议近期迁移 | P5 | flow accumulation GPU 稳定之后才可研究 |

## 7. 下一步建议

- 立即下一步不应是图算法 GPU 化，而应是优化 `isostasy` experimental 的 readback：减少下载字段、批量合并 validate、降低 validate 频率，或把多个 dense kernel 合批。
- 若仍要推进图算法研究，建议先新增 `tools/gpu-graph-candidate-check.mjs` 的空框架，只支持 CPU baseline + safe skip，再接入 `distance-field` candidate。
- 所有图算法相关字段必须继续在公共接口中由 CPU 权威路径提供，直到 candidate 通过浏览器、long-run、resolution 和 debug-render 的完整门禁。
