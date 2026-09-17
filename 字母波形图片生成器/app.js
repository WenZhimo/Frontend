const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const alphabetMap = document.querySelector("#alphabetMap");
const metrics = document.querySelector("#metrics");
const audioStatus = document.querySelector("#audioStatus");

const controls = {
  format: document.querySelector("#format"),
  synthesisMode: document.querySelector("#synthesisMode"),
  ttsVoice: document.querySelector("#ttsVoice"),
  ttsBackend: document.querySelector("#ttsBackend"),
  ttsDtype: document.querySelector("#ttsDtype"),
  ttsSpeed: document.querySelector("#ttsSpeed"),
  backgroundMode: document.querySelector("#backgroundMode"),
  inkColor: document.querySelector("#inkColor"),
  paperColor: document.querySelector("#paperColor"),
  pixelsPerSecond: document.querySelector("#pixelsPerSecond"),
  lineHeight: document.querySelector("#lineHeight"),
  amplitude: document.querySelector("#amplitude"),
  roughness: document.querySelector("#roughness"),
  unitGap: document.querySelector("#unitGap"),
  preserveStyle: document.querySelector("#preserveStyle"),
  showGuides: document.querySelector("#showGuides"),
  tightCrop: document.querySelector("#tightCrop"),
  textColor: document.querySelector("#textColor"),
  fontSize: document.querySelector("#fontSize"),
  sampleLettersBtn: document.querySelector("#sampleLettersBtn"),
  generateWordsBtn: document.querySelector("#generateWordsBtn"),
  playAudioBtn: document.querySelector("#playAudioBtn"),
  generationProgress: document.querySelector("#generationProgress"),
  progressLabel: document.querySelector("#progressLabel"),
  progressCount: document.querySelector("#progressCount"),
  progressBar: document.querySelector("#progressBar"),
  progressDetail: document.querySelector("#progressDetail"),
  previewShell: document.querySelector("#previewShell"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomFitBtn: document.querySelector("#zoomFitBtn"),
  zoomResetBtn: document.querySelector("#zoomResetBtn"),
  previewZoomLabel: document.querySelector("#previewZoomLabel")
};

const sampleHtml = [
  "<b>alphabet</b> wave text",
  "  voice forms follow sound",
  "<span style=\"color:#0b7f7a\">hello world cassie</span>",
  "<i>letters and words keep spacing</i>"
].join("<br>");

const TTS_WORKER_URL = "./tts-worker.js";
const TTS_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const SILENCE_TRIM = {
  floorThreshold: 0.0035,
  relativeThreshold: 0.018,
  edgePaddingMs: 18,
  minKeepMs: 45
};
const PREVIEW_ZOOM = {
  min: 0.12,
  max: 6,
  step: 1.2
};
const LETTER_SPEECH = new Map([
  ["A", "ay"], ["B", "bee"], ["C", "see"], ["D", "dee"], ["E", "ee"],
  ["F", "eff"], ["G", "gee"], ["H", "aitch"], ["I", "eye"], ["J", "jay"],
  ["K", "kay"], ["L", "ell"], ["M", "em"], ["N", "en"], ["O", "oh"],
  ["P", "pee"], ["Q", "cue"], ["R", "are"], ["S", "ess"], ["T", "tee"],
  ["U", "you"], ["V", "vee"], ["W", "double you"], ["X", "ex"],
  ["Y", "why"], ["Z", "zee"]
]);

const audioPeakCache = new WeakMap();
const ttsCache = new Map();

let audioContext = null;
let ttsWorker = null;
let pendingTtsJob = null;
let currentJobId = 0;
let renderTicket = 0;
let latestSvg = "";
let latestLayout = null;
let latestAudioBuffer = null;
let latestMeta = { width: 0, height: 0, units: 0, missing: 0, duration: 0 };
let toastTimer = 0;
let previewZoom = 1;
let generationState = {
  running: false,
  startedAt: 0,
  timerId: 0,
  label: "待生成",
  detail: "点击生成后会显示模型加载、当前语音单元和耗时。",
  ratio: 0,
  indeterminate: false
};
let playbackState = {
  source: null,
  startedAt: 0,
  offset: 0,
  pausedAt: 0,
  duration: 0,
  isPlaying: false,
  ignoreEnded: false
};

editor.innerHTML = sampleHtml;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(value) {
  return function random() {
    let t = value += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rgbToHex(color) {
  if (!color) return "";
  if (color.startsWith("#")) return color;
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (!match) return color;
  const parts = match[1].split(",").map((item) => Number.parseFloat(item.trim()));
  const alpha = parts[3] ?? 1;
  if (alpha === 0) return "";
  return `#${parts.slice(0, 3).map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function getAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx({ sampleRate: 44100 });
  }
  return audioContext;
}

async function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

function setStatus(message, tone = "normal") {
  audioStatus.textContent = message;
  audioStatus.dataset.tone = tone;
}

function elapsedSeconds() {
  if (!generationState.startedAt) return 0;
  return Math.max(0, (performance.now() - generationState.startedAt) / 1000);
}

function formatElapsed(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}.${tenths}` : `${secs}.${tenths}s`;
}

function setProgress(label, options = {}) {
  generationState.label = label || generationState.label;
  generationState.detail = options.detail ?? generationState.detail;
  generationState.ratio = clamp(Number(options.ratio) || 0, 0, 1);
  generationState.indeterminate = Boolean(options.indeterminate);

  controls.progressLabel.textContent = generationState.label;
  controls.progressDetail.textContent = generationState.detail;
  if (generationState.indeterminate) {
    controls.progressBar.removeAttribute("value");
    controls.progressCount.textContent = generationState.running
      ? `运行中 · ${formatElapsed(elapsedSeconds())}`
      : "等待";
  } else {
    controls.progressBar.value = generationState.ratio;
    controls.progressCount.textContent = `${Math.round(generationState.ratio * 100)}%`;
  }
}

function refreshElapsedProgress() {
  if (!generationState.running) return;
  const suffix = `耗时 ${formatElapsed(elapsedSeconds())}`;
  controls.progressDetail.textContent = generationState.detail.includes("耗时")
    ? generationState.detail.replace(/耗时\s+\S+$/, suffix)
    : `${generationState.detail} · ${suffix}`;
  if (generationState.indeterminate) {
    controls.progressCount.textContent = `运行中 · ${formatElapsed(elapsedSeconds())}`;
  }
}

function startProgress(label, detail) {
  generationState.running = true;
  generationState.startedAt = performance.now();
  controls.generationProgress.setAttribute("aria-busy", "true");
  setProgress(label, { detail, ratio: 0.02, indeterminate: false });
  clearInterval(generationState.timerId);
  generationState.timerId = setInterval(refreshElapsedProgress, 250);
}

function finishProgress(label, detail, tone = "normal") {
  generationState.running = false;
  clearInterval(generationState.timerId);
  generationState.timerId = 0;
  controls.generationProgress.setAttribute("aria-busy", "false");
  setProgress(label, { detail: `${detail} · 总耗时 ${formatElapsed(elapsedSeconds())}`, ratio: tone === "error" ? generationState.ratio : 1, indeterminate: false });
}

function resetProgress(label = "待生成", detail = "点击生成后会显示模型加载、当前语音单元和耗时。") {
  generationState.running = false;
  clearInterval(generationState.timerId);
  generationState.timerId = 0;
  generationState.startedAt = 0;
  controls.generationProgress.setAttribute("aria-busy", "false");
  setProgress(label, { detail, ratio: 0, indeterminate: false });
}

function isBlockElement(element) {
  if (!element || element === editor) return false;
  return new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "MAIN", "P", "PRE", "SECTION"]).has(element.tagName);
}

function getTokenStyle(parent) {
  const element = parent?.nodeType === Node.ELEMENT_NODE ? parent : parent?.parentElement;
  const style = element ? getComputedStyle(element) : getComputedStyle(editor);
  const weightText = style.fontWeight || "400";
  const weight = Number.parseInt(weightText, 10);
  const fontSize = Number.parseFloat(style.fontSize) || 18;
  return {
    color: rgbToHex(style.color),
    bold: Number.isNaN(weight) ? weightText === "bold" : weight >= 600,
    italic: style.fontStyle === "italic" || style.fontStyle === "oblique",
    underline: (style.textDecorationLine || "").includes("underline"),
    scale: clamp(fontSize / 18, 0.68, 1.85)
  };
}

function currentLine(lines) {
  return lines[lines.length - 1];
}

function pushNewLine(lines) {
  if (lines.length === 0 || currentLine(lines).length > 0) lines.push([]);
}

function extractRichCharLines() {
  const lines = [[]];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const style = getTokenStyle(node.parentElement);
      const text = node.nodeValue.replace(/\r/g, "");
      for (const char of text) {
        if (char === "\n") pushNewLine(lines);
        else currentLine(lines).push({ type: "char", text: char, char, style });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node;
    if (element.tagName === "BR") {
      pushNewLine(lines);
      return;
    }

    if (isBlockElement(element) && currentLine(lines).length > 0) pushNewLine(lines);
    element.childNodes.forEach(walk);
    if (isBlockElement(element)) pushNewLine(lines);
  };

  editor.childNodes.forEach(walk);
  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines.length ? lines : [[]];
}

function isSpeechChar(char) {
  return /[A-Za-z0-9'\-\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char);
}

function styleKey(style) {
  return [style.color, style.bold, style.italic, style.underline, style.scale.toFixed(3)].join("|");
}

function extractSpeechUnitLines() {
  return extractRichCharLines().map((line) => {
    const tokens = [];
    let unit = null;

    const flushUnit = () => {
      if (!unit) return;
      unit.text = unit.text.replace(/^[-']+|[-']+$/g, "");
      if (unit.text) tokens.push(unit);
      unit = null;
    };

    line.forEach((token) => {
      const char = token.char;
      if (isSpeechChar(char)) {
        if (!unit || styleKey(unit.style) !== styleKey(token.style)) {
          flushUnit();
          unit = { type: "speech", text: "", style: token.style };
        }
        unit.text += char;
        return;
      }

      flushUnit();
      if (char === " " || char === "\t") {
        tokens.push({ type: "space", text: char, style: token.style });
      } else {
        tokens.push({ type: "punct", text: char, style: token.style });
      }
    });

    flushUnit();
    return tokens;
  });
}

function getSettings() {
  const backgroundMode = controls.backgroundMode.value;
  return {
    mode: controls.synthesisMode.value,
    ttsVoice: controls.ttsVoice.value,
    ttsBackend: controls.ttsBackend.value,
    ttsDtype: controls.ttsDtype.value,
    ttsSpeed: clamp(Number(controls.ttsSpeed.value) || 100, 50, 180) / 100,
    format: controls.format.value,
    backgroundMode,
    background: backgroundMode === "transparent" ? "transparent" : backgroundMode === "soft" ? "#eef2f6" : controls.paperColor.value,
    inkColor: controls.inkColor.value,
    pixelsPerSecond: Number(controls.pixelsPerSecond.value),
    lineHeight: Number(controls.lineHeight.value),
    amplitude: Number(controls.amplitude.value),
    roughness: Number(controls.roughness.value) / 100,
    unitGapMs: Number(controls.unitGap.value),
    preserveStyle: controls.preserveStyle.checked,
    showGuides: controls.showGuides.checked,
    tightCrop: controls.tightCrop.checked,
    padding: controls.tightCrop.checked ? 18 : 34
  };
}

function ttsProfileKey(settings) {
  return [
    settings.ttsVoice,
    settings.ttsBackend,
    settings.ttsDtype,
    settings.ttsSpeed.toFixed(3)
  ].join("|");
}

function cacheKey(kind, label, settings) {
  return `${kind}|${ttsProfileKey(settings)}|${String(label).toLowerCase()}`;
}

function letterFor(char) {
  return /^[a-z]$/i.test(char) ? char.toUpperCase() : "";
}

function getCachedAudio(kind, label, settings) {
  return ttsCache.get(cacheKey(kind, label, settings)) || null;
}

function lineScale(line) {
  if (!line.length) return 1;
  return Math.max(...line.map((token) => token.style?.scale || 1));
}

function visualWidthForAudio(buffer, style, settings) {
  return Math.max(12, buffer.duration * settings.pixelsPerSecond * (style?.scale || 1));
}

function gapWidth(ms, style, settings) {
  return Math.max(4, (Math.max(0, ms) / 1000) * settings.pixelsPerSecond * (style?.scale || 1));
}

function buildLetterLines(settings) {
  let missing = 0;
  let units = 0;
  const lines = extractRichCharLines().map((line) => line.map((token) => {
    const char = token.char;
    if (char === " ") return { ...token, type: "space", width: gapWidth(settings.unitGapMs * 0.8, token.style, settings), audio: null, silenceMs: settings.unitGapMs * 0.8 };
    if (char === "\t") return { ...token, type: "space", width: gapWidth(settings.unitGapMs * 3.2, token.style, settings), audio: null, silenceMs: settings.unitGapMs * 3.2 };

    const letter = letterFor(char);
    if (!letter) {
      return { ...token, type: "punct", width: gapWidth(settings.unitGapMs, token.style, settings), audio: null, silenceMs: settings.unitGapMs };
    }

    const buffer = getCachedAudio("letter", letter, settings);
    if (buffer) {
      units += 1;
      return { ...token, type: "letter", width: visualWidthForAudio(buffer, token.style, settings), audio: buffer, label: letter };
    }

    missing += 1;
    return { ...token, type: "pending", width: Math.max(24, settings.pixelsPerSecond * 0.2 * token.style.scale), audio: null, silenceMs: settings.unitGapMs, label: letter };
  }));
  return { lines, missing, units };
}

function buildWordLines(settings) {
  let missing = 0;
  let units = 0;
  const lines = extractSpeechUnitLines().map((line) => line.map((token) => {
    if (token.type === "space") {
      const mult = token.text === "\t" ? 3.2 : 0.8;
      return { ...token, width: gapWidth(settings.unitGapMs * mult, token.style, settings), audio: null, silenceMs: settings.unitGapMs * mult };
    }
    if (token.type === "punct") {
      return { ...token, width: gapWidth(settings.unitGapMs * 1.15, token.style, settings), audio: null, silenceMs: settings.unitGapMs * 1.15 };
    }

    const buffer = getCachedAudio("word", token.text, settings);
    if (buffer) {
      units += 1;
      return { ...token, width: visualWidthForAudio(buffer, token.style, settings), audio: buffer, label: token.text };
    }

    missing += 1;
    return { ...token, type: "pending", width: Math.max(38, token.text.length * 13 * token.style.scale), audio: null, silenceMs: settings.unitGapMs, label: token.text };
  }));
  return { lines, missing, units };
}

function buildLayout(settings) {
  const audioLines = settings.mode === "letters" ? buildLetterLines(settings) : buildWordLines(settings);
  const lineWidths = audioLines.lines.map((line) => line.reduce((sum, token) => sum + token.width, 0));
  const lineHeights = audioLines.lines.map((line) => settings.lineHeight * lineScale(line));
  const contentWidth = Math.max(1, ...lineWidths);
  const contentHeight = Math.max(settings.lineHeight, lineHeights.reduce((sum, height) => sum + height, 0));
  return {
    ...audioLines,
    width: Math.ceil(contentWidth + settings.padding * 2),
    height: Math.ceil(contentHeight + settings.padding * 2),
    lineWidths,
    lineHeights
  };
}

function sampleAt(buffer, sampleIndex) {
  let sum = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    sum += buffer.getChannelData(channel)[sampleIndex] || 0;
  }
  return sum / buffer.numberOfChannels;
}

function findAudibleRange(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  let peak = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    for (const data of channels) {
      const value = Math.abs(data[i] || 0);
      if (value > peak) peak = value;
    }
  }

  if (peak <= SILENCE_TRIM.floorThreshold) {
    return {
      start: 0,
      end: buffer.length,
      peak,
      threshold: SILENCE_TRIM.floorThreshold,
      leadingSeconds: 0,
      trailingSeconds: 0
    };
  }

  const threshold = Math.max(SILENCE_TRIM.floorThreshold, peak * SILENCE_TRIM.relativeThreshold);
  const hasSignalAt = (index) => channels.some((data) => Math.abs(data[index] || 0) > threshold);
  let start = 0;
  let end = buffer.length - 1;

  while (start < buffer.length && !hasSignalAt(start)) start += 1;
  while (end > start && !hasSignalAt(end)) end -= 1;

  const pad = Math.round((SILENCE_TRIM.edgePaddingMs / 1000) * buffer.sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(buffer.length, end + pad + 1);

  const minLength = Math.max(1, Math.round((SILENCE_TRIM.minKeepMs / 1000) * buffer.sampleRate));
  if (end - start < minLength) {
    const midpoint = Math.round((start + end) / 2);
    start = Math.max(0, midpoint - Math.floor(minLength / 2));
    end = Math.min(buffer.length, start + minLength);
    start = Math.max(0, end - minLength);
  }

  return {
    start,
    end,
    peak,
    threshold,
    leadingSeconds: start / buffer.sampleRate,
    trailingSeconds: (buffer.length - end) / buffer.sampleRate
  };
}

function trimAudioSilence(buffer) {
  const range = findAudibleRange(buffer);
  if (range.start <= 0 && range.end >= buffer.length) {
    return {
      buffer,
      trimmed: false,
      leadingSeconds: 0,
      trailingSeconds: 0
    };
  }

  const length = Math.max(1, range.end - range.start);
  const output = getAudioContext().createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    output.copyToChannel(buffer.getChannelData(channel).subarray(range.start, range.end), channel);
  }

  return {
    buffer: output,
    trimmed: true,
    leadingSeconds: range.leadingSeconds,
    trailingSeconds: range.trailingSeconds
  };
}

