import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbiddenPatterns = [
  { name: "grid.width", regex: /\bgrid\.width\b/g },
  { name: "grid.height", regex: /\bgrid\.height\b/g },
  { name: "y_times_width_plus_x", regex: /\by\s*\*\s*width\s*\+\s*x\b/g },
  { name: "ny_times_width_plus_nx", regex: /\bny\s*\*\s*width\s*\+\s*nx\b/g },
  { name: "id_mod_grid_width", regex: /\b\w+\s*%\s*grid\.width\b/g },
  { name: "id_div_grid_width", regex: /Math\.floor\(\s*\w+\s*\/\s*grid\.width\s*\)/g },
];

const helperDependencyPatterns = [
  { name: "indexOf", regex: /\bindexOf\s*\(/g },
  { name: "xyOf", regex: /\bxyOf\s*\(/g },
  { name: "sampleGridWrapped", regex: /\bsampleGridWrapped\s*\(/g },
  { name: "sampleGridBilinear", regex: /\bsampleGridBilinear\s*\(/g },
  { name: "gridParamWidth", regex: /\bgridParamWidth\s*\(/g },
  { name: "gridParamHeight", regex: /\bgridParamHeight\s*\(/g },
  { name: "wrapGridParamX", regex: /\bwrapGridParamX\s*\(/g },
  { name: "gridParamToU", regex: /\bgridParamToU\s*\(/g },
  { name: "gridParamToV", regex: /\bgridParamToV\s*\(/g },
];

const sphericalProductionPaths = [
  "src/sim/sphere",
];

const allowedSphericalMatches = [];

const legacyMigrationScopes = [
  "src/sim/geology",
  "src/sim/derived",
  "src/sim/tectonics.js",
  "src/sim/terrain.js",
  "src/sim/hydrology.js",
  "src/sim/scale.js",
];

const topologyAwareLegacyFiles = new Set([
  "src/sim/scale.js",
]);

const guardedCoreHelperFile = "src/sim/grid.js";
const guardedCoreHelpers = [
  "gridParamWidth",
  "gridParamHeight",
  "wrapGridParamX",
  "clampGridParamY",
  "gridParamToU",
  "gridParamToV",
  "forEachNeighbor4",
  "indexOf",
  "xyOf",
  "sampleGrid",
  "sampleGridWrapped",
  "sampleGridBilinear",
];

const renderRectangularGuardSpecs = [
  {
    name: "webglRendererRejectsGraphBackedGrid",
    file: "src/render/gpuMapRenderer.js",
    pattern:
      /if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*\)\s*\)\s*\{[\s\S]*?only accepts rectangular grids[\s\S]*?ensureSize\s*\(\s*grid\.width\s*,\s*grid\.height\s*\)/,
  },
  {
    name: "renderBackendRoutesSphericalToCpuProjection",
    file: "src/render/renderBackend.js",
    pattern:
      /if\s*\(\s*isGraphBackedGrid\s*\(\s*world\.grid\s*\)\s*\)\s*\{[\s\S]*?cpuRenderer\.render\s*\(\s*world\s*\)[\s\S]*?world\.renderBackend\s*=\s*["']cpu-spherical-projection["']/,
  },
  {
    name: "cpuRendererUsesProjectionForGraphBackedGrid",
    file: "src/render/cpuMapRenderer.js",
    pattern:
      /if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*\)\s*\)\s*\{[\s\S]*?renderSphericalWorld\s*\(\s*world\s*\)[\s\S]*?renderRectangularWorld\s*\(\s*world\s*\)/,
  },
  {
    name: "renderCheckProjectsGraphBackedGrid",
    file: "tools/render-check.mjs",
    pattern:
      /if\s*\(\s*isGraphBackedGrid\s*\(\s*world\.grid\s*\)\s*\)\s*\{[\s\S]*?renderSphericalField[\s\S]*?cpu-spherical-projection-reference[\s\S]*?world\.grid\.width/,
  },
  {
    name: "gpuRenderCheckSkipsGraphBackedWebgl",
    file: "tools/gpu-render-check.mjs",
    pattern:
      /reason:\s*isGraphBackedGrid\s*\(\s*world\.grid\s*\)[\s\S]*?renderSphericalField[\s\S]*?world\.grid\.width/,
  },
  {
    name: "debugRenderProjectsGraphBackedGrid",
    file: "tools/geology-debug-render.mjs",
    pattern:
      /if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*\)\s*\)\s*\{[\s\S]*?writeProjectedPpm\s*\(\s*currentWorld\s*,\s*output\s*,\s*colorFn\s*\)[\s\S]*?grid\.width\s*\*\s*grid\.height/,
  },
];

const scaleTopologyGuardSpecs = [
  {
    name: "resolutionScaleUsesFaceSizeForCubedSphere",
    file: "src/sim/scale.js",
    pattern:
      /function\s+resolutionScale\s*\(\s*grid\s*\)\s*\{[\s\S]*?topologyKind\s*===\s*["']cubed-sphere["'][\s\S]*?grid\.faceSize[\s\S]*?REFERENCE_CUBED_SPHERE_FACE_SIZE[\s\S]*?grid\.width\s*\/\s*REFERENCE_WIDTH/,
  },
  {
    name: "cellCenterURequiresRectangularWidth",
    file: "src/sim/scale.js",
    pattern:
      /function\s+cellCenterU\s*\(\s*grid\s*,\s*x\s*\)\s*\{[\s\S]*?!Number\.isFinite\s*\(\s*grid\.width\s*\)[\s\S]*?requires a rectangular grid width[\s\S]*?grid\.width/,
  },
  {
    name: "cellCenterVRequiresRectangularHeight",
    file: "src/sim/scale.js",
    pattern:
      /function\s+cellCenterV\s*\(\s*grid\s*,\s*y\s*\)\s*\{[\s\S]*?!Number\.isFinite\s*\(\s*grid\.height\s*\)[\s\S]*?requires a rectangular grid height[\s\S]*?grid\.height/,
  },
  {
    name: "spherePointForCellRejectsCubedSphere",
    file: "src/sim/scale.js",
    pattern:
      /function\s+spherePointForCell\s*\(\s*grid\s*,\s*x\s*,\s*y\s*\)\s*\{[\s\S]*?topologyKind\s*===\s*["']cubed-sphere["'][\s\S]*?only valid for rectangular grids[\s\S]*?cellCenterU\s*\(\s*grid\s*,\s*x\s*\)/,
  },
];

const topologyDiagnosticGuardSpecs = [
  {
    name: "topologyForGridRoutesCubedSphereToGraphTopology",
    file: "src/sim/topology.js",
    pattern:
      /export\s+function\s+topologyForGrid\s*\(\s*grid\s*\)\s*\{[\s\S]*?grid\.topologyKind\s*===\s*["']cubed-sphere["'][\s\S]*?createSphericalTopology\s*\(\s*grid\s*\)[\s\S]*?createTopology\s*\(\s*grid\.width\s*,\s*grid\.height\s*,\s*grid\.topologyOptions\s*\)/,
  },
  {
    name: "measureTopologyDiagnosticsRoutesGraphBackedToGraphDiagnostics",
    file: "src/sim/topology.js",
    pattern:
      /export\s+function\s+measureTopologyDiagnostics\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedTopology\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*return\s+measureGraphTopologyDiagnostics\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?grid\.width/,
  },
  {
    name: "graphTopologyDiagnosticsReportsNoManualRectangularAccess",
    file: "src/sim/topology.js",
    pattern:
      /function\s+measureGraphTopologyDiagnostics\s*\(\s*grid\s*,\s*topology\s*\)\s*\{[\s\S]*?topologyManualAccessRisk\s*:\s*0\s*,[\s\S]*?topologyMigrationCoverage\s*:\s*1\s*,/,
  },
];

const resolutionSamplingGuardSpecs = [
  {
    name: "resolutionCheckRoutesGraphBackedToProjectedSampling",
    file: "tools/resolution-check.mjs",
    pattern:
      /function\s+sampleWorld\s*\(\s*world\s*,\s*width\s*,\s*height\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*world\.grid\s*\)\s*\)\s*return\s+sampleProjectedWorld\s*\(\s*world\s*,\s*width\s*,\s*height\s*\)[\s\S]*?return\s+sampleRectangularWorld\s*\(\s*world\s*,\s*width\s*,\s*height\s*\)/,
  },
  {
    name: "resolutionCheckProjectedSamplingUsesVectorNearestCell",
    file: "tools/resolution-check.mjs",
    pattern:
      /function\s+sampleProjectedWorld\s*\(\s*world\s*,\s*width\s*,\s*height\s*\)\s*\{[\s\S]*?projectionSampleToVec3\s*\(\s*x\s*,\s*y\s*,\s*width\s*,\s*height\s*,\s*projectionMode\s*\)[\s\S]*?nearestCellByVector\s*\(\s*world\.grid\s*,\s*sample\.x\s*,\s*sample\.y\s*,\s*sample\.z\s*\)[\s\S]*?function\s+sampleRectangularWorld/,
  },
  {
    name: "resolutionGateUsesProjectedWorldSamples",
    file: "tools/spherical-resolution-gate-check.mjs",
    pattern:
      /const\s+baseline\s*=\s*sampleProjectedWorld\s*\(\s*baselineWorld\s*,\s*sampleWidth\s*,\s*sampleHeight\s*,\s*projectionMode\s*\)[\s\S]*?const\s+sample\s*=\s*sampleProjectedWorld\s*\(\s*world\s*,\s*sampleWidth\s*,\s*sampleHeight\s*,\s*projectionMode\s*\)/,
  },
];

const projectionOutputIndexGuardSpecs = [
  {
    name: "sphericalRendererIndexesProjectionOutputPixelsOnly",
    file: "src/render/sphericalProjectionRenderer.js",
    pattern:
      /export\s+function\s+renderSphericalField\s*\(\s*grid\s*,\s*field\s*,\s*options\s*=\s*\{\}\s*\)\s*\{[\s\S]*?const\s+pixels\s*=\s*new\s+Uint8ClampedArray\s*\(\s*width\s*\*\s*height\s*\*\s*4\s*\)[\s\S]*?const\s+offset\s*=\s*\(\s*y\s*\*\s*width\s*\+\s*x\s*\)\s*\*\s*4[\s\S]*?projectionSampleToVec3\s*\(\s*x\s*,\s*y\s*,\s*width\s*,\s*height\s*,\s*projectionMode\s*,\s*options\s*\)[\s\S]*?nearestCellByVector\s*\(\s*grid\s*,\s*sample\.x\s*,\s*sample\.y\s*,\s*sample\.z\s*\)/,
  },
  {
    name: "sphericalResolutionGateIndexesProjectedSamplesOnly",
    file: "tools/spherical-resolution-gate-check.mjs",
    pattern:
      /function\s+sampleProjectedWorld\s*\(\s*world\s*,\s*width\s*,\s*height\s*,\s*projectionMode\s*\)\s*\{[\s\S]*?const\s+land\s*=\s*new\s+Uint8Array\s*\(\s*size\s*\)[\s\S]*?const\s+id\s*=\s*y\s*\*\s*width\s*\+\s*x[\s\S]*?projectionSampleToVec3\s*\(\s*x\s*,\s*y\s*,\s*width\s*,\s*height\s*,\s*projectionMode\s*\)[\s\S]*?nearestCellByVector\s*\(\s*world\.grid\s*,\s*sample\.x\s*,\s*sample\.y\s*,\s*sample\.z\s*\)/,
  },
  {
    name: "sphericalResolutionGateCoastlineIndexesProjectedSampleOnly",
    file: "tools/spherical-resolution-gate-check.mjs",
    pattern:
      /function\s+measureCoastline\s*\(\s*land\s*,\s*width\s*,\s*height\s*\)\s*\{[\s\S]*?const\s+id\s*=\s*y\s*\*\s*width\s*\+\s*x[\s\S]*?const\s+right\s*=\s*y\s*\*\s*width\s*\+\s*wrapX\s*\(\s*width\s*,\s*x\s*\+\s*1\s*\)[\s\S]*?return\s+edges\s*\/\s*Math\.max\s*\(\s*1\s*,\s*land\.length\s*\)/,
  },
  {
    name: "geologyDebugRenderIndexesProjectedPpmPixelsOnly",
    file: "tools/geology-debug-render.mjs",
    pattern:
      /function\s+writeProjectedPpm\s*\(\s*currentWorld\s*,\s*output\s*,\s*colorFn\s*\)\s*\{[\s\S]*?const\s+bytes\s*=\s*Buffer\.alloc\s*\(\s*width\s*\*\s*height\s*\*\s*3\s*\)[\s\S]*?const\s+pixel\s*=\s*y\s*\*\s*width\s*\+\s*x[\s\S]*?projectionSampleToVec3\s*\(\s*x\s*,\s*y\s*,\s*width\s*,\s*height\s*,\s*projectionMode\s*\)[\s\S]*?nearestCellByVector\s*\(\s*grid\s*,\s*sample\.x\s*,\s*sample\.y\s*,\s*sample\.z\s*\)/,
  },
  {
    name: "sphericalRenderCheckWritesProjectedPixelsOnly",
    file: "tools/spherical-render-check.mjs",
    pattern:
      /const\s+rendered\s*=\s*createRenderedLayer\s*\(\s*\{\s*grid\s*,\s*world\s*,\s*adapter\s*,\s*mode\s*,\s*width\s*,\s*height\s*,\s*projectionMode\s*\}\s*\)[\s\S]*?writePpm\s*\(\s*output\s*,\s*rendered\.pixels\s*,\s*width\s*,\s*height\s*\)[\s\S]*?function\s+writePpm\s*\(\s*path\s*,\s*pixels\s*,\s*width\s*,\s*height\s*\)\s*\{[\s\S]*?const\s+bytes\s*=\s*Buffer\.alloc\s*\(\s*width\s*\*\s*height\s*\*\s*3\s*\)[\s\S]*?pixels\s*\[\s*i\s*\*\s*4\s*\]/,
  },
  {
    name: "renderCheckRectangularRgbOutputIsLegacyFallback",
    file: "tools/render-check.mjs",
    pattern:
      /function\s+renderElevationReference\s*\(\s*world\s*,\s*params\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*world\.grid\s*\)\s*\)\s*\{[\s\S]*?renderSphericalField\s*\(\s*world\.grid\s*,\s*world\.grid\.elev[\s\S]*?backend\s*:\s*["']cpu-spherical-projection-reference["'][\s\S]*?return\s*\{[\s\S]*?width\s*:\s*world\.grid\.width[\s\S]*?bytes\s*:\s*renderRectangularElevationToRgbBytes\s*\(\s*world\s*\)[\s\S]*?function\s+renderRectangularElevationToRgbBytes\s*\(\s*world\s*\)\s*\{[\s\S]*?Buffer\.alloc\s*\(\s*grid\.width\s*\*\s*grid\.height\s*\*\s*3\s*\)/,
  },
  {
    name: "gpuRenderCheckRectangularRgbOutputIsLegacyFallback",
    file: "tools/gpu-render-check.mjs",
    pattern:
      /function\s+renderElevationReference\s*\(\s*world\s*,\s*topologyOptions\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*world\.grid\s*\)\s*\)\s*\{[\s\S]*?renderSphericalField\s*\(\s*world\.grid\s*,\s*world\.grid\.elev[\s\S]*?return\s*\{[\s\S]*?width\s*:\s*world\.grid\.width[\s\S]*?bytes\s*:\s*renderRectangularElevationToRgbBytes\s*\(\s*world\s*\)[\s\S]*?function\s+renderRectangularElevationToRgbBytes\s*\(\s*world\s*\)\s*\{[\s\S]*?Buffer\.alloc\s*\(\s*grid\.width\s*\*\s*grid\.height\s*\*\s*3\s*\)/,
  },
];

const legacyFallbackIndexGuardSpecs = [
  {
    name: "forEachNeighbor4IdToXyFallbackRequiresRectangularGrid",
    file: "src/sim/grid.js",
    pattern:
      /export\s+function\s+forEachNeighbor4\s*\(\s*grid\s*,\s*x\s*,\s*y\s*,\s*visit\s*\)\s*\{[\s\S]*?assertRectangularGrid\s*\(\s*grid\s*,\s*["']forEachNeighbor4["']\s*\)[\s\S]*?nid\s*%\s*grid\.width[\s\S]*?Math\.floor\s*\(\s*nid\s*\/\s*grid\.width\s*\)/,
  },
  {
    name: "gridTopologyHelperCheckExercisesLegacyRectangularHelpers",
    file: "tools/grid-topology-helper-check.mjs",
    pattern:
      /const\s+sizes\s*=\s*\[[\s\S]*?\[\s*8\s*,\s*4\s*\][\s\S]*?createGrid\s*\(\s*width\s*,\s*height\s*\)[\s\S]*?wrapXMatchesLegacy:\s*wrapX\s*\(\s*grid\.width[\s\S]*?indexMatchesTopology:[\s\S]*?top\.index\s*\(\s*grid\.width\s*-\s*1\s*,\s*1\s*\)[\s\S]*?checkGraphGridHelpers\s*\(\s*grid\s*\)/,
  },
];

const graphRoutedLegacyFiles = new Map([
  [
    "src/sim/tectonics.js",
    {
      reason: "assignPlates routes graph-backed worlds to spherical plates before the legacy raster tectonics helpers",
      patterns: new Set(["indexOf", "sampleGridBilinear", "xyOf"]),
    },
  ],
]);

const sphericalMatches = scanPaths(sphericalProductionPaths).filter((match) => {
  return !isAllowedSphericalMatch(match);
});
const legacyMatches = scanPaths(legacyMigrationScopes).filter((match) => {
  return !topologyAwareLegacyFiles.has(match.file);
});
const legacyHelperMatches = scanPaths(legacyMigrationScopes, helperDependencyPatterns).filter((match) => {
  return !topologyAwareLegacyFiles.has(match.file);
});
const classifiedLegacyHelperMatches = legacyHelperMatches.map(classifyHelperMatch);
const sphericalByFile = summarizeByFile(sphericalMatches);
const legacyByFile = summarizeByFile(legacyMatches);
const legacyHelperByFile = summarizeByFile(legacyHelperMatches);
const legacyFallbackHelperMatches = classifiedLegacyHelperMatches.filter((match) => match.classification === "legacyFallback");
const guardedHelperMatches = classifiedLegacyHelperMatches.filter((match) => match.classification === "guardedHelper");
const possibleSphericalPathHelperMatches = classifiedLegacyHelperMatches.filter((match) => match.classification === "possibleSphericalPath");
const graphRoutedFallbackMatches = legacyFallbackHelperMatches.filter((match) => match.routeKind === "graphRoutedFile");
const explicitLegacyWrapperMatches = legacyFallbackHelperMatches.filter((match) => match.routeKind === "explicitLegacyFunction");
const graphBranchFallbackMatches = legacyFallbackHelperMatches.filter((match) => match.routeKind === "graphBranchFallback");
const migrationHelperRiskMatches = classifiedLegacyHelperMatches.filter((match) => {
  return !(match.classification === "legacyFallback" && match.routeKind === "explicitLegacyFunction");
});
const legacyFallbackHelperByFile = summarizeByFile(legacyFallbackHelperMatches);
const guardedHelperByFile = summarizeByFile(guardedHelperMatches);
const possibleSphericalPathHelperByFile = summarizeByFile(possibleSphericalPathHelperMatches);
const graphRoutedFallbackByFile = summarizeByFile(graphRoutedFallbackMatches);
const explicitLegacyWrapperByFile = summarizeByFile(explicitLegacyWrapperMatches);
const graphBranchFallbackByFile = summarizeByFile(graphBranchFallbackMatches);
const migrationHelperRiskByFile = summarizeByFile(migrationHelperRiskMatches);
const coreHelperGuardStatus = measureCoreHelperGuards();
const coreRectangularHelperGuardReady = coreHelperGuardStatus.missing.length === 0;
const renderGuardStatus = measureRenderRectangularGuards();
const renderRectangularPathGuardReady = renderGuardStatus.missing.length === 0;
const scaleGuardStatus = measureScaleTopologyGuards();
const scaleTopologyGuardReady = scaleGuardStatus.missing.length === 0;
const topologyDiagnosticGuardStatus = measureTopologyDiagnosticGuards();
const topologyDiagnosticGuardReady = topologyDiagnosticGuardStatus.missing.length === 0;
const resolutionSamplingGuardStatus = measureResolutionSamplingGuards();
const resolutionSamplingGuardReady = resolutionSamplingGuardStatus.missing.length === 0;
const projectionOutputIndexGuardStatus = measureProjectionOutputIndexGuards();
const projectionOutputIndexGuardReady = projectionOutputIndexGuardStatus.missing.length === 0;
const legacyFallbackIndexGuardStatus = measureLegacyFallbackIndexGuards();
const legacyFallbackIndexGuardReady = legacyFallbackIndexGuardStatus.missing.length === 0;

const productionAdapterReady = sphericalMatches.length === 0;
const fullMigrationReady = legacyMatches.length === 0;
const helperMigrationReady = migrationHelperRiskMatches.length === 0;
const result = {
  valid:
    productionAdapterReady &&
    helperMigrationReady &&
    coreRectangularHelperGuardReady &&
    renderRectangularPathGuardReady &&
    scaleTopologyGuardReady &&
    topologyDiagnosticGuardReady &&
    resolutionSamplingGuardReady &&
    projectionOutputIndexGuardReady &&
    legacyFallbackIndexGuardReady,
  productionAdapterReady,
  fullMigrationReady,
  helperMigrationReady,
  coreRectangularHelperGuardReady,
  coreRectangularHelperGuardCount: coreHelperGuardStatus.guarded.length,
  coreRectangularHelperGuardMissing: coreHelperGuardStatus.missing,
  guardedCoreRectangularHelpers: coreHelperGuardStatus.guarded,
  renderRectangularPathGuardReady,
  renderRectangularPathGuardCount: renderGuardStatus.guarded.length,
  renderRectangularPathGuardMissing: renderGuardStatus.missing,
  guardedRenderRectangularPaths: renderGuardStatus.guarded,
  scaleTopologyGuardReady,
  scaleTopologyGuardCount: scaleGuardStatus.guarded.length,
  scaleTopologyGuardMissing: scaleGuardStatus.missing,
  guardedScaleTopologyPaths: scaleGuardStatus.guarded,
  topologyDiagnosticGuardReady,
  topologyDiagnosticGuardCount: topologyDiagnosticGuardStatus.guarded.length,
  topologyDiagnosticGuardMissing: topologyDiagnosticGuardStatus.missing,
  guardedTopologyDiagnosticPaths: topologyDiagnosticGuardStatus.guarded,
  resolutionSamplingGuardReady,
  resolutionSamplingGuardCount: resolutionSamplingGuardStatus.guarded.length,
  resolutionSamplingGuardMissing: resolutionSamplingGuardStatus.missing,
  guardedResolutionSamplingPaths: resolutionSamplingGuardStatus.guarded,
  projectionOutputIndexGuardReady,
  projectionOutputIndexGuardCount: projectionOutputIndexGuardStatus.guarded.length,
  projectionOutputIndexGuardMissing: projectionOutputIndexGuardStatus.missing,
  guardedProjectionOutputIndexPaths: projectionOutputIndexGuardStatus.guarded,
  legacyFallbackIndexGuardReady,
  legacyFallbackIndexGuardCount: legacyFallbackIndexGuardStatus.guarded.length,
  legacyFallbackIndexGuardMissing: legacyFallbackIndexGuardStatus.missing,
  guardedLegacyFallbackIndexPaths: legacyFallbackIndexGuardStatus.guarded,
  sphericalForbiddenCount: sphericalMatches.length,
  sphericalForbiddenFiles: Object.keys(sphericalByFile).length,
  legacyRiskCount: legacyMatches.length,
  legacyRiskFiles: Object.keys(legacyByFile).length,
  legacyDirectRectangularRiskCount: legacyMatches.length,
  legacyDirectRectangularRiskFiles: Object.keys(legacyByFile).length,
  legacyHelperRawCount: legacyHelperMatches.length,
  legacyHelperRawFiles: Object.keys(legacyHelperByFile).length,
  legacyHelperRiskCount: migrationHelperRiskMatches.length,
  legacyHelperRiskFiles: Object.keys(migrationHelperRiskByFile).length,
  migrationHelperRiskCount: migrationHelperRiskMatches.length,
  migrationHelperRiskFiles: Object.keys(migrationHelperRiskByFile).length,
  legacyFallbackHelperCount: legacyFallbackHelperMatches.length,
  legacyFallbackHelperFiles: Object.keys(legacyFallbackHelperByFile).length,
  graphRoutedFallbackCount: graphRoutedFallbackMatches.length,
  graphRoutedFallbackFiles: Object.keys(graphRoutedFallbackByFile).length,
  explicitLegacyWrapperCount: explicitLegacyWrapperMatches.length,
  explicitLegacyWrapperFiles: Object.keys(explicitLegacyWrapperByFile).length,
  graphBranchFallbackCount: graphBranchFallbackMatches.length,
  graphBranchFallbackFiles: Object.keys(graphBranchFallbackByFile).length,
  guardedHelperCount: guardedHelperMatches.length,
  guardedHelperFiles: Object.keys(guardedHelperByFile).length,
  possibleSphericalPathHelperCount: possibleSphericalPathHelperMatches.length,
  possibleSphericalPathHelperFiles: Object.keys(possibleSphericalPathHelperByFile).length,
  topologyAwareLegacyFiles: Array.from(topologyAwareLegacyFiles).sort(),
  topLegacyRiskFiles: Object.entries(legacyByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topLegacyHelperRiskFiles: Object.entries(migrationHelperRiskByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topLegacyHelperRawFiles: Object.entries(legacyHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topMigrationHelperRiskFiles: Object.entries(migrationHelperRiskByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topPossibleSphericalPathHelperFiles: Object.entries(possibleSphericalPathHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topLegacyFallbackHelperFiles: Object.entries(legacyFallbackHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topGraphRoutedFallbackFiles: Object.entries(graphRoutedFallbackByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topExplicitLegacyWrapperFiles: Object.entries(explicitLegacyWrapperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topGraphBranchFallbackFiles: Object.entries(graphBranchFallbackByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  topGuardedHelperFiles: Object.entries(guardedHelperByFile)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([file, summary]) => ({ file, count: summary.count, patterns: summary.patterns })),
  notes: [
    "valid means the spherical production adapter boundary is clean and no unclassified possible spherical-path helpers remain",
    fullMigrationReady
      ? "fullMigrationReady means scanned legacy migration scopes have no unclassified rectangular-indexing risks"
      : "fullMigrationReady remains false while scanned legacy migration scopes still contain rectangular-indexing risks",
    helperMigrationReady
      ? "helperMigrationReady means no non-wrapper or unclassified topology helper usage remains on scanned migration paths"
      : "helperMigrationReady is false while migrationHelperRiskCount is non-zero",
    "legacyHelperRawCount tracks all scanned topology helper usage; explicitLegacyWrapperCount tracks legacy compatibility wrappers",
    "legacyHelperRiskCount and migrationHelperRiskCount exclude explicit legacy wrapper bodies; possibleSphericalPathHelperCount is one risk subtype",
    "coreRectangularHelperGuardReady means src/sim/grid.js rectangular coordinate helpers fail fast on graph-backed cubed-sphere grids",
    "renderRectangularPathGuardReady means rectangular render/WebGL paths explicitly route or reject graph-backed cubed-sphere grids before grid.width/grid.height usage",
    "scaleTopologyGuardReady means resolution scaling uses cubed-sphere faceSize while rectangular center helpers reject non-rectangular grids",
    "topologyDiagnosticGuardReady means graph-backed cubed-sphere topology diagnostics route away from rectangular grid.width/grid.height checks and report zero manual-access risk",
    "resolutionSamplingGuardReady means graph-backed resolution comparisons sample through projection vectors and reserve rectangular bilinear sampling for legacy grids",
    "projectionOutputIndexGuardReady means y * width + x occurrences in projection render/gate tools index output pixels or projected sample buffers, not simulation grid cells",
    "legacyFallbackIndexGuardReady means remaining id-to-xy rectangular index math is behind explicit rectangular-only helper guards or inside legacy helper tests",
  ],
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function scanPaths(paths, patterns = forbiddenPatterns) {
  const matches = [];
  for (const relativePath of paths) {
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) continue;
    const stat = statSync(absolutePath);
    const files = stat.isDirectory() ? listJsFiles(absolutePath) : [absolutePath];
    for (const file of files) matches.push(...scanFile(file, patterns));
  }
  return matches;
}

function listJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const absolutePath = path.join(dir, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...listJsFiles(absolutePath));
    } else if (/\.(js|mjs)$/.test(entry)) {
      files.push(absolutePath);
    }
  }
  return files;
}

function scanFile(file, patterns = forbiddenPatterns) {
  const text = readFileSync(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const line = lineNumberAt(text, match.index ?? 0);
      matches.push({
        file: relative,
        line,
        lineText: lines[line - 1] ?? "",
        contextBefore: lines.slice(Math.max(0, line - 80), Math.max(0, line - 1)),
        contextAfter: lines.slice(line, Math.min(lines.length, line + 24)),
        pattern: pattern.name,
      });
    }
  }
  return matches;
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function summarizeByFile(matches) {
  const byFile = {};
  for (const match of matches) {
    if (!byFile[match.file]) byFile[match.file] = { count: 0, patternSet: new Set() };
    byFile[match.file].count += 1;
    byFile[match.file].patternSet.add(match.pattern);
  }
  for (const summary of Object.values(byFile)) {
    summary.patterns = Array.from(summary.patternSet).sort();
    delete summary.patternSet;
  }
  return byFile;
}

function classifyHelperMatch(match) {
  const before = match.contextBefore.join("\n");
  const after = match.contextAfter.join("\n");
  const context = `${before}\n${match.lineText}\n${after}`;
  if (isInsideLegacyFunction(match)) {
    return {
      ...match,
      classification: "legacyFallback",
      routeKind: "explicitLegacyFunction",
      routeReason: "helper call is inside an explicitly named legacy fallback function",
    };
  }
  const graphRoutedFile = graphRoutedLegacyFiles.get(match.file);
  if (graphRoutedFile?.patterns.has(match.pattern)) {
    return {
      ...match,
      classification: "legacyFallback",
      routeKind: "graphRoutedFile",
      routeReason: graphRoutedFile.reason,
    };
  }
  const hasGraphGuard = /isGraphBackedGrid\s*\(|graphBacked|topology\.forEachNeighbor|topology\.shortestDistanceSeeds/.test(context);
  const precededByGraphReturn = /if\s*\([^\n]*(?:isGraphBackedGrid|graphBacked)[^\n]*\)\s*\{[\s\S]{0,2600}\breturn\s*;[\s\S]{0,1600}$/.test(before);
  const precededByGraphBranch = /if\s*\([^\n]*(?:isGraphBackedGrid|graphBacked)[^\n]*\)\s*\{[\s\S]{0,2600}$/.test(before);
  const followedByFallbackReturn = /\breturn\b/.test(after.slice(0, 260));
  const classification = precededByGraphReturn || (precededByGraphBranch && followedByFallbackReturn)
    ? "legacyFallback"
    : hasGraphGuard
      ? "guardedHelper"
      : "possibleSphericalPath";
  return {
    ...match,
    classification,
    routeKind: classification === "legacyFallback" ? "graphBranchFallback" : null,
  };
}

function isInsideLegacyFunction(match) {
  const lines = [...match.contextBefore, match.lineText];
  let depth = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    depth += countChar(line, "}") - countChar(line, "{");
    const fn = line.match(/^\s*function\s+(legacy[A-Za-z0-9_]*)\s*\(/);
    if (!fn) continue;
    return depth < countChar(line, "{") || line.includes("{");
  }
  return false;
}

function countChar(text, char) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === char) count += 1;
  }
  return count;
}

function measureCoreHelperGuards() {
  const file = path.join(root, guardedCoreHelperFile);
  if (!existsSync(file)) {
    return { guarded: [], missing: guardedCoreHelpers.map((name) => ({ helper: name, reason: "file missing" })) };
  }
  const text = readFileSync(file, "utf8");
  const guarded = [];
  const missing = [];
  const hasAssertImplementation =
    /function\s+assertRectangularGrid\s*\([^)]*\)\s*\{[\s\S]*?graphBacked[\s\S]*?cubed-sphere[\s\S]*?requires a rectangular grid/.test(text);
  const bodies = Object.fromEntries(guardedCoreHelpers.map((helper) => [helper, exportedFunctionBody(text, helper)]));
  const directlyGuarded = new Set(
    guardedCoreHelpers.filter((helper) => {
      const body = bodies[helper];
      return body && new RegExp(`assertRectangularGrid\\s*\\(\\s*grid\\s*,\\s*["']${helper}["']\\s*\\)`).test(body);
    }),
  );
  for (const helper of guardedCoreHelpers) {
    const body = bodies[helper];
    if (body && hasAssertImplementation && (directlyGuarded.has(helper) || callsGuardedHelper(body, directlyGuarded))) {
      guarded.push(helper);
    } else {
      missing.push({ helper, reason: body ? "missing direct or indirect rectangular guard" : "exported function missing" });
    }
  }
  return { guarded, missing };
}

function callsGuardedHelper(body, directlyGuarded) {
  for (const helper of directlyGuarded) {
    if (new RegExp(`\\b${helper}\\s*\\(\\s*grid\\b`).test(body)) return true;
  }
  return false;
}

function measureRenderRectangularGuards() {
  const guarded = [];
  const missing = [];
  for (const spec of renderRectangularGuardSpecs) {
    const file = path.join(root, spec.file);
    if (!existsSync(file)) {
      missing.push({ name: spec.name, file: spec.file, reason: "file missing" });
      continue;
    }
    const text = readFileSync(file, "utf8");
    if (spec.pattern.test(text)) {
      guarded.push({ name: spec.name, file: spec.file });
    } else {
      missing.push({ name: spec.name, file: spec.file, reason: "missing graph-backed guard before rectangular render path" });
    }
  }
  return { guarded, missing };
}

function measureScaleTopologyGuards() {
  return measureRegexSpecs(scaleTopologyGuardSpecs, "missing topology-aware scale guard");
}

function measureTopologyDiagnosticGuards() {
  return measureRegexSpecs(topologyDiagnosticGuardSpecs, "missing graph-backed topology diagnostic guard");
}

function measureResolutionSamplingGuards() {
  return measureRegexSpecs(resolutionSamplingGuardSpecs, "missing graph-backed resolution sampling guard");
}

function measureProjectionOutputIndexGuards() {
  return measureRegexSpecs(projectionOutputIndexGuardSpecs, "missing projection-output pixel indexing guard");
}

function measureLegacyFallbackIndexGuards() {
  return measureRegexSpecs(legacyFallbackIndexGuardSpecs, "missing legacy fallback indexing guard");
}

function measureRegexSpecs(specs, missingReason) {
  const guarded = [];
  const missing = [];
  for (const spec of specs) {
    const file = path.join(root, spec.file);
    if (!existsSync(file)) {
      missing.push({ name: spec.name, file: spec.file, reason: "file missing" });
      continue;
    }
    const text = readFileSync(file, "utf8");
    if (spec.pattern.test(text)) {
      guarded.push({ name: spec.name, file: spec.file });
    } else {
      missing.push({ name: spec.name, file: spec.file, reason: missingReason });
    }
  }
  return { guarded, missing };
}

function exportedFunctionBody(text, helper) {
  const signature = new RegExp(`export\\s+function\\s+${helper}\\s*\\([^)]*\\)\\s*\\{`, "g");
  const match = signature.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 1;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, i);
  }
  return null;
}

function isAllowedSphericalMatch(match) {
  return allowedSphericalMatches.some((allowed) => {
    return (
      match.file === allowed.file &&
      match.pattern === allowed.pattern &&
      match.lineText.trim() === allowed.lineText
    );
  });
}
