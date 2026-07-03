import { spawnSync } from "node:child_process";
import { parseIntOption, parseOptions } from "./lib/cli.mjs";

const { positional, options } = parseOptions(process.argv.slice(2));
const seedText = positional[0] ?? options.seed ?? "龙骨海-纪元7";
const faceSize = parseIntOption(options, "face-size", Number(positional[1] ?? 64));
const steps = parseIntOption(options, "steps", Number(positional[2] ?? 200));
const smallFaceSize = Math.max(16, Math.floor(faceSize / 2));
const failures = [];

const checks = [
  ["sphere-topology-check", ["tools/sphere-topology-check.mjs", String(faceSize)]],
  ["face-seam-check", ["tools/face-seam-check.mjs", String(faceSize)]],
  ["area-weight-check", ["tools/area-weight-check.mjs", String(faceSize)]],
  ["projection-check:equirectangular", ["tools/projection-check.mjs", String(faceSize), "equirectangular"]],
  ["projection-check:mollweide", ["tools/projection-check.mjs", String(faceSize), "mollweide"]],
  ["spherical-topology-api-check", ["tools/spherical-topology-api-check.mjs", String(faceSize)]],
  ["spherical-production-adapter-check", ["tools/spherical-production-adapter-check.mjs", String(faceSize)]],
  ["spherical-connectivity-check", ["tools/spherical-connectivity-check.mjs", String(faceSize)]],
  ["spherical-boundary-check", ["tools/spherical-boundary-check.mjs", seedText, String(faceSize), "14", String(steps)]],
  ["spherical-plate-check", ["tools/spherical-plate-check.mjs", seedText, String(faceSize), "14", String(steps)]],
  ["spherical-core-check", ["tools/spherical-core-check.mjs", seedText, String(faceSize), "14", String(steps)]],
  ["spherical-noise-check", ["tools/spherical-noise-check.mjs", String(faceSize), seedText]],
  ["spherical-diagnostic-terrain-check", ["tools/spherical-diagnostic-terrain-check.mjs", seedText, String(faceSize), String(steps)]],
  ["spherical-diagnostic-terrain-check:small", ["tools/spherical-diagnostic-terrain-check.mjs", "artifact-seed-3", String(smallFaceSize), "55"]],
  ["spherical-render-check:mollweide", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_mollweide.ppm", "mollweide", "256", "128", "diagnostic-elevation", seedText, "20"]],
  ["spherical-render-check:normal-motion", ["tools/spherical-render-check.mjs", String(smallFaceSize), "_spherical_regression_normal_motion.ppm", "equirectangular", "256", "128", "normal-motion", seedText, "20"]],
];

const startedAt = Date.now();
const results = [];

for (const [name, args] of checks) {
  const result = runNodeCheck(name, args);
  results.push(result);
  if (!result.valid) failures.push(name);
}

const summary = {
  valid: failures.length === 0,
  seedText,
  faceSize,
  steps,
  checkCount: results.length,
  failures,
  totalMs: Date.now() - startedAt,
  results,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.valid ? 0 : 1);

function runNodeCheck(name, args) {
  const startedAt = Date.now();
  const child = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = String(child.stdout ?? "").trim();
  const stderr = String(child.stderr ?? "").trim();
  let parsed = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  return {
    name,
    valid: child.status === 0,
    status: child.status,
    ms: Date.now() - startedAt,
    metrics: compactMetrics(parsed),
    stderr: stderr ? stderr.slice(0, 1200) : undefined,
  };
}

function compactMetrics(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const picked = {};
  for (const key of [
    "valid",
    "topologyKind",
    "faceSize",
    "cellCount",
    "blankShare",
    "activeBoundaryShare",
    "externalSeaShare",
    "inlandWaterCandidateShare",
    "closedBasinCount",
    "derivedSeaShare",
    "diagnosticSeaCandidateShare",
    "seamDiffToInteriorRatio",
    "seamRiskEdgeShare",
    "poleLongitudeVarianceMax",
    "maxNearestAngularError",
    "areaTotalError",
  ]) {
    if (parsed[key] !== undefined) picked[key] = parsed[key];
  }
  return picked;
}