function getWavePeaks(buffer, width, settings, seedText = "") {
  const safeWidth = Math.max(1, Math.round(width));
  const cacheId = `${safeWidth}|${settings.roughness.toFixed(3)}|${seedText}`;
  let cache = audioPeakCache.get(buffer);
  if (!cache) {
    cache = new Map();
    audioPeakCache.set(buffer, cache);
  }
  if (cache.has(cacheId)) return cache.get(cacheId);

  const random = mulberry32(fnv1a(`${cacheId}:${buffer.duration}:${buffer.length}`));
  const mins = new Float32Array(safeWidth);
  const maxs = new Float32Array(safeWidth);
  for (let x = 0; x < safeWidth; x += 1) {
    const start = Math.floor((x / safeWidth) * buffer.length);
    const end = Math.min(buffer.length, Math.max(start + 1, Math.floor(((x + 1) / safeWidth) * buffer.length)));
    let min = 1;
    let max = -1;
    for (let i = start; i < end; i += 1) {
      const sample = sampleAt(buffer, i);
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    const inkJitter = 1 + (random() - 0.5) * settings.roughness * 0.26;
    mins[x] = (min === 1 ? 0 : min) * inkJitter;
    maxs[x] = (max === -1 ? 0 : max) * inkJitter;
  }

  const peaks = { mins, maxs, width: safeWidth };
  cache.set(cacheId, peaks);
  return peaks;
}

function tokenColor(token, settings) {
  return settings.preserveStyle && token.style?.color ? token.style.color : settings.inkColor;
}

function buildWavePath(token, x, centerY, settings) {
  if (!token.audio) return "";
  const width = Math.max(2, Math.round(token.width));
  const peaks = getWavePeaks(token.audio, width, settings, token.label || token.text || "");
  const amp = settings.amplitude * (token.style?.scale || 1) * (token.style?.bold ? 1.18 : 1);
  const color = tokenColor(token, settings);
  const top = [];
  const bottom = [];

  for (let i = 0; i < peaks.width; i += 1) {
    top.push(`${(x + i).toFixed(2)},${(centerY - peaks.maxs[i] * amp).toFixed(2)}`);
    bottom.push(`${(x + i).toFixed(2)},${(centerY - peaks.mins[i] * amp).toFixed(2)}`);
  }
  bottom.reverse();

  const fillPath = `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
  const centerPath = `M ${x.toFixed(2)},${centerY.toFixed(2)} L ${(x + width).toFixed(2)},${centerY.toFixed(2)}`;
  const transform = token.style?.italic
    ? ` transform="translate(${(x + width / 2).toFixed(2)} ${centerY.toFixed(2)}) skewX(-8) translate(${(-x - width / 2).toFixed(2)} ${(-centerY).toFixed(2)})"`
    : "";
  const underline = token.style?.underline
    ? `<line x1="${x.toFixed(2)}" y1="${(centerY + amp + 4).toFixed(2)}" x2="${(x + width).toFixed(2)}" y2="${(centerY + amp + 4).toFixed(2)}" stroke="${escapeXml(color)}" stroke-width="1.15" opacity="0.5"/>`
    : "";

  return [
    `<g${transform}>`,
    `<path d="${fillPath}" fill="${escapeXml(color)}" opacity="${token.style?.bold ? "0.84" : "0.7"}"/>`,
    `<path d="${centerPath}" stroke="${escapeXml(color)}" stroke-width="${token.style?.bold ? "1.2" : "0.75"}" stroke-linecap="round" opacity="0.32"/>`,
    underline,
    `</g>`
  ].join("");
}

function buildPendingGlyph(token, x, centerY) {
  if (token.type !== "pending") return "";
  const width = Math.max(10, token.width);
  return [
    `<g opacity="0.68">`,
    `<line x1="${x.toFixed(2)}" y1="${centerY.toFixed(2)}" x2="${(x + width).toFixed(2)}" y2="${centerY.toFixed(2)}" stroke="#9b6a1b" stroke-width="1" stroke-dasharray="3 4"/>`,
    `<text x="${(x + width / 2).toFixed(2)}" y="${(centerY - 8).toFixed(2)}" text-anchor="middle" font-size="${Math.max(8, 9 * (token.style?.scale || 1)).toFixed(1)}" fill="#9b6a1b" font-family="Inter, Arial">${escapeXml(token.label || "待生成")}</text>`,
    `</g>`
  ].join("");
}

function estimateDuration(layout, settings) {
  return layout.lines.reduce((total, line) => {
    return total + line.reduce((sum, token) => {
      if (token.audio) return sum + token.audio.duration;
      return sum + (Math.max(0, token.silenceMs || settings.unitGapMs) / 1000);
    }, 0);
  }, 0);
}

function buildSvgString() {
  const settings = getSettings();
  const layout = buildLayout(settings);
  const parts = [];
  let y = settings.padding;

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Generated TTS waveform text">`);
  parts.push(`<title>TTS waveform text export</title>`);
  parts.push(`<desc>Waveforms are rendered from Kokoro TTS generated audio buffers. Letter mode uses TTS-generated A-Z samples; word mode generates input speech units.</desc>`);
  if (settings.background !== "transparent") {
    parts.push(`<rect width="100%" height="100%" rx="10" fill="${escapeXml(settings.background)}"/>`);
  }
  parts.push(`<g shape-rendering="geometricPrecision">`);

  layout.lines.forEach((line, lineIndex) => {
    const lineHeight = layout.lineHeights[lineIndex];
    const centerY = y + lineHeight * 0.5;
    let x = settings.padding;
    if (settings.showGuides && line.length) {
      parts.push(`<line x1="${settings.padding}" y1="${centerY.toFixed(2)}" x2="${(settings.padding + layout.lineWidths[lineIndex]).toFixed(2)}" y2="${centerY.toFixed(2)}" stroke="${escapeXml(settings.inkColor)}" stroke-width="0.6" opacity="0.12"/>`);
    }
    line.forEach((token) => {
      parts.push(token.audio ? buildWavePath(token, x, centerY, settings) : buildPendingGlyph(token, x, centerY));
      x += token.width;
    });
    y += lineHeight;
  });

  parts.push(`</g></svg>`);
  latestLayout = layout;
  latestMeta = {
    width: layout.width,
    height: layout.height,
    units: layout.units,
    missing: layout.missing,
    duration: estimateDuration(layout, settings)
  };
  return parts.join("");
}

