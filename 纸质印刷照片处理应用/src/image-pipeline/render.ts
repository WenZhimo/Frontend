import type { InkLayer, RenderInput, RenderOutput, SeparationMode } from "./types";

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type PreparedInkLayer = InkLayer & {
  rgb: Rgb;
  coverage: Float32Array;
  centerR: Float32Array;
  centerG: Float32Array;
  centerB: Float32Array;
  spreadR: Float32Array;
  spreadG: Float32Array;
  spreadB: Float32Array;
};

type ProcessCmyk = {
  c: number;
  m: number;
  y: number;
  k: number;
};

const MAX_EXPORT_EDGE = 2400;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function createRenderCanvas(width: number, height: number): RenderCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document === "undefined") {
    throw new Error("当前环境无法创建渲染画布");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getRenderContext(canvas: RenderCanvas, willReadFrequently = false): RenderContext | null {
  return canvas.getContext("2d", { willReadFrequently }) as RenderContext | null;
}

function parseHexColor(hex: string): Rgb {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((item) => item + item)
          .join("")
      : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToCss({ r, g, b }: Rgb) {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

function rgbToRgbaCss({ r, g, b }: Rgb, alpha: number) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${clamp(alpha)})`;
}

function mix(a: number, b: number, amount: number) {
  return a * (1 - amount) + b * amount;
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: mix(a.r, b.r, amount),
    g: mix(a.g, b.g, amount),
    b: mix(a.b, b.b, amount),
  };
}

function scaleRgb(color: Rgb, amount: number): Rgb {
  return {
    r: clamp((color.r * amount) / 255) * 255,
    g: clamp((color.g * amount) / 255) * 255,
    b: clamp((color.b * amount) / 255) * 255,
  };
}

function getHue({ r, g, b }: Rgb) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  if (max === rn) {
    return ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
  }

  if (max === gn) {
    return ((bn - rn) / delta + 2) * 60;
  }

  return ((rn - gn) / delta + 4) * 60;
}

function hueAffinity(sourceHue: number, inkHue: number) {
  const diff = Math.abs(sourceHue - inkHue);
  const wrapped = Math.min(diff, 360 - diff);

  return clamp(1 - wrapped / 135);
}

function isNeutralInk(color: Rgb) {
  const rn = color.r / 255;
  const gn = color.g / 255;
  const bn = color.b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);

  return max < 0.24 || max - min < 0.08;
}

function hashNoise(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function sourceToImageData(input: RenderInput) {
  const width = Math.min(input.size.width, input.mode === "export" ? MAX_EXPORT_EDGE : input.size.width);
  const scale = width / input.size.width;
  const height = Math.max(1, Math.round(input.size.height * scale));
  const canvas = createRenderCanvas(width, height);
  const context = getRenderContext(canvas, true);

  if (!context) {
    throw new Error("无法创建源图画布");
  }

  context.drawImage(input.image as CanvasImageSource, 0, 0, width, height);

  return {
    width,
    height,
    imageData: context.getImageData(0, 0, width, height),
  };
}

function applyTone(value: number, brightness: number, contrast: number) {
  return clamp((value - 0.5) * (1 + contrast * 1.35) + 0.5 + brightness);
}

function posterize(value: number, levels: number) {
  if (levels <= 1) {
    return value;
  }

  return Math.round(value * (levels - 1)) / (levels - 1);
}

function prepareSourceUnitRgb(data: Uint8ClampedArray, dataIndex: number, input: RenderInput, posterizeLevels: number) {
  let r = data[dataIndex] / 255;
  let g = data[dataIndex + 1] / 255;
  let b = data[dataIndex + 2] / 255;

  const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const saturationFactor = 1 + input.preset.tone.saturation;
  r = clamp(gray + (r - gray) * saturationFactor);
  g = clamp(gray + (g - gray) * saturationFactor);
  b = clamp(gray + (b - gray) * saturationFactor);

  return {
    r: posterize(applyTone(r, input.preset.tone.brightness, input.preset.tone.contrast), posterizeLevels),
    g: posterize(applyTone(g, input.preset.tone.brightness, input.preset.tone.contrast), posterizeLevels),
    b: posterize(applyTone(b, input.preset.tone.brightness, input.preset.tone.contrast), posterizeLevels),
  };
}

function inkAbsorption(color: Rgb) {
  return {
    c: 1 - color.r / 255,
    m: 1 - color.g / 255,
    y: 1 - color.b / 255,
  };
}

function rgbToProcessCmyk(r: number, g: number, b: number): ProcessCmyk {
  const k = clamp(1 - Math.max(r, g, b));
  const white = 1 - k;

  if (white <= 0.0001) {
    return { c: 0, m: 0, y: 0, k: 1 };
  }

  return {
    c: clamp((1 - r - k) / white),
    m: clamp((1 - g - k) / white),
    y: clamp((1 - b - k) / white),
    k,
  };
}

function processCoverageForInk(color: Rgb, cmyk: ProcessCmyk) {
  if (isNeutralInk(color)) {
    return cmyk.k;
  }

  const absorption = inkAbsorption(color);
  const strongest = Math.max(absorption.c, absorption.m, absorption.y);

  if (strongest === absorption.c) {
    return cmyk.c;
  }

  if (strongest === absorption.m) {
    return cmyk.m;
  }

  return cmyk.y;
}

function processHalftoneCoverage(coverage: number, contrast: number) {
  const normalizedContrast = clamp(contrast);
  const processContrast = 0.65 + normalizedContrast * 1.5;
  const contrastedCoverage = clamp((coverage - 0.5) * processContrast + 0.5);
  const highlightDotRescue = coverage * (1 - coverage) * (0.24 + normalizedContrast * 0.24);

  return clamp(Math.max(contrastedCoverage, highlightDotRescue));
}

function prepareInkCoverages(input: RenderInput, imageData: ImageData) {
  const { preset } = input;
  const separationMode = preset.separationMode ?? "expressive";
  const count = imageData.width * imageData.height;
  const paperRgb = parseHexColor(preset.paper.baseColor);
  const inks = preset.inks.map((ink) => ({
    ...ink,
    rgb: parseHexColor(ink.color),
    coverage: new Float32Array(count),
    centerR: new Float32Array(count),
    centerG: new Float32Array(count),
    centerB: new Float32Array(count),
    spreadR: new Float32Array(count),
    spreadG: new Float32Array(count),
    spreadB: new Float32Array(count),
  })) satisfies PreparedInkLayer[];

  const data = imageData.data;
  const posterizeLevels = Math.max(2, Math.round(preset.tone.posterizeLevels));
  const inkCount = Math.max(1, inks.length);
  const hasNeutralLayer = inks.some((ink) => isNeutralInk(ink.rgb));

  for (let index = 0; index < count; index += 1) {
    const dataIndex = index * 4;
    const { r, g, b } = prepareSourceUnitRgb(data, dataIndex, input, posterizeLevels);

    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;

    if (separationMode === "process-cmyk") {
      const cmyk = rgbToProcessCmyk(r, g, b);

      inks.forEach((ink) => {
        const localCoverage = clamp(processCoverageForInk(ink.rgb, cmyk));
        const spreadColor = mixRgb(ink.rgb, paperRgb, 0.04 + luma * 0.06);

        ink.coverage[index] = localCoverage;
        ink.centerR[index] = ink.rgb.r;
        ink.centerG[index] = ink.rgb.g;
        ink.centerB[index] = ink.rgb.b;
        ink.spreadR[index] = spreadColor.r;
        ink.spreadG[index] = spreadColor.g;
        ink.spreadB[index] = spreadColor.b;
      });
      continue;
    }

    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const shadow = Math.pow(1 - luma, 0.62 + preset.halftone.contrast * 0.34);
    const sourceColor: Rgb = {
      r: r * 255,
      g: g * 255,
      b: b * 255,
    };
    const sourceHue = getHue(sourceColor);
    const commonShadow = Math.min(1 - r, 1 - g, 1 - b);
    const blackExtraction = hasNeutralLayer ? commonShadow * (0.58 + preset.halftone.contrast * 0.18) : 0;
    const demand = {
      c: clamp(1 - r - blackExtraction),
      m: clamp(1 - g - blackExtraction),
      y: clamp(1 - b - blackExtraction),
    };

    inks.forEach((ink) => {
      const neutralInk = isNeutralInk(ink.rgb);
      const absorption = inkAbsorption(ink.rgb);
      const absorptionSum = Math.max(0.05, absorption.c + absorption.m + absorption.y);
      const rawSeparation =
        (demand.c * absorption.c + demand.m * absorption.m + demand.y * absorption.y) / absorptionSum;
      const colorAffinity = hueAffinity(sourceHue, getHue(ink.rgb));
      const sharedShadow = hasNeutralLayer ? shadow * 0.08 : shadow * 0.16;
      const channelCoverage =
        Math.pow(rawSeparation, 0.72) *
        (0.38 + colorAffinity * 0.72 + chroma * 0.16) *
        (0.78 + preset.halftone.contrast * 0.3);
      const neutralCoverage = Math.pow(Math.max(commonShadow, shadow * 0.82), 0.7) * (0.92 + preset.halftone.contrast * 0.28);
      const localCoverage = clamp(neutralInk || inkCount === 1 ? neutralCoverage : channelCoverage + sharedShadow);
      const centerColor = scaleRgb(ink.rgb, 0.68 + localCoverage * 0.12);
      const spreadColor = mixRgb(ink.rgb, paperRgb, 0.42 + luma * 0.24);

      ink.coverage[index] = localCoverage;
      ink.centerR[index] = centerColor.r;
      ink.centerG[index] = centerColor.g;
      ink.centerB[index] = centerColor.b;
      ink.spreadR[index] = spreadColor.r;
      ink.spreadG[index] = spreadColor.g;
      ink.spreadB[index] = spreadColor.b;
    });
  }

  return inks;
}

function drawProcessCmykProof(
  context: RenderContext,
  imageData: ImageData,
  input: RenderInput,
  inks: PreparedInkLayer[],
) {
  const output = context.createImageData(imageData.width, imageData.height);
  const source = imageData.data;
  const target = output.data;
  const posterizeLevels = Math.max(2, Math.round(input.preset.tone.posterizeLevels));
  const paperRgb = parseHexColor(input.preset.paper.baseColor);

  for (let index = 0; index < imageData.width * imageData.height; index += 1) {
    const dataIndex = index * 4;
    const sourceRgb = prepareSourceUnitRgb(source, dataIndex, input, posterizeLevels);
    const cmyk = rgbToProcessCmyk(sourceRgb.r, sourceRgb.g, sourceRgb.b);
    let r = paperRgb.r / 255;
    let g = paperRgb.g / 255;
    let b = paperRgb.b / 255;

    inks.forEach((ink) => {
      const density = clamp(processCoverageForInk(ink.rgb, cmyk) * ink.opacity);
      r *= 1 - density * (1 - ink.rgb.r / 255);
      g *= 1 - density * (1 - ink.rgb.g / 255);
      b *= 1 - density * (1 - ink.rgb.b / 255);
    });

    target[dataIndex] = clamp(r) * 255;
    target[dataIndex + 1] = clamp(g) * 255;
    target[dataIndex + 2] = clamp(b) * 255;
    target[dataIndex + 3] = 255;
  }

  context.putImageData(output, 0, 0);
}

function drawPaper(context: RenderContext, width: number, height: number, baseColor: Rgb, grain: number, fiber: number) {
  const imageData = context.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const low = hashNoise(Math.floor(x / 18), Math.floor(y / 18), 4) - 0.5;
      const high = hashNoise(x, y, 9) - 0.5;
      const line = hashNoise(Math.floor(x / 5), y, 13) - 0.5;
      const variation = low * grain * 34 + high * grain * 16 + line * fiber * 18;

      data[index] = clamp((baseColor.r + variation) / 255, 0, 1) * 255;
      data[index + 1] = clamp((baseColor.g + variation) / 255, 0, 1) * 255;
      data[index + 2] = clamp((baseColor.b + variation * 0.8) / 255, 0, 1) * 255;
      data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
}

function sampleInk(ink: PreparedInkLayer, width: number, height: number, x: number, y: number) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = py * width + px;

  return {
    coverage: ink.coverage[index] ?? 0,
    center: {
      r: ink.centerR[index] ?? ink.rgb.r,
      g: ink.centerG[index] ?? ink.rgb.g,
      b: ink.centerB[index] ?? ink.rgb.b,
    },
    spread: {
      r: ink.spreadR[index] ?? ink.rgb.r,
      g: ink.spreadG[index] ?? ink.rgb.g,
      b: ink.spreadB[index] ?? ink.rgb.b,
    },
  };
}

function drawHalftoneLayer(width: number, height: number, ink: PreparedInkLayer, input: RenderInput) {
  const layer = createRenderCanvas(width, height);
  const context = getRenderContext(layer);

  if (!context) {
    throw new Error("无法创建油墨图层");
  }

  const separationMode: SeparationMode = input.preset.separationMode ?? "expressive";
  const usesProcessCmyk = separationMode === "process-cmyk";
  const spacing = Math.max(3, input.preset.halftone.spacing);
  const angle = ((ink.angle + input.preset.halftone.angle) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const centerX = width / 2;
  const centerY = height / 2;
  const limit = Math.hypot(width, height);
  const radiusScale = 0.13 + input.preset.halftone.dotSize * 0.12;
  const dotShape = input.preset.halftone.dotShape ?? "soft-round";

  for (let gy = -limit; gy <= limit; gy += spacing) {
    for (let gx = -limit; gx <= limit; gx += spacing) {
      const x = centerX + gx * cos - gy * sin;
      const y = centerY + gx * sin + gy * cos;

      if (x < -spacing || y < -spacing || x > width + spacing || y > height + spacing) {
        continue;
      }

      const sample = sampleInk(ink, width, height, x, y);
      const { coverage } = sample;
      const effectiveCoverage = usesProcessCmyk
        ? processHalftoneCoverage(coverage, input.preset.halftone.contrast)
        : coverage;
      if (effectiveCoverage < (usesProcessCmyk ? 0.001 : 0.025)) {
        continue;
      }

      const jitter = usesProcessCmyk
        ? 0
        : (hashNoise(Math.round(x), Math.round(y), ink.offsetX + ink.offsetY + 3) - 0.5) * 0.22;
      const radiusCoverage = usesProcessCmyk ? Math.sqrt(effectiveCoverage) : coverage + jitter;
      const radius = Math.min(spacing * 0.54, Math.max(0.24, spacing * radiusScale * radiusCoverage));
      context.globalAlpha = usesProcessCmyk
        ? ink.opacity
        : clamp(ink.opacity * (0.34 + coverage * 0.92));

      if (dotShape === "square") {
        const side = radius * 1.85;
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.fillStyle = rgbToRgbaCss(sample.center, usesProcessCmyk ? 1 : 0.86);
        context.fillRect(-side / 2, -side / 2, side, side);
        context.restore();
        continue;
      }

      if (dotShape === "round") {
        context.fillStyle = rgbToRgbaCss(sample.center, usesProcessCmyk ? 1 : 0.92);
        context.beginPath();
        context.arc(x, y, radius * (1.02 + input.preset.grain.amount * 0.04), 0, Math.PI * 2);
        context.fill();
        continue;
      }

      const roughness = dotShape === "rough" ? 0.18 + input.preset.grain.amount * 0.18 : 0;
      const bleedRadius = radius * (dotShape === "rough" ? 1.18 : 1.34 + input.preset.grain.amount * 0.22);
      const edgeRadius = bleedRadius * (1 + (hashNoise(Math.round(x), Math.round(y), ink.angle + 17) - 0.5) * roughness);
      const gradient = context.createRadialGradient(x, y, 0, x, y, edgeRadius);

      gradient.addColorStop(0, rgbToRgbaCss(sample.center, 1));
      gradient.addColorStop(0.52, rgbToRgbaCss(sample.center, dotShape === "rough" ? 0.84 : 0.78));
      gradient.addColorStop(0.84, rgbToRgbaCss(sample.spread, dotShape === "rough" ? 0.38 : 0.52));
      gradient.addColorStop(1, rgbToRgbaCss(sample.spread, 0));

      context.fillStyle = gradient;
      context.beginPath();
      if (dotShape === "rough") {
        context.ellipse(x, y, edgeRadius * 1.04, edgeRadius * 0.88, angle + jitter, 0, Math.PI * 2);
      } else {
        context.arc(x, y, edgeRadius, 0, Math.PI * 2);
      }
      context.fill();
    }
  }

  return layer;
}

function drawGrainLayer(
  width: number,
  height: number,
  ink: PreparedInkLayer,
  input: RenderInput,
) {
  const layer = createRenderCanvas(width, height);
  const context = getRenderContext(layer);

  if (!context) {
    throw new Error("无法创建颗粒图层");
  }

  const scale = Math.max(0.35, input.preset.grain.scale);
  const step = Math.max(1, Math.round((2 + input.preset.grain.softness * 4) / scale));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const sample = sampleInk(ink, width, height, x, y);
      const { coverage } = sample;
      const noise = hashNoise(Math.floor(x / scale), Math.floor(y / scale), ink.angle);

      if (coverage * (0.68 + input.preset.grain.amount * 0.5) < noise) {
        continue;
      }

      context.globalAlpha = clamp(ink.opacity * coverage * (0.18 + input.preset.grain.amount * 0.72));
      context.fillStyle = rgbToCss(sample.center);
      context.fillRect(x, y, step, step);
    }
  }

  return layer;
}

function drawInkLayers(
  context: RenderContext,
  width: number,
  height: number,
  inks: PreparedInkLayer[],
  input: RenderInput,
  layerAlpha = 1,
) {
  context.save();
  context.globalCompositeOperation = "multiply";
  context.globalAlpha = layerAlpha;

  inks.forEach((ink, index) => {
    const layer = input.preset.halftone.enabled
      ? drawHalftoneLayer(width, height, ink, input)
      : drawGrainLayer(width, height, ink, input);
    const offsetAmount = input.preset.misregistration.amount;
    const direction = index - (inks.length - 1) / 2;
    const randomX = input.preset.misregistration.randomize ? (hashNoise(index, 0, 91) - 0.5) * offsetAmount : 0;
    const randomY = input.preset.misregistration.randomize ? (hashNoise(index, 1, 97) - 0.5) * offsetAmount : 0;
    const offsetX = ink.offsetX + direction * offsetAmount + randomX;
    const offsetY = ink.offsetY - direction * offsetAmount * 0.75 + randomY;

    context.drawImage(layer, offsetX, offsetY);
  });

  context.restore();
}

function drawTopGrain(context: RenderContext, width: number, height: number, input: RenderInput) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const amount = input.preset.grain.amount;
  const scale = Math.max(0.35, input.preset.grain.scale);
  const stainAmount = input.preset.paper.stainAmount;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const speckle = hashNoise(x, y, 21) - 0.5;
      const cloud = hashNoise(Math.floor(x / (24 / scale)), Math.floor(y / (24 / scale)), 31) - 0.5;
      const stain = hashNoise(Math.floor(x / 70), Math.floor(y / 70), 41) > 0.9 ? stainAmount * 25 : 0;
      const delta = speckle * amount * 28 + cloud * amount * 16 - stain;

      data[index] = clamp((data[index] + delta) / 255, 0, 1) * 255;
      data[index + 1] = clamp((data[index + 1] + delta * 0.92) / 255, 0, 1) * 255;
      data[index + 2] = clamp((data[index + 2] + delta * 0.72) / 255, 0, 1) * 255;
    }
  }

  context.putImageData(imageData, 0, 0);
}

export async function renderPrintEffect(input: RenderInput): Promise<RenderOutput> {
  const startedAt = performance.now();
  const source = sourceToImageData(input);
  const canvas = createRenderCanvas(source.width, source.height);
  const context = getRenderContext(canvas, true);

  if (!context) {
    throw new Error("无法创建渲染画布");
  }

  const paperColor = parseHexColor(input.preset.paper.baseColor);
  drawPaper(
    context,
    source.width,
    source.height,
    paperColor,
    input.preset.paper.grainAmount,
    input.preset.paper.fiberAmount,
  );

  const inks = prepareInkCoverages(input, source.imageData);
  if ((input.preset.separationMode ?? "expressive") === "process-cmyk") {
    if (input.preset.halftone.enabled) {
      drawInkLayers(context, source.width, source.height, inks, input);
    } else {
      drawProcessCmykProof(context, source.imageData, input, inks);
    }
  } else {
    drawInkLayers(context, source.width, source.height, inks, input);
  }
  drawTopGrain(context, source.width, source.height, input);

  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = rgbToCss({
    r: paperColor.r * 0.78,
    g: paperColor.g * 0.78,
    b: paperColor.b * 0.78,
  });
  context.globalAlpha = 0.26;
  context.lineWidth = Math.max(1, Math.round(Math.min(source.width, source.height) * 0.003));
  context.strokeRect(2, 2, source.width - 4, source.height - 4);
  context.restore();

  const renderMs = performance.now() - startedAt;
  return {
    canvas,
    metadata: {
      width: source.width,
      height: source.height,
      renderMs,
      presetId: input.preset.id,
      mode: input.mode,
    },
  };
}
