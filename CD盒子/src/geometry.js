import * as THREE from 'three';

const TAU = Math.PI * 2;

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-7) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) out.pop();
  }
  return out;
}

export function roundedRectPath(half, radius, cornerSegments = 6) {
  const r = Math.max(0.0001, Math.min(radius, half));
  const c = half - r;
  const corners = [
    [c, c, 0, Math.PI / 2],
    [-c, c, Math.PI / 2, Math.PI],
    [-c, -c, Math.PI, Math.PI * 1.5],
    [c, -c, Math.PI * 1.5, TAU],
  ];
  const points = [];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = a0 + (a1 - a0) * (i / cornerSegments);
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return dedupe(points);
}

export function circlePath(radius, segments = 64) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    points.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return points;
}

export function linePath(a, b, segments = 4) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return points;
}

/**
 * Rounded-rectangle cross section in (side, z). Normals are smooth and radial on the
 * corners, which keeps the thin highlights from breaking into facets.
 */
export function roundedProfile(hw, hh, rc, cornerSegments = 4) {
  const r = Math.max(0.0001, Math.min(rc, Math.min(hw, hh)));
  const cw = hw - r;
  const ch = hh - r;
  const corners = [
    [cw, -ch, -Math.PI / 2, 0],
    [cw, ch, 0, Math.PI / 2],
    [-cw, ch, Math.PI / 2, Math.PI],
    [-cw, -ch, Math.PI, Math.PI * 1.5],
  ];
  const pts = [];
  const nrm = [];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = a0 + (a1 - a0) * (i / cornerSegments);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      pts.push([cx + r * nx, cy + r * ny]);
      nrm.push([nx, ny]);
    }
  }
  // Deduplicate points but keep matching normals.
  const outPts = [];
  const outNrm = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = outPts[outPts.length - 1];
    if (!prev || Math.hypot(prev[0] - pts[i][0], prev[1] - pts[i][1]) > 1e-7) {
      outPts.push(pts[i]);
      outNrm.push(nrm[i]);
    }
  }
  if (outPts.length > 1) {
    const a = outPts[0];
    const b = outPts[outPts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) {
      outPts.pop();
      outNrm.pop();
    }
  }
  return { points: outPts, normals: outNrm, hw, hh, radius: r };
}

function pathFrames(points, closed) {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // For a CCW outline, (ty, -tx) points away from the shape.
    return { p, t: [tx, ty], s: [ty, -tx] };
  });
}

/**
 * Sweep a rounded rectangular profile along a 2D path.
 * Attributes are consumed by the plastic rod shader.
 */