function createPlaybackBuffer(layout, settings) {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const channels = Math.max(1, ...layout.lines.flatMap((line) => line.map((token) => token.audio?.numberOfChannels || 1)));
  let totalSamples = 0;

  layout.lines.forEach((line, lineIndex) => {
    line.forEach((token) => {
      if (token.audio) totalSamples += Math.max(1, Math.round(token.audio.duration * sampleRate));
      else totalSamples += Math.round(((token.silenceMs || settings.unitGapMs) / 1000) * sampleRate);
    });
    if (lineIndex < layout.lines.length - 1) totalSamples += Math.round((settings.unitGapMs / 1000) * sampleRate);
  });

  const output = ctx.createBuffer(channels, Math.max(1, totalSamples), sampleRate);
  let cursor = 0;

  layout.lines.forEach((line, lineIndex) => {
    line.forEach((token) => {
      if (!token.audio) {
        cursor += Math.round(((token.silenceMs || settings.unitGapMs) / 1000) * sampleRate);
        return;
      }
      const sampleCount = Math.max(1, Math.round(token.audio.duration * sampleRate));
      for (let channel = 0; channel < channels; channel += 1) {
        const target = output.getChannelData(channel);
        const source = token.audio.getChannelData(channel % token.audio.numberOfChannels);
        for (let i = 0; i < sampleCount; i += 1) {
          const srcIndex = Math.min(source.length - 1, Math.floor((i / sampleCount) * source.length));
          target[cursor + i] += (source[srcIndex] || 0) * 0.88;
        }
      }
      cursor += sampleCount;
    });
    if (lineIndex < layout.lines.length - 1) cursor += Math.round((settings.unitGapMs / 1000) * sampleRate);
  });

  return output;
}

