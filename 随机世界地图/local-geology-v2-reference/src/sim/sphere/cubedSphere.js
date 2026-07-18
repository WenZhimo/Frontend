import { angularDistance3, dot3, normalize3, vec3ToLonLat } from "./vector.js";

const FACE_COUNT = 6;
const FACE_POS_X = 0;
const FACE_NEG_X = 1;
const FACE_POS_Y = 2;
const FACE_NEG_Y = 3;
const FACE_POS_Z = 4;
const FACE_NEG_Z = 5;

export function createCubedSphereGrid(faceSize = 64) {
  const n = Math.max(2, Math.trunc(faceSize));
  const faceCellCount = n * n;
  const size = FACE_COUNT * faceCellCount;
  const positionX = new Float32Array(size);
  const positionY = new Float32Array(size);
  const positionZ = new Float32Array(size);
  const lon = new Float32Array(size);
  const lat = new Float32Array(size);
  const area = new Float32Array(size);
  const face = new Uint8Array(size);
  const faceU = new Uint16Array(size);
  const faceV = new Uint16Array(size);
  const neighborStart = new Int32Array(size);
  const neighborCount = new Uint8Array(size);
  const neighbors = new Int32Array(size * 4);
  const edgeLength = new Float32Array(size * 4);
  const edgeTangentX = new Float32Array(size * 4);
  const edgeTangentY = new Float32Array(size * 4);
  const edgeTangentZ = new Float32Array(size * 4);

  for (let f = 0; f < FACE_COUNT; f += 1) {
    for (let v = 0; v < n; v += 1) {
      for (let u = 0; u < n; u += 1) {
        const id = cellId(n, f, u, v);
        const p = faceUvToVec3(f, uvToLocal(u, n), uvToLocal(v, n));
        const ll = vec3ToLonLat(p.x, p.y, p.z);
        positionX[id] = p.x;
        positionY[id] = p.y;
        positionZ[id] = p.z;
        lon[id] = ll.lon;
        lat[id] = ll.lat;
        face[id] = f;
        faceU[id] = u;
        faceV[id] = v;
      }
    }
  }

  for (let id = 0; id < size; id += 1) {
    neighborStart[id] = id * 4;
    const f = face[id];
    const u = faceU[id];
    const v = faceV[id];
    let count = 0;
    count = addNeighbor(n, neighbors, id, count, f, u - 1, v);
    count = addNeighbor(n, neighbors, id, count, f, u + 1, v);
    count = addNeighbor(n, neighbors, id, count, f, u, v - 1);
    count = addNeighbor(n, neighbors, id, count, f, u, v + 1);
    neighborCount[id] = count;
  }

  for (let id = 0; id < size; id += 1) {
    const start = neighborStart[id];
    for (let k = 0; k < neighborCount[id]; k += 1) {
      const nid = neighbors[start + k];
      const offset = start + k;
      edgeLength[start + k] = angularDistance3(
        positionX[id],
        positionY[id],
        positionZ[id],
        positionX[nid],
        positionY[nid],
        positionZ[nid],
      );
      const tangent = tangentTowardNeighbor(
        positionX[id],
        positionY[id],
        positionZ[id],
        positionX[nid],
        positionY[nid],
        positionZ[nid],
      );
      edgeTangentX[offset] = tangent.x;
      edgeTangentY[offset] = tangent.y;
      edgeTangentZ[offset] = tangent.z;
    }
  }

  estimateCellAreas({ faceSize: n, size, positionX, positionY, positionZ, area });

  return {
    topologyKind: "cubed-sphere",
    kind: "cubed-sphere",
    faceSize: n,
    faceCount: FACE_COUNT,
    size,
    positionX,
    positionY,
    positionZ,
    lon,
    lat,
    area,
    face,
    faceU,
    faceV,
    neighborStart,
    neighborCount,
    neighbors,
    edgeLength,
    edgeTangentX,
    edgeTangentY,
    edgeTangentZ,
    cellId: (f, u, v) => cellId(n, f, u, v),
    faceUv: (id) => faceUvFromId(n, id),
    forEachCell: (visit) => {
      for (let id = 0; id < size; id += 1) visit(id);
    },
    forEachNeighbor: (id, visit) => {
      const start = neighborStart[id];
      for (let k = 0; k < neighborCount[id]; k += 1) visit(neighbors[start + k], k, edgeLength[start + k]);
    },
    neighborsOf: (id) => {
      const out = [];
      const start = neighborStart[id];
      for (let k = 0; k < neighborCount[id]; k += 1) out.push(neighbors[start + k]);
      return out;
    },
    distance: (a, b) =>
      angularDistance3(positionX[a], positionY[a], positionZ[a], positionX[b], positionY[b], positionZ[b]),
    nearestCell: (x, y, z) => nearestCellByVector({ faceSize: n, size, positionX, positionY, positionZ }, x, y, z),
  };
}

function tangentTowardNeighbor(ax, ay, az, bx, by, bz) {
  const radialProjection = dot3(bx, by, bz, ax, ay, az);
  return normalize3(
    bx - ax * radialProjection,
    by - ay * radialProjection,
    bz - az * radialProjection,
  );
}

