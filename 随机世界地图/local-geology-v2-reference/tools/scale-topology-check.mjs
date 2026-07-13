import {
  REFERENCE_CUBED_SPHERE_FACE_SIZE,
  cellsFromReference,
  referenceCellsFromGridDistance,
  resolutionScale,
} from "../src/sim/scale.js";
import { createGrid } from "../src/sim/grid.js";
import { createCubedSphereProductionGridAdapter } from "../src/sim/sphere/productionGridAdapter.js";

const cylindricalReference = createGrid(512, 256);
const cylindricalSmall = createGrid(256, 128);
const sphereReference = createCubedSphereProductionGridAdapter({ faceSize: REFERENCE_CUBED_SPHERE_FACE_SIZE });
const sphereSmall = createCubedSphereProductionGridAdapter({ faceSize: 64 });

const result = {
  valid: true,
  cylindricalReferenceScale: resolutionScale(cylindricalReference),
  cylindricalSmallScale: resolutionScale(cylindricalSmall),
  sphereReferenceScale: resolutionScale(sphereReference),
  sphereSmallScale: resolutionScale(sphereSmall),
  sphereReferenceFaceSize: sphereReference.faceSize,
  sphereSmallFaceSize: sphereSmall.faceSize,
  cylindricalReferenceCells: cellsFromReference(cylindricalReference, 8),
  cylindricalSmallCells: cellsFromReference(cylindricalSmall, 8),
  sphereReferenceCells: cellsFromReference(sphereReference, 8),
  sphereSmallCells: cellsFromReference(sphereSmall, 8),
  sphereReferenceDistance: referenceCellsFromGridDistance(sphereReference, 8),
  sphereSmallDistance: referenceCellsFromGridDistance(sphereSmall, 4),
};

if (Math.abs(result.cylindricalReferenceScale - 1) > 1e-9) result.valid = false;
if (Math.abs(result.cylindricalSmallScale - 0.5) > 1e-9) result.valid = false;
if (Math.abs(result.sphereReferenceScale - 1) > 1e-9) result.valid = false;
if (Math.abs(result.sphereSmallScale - 0.5) > 1e-9) result.valid = false;
if (result.cylindricalReferenceCells !== 8) result.valid = false;
if (result.cylindricalSmallCells !== 4) result.valid = false;
if (result.sphereReferenceCells !== 8) result.valid = false;
if (result.sphereSmallCells !== 4) result.valid = false;
if (Math.abs(result.sphereReferenceDistance - 8) > 1e-9) result.valid = false;
if (Math.abs(result.sphereSmallDistance - 8) > 1e-9) result.valid = false;

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
