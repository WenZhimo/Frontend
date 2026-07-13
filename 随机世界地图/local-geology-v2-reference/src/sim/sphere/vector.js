export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function dot3(ax, ay, az, bx, by, bz) {
  return ax * bx + ay * by + az * bz;
}

export function length3(x, y, z) {
  return Math.hypot(x, y, z);
}

export function normalize3(x, y, z) {
  const length = length3(x, y, z) || 1;
  return {
    x: x / length,
    y: y / length,
    z: z / length,
  };
}

export function cross3(ax, ay, az, bx, by, bz) {
  return {
    x: ay * bz - az * by,
    y: az * bx - ax * bz,
    z: ax * by - ay * bx,
  };
}

export function angularDistance3(ax, ay, az, bx, by, bz) {
  return Math.acos(clamp(dot3(ax, ay, az, bx, by, bz), -1, 1));
}

export function lonLatToVec3(lon, lat) {
  const cosLat = Math.cos(lat);
  return {
    x: Math.cos(lon) * cosLat,
    y: Math.sin(lat),
    z: Math.sin(lon) * cosLat,
  };
}

export function vec3ToLonLat(x, y, z) {
  let lon = Math.atan2(z, x);
  if (lon < 0) lon += TAU;
  return {
    lon,
    lat: Math.asin(clamp(y, -1, 1)),
  };
}

export function rotateAroundAxis(point, axis, angle) {
  const n = normalize3(axis.x, axis.y, axis.z);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const axisDot = dot3(n.x, n.y, n.z, point.x, point.y, point.z);
  const cross = cross3(n.x, n.y, n.z, point.x, point.y, point.z);
  return normalize3(
    point.x * cos + cross.x * sin + n.x * axisDot * (1 - cos),
    point.y * cos + cross.y * sin + n.y * axisDot * (1 - cos),
    point.z * cos + cross.z * sin + n.z * axisDot * (1 - cos),
  );
}