function applyPreviewZoom(options = {}) {
  const svg = preview.querySelector("svg");
  if (svg && latestMeta.width > 0 && latestMeta.height > 0) {
    svg.style.width = `${Math.max(1, Math.round(latestMeta.width * previewZoom))}px`;
    svg.style.height = `${Math.max(1, Math.round(latestMeta.height * previewZoom))}px`;
  }

  controls.previewZoomLabel.textContent = `${Math.round(previewZoom * 100)}%`;
  controls.zoomOutBtn.disabled = previewZoom <= PREVIEW_ZOOM.min + 0.001;
  controls.zoomInBtn.disabled = previewZoom >= PREVIEW_ZOOM.max - 0.001;

  if (options.resetScroll) {
    controls.previewShell.scrollLeft = 0;
    controls.previewShell.scrollTop = 0;
    window.requestAnimationFrame(() => {
      controls.previewShell.scrollLeft = 0;
      controls.previewShell.scrollTop = 0;
    });
  }
}

function setPreviewZoom(value, options = {}) {
  const previousZoom = previewZoom;
  const shell = controls.previewShell;
  const anchor = options.anchor;
  const rect = anchor ? shell.getBoundingClientRect() : null;
  const beforeX = rect ? shell.scrollLeft + anchor.x - rect.left : 0;
  const beforeY = rect ? shell.scrollTop + anchor.y - rect.top : 0;

  previewZoom = clamp(Number(value) || 1, PREVIEW_ZOOM.min, PREVIEW_ZOOM.max);
  applyPreviewZoom({ resetScroll: options.resetScroll });

  if (anchor && previousZoom > 0) {
    const ratio = previewZoom / previousZoom;
    shell.scrollLeft = Math.max(0, beforeX * ratio - (anchor.x - rect.left));
    shell.scrollTop = Math.max(0, beforeY * ratio - (anchor.y - rect.top));
  }
}

