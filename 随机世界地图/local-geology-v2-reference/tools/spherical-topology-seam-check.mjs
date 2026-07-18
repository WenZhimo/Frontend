import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";
import { measureTopologyDiagnostics } from "../src/sim/topology.js";

const faceSize = Math.max(2, Math.trunc(Number(process.argv[2] ?? 24)));

const smooth = createCubedSphereProductionGridAdapter({ faceSize });
for (let id = 0; id < smooth.size; id += 1) {
  smooth.elev[id] = smooth.positionX[id] * 0.12 + smooth.positionY[id] * 0.08 - smooth.positionZ[id] * 0.05;
}
const smoothDiagnostics = measureTopologyDiagnostics({ grid: smooth });

const broken = createCubedSphereProductionGridAdapter({ faceSize });
for (let id = 0; id < broken.size; id += 1) {
  broken.elev[id] = smooth.elev[id] + (broken.face[id] % 2 === 0 ? 0.65 : -0.65);
}
const brokenDiagnostics = measureTopologyDiagnostics({ grid: broken });

const checks = {
  graphBacked: smoothDiagnostics.graphBacked === true && brokenDiagnostics.graphBacked === true,
  smoothSeamRiskLow: smoothDiagnostics.faceSeamContinuityRisk < 0.02,
  brokenSeamRiskHigh: brokenDiagnostics.faceSeamContinuityRisk > 0.3,
  seamRiskSeparatesBrokenFromSmooth:
    brokenDiagnostics.faceSeamContinuityRisk > smoothDiagnostics.faceSeamContinuityRisk + 0.25,
  legacyPolarRiskNotApplied: smoothDiagnostics.polarBoundaryRisk === 0 && smoothDiagnostics.polarAccessRisk === 0,
};

const result = {
  valid: Object.values(checks).every(Boolean),
  faceSize,
  smooth: pickTopologyDiagnostics(smoothDiagnostics),
  broken: pickTopologyDiagnostics(brokenDiagnostics),
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function pickTopologyDiagnostics(diagnostics) {
  return {
    topologyKind: diagnostics.topologyKind,
    graphBacked: diagnostics.graphBacked,
    neighborConsistencyValid: diagnostics.neighborConsistencyValid,
    floodFillTopologyValid: diagnostics.floodFillTopologyValid,
    connectedComponentTopologyValid: diagnostics.connectedComponentTopologyValid,
    seamContinuityRisk: diagnostics.seamContinuityRisk,
    faceSeamContinuityRisk: diagnostics.faceSeamContinuityRisk,
    polarBoundaryRisk: diagnostics.polarBoundaryRisk,
    polarAccessRisk: diagnostics.polarAccessRisk,
  };
}