export function buildSweepGeometry(path, profile, z, closed = true) {
  const frames = pathFrames(path, closed);
  const m = profile.points.length;
  const n = frames.length;
  const positions = [];
  const normals = [];
  const centers = [];
  const sides = [];
  const halves = [];
  const radii = [];
  const caps = [];
  const indices = [];

  for (let i = 0; i < n; i++) {
    const { p, s } = frames[i];
    for (let j = 0; j < m; j++) {
      const [ps, pz] = profile.points[j];
      const [ns, nz] = profile.normals[j];
      positions.push(p[0] + s[0] * ps, p[1] + s[1] * ps, z + pz);
      normals.push(s[0] * ns, s[1] * ns, nz);
      centers.push(p[0], p[1], z);
      sides.push(s[0], s[1]);
      halves.push(profile.hw, profile.hh);
      radii.push(profile.radius);
      caps.push(0);
    }
  }

  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const i0 = i;
    const i1 = (i + 1) % n;
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const a = i0 * m + j;
      const b = i0 * m + j1;
      const c = i1 * m + j;
      const d = i1 * m + j1;
      indices.push(a, b, c, b, d, c);
    }
  }

  if (!closed) {
    const addCap = (index, direction) => {
      const { p, s, t } = frames[index];
      const normal = [t[0] * direction, t[1] * direction, 0];
      const centerIndex = positions.length / 3;
      positions.push(p[0], p[1], z);
      normals.push(...normal);
      centers.push(p[0], p[1], z);
      sides.push(s[0], s[1]);
      halves.push(profile.hw, profile.hh);
      radii.push(profile.radius);
      caps.push(1);

      const ringStart = positions.length / 3;
      for (let j = 0; j < m; j++) {
        const [ps, pz] = profile.points[j];
        positions.push(p[0] + s[0] * ps, p[1] + s[1] * ps, z + pz);
        normals.push(...normal);
        centers.push(p[0], p[1], z);
        sides.push(s[0], s[1]);
        halves.push(profile.hw, profile.hh);
        radii.push(profile.radius);
        caps.push(1);
      }
      for (let j = 0; j < m; j++) {
        const a = ringStart + j;
        const b = ringStart + ((j + 1) % m);
        if (direction > 0) indices.push(centerIndex, a, b);
        else indices.push(centerIndex, b, a);
      }
    };
    addCap(0, -1);
    addCap(n - 1, 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 2));
  g.setAttribute('aHalf', new THREE.Float32BufferAttribute(halves, 2));
  g.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
  g.setAttribute('aCap', new THREE.Float32BufferAttribute(caps, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

export function roundedShape(half, radius) {
  const pts = roundedRectPath(half, radius, 8);
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  return shape;
}

/**
 * Flat plate built from a Shape. It has two faces and no rim: the rim is hidden by
 * the rounded frame in this model.
 */
export function buildSheetGeometry(shape, z0, z1, curveSegments = 24) {
  const src = new THREE.ShapeGeometry(shape, curveSegments);
  const pos = src.attributes.position;
  const idx = src.index;
  const count = pos.count;
  const positions = [];
  const normals = [];
  const thick = [];

  for (const [z, nz] of [
    [z1, 1],
    [z0, -1],
  ]) {
    for (let i = 0; i < count; i++) {
      positions.push(pos.getX(i), pos.getY(i), z);
      normals.push(0, 0, nz);
      thick.push(Math.abs(z1 - z0));
    }
  }

  const indices = [];
  for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i));
  for (let i = 0; i < idx.count; i += 3) {
    indices.push(idx.getX(i) + count, idx.getX(i + 2) + count, idx.getX(i + 1) + count);
  }

  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(thick, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Three-faced disc: printed front, silver data back, and an outer edge. Planar
 * local XY is used as the label UV space.
 */
export function buildDiscGeometry({
  radius = 60,
  inner = 7.5,
  thickness = 1.2,
  thetaSegments = 256,
  radialSegments = 12,
} = {}) {
  const positions = [];
  const normals = [];
  const faces = [];
  const indices = [];

  const addAnnulus = (z, normalZ, face, innerR, outerR) => {
    const base = positions.length / 3;
    const rows = radialSegments;
    const cols = thetaSegments;
    for (let i = 0; i <= rows; i++) {
      const r = innerR + ((outerR - innerR) * i) / rows;
      for (let j = 0; j < cols; j++) {
        const a = (j / cols) * TAU;
        positions.push(r * Math.cos(a), r * Math.sin(a), z);
        normals.push(0, 0, normalZ);
        faces.push(face);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const j1 = (j + 1) % cols;
        const a = base + i * cols + j;
        const b = base + i * cols + j1;
        const c = base + (i + 1) * cols + j;
        const d = base + (i + 1) * cols + j1;
        if (normalZ > 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  };

  addAnnulus(0, 1, 0, inner, radius);
  addAnnulus(-thickness, -1, 1, inner, radius);

  // Outer rim.
  const base = positions.length / 3;
  for (const z of [0, -thickness]) {
    for (let j = 0; j < thetaSegments; j++) {
      const a = (j / thetaSegments) * TAU;
      positions.push(radius * Math.cos(a), radius * Math.sin(a), z);
      normals.push(Math.cos(a), Math.sin(a), 0);
      faces.push(2);
    }
  }
  for (let j = 0; j < thetaSegments; j++) {
    const j1 = (j + 1) % thetaSegments;
    const a = base + j;
    const b = base + j1;
    const c = base + thetaSegments + j;
    const d = base + thetaSegments + j1;
    indices.push(a, b, c, b, d, c);
  }

  // Inner rim, so the centre hole has a visible plastic wall.
  const innerBase = positions.length / 3;
  for (const z of [0, -thickness]) {
    for (let j = 0; j < thetaSegments; j++) {
      const a = (j / thetaSegments) * TAU;
      positions.push(inner * Math.cos(a), inner * Math.sin(a), z);
      normals.push(-Math.cos(a), -Math.sin(a), 0);
      faces.push(2);
    }
  }
  for (let j = 0; j < thetaSegments; j++) {
    const j1 = (j + 1) % thetaSegments;
    const a = innerBase + j;
    const b = innerBase + j1;
    const c = innerBase + thetaSegments + j;
    const d = innerBase + thetaSegments + j1;
    indices.push(a, c, b, b, c, d);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(faces, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