function fitPreviewToViewport() {
  if (!latestMeta.width || !latestMeta.height) return;
  const shell = controls.previewShell;
  const style = getComputedStyle(shell);
  const paddingX = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const paddingY = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const availableWidth = Math.max(80, shell.clientWidth - paddingX);
  const availableHeight = Math.max(80, shell.clientHeight - paddingY);
  const nextZoom = Math.min(1, availableWidth / latestMeta.width, availableHeight / latestMeta.height);
  setPreviewZoom(nextZoom, { resetScroll: true });
}

function renderFromCache(message = "") {
  const settings = getSettings();
  stopPlayback({ resetOffset: true, silent: true });
  latestSvg = buildSvgString();
  preview.innerHTML = latestSvg;
  applyPreviewZoom({ resetScroll: true });
  latestAudioBuffer = latestLayout && latestMeta.units > 0 ? createPlaybackBuffer(latestLayout, settings) : null;
  updateMetrics();
  renderAlphabetMap();
  if (message) setStatus(message, latestMeta.missing ? "warn" : "normal");
}

function renderPlaceholder(message, tone = "normal") {
  const settings = getSettings();
  stopPlayback({ resetOffset: true, silent: true });
  const width = 760;
  const height = 230;
  const bg = settings.background === "transparent" ? "" : `<rect width="100%" height="100%" rx="10" fill="${escapeXml(settings.background)}"/>`;
  latestSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bg}<line x1="42" y1="115" x2="718" y2="115" stroke="${escapeXml(settings.inkColor)}" opacity="0.14"/><text x="380" y="105" text-anchor="middle" font-size="18" fill="${tone === "error" ? "#9b2335" : "#657282"}" font-family="Inter, Arial">${escapeXml(message)}</text><text x="380" y="134" text-anchor="middle" font-size="12" fill="#657282" font-family="Inter, Arial">所有可见波形都必须先由 TTS 音频生成</text></svg>`;
  preview.innerHTML = latestSvg;
  latestLayout = null;
  latestAudioBuffer = null;
  latestMeta = { width, height, units: 0, missing: 0, duration: 0 };
  applyPreviewZoom({ resetScroll: true });
  updateMetrics();
  renderAlphabetMap();
  setStatus(message, tone);
}

function updateMetrics() {
  const modeLabel = controls.synthesisMode.value === "letters" ? "字母 TTS 采样" : "单词 TTS";
  metrics.textContent = `${modeLabel} · ${latestMeta.units} 音频单元 · ${latestMeta.missing} 待生成 · ${latestMeta.width} × ${latestMeta.height} · ${latestMeta.duration.toFixed(2)}s`;
}

function collectLetterUnits(settings) {
  return [...LETTER_SPEECH.entries()].map(([letter, speech], index) => ({
    index,
    kind: "letter",
    label: letter,
    text: speech,
    cacheKey: cacheKey("letter", letter, settings)
  })).filter((unit) => !ttsCache.has(unit.cacheKey));
}

function collectWordUnits(settings) {
  const seen = new Set();
  const units = [];
  extractSpeechUnitLines().forEach((line) => {
    line.forEach((token) => {
      if (token.type !== "speech" || !token.text) return;
      const key = cacheKey("word", token.text, settings);
      if (ttsCache.has(key) || seen.has(key)) return;
      seen.add(key);
      units.push({
        index: units.length,
        kind: "word",
        label: token.text,
        text: token.text,
        cacheKey: key
      });
    });
  });
  return units;
}

function ensureTtsWorker() {
  if (ttsWorker) return ttsWorker;
  ttsWorker = new Worker(TTS_WORKER_URL, { type: "module" });
  ttsWorker.onmessage = handleTtsWorkerMessage;
  ttsWorker.onerror = (event) => {
    rejectTtsJob(new Error(event.message || "TTS worker failed"));
  };
  return ttsWorker;
}