export function cellId(faceSize, face, u, v) {
  return face * faceSize * faceSize + v * faceSize + u;
}

export function faceUvFromId(faceSize, id) {
  const faceCellCount = faceSize * faceSize;
  const face = Math.floor(id / faceCellCount);
  const local = id - face * faceCellCount;
  const v = Math.floor(local / faceSize);
  const u = local - v * faceSize;
  return { face, u, v };
}

export function faceUvToVec3(face, u, v) {
  if (face === FACE_POS_X) return normalize3(1, v, -u);
  if (face === FACE_NEG_X) return normalize3(-1, v, u);
  if (face === FACE_POS_Y) return normalize3(u, 1, -v);
  if (face === FACE_NEG_Y) return normalize3(u, -1, v);
  if (face === FACE_POS_Z) return normalize3(u, v, 1);
  return normalize3(-u, v, -1);
}

export function vec3ToFaceUv(x, y, z) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) {
    return x >= 0
      ? { face: FACE_POS_X, u: -z / ax, v: y / ax }
      : { face: FACE_NEG_X, u: z / ax, v: y / ax };
  }
  if (ay >= ax && ay >= az) {
    return y >= 0
      ? { face: FACE_POS_Y, u: x / ay, v: -z / ay }
      : { face: FACE_NEG_Y, u: x / ay, v: z / ay };
  }
  return z >= 0
    ? { face: FACE_POS_Z, u: x / az, v: y / az }
    : { face: FACE_NEG_Z, u: -x / az, v: y / az };
}

export function nearestCellByVector(grid, x, y, z) {
  if (Number.isFinite(grid?.faceSize) && grid.faceSize > 1) {
    const mapped = vec3ToFaceUv(x, y, z);
    return cellId(
      grid.faceSize,
      mapped.face,
      localToIndex(mapped.u, grid.faceSize),
      localToIndex(mapped.v, grid.faceSize),
    );
  }

  let best = 0;
  let bestDot = -Infinity;
  for (let id = 0; id < grid.size; id += 1) {
    const d = grid.positionX[id] * x + grid.positionY[id] * y + grid.positionZ[id] * z;
    if (d > bestDot) {
      bestDot = d;
      best = id;
    }
  }
  return best;
}

function uvToLocal(i, faceSize) {
  return ((i + 0.5) / faceSize) * 2 - 1;
}

function localToIndex(value, faceSize) {
  const normalized = (value + 1) * 0.5 * faceSize;
  return Math.max(0, Math.min(faceSize - 1, Math.floor(normalized)));
}

function addNeighbor(faceSize, neighbors, id, count, face, u, v) {
  let nid;
  if (u >= 0 && u < faceSize && v >= 0 && v < faceSize) {
    nid = cellId(faceSize, face, u, v);
  } else {
    const localU = uvToLocal(u, faceSize);
    const localV = uvToLocal(v, faceSize);
    const p = faceUvToVec3(face, localU, localV);
    const mapped = vec3ToFaceUv(p.x, p.y, p.z);
    nid = cellId(faceSize, mapped.face, localToIndex(mapped.u, faceSize), localToIndex(mapped.v, faceSize));
  }
  const start = id * 4;
  for (let i = 0; i < count; i += 1) {
    if (neighbors[start + i] === nid) return count;
  }
  neighbors[start + count] = nid;
  return count + 1;
}

function estimateCellAreas(grid) {
  const { faceSize, size, area } = grid;
  let total = 0;
  for (let f = 0; f < FACE_COUNT; f += 1) {
    for (let v = 0; v < faceSize; v += 1) {
      for (let u = 0; u < faceSize; u += 1) {
        const id = cellId(faceSize, f, u, v);
        const u0 = edgeToLocal(u, faceSize);
        const u1 = edgeToLocal(u + 1, faceSize);
        const v0 = edgeToLocal(v, faceSize);
        const v1 = edgeToLocal(v + 1, faceSize);
        const a = faceUvToVec3(f, u0, v0);
        const b = faceUvToVec3(f, u1, v0);
        const c = faceUvToVec3(f, u1, v1);
        const d = faceUvToVec3(f, u0, v1);
        const solidAngle = sphericalTriangleArea(a, b, c) + sphericalTriangleArea(a, c, d);
        area[id] = solidAngle;
        total += solidAngle;
      }
    }
  }
  const scale = (4 * Math.PI) / Math.max(total, Number.EPSILON);
  for (let id = 0; id < size; id += 1) area[id] *= scale;
}

function edgeToLocal(edge, faceSize) {
  return (edge / faceSize) * 2 - 1;
}

function sphericalTriangleArea(a, b, c) {
  const det =
    a.x * (b.y * c.z - b.z * c.y) -
    a.y * (b.x * c.z - b.z * c.x) +
    a.z * (b.x * c.y - b.y * c.x);
  const denominator = 1 + dot3(a.x, a.y, a.z, b.x, b.y, b.z) + dot3(b.x, b.y, b.z, c.x, c.y, c.z) + dot3(c.x, c.y, c.z, a.x, a.y, a.z);
  return Math.abs(2 * Math.atan2(det, denominator));
}
