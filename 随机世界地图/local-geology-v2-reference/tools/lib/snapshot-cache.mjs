import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const TYPED_ARRAYS = new Map([
  ["Float32Array", Float32Array],
  ["Float64Array", Float64Array],
  ["Int32Array", Int32Array],
  ["Uint32Array", Uint32Array],
  ["Int16Array", Int16Array],
  ["Uint16Array", Uint16Array],
  ["Int8Array", Int8Array],
  ["Uint8Array", Uint8Array],
  ["Uint8ClampedArray", Uint8ClampedArray],
]);

export function saveWorldSnapshot(world, snapshotDir, { seedText, pipelineMode, resolution } = {}) {
  mkdirSync(snapshotDir, { recursive: true });
  const meta = {
    version: 1,
    seedText: seedText ?? world.params?.seedText,
    pipelineMode: pipelineMode ?? world.params?.pipelineMode,
    resolution: resolution ?? world.params?.resolution,
    step: world.step,
    ageYears: world.ageYears,
    seaLevel: world.seaLevel,
    baseSeaLevel: world.baseSeaLevel ?? null,
    geologicSeaLevelOffset: world.geologicSeaLevelOffset ?? null,
    stats: world.stats,
    params: world.params,
    sedimentBudgetDiagnostics: world.sedimentBudgetDiagnostics ?? null,
    geologicSeaLevelDiagnostics: world.geologicSeaLevelDiagnostics ?? null,
    transformDiagnostics: world.transformDiagnostics ?? null,
    reliefDiagnostics: world.reliefDiagnostics ?? null,
    gitCommit: gitCommit(),
  };
  const grid = {};
  for (const [key, value] of Object.entries(world.grid)) {
    if (isTypedArray(value)) {
      grid[key] = encodeTypedArray(value);
    } else if (typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value === null) {
      grid[key] = { type: "primitive", value };
    }
  }
  const payload = { meta, grid };
  const key = snapshotKey(meta);
  const file = join(snapshotDir, `${key}.json`);
  writeFileSync(file, JSON.stringify(payload));
  return file;
}

export function loadWorldSnapshot(file) {
  if (!existsSync(file)) throw new Error(`Snapshot not found: ${file}`);
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const grid = {};
  for (const [key, value] of Object.entries(payload.grid ?? {})) {
    if (value.type === "primitive") {
      grid[key] = value.value;
    } else {
      grid[key] = decodeTypedArray(value);
    }
  }
  return {
    grid,
    params: payload.meta.params ?? {},
    step: payload.meta.step ?? 0,
    ageYears: payload.meta.ageYears ?? 0,
    seaLevel: payload.meta.seaLevel ?? 0,
    baseSeaLevel: payload.meta.baseSeaLevel ?? undefined,
    geologicSeaLevelOffset: payload.meta.geologicSeaLevelOffset ?? undefined,
    stats: payload.meta.stats ?? {},
    sedimentBudgetDiagnostics: payload.meta.sedimentBudgetDiagnostics ?? null,
    geologicSeaLevelDiagnostics: payload.meta.geologicSeaLevelDiagnostics ?? null,
    transformDiagnostics: payload.meta.transformDiagnostics ?? null,
    reliefDiagnostics: payload.meta.reliefDiagnostics ?? null,
    snapshotMeta: payload.meta,
  };
}

export function snapshotLabel(file) {
  return basename(file, ".json");
}

function encodeTypedArray(value) {
  return {
    type: value.constructor.name,
    length: value.length,
    data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64"),
  };
}

function decodeTypedArray(value) {
  const Ctor = TYPED_ARRAYS.get(value.type);
  if (!Ctor) throw new Error(`Unsupported typed array in snapshot: ${value.type}`);
  const bytes = Buffer.from(value.data, "base64");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Ctor(buffer, 0, value.length);
}

function isTypedArray(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function snapshotKey(meta) {
  const raw = `${meta.seedText}|${meta.pipelineMode}|${meta.resolution}|${meta.step}|${meta.gitCommit ?? "nogit"}`;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 10);
  return `${sanitize(meta.seedText)}_${meta.pipelineMode}_${meta.resolution}_${meta.step}_${hash}`;
}

function sanitize(value) {
  return String(value ?? "seed").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 64);
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

