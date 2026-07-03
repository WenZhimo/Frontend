import {
  createCubedSphereProductionGridAdapter,
  productionAdapterFieldNames,
  summarizeProductionGridAdapter,
} from "../src/sim/sphere/productionGridAdapter.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 64)));
const grid = createCubedSphereProductionGridAdapter({ faceSize });
const summary = summarizeProductionGridAdapter(grid);
const firstCellNeighbors = [];
grid.topology.forEachNeighbor(0, (id, slot, edgeLength) => {
  firstCellNeighbors.push({ id, slot, edgeLength });
});

const result = {
  valid: true,
  ...summary,
  fieldNames: productionAdapterFieldNames(),
  firstCellNeighbors,
  notes: [
    "adapter is intentionally not wired into createWorld yet",
    "production sphere migration must use cell ids and topology graph access, not y * width + x indexing",
  ],
};

if (summary.kind !== "cubed-sphere-production-grid-adapter") result.valid = false;
if (summary.topologyKind !== "cubed-sphere") result.valid = false;
if (summary.topologyApiKind !== "cubed-sphere") result.valid = false;
if (summary.size !== 6 * faceSize * faceSize) result.valid = false;
if (summary.cellCount !== summary.size) result.valid = false;
if (summary.faceSize !== faceSize) result.valid = false;
if (summary.faceCount !== 6) result.valid = false;
if (summary.hasLegacyDimensions) result.valid = false;
if (summary.rectangularIndexing) result.valid = false;
if (!summary.graphBacked) result.valid = false;
if (summary.areaTotalError > 1e-5) result.valid = false;
if (Math.abs(summary.areaStats.areaTotalError) > 1e-5) result.valid = false;
if (!(summary.areaStats.areaMin > 0 && summary.areaStats.areaMax > summary.areaStats.areaMin)) result.valid = false;
if (Math.abs(summary.hemisphereAreaStats.northAreaShare - 0.5) > 0.01) result.valid = false;
if (Math.abs(summary.hemisphereAreaStats.southAreaShare - 0.5) > 0.01) result.valid = false;
if (!Number.isFinite(summary.statsProbe.weightedSum)) result.valid = false;
if (!Number.isFinite(summary.statsProbe.weightedMean)) result.valid = false;
if (Math.abs(summary.statsProbe.northShare - 0.5) > 0.01) result.valid = false;
if (Math.abs(summary.statsProbe.categoryShareTotal - 1) > 1e-9) result.valid = false;
if (Math.abs(summary.statsProbe.categoryTotalArea - 4 * Math.PI) > 1e-5) result.valid = false;
if (!(summary.connectivityProbe.seaShare > 0.1 && summary.connectivityProbe.seaShare < 0.9)) result.valid = false;
if (summary.connectivityProbe.componentCount < 2) result.valid = false;
if (summary.connectivityProbe.externalSeaShare <= summary.connectivityProbe.inlandWaterCandidateShare) result.valid = false;
if (summary.connectivityProbe.closedBasinCount < 1) result.valid = false;
if (summary.connectivityProbe.closedBasinCount !== summary.connectivityProbe.closedBasinIdMax) result.valid = false;
if (summary.connectivityProbe.distanceFiniteShare !== 1) result.valid = false;
if (!summary.connectivityProbe.largestComponentIsExternal) result.valid = false;
if (!summary.allFieldsMatchSize) result.valid = false;
if (!summary.neighborSymmetryValid) result.valid = false;
if (firstCellNeighbors.length < 2 || firstCellNeighbors.length > 4) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
