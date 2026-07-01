export function readParams(elements) {
  return {
    seedText: elements.seedText.value,
    waterLevel: Number(elements.waterLevel.value),
    intensity: Number(elements.intensity.value),
    plateCount: Number(elements.plateCount.value),
    timeScale: Number(elements.timeScale.value),
    resolution: elements.resolution.value,
    showBoundaries: elements.showBoundaries.checked,
    pipelineMode: elements.pipelineMode?.value ?? "geology-v2",
  };
}

export function bindControlLabels(elements) {
  const update = () => {
    elements.waterLabel.textContent = `${elements.waterLevel.value}%`;
    elements.intensityLabel.textContent = `${Number(elements.intensity.value).toFixed(2)}x`;
    elements.platesLabel.textContent = elements.plateCount.value;
  };
  elements.waterLevel.addEventListener("input", update);
  elements.intensity.addEventListener("input", update);
  elements.plateCount.addEventListener("input", update);
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
