import {
  createCubedSphereProductionGridAdapter,
  productionAdapterFieldNames,
  summarizeProductionGridAdapter,
} from "../src/sim/sphere/productionGridAdapter.js";
import { measureTopologyDiagnostics } from "../src/sim/topology.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 64)));
const grid = createCubedSphereProductionGridAdapter({ faceSize });
const legacyDimensionAttempt = createCubedSphereProductionGridAdapter({
  faceSize,
  includeLegacyDimensions: true,
});
const summary = summarizeProductionGridAdapter(grid);
const topologyDiagnostics = measureTopologyDiagnostics({ grid });
const firstCellNeighbors = [];
grid.topology.forEachNeighbor(0, (id, slot, edgeLength) => {
  firstCellNeighbors.push({ id, slot, edgeLength });
});

const result = {
  valid: true,
  ...summary,
  topologyDiagnostics,
  legacyDimensionAttempt: {
    hasWidth: Object.hasOwn(legacyDimensionAttempt, "width"),
    hasHeight: Object.hasOwn(legacyDimensionAttempt, "height"),
    rectangularIndexing: Boolean(legacyDimensionAttempt.topologyOptions?.rectangularIndexing),
  },
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
if (result.legacyDimensionAttempt.hasWidth || result.legacyDimensionAttempt.hasHeight) result.valid = false;
if (result.legacyDimensionAttempt.rectangularIndexing) result.valid = false;
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
if (!summary.fieldSummaries || Object.keys(summary.fieldSummaries).length !== summary.fieldCount) result.valid = false;
for (const name of result.fieldNames) {
  const field = summary.fieldSummaries?.[name];
  if (!field) result.valid = false;
  else {
    if (field.finiteShare !== 1) result.valid = false;
    if (field.finiteCount !== summary.size) result.valid = false;
    if (!Number.isFinite(field.weightedMean)) result.valid = false;
    if (!Number.isFinite(field.sampledArea) || Math.abs(field.sampledArea - 4 * Math.PI) > 1e-5) {
      result.valid = false;
    }
  }
}
if (!(summary.fieldSummaries.diagnosticElevation.max > summary.fieldSummaries.diagnosticElevation.min)) {
  result.valid = false;
}
if (!(summary.fieldSummaries.externalSeaMask.nonZeroShare > 0.1)) result.valid = false;
if (!(summary.fieldSummaries.inlandWaterCandidate.nonZeroShare > 0)) result.valid = false;
if (!(summary.connectivityProbe.seaShare > 0.1 && summary.connectivityProbe.seaShare < 0.9)) result.valid = false;
if (summary.connectivityProbe.componentCount < 2) result.valid = false;
if (summary.connectivityProbe.externalSeaShare <= summary.connectivityProbe.inlandWaterCandidateShare) result.valid = false;
if (summary.connectivityProbe.closedBasinCount < 1) result.valid = false;
if (summary.connectivityProbe.closedBasinCount !== summary.connectivityProbe.closedBasinIdMax) result.valid = false;
if (summary.connectivityProbe.distanceFiniteShare !== 1) result.valid = false;
if (!summary.connectivityProbe.largestComponentIsExternal) result.valid = false;
if (!summary.diagnosticTerrainProbe.hasDiagnosticTerrain) result.valid = false;
if (!(summary.diagnosticTerrainProbe.seaCandidateShare > 0.45 && summary.diagnosticTerrainProbe.seaCandidateShare < 0.7)) result.valid = false;
if (summary.diagnosticTerrainProbe.externalSeaShare <= summary.diagnosticTerrainProbe.inlandWaterCandidateShare) result.valid = false;
if (summary.diagnosticTerrainProbe.closedBasinCount < 1) result.valid = false;
if (summary.diagnosticTerrainProbe.distanceFiniteShare !== 1) result.valid = false;
if (!Number.isFinite(summary.diagnosticTerrainProbe.elevationMean)) result.valid = false;
if (!(summary.diagnosticTerrainProbe.ridgeCandidateMean > 0)) result.valid = false;
if (!(summary.diagnosticTerrainProbe.trenchCandidateMean > 0)) result.valid = false;
if (!Number.isFinite(summary.diagnosticTerrainProbe.noiseCombinedMean)) result.valid = false;
if (!summary.allFieldsMatchSize) result.valid = false;
if (!summary.neighborSymmetryValid) result.valid = false;
if (firstCellNeighbors.length < 2 || firstCellNeighbors.length > 4) result.valid = false;
if (topologyDiagnostics.topologyKind !== "cubed-sphere") result.valid = false;
if (!topologyDiagnostics.graphBacked) result.valid = false;
if (!topologyDiagnostics.neighborConsistencyValid) result.valid = false;
if (!topologyDiagnostics.floodFillTopologyValid) result.valid = false;
if (!topologyDiagnostics.connectedComponentTopologyValid) result.valid = false;
if (topologyDiagnostics.topologyManualAccessRisk !== 0) result.valid = false;
if (topologyDiagnostics.topologyMigrationCoverage !== 1) result.valid = false;
if (topologyDiagnostics.areaTotalError > 1e-5) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
