export const PHOSPHOR_DEFAULT_CONFIG = {
  target: null,
  mount: null,
  backend: "auto",
  quality: "medium",
  motionMode: "realtime",
  accessibilityMode: "preserveDom",
  maxDpr: 1,
  frameRate: 45,
  sourceFrameInterval: 520,
  sourceScale: 0.55,
  matrixPitch: 8,
  cellFillRatio: 0.42,
  cellCornerRadius: 1.4,
  threshold: 0.055,
  brightness: 1.18,
  contrast: 1.36,
  coreIntensity: 1.48,
  bloomRadius: 22,
  bloomStrength: 1.08,
  diffusionStrength: 0.48,
  blackLevel: 0.94,
  noiseAmount: 0.026,
  vignetteStrength: 0.42,
  flickerAmount: 0.025,
  opacity: 1,
  scanlineStrength: 0,
  phosphorPalette: {
    core: [235, 244, 255],
    hot: [164, 204, 255],
    glow: [98, 128, 255],
    outer: [48, 52, 176],
    black: [2, 5, 12],
  },
};

const QUALITY_PRESETS = {
  low: {
    maxDpr: 1,
    frameRate: 30,
    sourceFrameInterval: 720,
    sourceScale: 0.42,
    matrixPitch: 10,
    bloomRadius: 16,
    bloomStrength: 0.88,
    diffusionStrength: 0.32,
  },
  medium: {
    maxDpr: 1,
    frameRate: 45,
    sourceFrameInterval: 520,
    sourceScale: 0.55,
    matrixPitch: 8,
    bloomRadius: 22,
    bloomStrength: 1.08,
    diffusionStrength: 0.42,
  },
  high: {
    maxDpr: 1.25,
    frameRate: 60,
    sourceFrameInterval: 420,
    sourceScale: 0.66,
    matrixPitch: 5,
    bloomRadius: 28,
    bloomStrength: 1.18,
    diffusionStrength: 0.5,
  },
};

export function createPhosphorConfig(config = {}) {
  const quality = config.quality || PHOSPHOR_DEFAULT_CONFIG.quality;
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
  return {
    ...PHOSPHOR_DEFAULT_CONFIG,
    ...preset,
    ...config,
    quality,
    phosphorPalette: {
      ...PHOSPHOR_DEFAULT_CONFIG.phosphorPalette,
      ...(config.phosphorPalette || {}),
    },
  };
}

export function applyQualityPreset(currentConfig, quality) {
  return createPhosphorConfig({
    ...currentConfig,
    ...(QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium),
    quality,
  });
}