function rejectTtsJob(error) {
  if (!pendingTtsJob) return;
  pendingTtsJob.reject(error);
  pendingTtsJob = null;
}

function resolveTtsJob(value) {
  if (!pendingTtsJob) return;
  pendingTtsJob.resolve(value);
  pendingTtsJob = null;
}

function handleTtsWorkerMessage(event) {
  const message = event.data || {};
  if (message.jobId && pendingTtsJob?.jobId && message.jobId !== pendingTtsJob.jobId) return;

  switch (message.type) {
    case "backend":
      if (message.stage === "fallback") {
        setProgress("切换后端", {
          detail: `WebGPU 加载失败，正在回退到 WASM / ${message.dtype}。`,
          ratio: 0.05,
          indeterminate: true
        });
        setStatus(`WebGPU 加载失败，正在回退到 WASM / ${message.dtype}。`);
      } else {
        setProgress("加载模型", {
          detail: `正在加载 Kokoro TTS：${String(message.backend || "").toUpperCase()} / ${message.dtype}。`,
          ratio: 0.04,
          indeterminate: true
        });
        setStatus(`正在加载 Kokoro TTS：${String(message.backend || "").toUpperCase()} / ${message.dtype}。`);
      }
      break;
    case "progress":
      if (message.phase === "load") {
        setProgress("下载 / 加载模型", {
          detail: `模型文件 ${message.total ? `${Math.round((message.loaded || 0) / 1024 / 1024)}MB / ${Math.round((message.total || 0) / 1024 / 1024)}MB` : "正在准备运行时"}`,
          ratio: message.progress ? 0.05 + clamp(message.progress, 0, 1) * 0.35 : 0.05,
          indeterminate: !message.progress
        });
        setStatus(`正在下载 / 加载模型：${Math.round((message.progress || 0) * 100)}%。`);
      } else if (message.phase === "import") {
        setProgress("加载 TTS 引擎", {
          detail: message.detail || "正在导入 Kokoro JS 运行时。",
          ratio: 0.02,
          indeterminate: true
        });
        setStatus(message.detail || "正在导入 Kokoro JS 运行时。");
      } else {
        const done = Number(message.done) || 0;
        const total = Math.max(1, Number(message.total) || 1);
        setProgress("生成语音单元", {
          detail: `${done} / ${total}${message.currentText ? ` · 当前：${message.currentText}` : ""}`,
          ratio: 0.42 + clamp(done / total, 0, 1) * 0.5,
          indeterminate: false
        });
        setStatus(`正在生成 TTS 音频：${message.done || 0} / ${message.total || 0}${message.currentText ? ` · ${message.currentText}` : ""}`);
      }
      break;
    case "loaded":
      setProgress("模型已加载", {
        detail: `Kokoro TTS 已加载：${String(message.backend || "").toUpperCase()} / ${message.dtype}。`,
        ratio: 0.4,
        indeterminate: false
      });
      setStatus(`Kokoro TTS 已加载：${String(message.backend || "").toUpperCase()} / ${message.dtype}。`);
      break;
    case "done":
      resolveTtsJob(message.parts || []);
      break;
    case "cancelled":
      rejectTtsJob(new Error("TTS 生成已取消。"));
      break;
    case "error":
      rejectTtsJob(new Error(message.message || "TTS generation failed"));
      break;
    default:
      break;
  }
}

function queueTtsGenerate(units, settings) {
  if (pendingTtsJob) return pendingTtsJob.promise;
  const worker = ensureTtsWorker();
  const jobId = ++currentJobId;
  const promise = new Promise((resolve, reject) => {
    pendingTtsJob = { jobId, resolve, reject };
  });
  worker.postMessage({
    type: "generate",
    jobId,
    settings: {
      modelId: TTS_MODEL_ID,
      device: settings.ttsBackend,
      dtype: settings.ttsDtype
    },
    voice: settings.ttsVoice,
    speed: settings.ttsSpeed,
    units
  });
  return promise;
}

async function decodeGeneratedParts(parts) {
  setProgress("后处理音频", {
    detail: `正在解码 ${parts.length} 个 WAV 片段、裁剪首尾静音并生成 AudioBuffer。`,
    ratio: 0.94,
    indeterminate: false
  });
  const ctx = getAudioContext();
  let totalBefore = 0;
  let totalAfter = 0;
  let trimmedParts = 0;

  for (const part of parts) {
    const buffer = await ctx.decodeAudioData(part.wav.slice(0));
    const result = trimAudioSilence(buffer);
    totalBefore += buffer.duration;
    totalAfter += result.buffer.duration;
    if (result.trimmed) trimmedParts += 1;
    ttsCache.set(part.cacheKey, result.buffer);
  }

  return {
    count: parts.length,
    trimmedParts,
    secondsRemoved: Math.max(0, totalBefore - totalAfter)
  };
}

