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

const derivedTerrainTopologyGuardSpecs = [
  {
    name: "terrainShapeUsesGraphNeighborsForGraphBackedGrid",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+measureTerrainShape\s*\(\s*grid\s*,\s*field\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?return\s*\{\s*slope\s*,\s*aspect\s*,\s*ruggedness\s*\}[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "terrainCoastDistanceUsesGraphShortestDistance",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+distanceFromCoast\s*\(\s*grid\s*,\s*landMask\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?return\s+topology\.shortestDistanceSeeds\s*\(\s*coast\s*\)[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "terrainDistanceSourcesUsesGraphShortestDistance",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+distanceFromSources\s*\(\s*grid\s*,\s*sourceMask\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*&&\s*topology\.shortestDistanceSeeds\s*\)\s*\{[\s\S]*?return\s+topology\.shortestDistanceSeeds\s*\(\s*sourceMask\s*\)[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "terrainLandmassLabelsUseTopologyNeighborVisitor",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+labelLandmasses\s*\(\s*grid\s*,\s*landMask\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?visitTerrainCardinalNeighbor\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*graphBacked[\s\S]*?function\s+visitTerrainCardinalNeighbor\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*graphBacked\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*graphBacked\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "terrainSmoothingUsesGraphNeighborRing",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+smoothElevation\s*\(\s*grid\s*,\s*field\s*,\s*radius\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?visitTerrainRadiusNeighbor\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*radius\s*,\s*graphBacked[\s\S]*?function\s+visitTerrainRadiusNeighbor\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*radius\s*,\s*graphBacked\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*graphBacked\s*\)\s*\{[\s\S]*?topology\.forEachNeighborRing\s*\(\s*id\s*,\s*radius[\s\S]*?forEachNeighborRadiusById\s*\(\s*grid\s*,\s*id\s*,\s*radius/,
  },
  {
    name: "terrainLatitudeUsesCellLatitudeBeforeLegacyHeight",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+latitudeDegrees\s*\(\s*grid\s*,\s*id\s*,\s*y\s*\)\s*\{[\s\S]*?if\s*\(\s*grid\.lat\s*&&\s*Number\.isFinite\s*\(\s*grid\.lat\s*\[\s*id\s*\]\s*\)\s*\)\s*return\s+grid\.lat\s*\[\s*id\s*\]\s*\*\s*180\s*\/\s*Math\.PI[\s\S]*?return\s+legacyLatitudeDegrees\s*\(\s*grid\s*,\s*y\s*\)[\s\S]*?function\s+legacyLatitudeDegrees\s*\(\s*grid\s*,\s*y\s*\)\s*\{[\s\S]*?gridParamHeight\s*\(\s*grid\s*\)/,
  },
];

const hydrologyTopologyGuardSpecs = [
  {
    name: "hydrologyDeriveUsesTopologyForGrid",
    file: "src/sim/hydrology.js",
    pattern:
      /export\s+function\s+deriveHydrology\s*\(\s*world\s*,\s*terrain\s*,\s*options\s*=\s*\{\}\s*\)\s*\{[\s\S]*?const\s+\{\s*grid\s*\}\s*=\s*world[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?smoothHydroElevation\s*\(\s*topology\s*,\s*elev\s*\)[\s\S]*?assignFlowTargets\s*\(\s*topology/,
  },
  {
    name: "hydrologyFlowTargetsUseTopologyDistance",
    file: "src/sim/hydrology.js",
    pattern:
      /function\s+assignFlowTargets\s*\(\s*topology\s*,[\s\S]*?\)\s*\{[\s\S]*?forEachHydrologyNeighbor8\s*\(\s*topology\s*,\s*id[\s\S]*?const\s+distance\s*=\s*Math\.max\s*\(\s*1\s*,\s*topology\.distance\s*\(\s*id\s*,\s*nid\s*\)\s*\)[\s\S]*?const\s+drop\s*=\s*\(\s*hydroElevation\s*\[\s*id\s*\]\s*-\s*targetElevation\s*\)\s*\/\s*distance/,
  },
  {
    name: "hydrologyNeighborWrappersPreferTopologyMethods",
    file: "src/sim/hydrology.js",
    pattern:
      /function\s+forEachHydrologyNeighbor4\s*\(\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?typeof\s+topology\.forEachNeighbor4\s*===\s*["']function["'][\s\S]*?topology\.forEachNeighbor4\s*\(\s*id\s*,\s*visit\s*\)[\s\S]*?forEachNeighbor4ById\s*\(\s*topology\.grid\s*,\s*id\s*,\s*visit\s*\)[\s\S]*?function\s+forEachHydrologyNeighbor8\s*\(\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?typeof\s+topology\.forEachNeighbor8\s*===\s*["']function["'][\s\S]*?topology\.forEachNeighbor8\s*\(\s*id\s*,\s*visit\s*\)[\s\S]*?forEachNeighbor8ById\s*\(\s*topology\.grid\s*,\s*id\s*,\s*visit\s*\)[\s\S]*?function\s+forEachHydrologyNeighborRadius\s*\(\s*topology\s*,\s*id\s*,\s*radius\s*,\s*visit\s*\)\s*\{[\s\S]*?typeof\s+topology\.forEachNeighborRadius\s*===\s*["']function["'][\s\S]*?topology\.forEachNeighborRadius\s*\(\s*id\s*,\s*radius\s*,\s*visit\s*\)[\s\S]*?forEachNeighborRadiusById\s*\(\s*topology\.grid\s*,\s*id\s*,\s*radius\s*,\s*visit\s*\)/,
  },
  {
    name: "hydrologyUsesMetricWeightsForGraphBackedAreas",
    file: "src/sim/hydrology.js",
    pattern:
      /function\s+metricWeight\s*\(\s*grid\s*,\s*id\s*\)\s*\{[\s\S]*?if\s*\(\s*!isGraphBackedGrid\s*\(\s*grid\s*\)\s*\)\s*return\s+1[\s\S]*?grid\.area\?\.\[\s*id\s*\][\s\S]*?function\s+totalMetricArea\s*\(\s*grid\s*\)\s*\{[\s\S]*?if\s*\(\s*!isGraphBackedGrid\s*\(\s*grid\s*\)\s*\)\s*return\s+grid\.size\s*\?\?\s*0[\s\S]*?metricWeight\s*\(\s*grid\s*,\s*i\s*\)[\s\S]*?function\s+hydrologyFlowUnit\s*\(\s*grid\s*,\s*landArea\s*,\s*landCount\s*\)\s*\{[\s\S]*?if\s*\(\s*!isGraphBackedGrid\s*\(\s*grid\s*\)\s*\)\s*return\s+1[\s\S]*?landArea\s*\/\s*Math\.max\s*\(\s*1\s*,\s*landCount\s*\)/,
  },
  {
    name: "hydrologyDiagnosticsUseAreaWeightedDenominators",
    file: "src/sim/hydrology.js",
    pattern:
      /function\s+measureHydrologyDiagnostics\s*\(\s*\{[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+totalArea\s*=\s*graphBacked\s*\?\s*totalMetricArea\s*\(\s*grid\s*\)\s*:\s*size[\s\S]*?const\s+landDenominator\s*=\s*graphBacked\s*\?\s*landArea\s*:\s*landCount[\s\S]*?flowAssignedShare\s*:\s*shareValue\s*\(\s*graphBacked\s*\?\s*assignedArea\s*:\s*assigned\s*,\s*landDenominator\s*\)[\s\S]*?lakeCandidateShare\s*:\s*shareValue\s*\(\s*graphBacked\s*\?\s*lakeArea\s*:\s*lake\s*,\s*totalArea\s*\)/,
  },
];

const worldTopologyGuardSpecs = [
  {
    name: "createWorldRoutesCubedSphereToProductionAdapter",
    file: "src/sim/world.js",
    pattern:
      /function\s+normalizeProductionTopologyMode\s*\(\s*params\s*\)\s*\{[\s\S]*?params\.topologyMode\s*===\s*TopologyMode\.CUBED_SPHERE[\s\S]*?return\s+ProductionTopologyMode\.CUBED_SPHERE_ADAPTER[\s\S]*?function\s+createProductionGrid\s*\(\s*params\s*,\s*width\s*,\s*height\s*,\s*seedUint32\s*\)\s*\{[\s\S]*?params\.productionTopologyMode\s*===\s*ProductionTopologyMode\.CUBED_SPHERE_ADAPTER[\s\S]*?createCubedSphereProductionGridAdapter\s*\(\s*\{[\s\S]*?faceSize\s*:\s*params\.faceSize[\s\S]*?seedUint32[\s\S]*?return\s+createGrid\s*\(\s*width\s*,\s*height\s*\)/,
  },
  {
    name: "cubedSphereForcesGeologyV2Pipeline",
    file: "src/sim/world.js",
    pattern:
      /function\s+normalizeParams\s*\(\s*params\s*\)\s*\{[\s\S]*?const\s+productionTopologyMode\s*=\s*normalizeProductionTopologyMode\s*\(\s*\{[\s\S]*?const\s+pipelineMode\s*=\s*productionTopologyMode\s*===\s*ProductionTopologyMode\.CUBED_SPHERE_ADAPTER\s*\|\|\s*params\.pipelineMode\s*===\s*PipelineMode\.GEOLOGY_V2[\s\S]*?\?\s*PipelineMode\.GEOLOGY_V2[\s\S]*?:\s*PipelineMode\.LEGACY/,
  },
  {
    name: "worldStatsUseAreaWeightsForGraphBackedGrid",
    file: "src/sim/world.js",
    pattern:
      /export\s+function\s+analyzeWorld\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+areaWeighted\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+weight\s*=\s*areaWeighted\s*\?\s*grid\.area\?\.\[\s*i\s*\]\s*\?\?\s*1\s*:\s*1[\s\S]*?totalArea\s*\+=\s*weight[\s\S]*?if\s*\(\s*h\s*>=\s*world\.seaLevel\s*\)\s*landArea\s*\+=\s*weight[\s\S]*?const\s+landRatio\s*=\s*landArea\s*\/\s*Math\.max\s*\(\s*totalArea\s*,\s*Number\.EPSILON\s*\)/,
  },
  {
    name: "worldPlateDriftUsesSphericalPlatesBeforeLegacyUv",
    file: "src/sim/world.js",
    pattern:
      /function\s+measurePlateDrift\s*\(\s*world\s*\)\s*\{[\s\S]*?world\.plates\?\.kind\s*===\s*["']spherical-plates["']\s*&&\s*world\.initialSphericalPlates[\s\S]*?measureSphericalPlateDrift\s*\(\s*world\.initialSphericalPlates\s*,\s*world\.plates\s*\)[\s\S]*?if\s*\(\s*!world\.plates\s*\|\|[\s\S]*?initialPlateCentersU[\s\S]*?initialPlateCentersV[\s\S]*?world\.plates\.centersU/,
  },
];

const geologyFeatureTopologyGuardSpecs = [
  {
    name: "geologyFeaturesUseGraphStressAndGraphDiffusion",
    file: "src/sim/geology/features.js",
    pattern:
      /function\s+seedFeatureSources\s*\(\s*grid\s*\)\s*\{[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*\)[\s\S]*?measureFeatureGraphStressModel\s*\(\s*grid\s*\)[\s\S]*?graphBacked\s*\?\s*featureActiveBoundaryInfluence\s*\(\s*grid\s*,\s*i\s*\)\s*:\s*boundaryInfluence\s*\[\s*i\s*\][\s\S]*?normalizedFeatureGraphStress\s*\(\s*stress\s*\[\s*i\s*\]\s*,\s*stressModel\s*\)/,
  },
  {
    name: "geologyFeaturesRoutesDiffusionToGraphPath",
    file: "src/sim/geology/features.js",
    pattern:
      /function\s+diffuseFeature\s*\(\s*grid\s*,\s*source\s*,\s*target\s*,\s*referenceRadius\s*,\s*gain\s*,\s*options\s*=\s*\{\}\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?diffuseFeatureGraph\s*\(\s*grid\s*,\s*topology\s*,\s*source\s*,\s*spread\s*,\s*radius\s*,\s*gain\s*,\s*options\s*\)[\s\S]*?\}\s*else\s*\{[\s\S]*?legacyDiffuseFeatureRaster\s*\(\s*grid\s*,\s*source\s*,\s*spread\s*,\s*radius\s*,\s*gain\s*,\s*options\s*\)/,
  },
  {
    name: "geologyFeaturesGraphSegmentationUsesSphereCoordinates",
    file: "src/sim/geology/features.js",
    pattern:
      /function\s+diffuseFeatureGraph\s*\(\s*grid\s*,\s*topology\s*,\s*source\s*,\s*spread\s*,\s*radius\s*,\s*gain\s*,\s*options\s*\)\s*\{[\s\S]*?forEachNeighborRadiusById\s*\(\s*grid\s*,\s*id[\s\S]*?graphSegmentMask\s*\(\s*grid\s*,\s*id\s*,\s*nid\s*,\s*weak\s*\)[\s\S]*?function\s+graphSegmentMask\s*\(\s*grid\s*,\s*sourceId\s*,\s*targetId\s*,\s*weakness\s*\)\s*\{[\s\S]*?grid\.positionX\?\.\[\s*sourceId\s*\][\s\S]*?grid\.positionY\?\.\[\s*sourceId\s*\][\s\S]*?grid\.positionZ\?\.\[\s*sourceId\s*\][\s\S]*?grid\.positionX\?\.\[\s*targetId\s*\][\s\S]*?grid\.positionY\?\.\[\s*targetId\s*\][\s\S]*?grid\.positionZ\?\.\[\s*targetId\s*\][\s\S]*?Math\.atan2/,
  },
  {
    name: "geologyAxesRouteNaturalizationToGraphPath",
    file: "src/sim/geology/axes.js",
    pattern:
      /function\s+naturalizeAxis\s*\(\s*grid\s*,\s*source\s*,\s*target\s*,\s*referenceRadius\s*,\s*gain\s*,\s*options\s*=\s*\{\}\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?naturalizeAxisGraph\s*\(\s*grid\s*,\s*topology\s*,\s*seedSource\s*,\s*spread\s*,\s*radius\s*,\s*gain\s*,\s*options\s*\)[\s\S]*?return[\s\S]*?forEachGridCell\s*\(\s*grid\s*,\s*\(\s*id\s*,\s*x\s*,\s*y\s*\)/,
  },
  {
    name: "geologyAxesGraphDiagnosticsAvoidLegacySamples",
    file: "src/sim/geology/axes.js",
    pattern:
      /function\s+measureAxisDiagnostics\s*\(\s*grid\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?const\s+diagnostic\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\?\s*sampleGraphAxisDiagnostic\s*\(\s*grid\s*,\s*topology\s*,\s*tectonicAxis\s*,\s*id\s*\)\s*:\s*sampleLegacyAxisDiagnostic\s*\(\s*grid\s*,\s*tectonicAxis\s*,\s*x\s*,\s*y\s*\)[\s\S]*?function\s+sampleGraphAxisDiagnostic\s*\(\s*grid\s*,\s*topology\s*,\s*field\s*,\s*id\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id/,
  },
  {
    name: "geologyAxesSegmentAndBlockinessUseGraphNeighbors",
    file: "src/sim/geology/axes.js",
    pattern:
      /function\s+measureFieldBlockiness\s*\(\s*grid\s*,\s*field\s*,\s*output\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?measureGraphFieldBlockiness\s*\(\s*grid\s*,\s*topology\s*,\s*field\s*,\s*output\s*\)[\s\S]*?return[\s\S]*?legacyAxisSample[\s\S]*?function\s+visitAxisSegmentNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "geologyTransformsRouteAgeBandRiskToGraphPath",
    file: "src/sim/geology/transforms.js",
    pattern:
      /function\s+updateAgeBandRisk\s*\(\s*grid\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?updateGraphAgeBandRisk\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?return[\s\S]*?legacySameAgeBandAt/,
  },
  {
    name: "geologyTransformsGraphAgeBandRiskUsesTopologyRings",
    file: "src/sim/geology/transforms.js",
    pattern:
      /function\s+updateGraphAgeBandRisk\s*\(\s*grid\s*,\s*topology\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?typeof\s+topology\.forEachNeighborRing\s*===\s*["']function["'][\s\S]*?topology\.forEachNeighborRing\s*\(\s*id\s*,\s*2[\s\S]*?ageBandStraightnessRisk\s*\[\s*id\s*\]/,
  },
  {
    name: "geologyTransformsFractureSmoothingUsesGraphNeighbors",
    file: "src/sim/geology/transforms.js",
    pattern:
      /export\s+function\s+suppressInactiveFractureRelief\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?visitFractureSmoothingNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?function\s+visitFractureSmoothingNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
];

const geologyCoreTopologyGuardSpecs = [
  {
    name: "geologyBoundariesRouteDistanceToGraphHeap",
    file: "src/sim/geology/boundaries.js",
    pattern:
      /export\s+function\s+updatePlateBoundariesV2\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?rebuildGraphBoundaryDistance\s*\(\s*grid\s*,\s*topology\s*,\s*activeBoundary\s*,\s*radius\s*\)[\s\S]*?while\s*\(\s*head\s*<\s*tail\s*\)[\s\S]*?function\s+rebuildGraphBoundaryDistance\s*\(\s*grid\s*,\s*topology\s*,\s*sourceMask\s*,\s*radius\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?edgeLength/,
  },
  {
    name: "geologyBoundariesClassifyWithGraphDirections",
    file: "src/sim/geology/boundaries.js",
    pattern:
      /export\s+function\s+classifyBoundaryKindV2\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?visitBoundaryClassificationNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?function\s+visitBoundaryClassificationNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?graphBoundaryDirection\s*\(\s*grid\s*,\s*id\s*,\s*nid\s*,\s*slot\s*\)[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "geologyBoundariesUseGraphCheckerboardAndNearestKind",
    file: "src/sim/geology/boundaries.js",
    pattern:
      /function\s+deriveBoundaryCoherence\s*\(\s*grid\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?visitBoundaryCoherenceNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\?\s*graphCheckerboardRiskAt\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*\)\s*:\s*legacyCheckerboardRiskAt\s*\(\s*grid\s*,\s*id\s*\)[\s\S]*?function\s+visitNearestBoundaryKindNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "geologyPlatesRouteDriftAndRasterizeToSpherical",
    file: "src/sim/geology/plates.js",
    pattern:
      /export\s+function\s+advectPlatesV2\s*\(\s*world\s*\)\s*\{[\s\S]*?plates\.kind\s*===\s*["']spherical-plates["']\s*&&\s*isGraphBackedGrid\s*\(\s*grid\s*\)[\s\S]*?driftSphericalPlates\s*\(\s*plates\s*,\s*drift\s*\)[\s\S]*?legacyPlateWrapGridParamX[\s\S]*?export\s+function\s+rasterizePlatesV2\s*\(\s*world\s*\)\s*\{[\s\S]*?plates\.kind\s*===\s*["']spherical-plates["']\s*&&\s*isGraphBackedGrid\s*\(\s*grid\s*\)[\s\S]*?rasterizeSphericalPlatesV2\s*\(\s*world\s*\)[\s\S]*?legacyPlateIndexOf/,
  },
  {
    name: "geologyPlatesRouteCrustAdvectionToSphericalSampling",
    file: "src/sim/geology/plates.js",
    pattern:
      /export\s+function\s+advectCrustByPlateMotion\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?advectCrustBySphericalPlateMotion\s*\(\s*world\s*,\s*interval\s*\)[\s\S]*?return[\s\S]*?sampleBilinear[\s\S]*?function\s+advectCrustBySphericalPlateMotion\s*\(\s*world\s*,\s*interval\s*\)\s*\{[\s\S]*?backtrackSphericalPosition[\s\S]*?sampleSphericalField/,
  },
  {
    name: "geologyPlatesGraphNeighborAndCheckerCleanupAvoidLegacyGridChecks",
    file: "src/sim/geology/plates.js",
    pattern:
      /function\s+forEachNeighbor8Local\s*\(\s*grid\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?edgeLength[\s\S]*?forEachNeighbor8ById\s*\(\s*grid\s*,\s*id[\s\S]*?function\s+cleanupPlateCheckerboards\s*\(\s*grid\s*\)\s*\{[\s\S]*?const\s+graphBacked\s*=\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)[\s\S]*?const\s+checker\s*=\s*graphBacked\s*\?\s*false\s*:\s*isCheckerboardCell\s*\(\s*grid\s*,\s*x\s*,\s*y\s*\)/,
  },
  {
    name: "geologyCrustRouteRidgeDistanceToGraphHeap",
    file: "src/sim/geology/crust.js",
    pattern:
      /function\s+rebuildOceanicAgeFromRidges\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?rebuildGraphRidgeDistance\s*\(\s*grid\s*,\s*topology\s*,\s*ridgeMask\s*\)[\s\S]*?while\s*\(\s*head\s*<\s*tail\s*\)[\s\S]*?function\s+rebuildGraphRidgeDistance\s*\(\s*grid\s*,\s*topology\s*,\s*ridgeMask\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?edgeLength/,
  },
  {
    name: "geologyCrustRidgeAgeSmoothingUsesGraphNeighbors",
    file: "src/sim/geology/crust.js",
    pattern:
      /function\s+rebuildOceanicAgeFromRidges\s*\(\s*world\s*\)\s*\{[\s\S]*?visitRidgeAgeSmoothingNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?function\s+visitRidgeAgeSmoothingNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
];

const geologySurfaceTopologyGuardSpecs = [
  {
    name: "geologySeaLevelUsesGraphSlopeReliefAndAreaWeights",
    file: "src/sim/geology/seaLevel.js",
    pattern:
      /function\s+localSlope\s*\(\s*grid\s*,\s*id\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*return\s+localGraphSlope\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*\)[\s\S]*?return\s+legacyLocalSlope\s*\(\s*grid\s*,\s*id\s*\)[\s\S]*?function\s+visitLocalReliefNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id[\s\S]*?function\s+metricArea\s*\(\s*grid\s*,\s*id\s*\)/,
  },
  {
    name: "geologySedimentRoutesSlopeReliefAndStraightnessToGraph",
    file: "src/sim/geology/sediment.js",
    pattern:
      /function\s+localSlope\s*\(\s*grid\s*,\s*field\s*,\s*id\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*return\s+localGraphSlope\s*\(\s*grid\s*,\s*topology\s*,\s*field\s*,\s*id\s*\)[\s\S]*?legacySedimentXyOf[\s\S]*?function\s+visitNeighbor4\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id[\s\S]*?function\s+measureSedimentStraightnessDiagnostics\s*\(\s*grid\s*,\s*field\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*return\s+measureGraphSedimentStraightnessDiagnostics\s*\(\s*grid\s*,\s*topology\s*,\s*field\s*\)/,
  },
  {
    name: "geologySedimentGraphStraightnessUsesTopologyNeighbors",
    file: "src/sim/geology/sediment.js",
    pattern:
      /function\s+measureGraphSedimentStraightnessDiagnostics\s*\(\s*grid\s*,\s*topology\s*,\s*field\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?sedimentBoundaryCorrelation[\s\S]*?sedimentGridAlignment[\s\S]*?sedimentNaturalSinkShare/,
  },
  {
    name: "geologyRiftConnectivityUsesTopologyComponents",
    file: "src/sim/geology/rift.js",
    pattern:
      /function\s+fillExternalSea\s*\(\s*grid\s*,\s*seaMask\s*,\s*externalSeaMask\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?const\s+components\s*=\s*topology\.connectedComponents\s*\(\s*seaMask\s*\)[\s\S]*?function\s+labelClosedBasins\s*\(\s*grid\s*,\s*seaMask\s*,\s*externalSeaMask\s*,\s*closedBasinId\s*\)\s*\{[\s\S]*?const\s+components\s*=\s*topology\.connectedComponents\s*\(\s*closedMask\s*\)/,
  },
  {
    name: "geologyMarginsUseGraphDistancesAndNeighbors",
    file: "src/sim/geology/margins.js",
    pattern:
      /function\s+marginDistanceFromSources\s*\(\s*grid\s*,\s*sourceMask\s*,\s*scratch\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*&&\s*typeof\s+topology\.shortestDistanceSeeds\s*===\s*["']function["']\s*\)\s*\{[\s\S]*?return\s+topology\.shortestDistanceSeeds\s*\(\s*sourceMask\s*\)[\s\S]*?function\s+visitMarginNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
  {
    name: "geologyOrogenyUsesGraphNeighborhoodsAndInterfaces",
    file: "src/sim/geology/orogeny.js",
    pattern:
      /function\s+visitOrogenyNeighborhood\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*x\s*,\s*y\s*,\s*radius\s*,\s*bend\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?forEachNeighborRadiusById\s*\(\s*grid\s*,\s*id[\s\S]*?legacyVisitOrogenyNeighborhood[\s\S]*?function\s+visitForelandNeighborhood\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?forEachNeighborRadiusById\s*\(\s*grid\s*,\s*id[\s\S]*?function\s+visitMountainInterfaceNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id/,
  },
  {
    name: "geologyPipelineUsesGraphNeighborhoodVisitors",
    file: "src/sim/geology/pipeline.js",
    pattern:
      /function\s+visitPassiveCrustNeighbors\s*\(\s*grid\s*,\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?function\s+visitSmoothingNeighborhood\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?forEachNeighborRadiusById\s*\(\s*grid\s*,\s*id[\s\S]*?function\s+visitBentSmoothingNeighborhood\s*\(\s*grid\s*,\s*topology\s*,\s*id[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)/,
  },
  {
    name: "geologyReliefBudgetUsesGraphSlopeAndTracksReliefRadius",
    file: "src/sim/geology/reliefBudget.js",
    pattern:
      /function\s+localRelief\s*\(\s*grid\s*,\s*id\s*,\s*radius\s*\)\s*\{[\s\S]*?forEachNeighborRadiusById\s*\(\s*grid\s*,\s*id\s*,\s*radius[\s\S]*?function\s+localSlope\s*\(\s*grid\s*,\s*id\s*,\s*seaLevel\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*grid\s*\)[\s\S]*?if\s*\(\s*isGraphBackedGrid\s*\(\s*grid\s*,\s*topology\s*\)\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor\s*\(\s*id[\s\S]*?edgeLength[\s\S]*?forEachNeighbor4ById\s*\(\s*grid\s*,\s*id/,
  },
];

const interfaceTopologyGuardSpecs = [
  {
    name: "terrainDerivedGetterExposesTopologyDerivedMasksAndDiagnostics",
    file: "src/sim/derived/terrain.js",
    pattern:
      /export\s+function\s+getTerrainDerived\s*\(\s*world\s*\)\s*\{[\s\S]*?externalSeaMask:\s*base\.externalSeaMask[\s\S]*?oceanConnectivity:\s*base\.oceanConnectivity[\s\S]*?closedBasinId:\s*base\.closedBasinId[\s\S]*?inlandWaterCandidate:\s*base\.inlandWaterCandidate[\s\S]*?topologyDiagnostics:\s*measureTopologyDiagnostics\s*\(\s*world\s*\)/,
  },
  {
    name: "terrainBaseBuildsConnectivityAndGraphDistances",
    file: "src/sim/derived/terrain.js",
    pattern:
      /function\s+buildTerrainBase\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+connectivity\s*=\s*deriveOceanConnectivity\s*\(\s*world\s*\)[\s\S]*?const\s+externalSeaMask\s*=\s*new\s+Uint8Array\s*\(\s*connectivity\.externalSeaMask\s*\)[\s\S]*?const\s+closedBasinId\s*=\s*new\s+Int32Array\s*\(\s*connectivity\.closedBasinId\s*\)[\s\S]*?const\s+coastDistance\s*=\s*distanceFromCoast\s*\(\s*grid\s*,\s*landMask\s*\)[\s\S]*?const\s+distanceToOcean\s*=\s*distanceFromSources\s*\(\s*grid\s*,\s*externalSeaMask\s*\)/,
  },
  {
    name: "climateInputsUseSphericalLatitudeAndTerrainMasks",
    file: "src/sim/derived/terrain.js",
    pattern:
      /export\s+function\s+getClimateInputs\s*\(\s*world\s*\)\s*\{[\s\S]*?forEachGridCell\s*\(\s*grid\s*,\s*\(\s*id\s*,\s*_x\s*,\s*y\s*\)\s*=>\s*\{[\s\S]*?const\s+lat\s*=\s*latitudeDegrees\s*\(\s*grid\s*,\s*id\s*,\s*y\s*\)[\s\S]*?latitude\s*\[\s*id\s*\]\s*=\s*lat[\s\S]*?landMask:\s*base\.landMask[\s\S]*?seaMask:\s*base\.seaMask[\s\S]*?distanceToOcean:\s*base\.distanceToOcean/,
  },
  {
    name: "hydrologyInputsRouteThroughDerivedHydrologyWithStepCache",
    file: "src/sim/derived/terrain.js",
    pattern:
      /export\s+function\s+getHydrologyInputs\s*\(\s*world\s*,\s*options\s*=\s*\{\}\s*\)\s*\{[\s\S]*?const\s+cached\s*=\s*getStepCache\s*\(\s*world\s*,\s*HYDROLOGY_CACHE\s*\)[\s\S]*?const\s+base\s*=\s*getTerrainBase\s*\(\s*world\s*\)[\s\S]*?const\s+value\s*=\s*deriveHydrology\s*\(\s*world\s*,\s*base\s*,\s*options\s*\)[\s\S]*?setStepCache\s*\(\s*world\s*,\s*HYDROLOGY_CACHE\s*,\s*value\s*,\s*\{\s*level\s*\}\s*\)/,
  },
  {
    name: "biosphereInputsUseMetricLandmassSizesAndGraphSmoothing",
    file: "src/sim/derived/terrain.js",
    pattern:
      /export\s+function\s+getBiosphereInputs\s*\(\s*world\s*\)\s*\{[\s\S]*?const\s+biomeBaseElevation\s*=\s*smoothElevation\s*\(\s*grid\s*,\s*elev\s*,\s*physicalRadius\s*\(\s*grid\s*,\s*1\s*\)\s*\)[\s\S]*?const\s+componentSizes\s*=\s*measureComponentSizes\s*\(\s*grid\s*,\s*base\.landmassId\s*\)[\s\S]*?const\s+landConnectivityScale\s*=\s*metricTotal\s*\(\s*grid\s*\)\s*\*\s*0\.18[\s\S]*?connectivityToLandmass\s*\[\s*i\s*\]\s*=\s*landId\s*\?/,
  },
  {
    name: "resourceInputsExposeGeologyV2TraceFields",
    file: "src/sim/derived/terrain.js",
    pattern:
      /export\s+function\s+getResourceInputs\s*\(\s*world\s*\)\s*\{[\s\S]*?riftStage[\s\S]*?passiveMargin[\s\S]*?sedimentaryBasin[\s\S]*?orogenicBelt:\s*maxFields\s*\(\s*activeOrogeny\s*,\s*oldOrogeny\s*,\s*orogeny\s*\)[\s\S]*?activeTransform:\s*new\s+Float32Array\s*\(\s*grid\.activeTransform\s*\)[\s\S]*?transformMemory:\s*new\s+Float32Array\s*\(\s*grid\.transformMemory\s*\)[\s\S]*?fractureZoneMemory:\s*new\s+Float32Array\s*\(\s*grid\.fractureZoneMemory\s*\)/,
  },
  {
    name: "interfaceCheckUsesAreaWeightsAndTopologyNeighbors",
    file: "tools/interface-check.mjs",
    pattern:
      /function\s+metricArea\s*\(\s*id\s*\)\s*\{[\s\S]*?world\.grid\.area\?\.\[\s*id\s*\][\s\S]*?function\s+widthProxy\s*\(\s*field\s*,\s*threshold\s*\)\s*\{[\s\S]*?const\s+topology\s*=\s*topologyForGrid\s*\(\s*world\.grid\s*\)[\s\S]*?forEachAnyNeighbor\s*\(\s*topology\s*,\s*id[\s\S]*?function\s+forEachAnyNeighbor\s*\(\s*topology\s*,\s*id\s*,\s*visit\s*\)\s*\{[\s\S]*?topology\.forEachNeighbor8[\s\S]*?topology\.forEachNeighbor/,
  },
  {
    name: "productionInterfaceChecksExerciseAllDerivedGetters",
    file: "tools/spherical-production-init-check.mjs",
    pattern:
      /runStage\s*\(\s*["']getTerrainDerived["'][\s\S]*?getTerrainDerived\s*\(\s*world\s*\)[\s\S]*?runStage\s*\(\s*["']getClimateInputs["'][\s\S]*?getClimateInputs\s*\(\s*world\s*\)[\s\S]*?runStage\s*\(\s*["']getHydrologyInputs["'][\s\S]*?getHydrologyInputs\s*\(\s*world\s*\)[\s\S]*?runStage\s*\(\s*["']getResourceInputs["'][\s\S]*?getResourceInputs\s*\(\s*world\s*\)/,
  },
];

const diagnosticToolchainGuardSpecs = [
  {
    name: "artifactScanPreservesTopologyOptionsAndReportsRiskDebugLayers",
    file: "tools/artifact-scan.mjs",
    pattern:
      /const\s+topologyOptions\s*=\s*parseTopologyOptions\s*\(\s*options\s*\)[\s\S]*?createCheckWorld\s*\(\s*\{\s*seedText\s*,\s*pipelineMode\s*,\s*resolution\s*,\s*\.\.\.topologyOptions\s*\}\s*\)[\s\S]*?assessArtifactRisk\s*\(\s*lastMetrics\s*\)[\s\S]*?suggestedDebugLayers\s*\(\s*failures\[0\]\?\.failures\s*\?\?\s*\[\]\s*\)/,
  },
  {
    name: "perfProfilePreservesTopologyOptionsAndStageTimings",
    file: "tools/perf-profile.mjs",
    pattern:
      /const\s+topologyOptions\s*=\s*parseTopologyOptions\s*\(\s*options\s*\)[\s\S]*?createCheckWorld\s*\(\s*\{\s*seedText\s*,\s*pipelineMode\s*,\s*resolution\s*,\s*\.\.\.topologyOptions\s*\}\s*\)[\s\S]*?world\.profileGeologyV2Stages\s*=\s*true[\s\S]*?geologyStageTimings:\s*formatStageTimings\s*\(\s*world\.geologyV2StageTimings\s*\)/,
  },
  {
    name: "scenarioCheckSnapshotsPreserveTopologyMetadata",
    file: "tools/scenario-check.mjs",
    pattern:
      /const\s+topologyOptions\s*=\s*parseTopologyOptions\s*\(\s*options\s*\)[\s\S]*?createCheckWorld\s*\(\s*\{\s*seedText\s*,\s*pipelineMode\s*,\s*resolution\s*,\s*\.\.\.topologyOptions\s*\}\s*\)[\s\S]*?saveWorldSnapshot\s*\(\s*currentWorld\s*,\s*snapshotDir\s*,\s*\{\s*seedText\s*,\s*pipelineMode\s*,\s*resolution\s*,\s*\.\.\.topologyOptions\s*\}\s*\)[\s\S]*?summarizeScenario\s*\(\s*\{/,
  },
  {
    name: "snapshotCacheStoresParamsStatsAndTypedArrays",
    file: "tools/lib/snapshot-cache.mjs",
    pattern:
      /export\s+function\s+saveWorldSnapshot\s*\(\s*world\s*,\s*snapshotDir[\s\S]*?params:\s*world\.params[\s\S]*?for\s*\(\s*const\s+\[\s*key\s*,\s*value\s*\]\s+of\s+Object\.entries\s*\(\s*world\.grid\s*\)\s*\)[\s\S]*?isTypedArray\s*\(\s*value\s*\)[\s\S]*?encodeTypedArray\s*\(\s*value\s*\)[\s\S]*?export\s+function\s+loadWorldSnapshot\s*\(\s*file\s*\)/,
  },
  {
    name: "sphericalToolchainSmokeCoversArtifactScanAndPerfProfile",
    file: "tools/spherical-toolchain-smoke-check.mjs",
    pattern:
      /const\s+artifactScan\s*=\s*runJson\s*\(\s*["']artifact-scan["'][\s\S]*?["']--topology["'][\s\S]*?["']cubed-sphere["'][\s\S]*?const\s+perfProfile\s*=\s*runJson\s*\(\s*["']perf-profile["'][\s\S]*?["']--topology["'][\s\S]*?["']cubed-sphere["'][\s\S]*?expect\s*\(\s*artifactScan\.parsed\?\.topologyMode\s*===\s*["']cubed-sphere["'][\s\S]*?expect\s*\(\s*perfProfile\.parsed\?\.topologyMode\s*===\s*["']cubed-sphere["'][\s\S]*?geologyStageTimings/,
  },
  {
    name: "sphericalRenderGateValidatesProjectionDebugAndCleanup",
    file: "tools/spherical-render-gate-check.mjs",
    pattern:
      /cleanup\s*\(\s*\)[\s\S]*?const\s+renderCheck\s*=\s*runJsonCheck\s*\(\s*["']render-check["'][\s\S]*?["']--topology["'][\s\S]*?["']cubed-sphere["'][\s\S]*?renderUsesSphericalProjection:\s*renderCheck\.parsed\?\.renderBackend\s*===\s*["']cpu-spherical-projection-reference["'][\s\S]*?debugLayerRestricted:[\s\S]*?debugProjectionSampling[\s\S]*?cleanup\s*\(\s*\)[\s\S]*?function\s+cleanup\s*\(\s*\)\s*\{[\s\S]*?rmSync\s*\(\s*debugOutputDir\s*,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\s*\)/,
  },
  {
    name: "sphericalRegressionSupportsGroupedTimeoutResumableRuns",
    file: "tools/spherical-regression-check.mjs",
    pattern:
      /const\s+resolutionGateFaceSizes\s*=\s*makeResolutionGateFaceSizes\s*\(\s*smallFaceSize\s*,\s*faceSize\s*\)[\s\S]*?const\s+requestedGroups\s*=\s*parseCsv\s*\(\s*options\.group\s*\?\?\s*options\.groups\s*,\s*\[\s*["']all["']\s*\]\s*\)[\s\S]*?const\s+checkTimeoutMs\s*=\s*parseIntOption\s*\(\s*options\s*,\s*["']timeout-ms["'][\s\S]*?const\s+heavyCheckTimeoutMs\s*=\s*parseIntOption\s*\(\s*options\s*,\s*["']heavy-timeout-ms["'][\s\S]*?resolutionGateFaceSizes\.join\s*\(\s*["'],["']\s*\)[\s\S]*?const\s+selectedChecks\s*=\s*checks[\s\S]*?group:\s*checkGroupForName\s*\(\s*name\s*\)[\s\S]*?timeoutMs:\s*checkTimeoutForName\s*\(\s*name\s*\)[\s\S]*?\.filter\s*\(\s*\(\s*check\s*\)\s*=>\s*groupMatches\s*\(\s*check\.group\s*\)\s*\)[\s\S]*?timeout:\s*timeoutMs[\s\S]*?function\s+makeResolutionGateFaceSizes\s*\(\s*a\s*,\s*b\s*\)/,
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
const derivedTerrainTopologyGuardStatus = measureDerivedTerrainTopologyGuards();
const derivedTerrainTopologyGuardReady = derivedTerrainTopologyGuardStatus.missing.length === 0;
const hydrologyTopologyGuardStatus = measureHydrologyTopologyGuards();
const hydrologyTopologyGuardReady = hydrologyTopologyGuardStatus.missing.length === 0;
const worldTopologyGuardStatus = measureWorldTopologyGuards();
const worldTopologyGuardReady = worldTopologyGuardStatus.missing.length === 0;
const geologyFeatureTopologyGuardStatus = measureGeologyFeatureTopologyGuards();
const geologyFeatureTopologyGuardReady = geologyFeatureTopologyGuardStatus.missing.length === 0;
const geologyCoreTopologyGuardStatus = measureGeologyCoreTopologyGuards();
const geologyCoreTopologyGuardReady = geologyCoreTopologyGuardStatus.missing.length === 0;
const geologySurfaceTopologyGuardStatus = measureGeologySurfaceTopologyGuards();
const geologySurfaceTopologyGuardReady = geologySurfaceTopologyGuardStatus.missing.length === 0;
const interfaceTopologyGuardStatus = measureInterfaceTopologyGuards();
const interfaceTopologyGuardReady = interfaceTopologyGuardStatus.missing.length === 0;
const diagnosticToolchainGuardStatus = measureDiagnosticToolchainGuards();
const diagnosticToolchainGuardReady = diagnosticToolchainGuardStatus.missing.length === 0;

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
    legacyFallbackIndexGuardReady &&
    derivedTerrainTopologyGuardReady &&
    hydrologyTopologyGuardReady &&
    worldTopologyGuardReady &&
    geologyFeatureTopologyGuardReady &&
    geologyCoreTopologyGuardReady &&
    geologySurfaceTopologyGuardReady &&
    interfaceTopologyGuardReady &&
    diagnosticToolchainGuardReady,
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
  derivedTerrainTopologyGuardReady,
  derivedTerrainTopologyGuardCount: derivedTerrainTopologyGuardStatus.guarded.length,
  derivedTerrainTopologyGuardMissing: derivedTerrainTopologyGuardStatus.missing,
  guardedDerivedTerrainTopologyPaths: derivedTerrainTopologyGuardStatus.guarded,
  hydrologyTopologyGuardReady,
  hydrologyTopologyGuardCount: hydrologyTopologyGuardStatus.guarded.length,
  hydrologyTopologyGuardMissing: hydrologyTopologyGuardStatus.missing,
  guardedHydrologyTopologyPaths: hydrologyTopologyGuardStatus.guarded,
  worldTopologyGuardReady,
  worldTopologyGuardCount: worldTopologyGuardStatus.guarded.length,
  worldTopologyGuardMissing: worldTopologyGuardStatus.missing,
  guardedWorldTopologyPaths: worldTopologyGuardStatus.guarded,
  geologyFeatureTopologyGuardReady,
  geologyFeatureTopologyGuardCount: geologyFeatureTopologyGuardStatus.guarded.length,
  geologyFeatureTopologyGuardMissing: geologyFeatureTopologyGuardStatus.missing,
  guardedGeologyFeatureTopologyPaths: geologyFeatureTopologyGuardStatus.guarded,
  geologyCoreTopologyGuardReady,
  geologyCoreTopologyGuardCount: geologyCoreTopologyGuardStatus.guarded.length,
  geologyCoreTopologyGuardMissing: geologyCoreTopologyGuardStatus.missing,
  guardedGeologyCoreTopologyPaths: geologyCoreTopologyGuardStatus.guarded,
  geologySurfaceTopologyGuardReady,
  geologySurfaceTopologyGuardCount: geologySurfaceTopologyGuardStatus.guarded.length,
  geologySurfaceTopologyGuardMissing: geologySurfaceTopologyGuardStatus.missing,
  guardedGeologySurfaceTopologyPaths: geologySurfaceTopologyGuardStatus.guarded,
  interfaceTopologyGuardReady,
  interfaceTopologyGuardCount: interfaceTopologyGuardStatus.guarded.length,
  interfaceTopologyGuardMissing: interfaceTopologyGuardStatus.missing,
  guardedInterfaceTopologyPaths: interfaceTopologyGuardStatus.guarded,
  diagnosticToolchainGuardReady,
  diagnosticToolchainGuardCount: diagnosticToolchainGuardStatus.guarded.length,
  diagnosticToolchainGuardMissing: diagnosticToolchainGuardStatus.missing,
  guardedDiagnosticToolchainPaths: diagnosticToolchainGuardStatus.guarded,
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
    "derivedTerrainTopologyGuardReady means terrain shape, distance, smoothing, labels, and latitude use graph topology or cell metadata before legacy rectangular helpers",
    "hydrologyTopologyGuardReady means hydrology flow, smoothing, diagnostics, and watershed accounting use topology methods and area weights before legacy rectangular helpers",
    "worldTopologyGuardReady means cubed-sphere createWorld requests route to the production adapter, force geology-v2, use area-weighted stats, and prefer spherical plate drift",
    "geologyFeatureTopologyGuardReady means geology-v2 features, axes, and transform/fracture diagnostics route graph-backed worlds through topology-aware stress, diffusion, smoothing, and segmentation paths",
    "geologyCoreTopologyGuardReady means boundaries, plates, crust advection, and oceanic ridge-age distance route graph-backed worlds through spherical plate, graph-neighbor, and heap-distance paths before legacy raster helpers",
    "geologySurfaceTopologyGuardReady means sea level, sediment, rift connectivity, passive margins, orogeny, pipeline smoothing, and relief budget use topology-aware graph paths or explicitly tracked legacy radius helpers",
    "interfaceTopologyGuardReady means terrain, hydrology, climate, biosphere, and resource getters expose graph-derived fields and are covered by area-weighted topology-aware interface checks",
    "diagnosticToolchainGuardReady means artifact scans, performance profiles, scenario snapshots, grouped regression checks, render gates, and debug tools preserve cubed-sphere topology options and clean temporary render artifacts",
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

function measureDerivedTerrainTopologyGuards() {
  return measureRegexSpecs(derivedTerrainTopologyGuardSpecs, "missing graph-backed derived terrain topology guard");
}

function measureHydrologyTopologyGuards() {
  return measureRegexSpecs(hydrologyTopologyGuardSpecs, "missing graph-backed hydrology topology guard");
}

function measureWorldTopologyGuards() {
  return measureRegexSpecs(worldTopologyGuardSpecs, "missing graph-backed world topology guard");
}

function measureGeologyFeatureTopologyGuards() {
  return measureRegexSpecs(geologyFeatureTopologyGuardSpecs, "missing graph-backed geology feature topology guard");
}

function measureGeologyCoreTopologyGuards() {
  return measureRegexSpecs(geologyCoreTopologyGuardSpecs, "missing graph-backed geology core topology guard");
}

function measureGeologySurfaceTopologyGuards() {
  return measureRegexSpecs(geologySurfaceTopologyGuardSpecs, "missing graph-backed geology surface topology guard");
}

function measureInterfaceTopologyGuards() {
  return measureRegexSpecs(interfaceTopologyGuardSpecs, "missing graph-backed interface topology guard");
}

function measureDiagnosticToolchainGuards() {
  return measureRegexSpecs(diagnosticToolchainGuardSpecs, "missing spherical diagnostic toolchain guard");
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
