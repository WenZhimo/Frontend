/*
 * O EMPIRE! filter core
 *
 * Accepts any drawable source: HTMLImageElement, HTMLVideoElement,
 * HTMLCanvasElement, OffscreenCanvas, or a Three.js renderer.domElement.
 * The public API is intentionally dependency-free so it can be dropped into
 * a separate canvas or animation loop.
 */
(function exposeEmpireFilter(global) {
  'use strict';

  const defaults = {
    mode: 'ward',
    bloom: 0.38,
    grain: 0.28,
    halftone: 0.54,
    scanlines: 0.22,
    vignette: 0.78,
    contrast: 1.18,
    brightness: 0.9,
    maxWidth: 1280,
    fit: 'cover',
  };

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  function sourceSize(source) {
    if (!source) return null;
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height) return null;
    return { width, height };
  }

  function coverRect(sourceWidth, sourceHeight, targetWidth, targetHeight, fit) {
    if (fit === 'contain') {
      const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight, dx: (targetWidth - width) / 2, dy: (targetHeight - height) / 2, dw: width, dh: height };
    }
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    if (sourceRatio > targetRatio) {
      const sw = sourceHeight * targetRatio;
      return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight, dx: 0, dy: 0, dw: targetWidth, dh: targetHeight };
    }
    const sh = sourceWidth / targetRatio;
    return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh, dx: 0, dy: 0, dw: targetWidth, dh: targetHeight };
  }

  function hashNoise(x, y, tick) {
    let value = (x * 374761393 + y * 668265263 + tick * 1442695041) | 0;
    value = (value ^ (value >>> 13)) * 1274126177;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295 - 0.5;
  }

  function processPixels(imageData, options, tick) {
    const pixels = imageData.data;
    const width = imageData.width;
    const raw = options.mode === 'raw';
    const bloom = clamp(options.bloom);
    const grain = clamp(options.grain);
    const contrast = options.contrast;
    const brightness = options.brightness;

    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        if (raw) continue;

        const lightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const redSeparation = clamp((r - (g * 0.83 + b * 0.17)) / 92) * clamp((Math.max(r, g, b) - Math.min(r, g, b)) / 46);
        const redFlower = clamp(redSeparation * (0.68 + bloom * 0.95));
        const noise = hashNoise(x, y, tick) * grain * 26;
        const grey = clamp(((lightness - 128) * contrast + 128) * brightness + noise, 0, 255);

        // Keep red details vivid while moving everything else toward the soft
        // paper-grey / mauve palette in the supplied frames.
        pixels[offset] = Math.round(clamp((grey * 1.03 + 4) * (1 - redFlower) + 221 * redFlower, 0, 255));
        pixels[offset + 1] = Math.round(clamp((grey * 0.99 + 4) * (1 - redFlower) + 45 * redFlower, 0, 255));
        pixels[offset + 2] = Math.round(clamp((grey * 0.95 + 7) * (1 - redFlower) + 34 * redFlower, 0, 255));
      }
    }

    return imageData;
  }

  function drawHalftone(ctx, imageData, options) {
    const strength = clamp(options.halftone);
    if (strength <= 0 || options.mode === 'raw') return;
    const step = Math.max(5, Math.round(10 - strength * 4));
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(22, 23, 22, ${0.16 + strength * 0.2})`;
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        const index = (Math.floor(y) * width + Math.floor(x)) * 4;
        const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / (255 * 3);
        const radius = (1 - luminance) * step * 0.46 * strength;
        if (radius < 0.42) continue;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGrain(ctx, width, height, options, tick) {
    if (options.mode === 'raw') return;
    const count = Math.floor(220 + clamp(options.grain) * 650);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count; i += 1) {
      const x = Math.abs((i * 97 + tick * 13) % width);
      const y = Math.abs((i * 53 + tick * 17) % height);
      const light = (i * 19 + tick) % 7 === 0;
      ctx.fillStyle = light ? 'rgba(255,255,246,0.18)' : 'rgba(10,10,11,0.12)';
      ctx.fillRect(x, y, (i % 3) + 0.35, (i % 2) + 0.35);
    }
    ctx.restore();
  }

  function drawScanlines(ctx, width, height, options) {
    if (options.mode === 'raw') return;
    const strength = clamp(options.scanlines);
    if (strength <= 0) return;
    ctx.save();
    ctx.globalAlpha = strength * 0.42;
    ctx.fillStyle = '#080908';
    for (let y = 1; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    ctx.restore();
  }

  function drawVignette(ctx, width, height, options) {
    const strength = clamp(options.vignette);
    if (strength <= 0) return;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.7);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.72, `rgba(0,0,0,${strength * 0.12})`);
    gradient.addColorStop(1, `rgba(0,0,0,${strength * 0.76})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function createFilter({ canvas, options = {} }) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('OEmpireFilter.create requires a target canvas.');
    const target = canvas;
    const targetContext = target.getContext('2d', { willReadFrequently: true });
    const workCanvas = document.createElement('canvas');
    const workContext = workCanvas.getContext('2d', { willReadFrequently: true });
    const state = { ...defaults, ...options };
    let source = null;
    let frame = 0;

    function resizeForViewport() {
      const cssWidth = target.clientWidth || 960;
      const cssHeight = target.clientHeight || cssWidth * 9 / 16;
      const scale = Math.min(1, state.maxWidth / cssWidth);
      const width = Math.max(320, Math.floor(cssWidth * scale));
      const height = Math.max(180, Math.floor(cssHeight * scale));
      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
        workCanvas.width = width;
        workCanvas.height = height;
      }
      return { width, height };
    }

    function render(time = performance.now()) {
      const size = sourceSize(source);
      if (!size) return false;
      const { width, height } = resizeForViewport();
      workContext.clearRect(0, 0, width, height);
      const rect = coverRect(size.width, size.height, width, height, state.fit);
      workContext.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
      const imageData = processPixels(workContext.getImageData(0, 0, width, height), state, frame);
      targetContext.putImageData(imageData, 0, 0);
      drawHalftone(targetContext, imageData, state);
      drawScanlines(targetContext, width, height, state);
      drawGrain(targetContext, width, height, state, frame);
      drawVignette(targetContext, width, height, state);
      frame += 1;
      return true;
    }

    return {
      canvas: target,
      setSource(nextSource) {
        if (!sourceSize(nextSource)) throw new TypeError('OEmpireFilter source must be a loaded image, video, or canvas.');
        source = nextSource;
        return this;
      },
      getSource() {
        return source;
      },
      render,
      setOptions(nextOptions = {}) {
        Object.assign(state, nextOptions);
        return this;
      },
      getOptions() {
        return { ...state };
      },
      resize: resizeForViewport,
    };
  }

  function apply(source, targetCanvas, options = {}) {
    const filter = createFilter({ canvas: targetCanvas, options });
    filter.setSource(source).render();
    return filter;
  }

  global.OEmpireFilter = { defaults, create: createFilter, apply };
})(window);