async function generateLetters() {
  if (generationState.running) {
    showToast("正在生成中，请等待当前任务完成");
    return;
  }
  const settings = getSettings();
  const units = collectLetterUnits(settings);
  if (units.length === 0) {
    renderFromCache("A-Z 字母 TTS 采样已在缓存中。");
    resetProgress("已缓存", "A-Z 字母采样已存在，可直接导出或试听。");
    return;
  }

  startProgress("准备生成", `A-Z 字母 TTS 采样：${units.length} 个待生成。`);
  setBusy(true);
  setStatus(`准备生成 A-Z 字母 TTS 采样：${units.length} 个待生成。`);
  try {
    await resumeAudioContext();
    const parts = await queueTtsGenerate(units, settings);
    const trimStats = await decodeGeneratedParts(parts);
    renderFromCache(`字母发音版就绪：A-Z 均由 ${settings.ttsVoice} 现场 TTS 生成。`);
    finishProgress("生成完成", `A-Z 字母采样完成：${parts.length} 个音频单元，已裁剪静音 ${trimStats.secondsRemoved.toFixed(2)}s。`);
  } catch (error) {
    renderPlaceholder(error.message || String(error), "error");
    finishProgress("生成失败", error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function generateWords() {
  if (generationState.running) {
    showToast("正在生成中，请等待当前任务完成");
    return;
  }
  const settings = getSettings();
  const units = collectWordUnits(settings);
  if (units.length === 0) {
    renderFromCache("当前输入单词音频已在缓存中。");
    resetProgress("已缓存", "当前输入对应的 TTS 音频已存在，可直接导出或试听。");
    return;
  }

  startProgress("准备生成", `当前输入需要生成 ${units.length} 个唯一语音单元。`);
  setBusy(true);
  setStatus(`准备逐词生成 TTS：${units.length} 个唯一语音单元。`);
  try {
    await resumeAudioContext();
    const parts = await queueTtsGenerate(units, settings);
    const trimStats = await decodeGeneratedParts(parts);
    renderFromCache(`单词发音版就绪：已生成 ${parts.length} 个 TTS 单词/语音单元。`);
    finishProgress("生成完成", `单词发音版完成：${parts.length} 个音频单元，已裁剪静音 ${trimStats.secondsRemoved.toFixed(2)}s。`);
  } catch (error) {
    renderPlaceholder(error.message || String(error), "error");
    finishProgress("生成失败", error.message || String(error), "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  controls.sampleLettersBtn.disabled = isBusy;
  controls.generateWordsBtn.disabled = isBusy;
  controls.synthesisMode.disabled = isBusy;
  controls.ttsVoice.disabled = isBusy;
  controls.ttsBackend.disabled = isBusy;
  controls.ttsDtype.disabled = isBusy;
  controls.ttsSpeed.disabled = isBusy;
  controls.sampleLettersBtn.textContent = isBusy ? "生成中..." : "生成 A-Z 字母采样";
  controls.generateWordsBtn.textContent = isBusy ? "生成中..." : "生成输入单词波形";
}

function updatePlaybackButton() {
  if (playbackState.isPlaying) {
    controls.playAudioBtn.textContent = "暂停试听";
    controls.playAudioBtn.classList.add("is-playing");
  } else if (playbackState.pausedAt > 0 && playbackState.pausedAt < playbackState.duration) {
    controls.playAudioBtn.textContent = "继续试听";
    controls.playAudioBtn.classList.remove("is-playing");
  } else {
    controls.playAudioBtn.textContent = "试听拼接音频";
    controls.playAudioBtn.classList.remove("is-playing");
  }
}

function stopPlayback(options = {}) {
  const { resetOffset = false, silent = false } = options;
  if (playbackState.source) {
    playbackState.ignoreEnded = true;
    try {
      playbackState.source.stop();
    } catch {
      // Already stopped sources throw in some browsers.
    }
    try {
      playbackState.source.disconnect();
    } catch {
      // Some engines disconnect ended nodes automatically.
    }
    playbackState.source = null;
  }

  if (playbackState.isPlaying && !resetOffset) {
    const elapsed = Math.max(0, getAudioContext().currentTime - playbackState.startedAt);
    playbackState.pausedAt = clamp(playbackState.offset + elapsed, 0, playbackState.duration);
  }

  playbackState.isPlaying = false;
  playbackState.startedAt = 0;
  if (resetOffset) {
    playbackState.offset = 0;
    playbackState.pausedAt = 0;
    playbackState.duration = latestAudioBuffer?.duration || 0;
  }
  updatePlaybackButton();
  if (!silent && playbackState.pausedAt > 0) {
    setStatus(`已暂停试听：${playbackState.pausedAt.toFixed(2)}s / ${playbackState.duration.toFixed(2)}s。`);
  }
}

function finishPlaybackNaturally() {
  playbackState.source = null;
  playbackState.isPlaying = false;
  playbackState.startedAt = 0;
  playbackState.offset = 0;
  playbackState.pausedAt = 0;
  updatePlaybackButton();
  setStatus("试听播放完成。");
}

function startPlaybackFrom(offset) {
  const ctx = getAudioContext();
  stopPlayback({ resetOffset: false, silent: true });
  playbackState.ignoreEnded = false;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = latestAudioBuffer;
  gain.gain.value = 0.86;
  source.connect(gain).connect(ctx.destination);
  playbackState.source = source;
  playbackState.offset = clamp(offset, 0, Math.max(0, latestAudioBuffer.duration - 0.02));
  playbackState.pausedAt = 0;
  playbackState.duration = latestAudioBuffer.duration;
  playbackState.startedAt = ctx.currentTime;
  playbackState.isPlaying = true;
  source.onended = () => {
    if (playbackState.ignoreEnded) {
      playbackState.ignoreEnded = false;
      return;
    }
    finishPlaybackNaturally();
  };
  source.start(0, playbackState.offset);
  updatePlaybackButton();
  setStatus(`正在试听拼接音频：${playbackState.duration.toFixed(2)}s。再次点击可暂停。`);
}

function renderAlphabetMap() {
  const settings = getSettings();
  alphabetMap.innerHTML = [...LETTER_SPEECH.keys()].map((letter) => {
    const buffer = getCachedAudio("letter", letter, settings);
    if (!buffer) {
      return `<div class="letter-card"><svg viewBox="0 0 72 28" aria-hidden="true"><line x1="6" y1="14" x2="66" y2="14" stroke="#9b6a1b" stroke-dasharray="3 4"/></svg><span>${letter.toLowerCase()}</span></div>`;
    }
    const token = {
      type: "letter",
      text: letter,
      label: letter,
      audio: buffer,
      width: 60,
      style: { color: settings.inkColor, bold: false, italic: false, underline: false, scale: 1 }
    };
    return `<div class="letter-card"><svg viewBox="0 0 72 28" aria-hidden="true">${buildWavePath(token, 6, 14, { ...settings, amplitude: 9, roughness: 0.14 })}</svg><span>${letter.toLowerCase()}</span></div>`;
  }).join("");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function svgToCanvas(format = "png") {
  return new Promise((resolve, reject) => {
    const settings = getSettings();
    if (!latestSvg) latestSvg = buildSvgString();
    const svgBlob = new Blob([latestSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    const scale = 2;

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = latestMeta.width * scale;
      canvas.height = latestMeta.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (format === "jpeg" || settings.background !== "transparent") {
        ctx.fillStyle = format === "jpeg" && settings.background === "transparent" ? "#ffffff" : settings.background;
        ctx.fillRect(0, 0, latestMeta.width, latestMeta.height);
      }
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 渲染失败"));
    };
    image.src = url;
  });
}

async function exportImage() {
  if (!latestSvg || latestMeta.units === 0 || latestMeta.missing > 0) {
    showToast("请先生成完整的 TTS 真实波形");
    return;
  }
  const format = controls.format.value;
  const name = `tts-wave-text-${timestamp()}.${format === "jpeg" ? "jpg" : format}`;
  if (format === "svg") {
    downloadBlob(new Blob([latestSvg], { type: "image/svg+xml;charset=utf-8" }), name);
    showToast("SVG 已导出");
    return;
  }

  const canvas = await svgToCanvas(format);
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  canvas.toBlob((blob) => {
    if (!blob) {
      showToast("导出失败，请换一种格式");
      return;
    }
    downloadBlob(blob, name);
    showToast(`${format.toUpperCase()} 已导出`);
  }, mime, format === "jpeg" ? 0.94 : 0.96);
}

async function copyPng() {
  if (!navigator.clipboard || !window.ClipboardItem) {
    showToast("当前浏览器不支持直接复制图片");
    return;
  }
  if (!latestSvg || latestMeta.units === 0 || latestMeta.missing > 0) {
    showToast("请先生成完整的 TTS 真实波形");
    return;
  }
  const canvas = await svgToCanvas("png");
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showToast("PNG 已复制到剪贴板");
  }, "image/png");
}

async function playAudio() {
  if (!latestAudioBuffer || latestMeta.missing > 0) {
    showToast("请先生成完整的 TTS 音频");
    return;
  }
  await resumeAudioContext();
  if (playbackState.isPlaying) {
    stopPlayback();
    return;
  }
  startPlaybackFrom(playbackState.pausedAt || 0);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  toastTimer = window.setTimeout(() => toast.remove(), 2400);
}

function applyCommand(command) {
  editor.focus();
  document.execCommand(command, false, null);
  updateToolbarState();
  renderAfterInput();
}

function applyTextColor(value) {
  editor.focus();
  document.execCommand("foreColor", false, value);
  renderAfterInput();
}

function applyFontSize(value) {
  editor.focus();
  document.execCommand("fontSize", false, value);
  renderAfterInput();
}

function updateToolbarState() {
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.classList.toggle("active", document.queryCommandState(button.dataset.command));
  });
}

function updateControlOutputs() {
  ["pixelsPerSecond", "lineHeight", "amplitude", "roughness", "unitGap", "ttsSpeed"].forEach((name) => {
    const output = document.querySelector(`#${name}Out`);
    if (output) output.value = controls[name].value;
  });
}

function renderAfterInput() {
  renderTicket += 1;
  stopPlayback({ resetOffset: true, silent: true });
  renderFromCache("输入已更新；缺失部分需要重新生成 TTS。");
}

function updateModeUi() {
  const isLetters = controls.synthesisMode.value === "letters";
  document.querySelectorAll("[data-mode-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.modePanel === "letters" ? !isLetters : isLetters;
  });
  renderFromCache(isLetters ? "字母发音版：先生成 A-Z TTS 采样。" : "单词发音版：按当前输入逐词生成 TTS。");
}

function bindEvents() {
  editor.addEventListener("input", renderAfterInput);
  editor.addEventListener("keyup", updateToolbarState);
  editor.addEventListener("mouseup", updateToolbarState);
  editor.addEventListener("paste", () => window.setTimeout(renderAfterInput, 0));

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => applyCommand(button.dataset.command));
  });

  controls.textColor.addEventListener("input", (event) => applyTextColor(event.target.value));
  controls.fontSize.addEventListener("change", (event) => applyFontSize(event.target.value));
  controls.synthesisMode.addEventListener("change", updateModeUi);

  ["backgroundMode", "inkColor", "paperColor", "pixelsPerSecond", "lineHeight", "amplitude", "roughness", "unitGap", "preserveStyle", "showGuides", "tightCrop"].forEach((name) => {
    controls[name].addEventListener("input", () => {
      updateControlOutputs();
      renderFromCache();
    });
    controls[name].addEventListener("change", () => {
      updateControlOutputs();
      renderFromCache();
    });
  });

  ["ttsVoice", "ttsBackend", "ttsDtype", "ttsSpeed"].forEach((name) => {
    controls[name].addEventListener("input", () => {
      updateControlOutputs();
      renderFromCache("TTS 设置已变更；请重新生成当前模式音频。");
    });
    controls[name].addEventListener("change", () => {
      updateControlOutputs();
      renderFromCache("TTS 设置已变更；请重新生成当前模式音频。");
    });
  });

  controls.sampleLettersBtn.addEventListener("click", () => {
    generateLetters().catch((error) => renderPlaceholder(error.message || String(error), "error"));
  });

  controls.generateWordsBtn.addEventListener("click", () => {
    generateWords().catch((error) => renderPlaceholder(error.message || String(error), "error"));
  });

  controls.playAudioBtn.addEventListener("click", () => {
    playAudio().catch((error) => showToast(error.message || String(error)));
  });

  controls.zoomOutBtn.addEventListener("click", () => {
    setPreviewZoom(previewZoom / PREVIEW_ZOOM.step);
  });

  controls.zoomInBtn.addEventListener("click", () => {
    setPreviewZoom(previewZoom * PREVIEW_ZOOM.step);
  });

  controls.zoomFitBtn.addEventListener("click", fitPreviewToViewport);

  controls.zoomResetBtn.addEventListener("click", () => {
    setPreviewZoom(1, { resetScroll: true });
  });

  controls.previewShell.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1 / PREVIEW_ZOOM.step : PREVIEW_ZOOM.step;
    setPreviewZoom(previewZoom * factor, { anchor: { x: event.clientX, y: event.clientY } });
  }, { passive: false });

  document.querySelector("#downloadBtn").addEventListener("click", () => {
    exportImage().catch((error) => showToast(error.message));
  });

  document.querySelector("#copyPngBtn").addEventListener("click", () => {
    copyPng().catch((error) => showToast(error.message));
  });

  document.querySelector("#clearBtn").addEventListener("click", () => {
    editor.innerHTML = "";
    editor.focus();
    renderAfterInput();
  });

  document.querySelector("#resetSample").addEventListener("click", () => {
    editor.innerHTML = sampleHtml;
    renderAfterInput();
  });

  document.querySelector("#refreshSeed").addEventListener("click", () => {
    renderFromCache("已按当前 TTS 音频重绘视觉墨迹。");
  });
}

bindEvents();
updateControlOutputs();
updateModeUi();
