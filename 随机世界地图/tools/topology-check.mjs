import { createTopology } from "../src/sim/topology.js";

const sizes = [
  [8, 4],
  [16, 8],
  [32, 16],
];

const failures = [];
const results = [];

for (const [width, height] of sizes) {
  const topology = createTopology(width, height);
  const result = checkTopology(topology);
  results.push(result);
  for (const [name, valid] of Object.entries(result.checks)) {
    if (!valid) failures.push(`${width}x${height}:${name}`);
  }
}

const report = {
  valid: failures.length === 0,
  failures,
  results,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);

function checkTopology(topology) {
  const { width, height, size } = topology;
  const allMask = new Uint8Array(size);
  allMask.fill(1);
  const flood = topology.floodFill([topology.index(0, 0)], () => true);
  const components = topology.connectedComponents(allMask);
  const sparseMask = new Uint8Array(size);
  sparseMask[topology.index(0, 0)] = 1;
  sparseMask[topology.index(width - 1, 0)] = 1;
  sparseMask[topology.index(0, height - 1)] = 1;
  const sparseComponents = topology.connectedComponents(sparseMask);

  const checks = {
    cylindricalDefaults: topology.kind === "cylindrical" && topology.wrapXEnabled === true && topology.wrapYEnabled === false,
    indexXyRoundTrip: checkIndexXyRoundTrip(topology),
    xWrapValid: topology.index(-1, 0) === topology.index(width - 1, 0) && topology.index(width, 0) === topology.index(0, 0),
    yNoWrapValid: topology.index(0, -1) < 0 && topology.index(0, height) < 0,
    neighbor4SymmetryValid: checkNeighborSymmetry(topology, 4),
    neighbor8SymmetryValid: checkNeighborSymmetry(topology, 8),
    radiusNeighborsValid: checkRadiusNeighbors(topology),
    floodFillTopologyValid: countMask(flood) === size,
    connectedComponentsValid: components.componentCount === 1 && components.componentSizes[1] === size,
    seamNeighborValid: topology.neighbors4(topology.index(0, 1)).includes(topology.index(width - 1, 1)),
    sparseComponentValid: sparseComponents.componentCount === 2,
    sampleValid: topology.sample(new Int32Array(size).map((_, i) => i), 1, 1) === topology.index(1, 1),
    sampleWrappedValid: topology.sampleWrapped(new Int32Array(size).map((_, i) => i), -1, 1) === topology.index(width - 1, 1),
    distanceWrapValid: topology.distanceXY(0, 0, width - 1, 0) === 1,
  };

  return {
    size: `${width}x${height}`,
    checks,
  };
}

function checkIndexXyRoundTrip(topology) {
  for (let i = 0; i < topology.size; i += 1) {
    const { x, y } = topology.xy(i);
    if (topology.index(x, y) !== i) return false;
  }
  return true;
}

function checkNeighborSymmetry(topology, mode) {
  const neighbors = mode === 8 ? topology.neighbors8 : topology.neighbors4;
  for (let i = 0; i < topology.size; i += 1) {
    for (const n of neighbors(i)) {
      if (!neighbors(n).includes(i)) return false;
    }
  }
  return true;
}

function checkRadiusNeighbors(topology) {
  for (let i = 0; i < topology.size; i += 1) {
    const seen = new Set();
    topology.forEachNeighborRadius(i, 2, (nid) => {
      if (nid < 0 || nid >= topology.size) seen.add(-1);
      if (nid === i) seen.add(-2);
      if (seen.has(nid)) seen.add(-3);
      seen.add(nid);
    });
    if (seen.has(-1) || seen.has(-2) || seen.has(-3)) return false;
  }
  return true;
}

function countMask(mask) {
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) total += mask[i] ? 1 : 0;
  return total;
}
