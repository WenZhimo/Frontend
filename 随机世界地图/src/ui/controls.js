export function readParams(elements) {
  const urlParams = readUrlOnlyParams();
  const topologyMode = urlParams.topologyMode ?? elements.topologyMode?.value;
  const projectionMode = urlParams.projectionMode ?? elements.projectionMode?.value;
  const resolution = elements.resolution.value;
  const faceSize = urlParams.faceSize
    ?? optionalNumber(elements.faceSize?.value)
    ?? interactiveAutoFaceSize(topologyMode, urlParams.productionTopologyMode, resolution);
  return {
    seedText: elements.seedText.value,
    waterLevel: Number(elements.waterLevel.value),
    intensity: Number(elements.intensity.value),
    plateCount: Number(elements.plateCount.value),
    timeScale: Number(elements.timeScale.value),
    resolution,
    topologyMode,
    projectionMode,
    faceSize,
    showBoundaries: elements.showBoundaries.checked,
    pipelineMode: elements.pipelineMode?.value ?? "geology-v2",
    ...urlParams,
    topologyMode,
    projectionMode,
    faceSize,
  };
}

export function bindControlLabels(elements) {
  const update = () => {
    elements.waterLabel.textContent = `${elements.waterLevel.value}%`;
    elements.intensityLabel.textContent = `${Number(elements.intensity.value).toFixed(2)}x`;
    elements.platesLabel.textContent = elements.plateCount.value;
    if (elements.faceSizeLabel) {
      elements.faceSizeLabel.textContent = elements.faceSize?.value ? elements.faceSize.value : "自动";
    }
  };
  elements.waterLevel.addEventListener("input", update);
  elements.intensity.addEventListener("input", update);
  elements.plateCount.addEventListener("input", update);
  elements.faceSize?.addEventListener("change", update);
  update();
}

export function randomSeedText() {
  const roots = ["玄武", "龙骨", "晨汐", "铁雨", "青焰", "星盐", "雾冠", "赤潮"];
  const forms = ["海", "陆桥", "裂谷", "群岛", "高原", "盆地", "洋脊", "纪元"];
  const bytes = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Date.now() >>> 0;
    bytes[1] = Math.floor(performance.now() * 1000) >>> 0;
  }
  return `${roots[bytes[0] % roots.length]}${forms[bytes[1] % forms.length]}-${(bytes[0] ^ bytes[1]).toString(36).slice(-5)}`;
}

function readUrlOnlyParams() {
  let params;
  try {
    params = new URLSearchParams(globalThis.location?.search ?? "");
  } catch {
    return {};
  }

  const result = {};
  assignStringParam(result, "topologyMode", firstParam(params, ["topology", "topologyMode", "topology-mode"]));
  assignStringParam(result, "projectionMode", firstParam(params, ["projection", "projectionMode", "projection-mode"]));
  assignStringParam(
    result,
    "productionTopologyMode",
    firstParam(params, ["productionTopology", "productionTopologyMode", "production-topology"]),
  );
  assignNumberParam(result, "faceSize", firstParam(params, ["faceSize", "face-size"]));
  assignNumberParam(result, "renderWidth", firstParam(params, ["renderWidth", "render-width"]));
  assignNumberParam(result, "renderHeight", firstParam(params, ["renderHeight", "render-height"]));
  return result;
}

function firstParam(params, names) {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value !== "") return value;
  }
  return null;
}

function assignStringParam(target, key, value) {
  if (value !== null) target[key] = value;
}

function assignNumberParam(target, key, value) {
  if (value === null || value === undefined || value === "") return;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) target[key] = numeric;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function interactiveAutoFaceSize(topologyMode, productionTopologyMode, resolution) {
  if (topologyMode !== "cubed-sphere" && productionTopologyMode !== "cubed-sphere-adapter") return undefined;
  const [width, height] = String(resolution ?? "512x256").split("x").map(Number);
  const base = Math.max(2, Math.min(width || 512, height || 256));
  return Math.min(64, Math.max(24, Math.round(base / 2)));
}
