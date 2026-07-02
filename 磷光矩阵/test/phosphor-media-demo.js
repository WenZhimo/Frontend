const copy = {
  labels: {
    builtInCanvas: "Canvas 源",
    builtInImage: "示例图像",
    builtInVideo: "示例视频",
  },
  buttons: {
    pause: "暂停",
    resume: "继续",
    downloadFrame: "下载当前帧",
    startRecording: "开始录制 WebM",
    stopRecording: "停止并下载",
  },
  status: {
    initializing: "WebGL2 初始化中",
    libraryMissing: "库未加载",
    unsupported: "WebGL2 不可用",
    destroyed: "演示已停止",
    exportIdle: "导出就绪：图片可下载当前帧，动态源可录制 WebM。",
    frameCaptured: "当前帧已导出。",
    recording: "正在录制滤镜画面…",
    recordingStarted: "正在录制 WebM，停止后自动下载。",
    recordingSaved: "WebM 已生成并下载。",
    recordingAutoPlayed: "录制需要动态刷新，已自动继续播放。",
  },
  errors: {
    imageLoad: "图片无法加载。",
    videoLoad: "视频无法加载，或浏览器无法解码该视频。",
    gifDecode: "GIF 解码失败，未读取到可播放帧。",
    unsupportedFile: "请选择浏览器可解码的图片、SVG、GIF 或视频文件。",
    libraryMissing: "磷光媒体库未加载，请确认 phosphor/media-renderer.global.js 与本页面在同一项目目录。",
    unsupportedWebgl: "当前浏览器不支持 WebGL2，媒体 shader 演示无法运行。",
    textureUpload: "纹理上传失败：",
    captureFrameUnsupported: "当前浏览器不支持导出当前帧。",
    captureFrameFailed: "当前帧导出失败，请稍后再试。",
    captureStreamUnsupported: "当前浏览器不支持录制画布流，可尝试使用 Chrome / Edge。",
    mediaRecorderUnsupported: "当前浏览器不支持录制 WebM，可尝试使用 Chrome / Edge。",
    recordingFailed: "WebM 录制失败，请换用更低帧率或重新选择资源。",
  },
};

const exportFormats = {
  png: { mimeType: "image/png", extension: "png", label: "PNG" },
  jpeg: { mimeType: "image/jpeg", extension: "jpg", label: "JPEG" },
  webp: { mimeType: "image/webp", extension: "webp", label: "WebP" },
};

const webmMimeCandidates = [
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/webm",
];

const mount = document.getElementById("mediaMount");
const imageSource = document.getElementById("imageSource");
const videoSource = document.getElementById("videoSource");
const videoGenerator = document.getElementById("videoGenerator");
const canvasSource = document.getElementById("canvasSource");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const toggleRender = document.getElementById("toggleRender");
const fitMode = document.getElementById("fitMode");
const qualityMode = document.getElementById("qualityMode");
const pitchControl = document.getElementById("pitchControl");
const bloomControl = document.getElementById("bloomControl");
const diffusionControl = document.getElementById("diffusionControl");
const noiseControl = document.getElementById("noiseControl");
const pitchValue = document.getElementById("pitchValue");
const bloomValue = document.getElementById("bloomValue");
const diffusionValue = document.getElementById("diffusionValue");
const noiseValue = document.getElementById("noiseValue");
const sourceLabel = document.getElementById("sourceLabel");
const statusText = document.getElementById("statusText");
const errorText = document.getElementById("errorText");
const frameFormat = document.getElementById("frameFormat");
const frameQuality = document.getElementById("frameQuality");
const frameQualityValue = document.getElementById("frameQualityValue");
const downloadFrame = document.getElementById("downloadFrame");
const recordFps = document.getElementById("recordFps");
const toggleRecording = document.getElementById("toggleRecording");
const exportStatus = document.getElementById("exportStatus");
const backendMetric = document.getElementById("backendMetric");
const sourceMetric = document.getElementById("sourceMetric");
const canvasMetric = document.getElementById("canvasMetric");
const fpsMetric = document.getElementById("fpsMetric");
const sourceButtons = [...document.querySelectorAll("[data-source]")];
const { PhosphorMediaRenderer } = window.Phosphor || {};

let renderer = null;
let generatedVideoStream = null;
let isDemoPlaying = true;
let appRafId = 0;
let frameCount = 0;
let fpsStart = performance.now();
let exportController = null;

function setExportStatus(message = copy.status.exportIdle) {
  if (exportStatus) exportStatus.textContent = message;
}

function setError(message = "") {
  errorText.textContent = message;
}

function syncOutputs() {
  pitchValue.textContent = pitchControl.value;
  bloomValue.textContent = Number(bloomControl.value).toFixed(2);
  diffusionValue.textContent = Number(diffusionControl.value).toFixed(2);
  noiseValue.textContent = Number(noiseControl.value).toFixed(3);
  if (frameQualityValue && frameQuality) frameQualityValue.textContent = Number(frameQuality.value).toFixed(2);
}

function sanitizeFilePart(value = "phosphor") {
  return String(value)
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "phosphor";
}

function timestampPart(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resolveFrameFormat() {
  return exportFormats[frameFormat?.value] || exportFormats.png;
}

function resolveWebmMimeType() {
  if (!("MediaRecorder" in window)) return "";
  return webmMimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function createExportController() {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let state = "idle";

  function setState(nextState, message) {
    state = nextState;
    if (toggleRecording) {
      toggleRecording.textContent = state === "recording" ? copy.buttons.stopRecording : copy.buttons.startRecording;
      toggleRecording.setAttribute("aria-pressed", String(state === "recording"));
    }
    if (message) setExportStatus(message);
  }

  function ensureRendererReady() {
    if (!renderer) throw new Error(copy.errors.libraryMissing);
    return renderer;
  }

  function clearRecorder() {
    stream?.getTracks?.().forEach((track) => track.stop());
    recorder = null;
    stream = null;
    chunks = [];
  }

  function userFacingExportError(error, fallback) {
    const knownMessages = new Set(Object.values(copy.errors));
    return knownMessages.has(error?.message) ? error.message : fallback;
  }

  function outputName(extension) {
    const sourceName = sourceRegistry.active?.label || "phosphor";
    return `${sanitizeFilePart(sourceName)}-filtered-${timestampPart()}.${extension}`;
  }

  async function downloadCurrentFrame() {
    const activeRenderer = ensureRendererReady();
    const outputCanvas = activeRenderer.getOutputCanvas?.();
    if (!outputCanvas?.toBlob || !activeRenderer.captureFrame) {
      throw new Error(copy.errors.captureFrameUnsupported);
    }
    const format = resolveFrameFormat();
    setState("capturingFrame");
    try {
      const quality = format.mimeType === "image/png" || !frameQuality ? undefined : Number(frameQuality.value);
      const blob = await activeRenderer.captureFrame({
        type: format.mimeType,
        quality,
        time: performance.now(),
      });
      const actualFormat = Object.values(exportFormats).find((item) => item.mimeType === blob.type) || format;
      downloadBlob(blob, outputName(actualFormat.extension));
      setState("idle", copy.status.frameCaptured);
      return blob;
    } catch (error) {
      const message = userFacingExportError(error, copy.errors.captureFrameFailed);
      setState("error", message);
      throw new Error(message);
    }
  }

  function startRecording() {
    if (state === "recording") return;
    if (state === "finalizing") throw new Error(copy.status.recording);
    const activeRenderer = ensureRendererReady();
    const outputCanvas = activeRenderer.getOutputCanvas?.();
    if (!outputCanvas?.captureStream || !activeRenderer.captureStream) throw new Error(copy.errors.captureStreamUnsupported);
    if (!("MediaRecorder" in window)) throw new Error(copy.errors.mediaRecorderUnsupported);
    const mimeType = resolveWebmMimeType();
    if (!mimeType) throw new Error(copy.errors.mediaRecorderUnsupported);
    if (!isDemoPlaying) {
      isDemoPlaying = true;
      toggleRender.textContent = copy.buttons.pause;
      setExportStatus(copy.status.recordingAutoPlayed);
    }

    chunks = [];
    const fps = Number(recordFps.value) || 30;
    stream = activeRenderer.captureStream(fps);
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: qualityMode.value === "high" ? 10_000_000 : qualityMode.value === "medium" ? 6_000_000 : 3_000_000,
    });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      setState("error", copy.errors.recordingFailed);
    });
    recorder.start(250);
    setState("recording", copy.status.recordingStarted);
  }

  function stopRecording(options = {}) {
    const { download = true } = options;
    if (!recorder || state !== "recording") return Promise.resolve(null);
    const currentRecorder = recorder;
    const currentChunks = chunks;
    const currentStream = stream;
    setState(download ? "finalizing" : "idle", download ? copy.status.recording : undefined);
    return new Promise((resolve, reject) => {
      let finalized = false;
      const finalize = () => {
        if (finalized) return;
        finalized = true;
        try {
          const type = currentRecorder.mimeType || "video/webm";
          const blob = new Blob(currentChunks, { type });
          clearRecorder();
          if (download) {
            if (!blob.size) throw new Error(copy.errors.recordingFailed);
            downloadBlob(blob, outputName("webm"));
            setState("idle", copy.status.recordingSaved);
            resolve(blob);
          } else {
            setState("idle");
            resolve(null);
          }
        } catch (error) {
          clearRecorder();
          const message = userFacingExportError(error, copy.errors.recordingFailed);
          setState("error", message);
          reject(new Error(message));
        }
      };
      const waitForDataThenFinalize = (startedAt = performance.now()) => {
        if (currentChunks.length || performance.now() - startedAt > 1600) {
          finalize();
          return;
        }
        window.setTimeout(() => waitForDataThenFinalize(startedAt), 80);
      };
      currentRecorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) currentChunks.push(event.data);
      });
      currentRecorder.addEventListener("stop", () => {
        waitForDataThenFinalize();
      }, { once: true });
      currentStream?.getVideoTracks?.().forEach((track) => track.requestFrame?.());
      currentRecorder.requestData?.();
      currentRecorder.stop();
    });
  }

  async function toggleRecordingState() {
    if (state === "recording") return stopRecording();
    startRecording();
    return null;
  }

  function dispose() {
    if (recorder && state === "recording") {
      stopRecording({ download: false }).catch(() => clearRecorder());
      return;
    }
    clearRecorder();
    setState("idle");
  }

  return {
    downloadCurrentFrame,
    startRecording,
    stopRecording,
    toggleRecording: toggleRecordingState,
    dispose,
    getState: () => ({
      state,
      mimeType: recorder?.mimeType || resolveWebmMimeType(),
      chunks: chunks.length,
    }),
  };
}

exportController = createExportController();

function updateSourceButtons(tab) {
  sourceButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.source === tab));
  });
}

function showSourcePreview(previewKind) {
  imageSource.classList.toggle("hidden", previewKind !== "image");
  videoSource.classList.toggle("hidden", previewKind !== "video");
  canvasSource.classList.toggle("hidden", previewKind !== "canvas");
}

function isGifFile(file) {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

function isSvgFile(file) {
  return file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name);
}

function isImageFile(file) {
  return file.type.startsWith("image/") || isSvgFile(file);
}

function isVideoFile(file) {
  return file.type.startsWith("video/");
}

function waitForImage(image) {
  if (!(image instanceof HTMLImageElement)) return Promise.resolve();
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error(copy.errors.imageLoad)), { once: true });
  });
}

function waitForVideo(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const handleReady = () => {
      if (video.videoWidth) resolve();
      else video.addEventListener("resize", resolve, { once: true });
    };
    video.addEventListener("loadeddata", handleReady, { once: true });
    video.addEventListener("canplay", handleReady, { once: true });
    video.addEventListener("error", () => reject(new Error(copy.errors.videoLoad)), { once: true });
  });
}

function createGeneratedImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 853;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#07101d");
  gradient.addColorStop(0.45, "#16395d");
  gradient.addColorStop(1, "#dcefff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 90; i += 1) {
    const x = (i * 89) % canvas.width;
    const y = (i * 137) % canvas.height;
    const size = 36 + ((i * 23) % 180);
    ctx.fillStyle = `rgba(${90 + (i % 5) * 28}, ${138 + (i % 7) * 12}, 255, ${0.08 + (i % 4) * 0.045})`;
    ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
  }

  ctx.fillStyle = "rgba(3, 8, 18, 0.45)";
  ctx.fillRect(0, canvas.height * 0.64, canvas.width, canvas.height * 0.22);
  ctx.fillStyle = "#eff7ff";
  ctx.font = "700 92px Segoe UI, sans-serif";
  ctx.fillText("GENERATED IMAGE", 86, canvas.height * 0.72);
  ctx.fillStyle = "#78e2ff";
  ctx.font = "500 38px Segoe UI, sans-serif";
  ctx.fillText("origin-clean local demo texture", 92, canvas.height * 0.79);
  return canvas.toDataURL("image/png");
}

function sizeCanvasSource() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvasSource.getBoundingClientRect();
  const width = Math.max(640, Math.round((rect.width || 640) * ratio));
  const height = Math.max(360, Math.round((rect.height || 360) * ratio));
  if (canvasSource.width !== width || canvasSource.height !== height) {
    canvasSource.width = width;
    canvasSource.height = height;
  }
}

function sizeVideoGenerator() {
  if (videoGenerator.width !== 1280 || videoGenerator.height !== 720) {
    videoGenerator.width = 1280;
    videoGenerator.height = 720;
  }
}

function drawBuiltInCanvas(time) {
  sizeCanvasSource();
  const ctx = canvasSource.getContext("2d");
  const w = canvasSource.width;
  const h = canvasSource.height;
  const t = time * 0.001;
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);

  const cols = 15;
  const rows = 9;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const u = x / Math.max(1, cols - 1);
      const v = y / Math.max(1, rows - 1);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + x * 0.72 + y * 0.44);
      const size = (10 + pulse * 28) * (window.devicePixelRatio || 1);
      ctx.fillStyle = `rgba(${Math.round(120 + pulse * 120)}, ${Math.round(180 + pulse * 70)}, 255, ${0.18 + pulse * 0.72})`;
      ctx.fillRect(u * w - size * 0.5, v * h - size * 0.5, size, size);
    }
  }

  ctx.fillStyle = "#eaf5ff";
  ctx.font = `${Math.round(h * 0.12)}px Segoe UI, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("LOCAL CANVAS", w * 0.08, h * 0.42);
  ctx.fillStyle = "#79e6a1";
  ctx.font = `${Math.round(h * 0.052)}px Segoe UI, sans-serif`;
  ctx.fillText("direct WebGL texture source", w * 0.085, h * 0.55);
}

function drawGeneratedVideo(time) {
  sizeVideoGenerator();
  const ctx = videoGenerator.getContext("2d");
  const w = videoGenerator.width;
  const h = videoGenerator.height;
  const t = time * 0.001;
  ctx.fillStyle = "#040813";
  ctx.fillRect(0, 0, w, h);

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 80, w * 0.5, h * 0.45, w * 0.78);
  bg.addColorStop(0, "#1d5b8d");
  bg.addColorStop(0.48, "#0e2446");
  bg.addColorStop(1, "#030711");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 42; i += 1) {
    const x = ((i * 91 + t * (36 + i * 1.7)) % (w + 180)) - 90;
    const y = (Math.sin(t * 0.9 + i * 0.48) * 0.32 + 0.5) * h;
    const size = 18 + (i % 8) * 14;
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.8 + i);
    ctx.fillStyle = `rgba(155, 205, 255, ${0.08 + pulse * 0.34})`;
    ctx.fillRect(x, y, size * 1.8, size);
  }

  ctx.fillStyle = "#eef7ff";
  ctx.font = "700 74px Segoe UI, sans-serif";
  ctx.fillText("GENERATED VIDEO", 72, h * 0.47);
  ctx.fillStyle = "#7ee7ad";
  ctx.font = "500 32px Segoe UI, sans-serif";
  ctx.fillText("canvas.captureStream source", 78, h * 0.55);
}

function drawImageElementToCanvas(image, canvas) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}

function prepareGifTimeline(frames) {
  let cursor = 0;
  frames.forEach((frame) => {
    frame.startMs = cursor;
    cursor += frame.durationMs;
    frame.endMs = cursor;
  });
  return Math.max(20, cursor);
}

function findGifFrameIndex(animation, time) {
  if (animation.frames.length <= 1) return 0;
  const totalDurationMs = animation.totalDurationMs || prepareGifTimeline(animation.frames);
  const elapsed = ((time - animation.startedAt) % totalDurationMs + totalDurationMs) % totalDurationMs;
  let low = 0;
  let high = animation.frames.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (elapsed < animation.frames[mid].endMs) high = mid;
    else low = mid + 1;
  }
  return low;
}

function updateDecodedGifFrame(animation, time, force = false) {
  if (!animation.frames?.length) return;
  const frameIndex = findGifFrameIndex(animation, time);
  if (!force && frameIndex === animation.drawnFrameIndex) return;

  const frame = animation.frames[frameIndex] || animation.frames[0];
  if (animation.canvas.width !== frame.width || animation.canvas.height !== frame.height) {
    animation.canvas.width = frame.width;
    animation.canvas.height = frame.height;
  }

  const ctx = animation.canvas.getContext("2d");
  ctx.clearRect(0, 0, animation.canvas.width, animation.canvas.height);
  ctx.drawImage(frame.bitmap, 0, 0);

  animation.frameIndex = frameIndex;
  animation.drawnFrameIndex = frameIndex;
}

async function decodeGifFrames(file) {
  const decoder = new ImageDecoder({
    data: await file.arrayBuffer(),
    type: file.type || "image/gif",
  });
  const frames = [];
  const maxFrames = 3000;

  try {
    await decoder.tracks.ready;
    for (let index = 0; index < maxFrames; index += 1) {
      let decoded;
      try {
        decoded = await decoder.decode({ frameIndex: index });
      } catch {
        break;
      }

      const image = decoded.image;
      try {
        frames.push({
          bitmap: await createImageBitmap(image),
          durationMs: Math.max(20, (image.duration || 100000) / 1000),
          width: image.displayWidth,
          height: image.displayHeight,
        });
      } finally {
        image.close();
      }
    }
  } finally {
    decoder.close();
  }

  return frames;
}

function createSourceAdapter(definition) {
  return Object.freeze({
    id: definition.id,
    mediaKind: definition.mediaKind,
    tab: definition.tab,
    previewKind: definition.previewKind,
    label: definition.label,
    rendererSource: definition.rendererSource,
    sourceUpdateMode: definition.sourceUpdateMode,
    update: definition.update || (() => {}),
    dispose: definition.dispose || (() => {}),
  });
}

function createSourceRegistry() {
  const registry = {
    active: null,
    lastImage: null,
    lastVideo: null,
    builtInCanvas: null,
    builtInImage: null,
    builtInVideo: null,
    replaceLocal(adapter) {
      if (adapter.tab === "image") {
        if (this.lastImage && this.lastImage !== this.builtInImage) this.lastImage.dispose();
        this.lastImage = adapter;
      } else if (adapter.tab === "video") {
        if (this.lastVideo && this.lastVideo !== this.builtInVideo) this.lastVideo.dispose();
        this.lastVideo = adapter;
      }
      this.active = adapter;
      return adapter;
    },
    setActive(adapter) {
      this.active = adapter;
      return adapter;
    },
    dispose() {
      const adapters = new Set([
        this.active,
        this.lastImage,
        this.lastVideo,
        this.builtInCanvas,
        this.builtInImage,
        this.builtInVideo,
      ]);
      adapters.forEach((adapter) => adapter?.dispose());
      this.active = null;
      this.lastImage = null;
      this.lastVideo = null;
      this.builtInCanvas = null;
      this.builtInImage = null;
      this.builtInVideo = null;
    },
  };
  return registry;
}

const sourceRegistry = createSourceRegistry();

function createBuiltInCanvasAdapter() {
  return createSourceAdapter({
    id: "built-in-canvas",
    mediaKind: "canvas",
    tab: "canvas",
    previewKind: "canvas",
    label: copy.labels.builtInCanvas,
    rendererSource: canvasSource,
    sourceUpdateMode: "realtime",
    update: drawBuiltInCanvas,
  });
}

async function createBuiltInImageAdapter() {
  if (!imageSource.src) imageSource.src = createGeneratedImage();
  await waitForImage(imageSource);
  return createSourceAdapter({
    id: "built-in-image",
    mediaKind: "image",
    tab: "image",
    previewKind: "image",
    label: copy.labels.builtInImage,
    rendererSource: imageSource,
    sourceUpdateMode: "static",
  });
}

async function createBuiltInVideoAdapter() {
  drawGeneratedVideo(performance.now());
  if (!generatedVideoStream && videoGenerator.captureStream) {
    generatedVideoStream = videoGenerator.captureStream(60);
  }
  if (generatedVideoStream && videoSource.srcObject !== generatedVideoStream) {
    videoSource.srcObject = generatedVideoStream;
    videoSource.removeAttribute("src");
  }
  videoSource.loop = true;
  videoSource.muted = true;
  await waitForVideo(videoSource);
  await playVideo(videoSource);
  return createSourceAdapter({
    id: "built-in-video",
    mediaKind: "video",
    tab: "video",
    previewKind: "video",
    label: copy.labels.builtInVideo,
    rendererSource: videoSource,
    sourceUpdateMode: "auto",
    update: drawGeneratedVideo,
  });
}

async function createBitmapAdapter(file, objectUrl) {
  imageSource.src = objectUrl;
  await waitForImage(imageSource);
  const bitmap = await createImageBitmap(file, { imageOrientation: "flipY" });
  return createSourceAdapter({
    id: `bitmap:${file.name}`,
    mediaKind: "image",
    tab: "image",
    previewKind: "image",
    label: file.name,
    rendererSource: bitmap,
    sourceUpdateMode: "static",
    dispose() {
      bitmap.close();
      URL.revokeObjectURL(objectUrl);
    },
  });
}

async function createGifAdapter(file, objectUrl) {
  const canvas = document.createElement("canvas");
  imageSource.src = objectUrl;
  await waitForImage(imageSource);
  let animation;

  if ("ImageDecoder" in window) {
    try {
      const frames = await decodeGifFrames(file);
      if (!frames.length) throw new Error(copy.errors.gifDecode);
      animation = {
        canvas,
        frames,
        frameIndex: 0,
        drawnFrameIndex: -1,
        startedAt: performance.now(),
        totalDurationMs: prepareGifTimeline(frames),
      };
      updateDecodedGifFrame(animation, animation.startedAt, true);
    } catch {
      animation = null;
    }
  }

  if (!animation) {
    animation = { canvas, image: imageSource };
    drawImageElementToCanvas(imageSource, canvas);
  }

  return createSourceAdapter({
    id: `gif:${file.name}`,
    mediaKind: "gif",
    tab: "image",
    previewKind: "image",
    label: file.name,
    rendererSource: canvas,
    sourceUpdateMode: "realtime",
    update(time) {
      if (animation.frames?.length) updateDecodedGifFrame(animation, time);
      else if (animation.image?.complete && animation.image.naturalWidth) drawImageElementToCanvas(animation.image, canvas);
    },
    dispose() {
      animation.frames?.forEach((frame) => frame.bitmap?.close?.());
      URL.revokeObjectURL(objectUrl);
    },
  });
}

async function createSvgAdapter(file, objectUrl) {
  const canvas = document.createElement("canvas");
  imageSource.src = objectUrl;
  await waitForImage(imageSource);
  drawImageElementToCanvas(imageSource, canvas);
  return createSourceAdapter({
    id: `svg:${file.name}`,
    mediaKind: "svg",
    tab: "image",
    previewKind: "image",
    label: file.name,
    rendererSource: canvas,
    sourceUpdateMode: "realtime",
    update() {
      if (imageSource.complete && imageSource.naturalWidth) drawImageElementToCanvas(imageSource, canvas);
    },
    dispose() {
      URL.revokeObjectURL(objectUrl);
    },
  });
}

async function createVideoAdapter(file, objectUrl) {
  videoSource.pause();
  videoSource.srcObject = null;
  videoSource.src = objectUrl;
  videoSource.loop = true;
  videoSource.muted = true;
  videoSource.load();
  await waitForVideo(videoSource);
  await playVideo(videoSource);
  return createSourceAdapter({
    id: `video:${file.name}`,
    mediaKind: "video",
    tab: "video",
    previewKind: "video",
    label: file.name,
    rendererSource: videoSource,
    sourceUpdateMode: "auto",
    dispose() {
      videoSource.pause();
      if (videoSource.src === objectUrl) {
        videoSource.removeAttribute("src");
        videoSource.load();
      }
      URL.revokeObjectURL(objectUrl);
    },
  });
}

async function playVideo(video) {
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }
}

function rendererConfig() {
  return {
    quality: qualityMode.value,
    matrixPitch: Number(pitchControl.value),
    bloomStrength: Number(bloomControl.value),
    diffusionStrength: Number(diffusionControl.value),
    noiseAmount: Number(noiseControl.value),
    maxDpr: qualityMode.value === "high" ? 1.5 : 1.15,
    frameRate: qualityMode.value === "high" ? 60 : qualityMode.value === "medium" ? 45 : 30,
  };
}

function ensureRenderer(source) {
  if (renderer) return renderer;
  renderer = new PhosphorMediaRenderer({
    source,
    mount,
    fit: fitMode.value,
    sourceUpdateMode: "auto",
    ...rendererConfig(),
  });
  return renderer;
}

function renderDemoFrame(time = performance.now()) {
  renderer?.renderFrame(time);
}

function applyActiveSource(adapter) {
  if (!adapter?.rendererSource) return;
  setError();
  setExportStatus();
  sourceRegistry.setActive(adapter);
  updateSourceButtons(adapter.tab);
  showSourcePreview(adapter.previewKind);
  sourceLabel.textContent = adapter.label;

  const activeRenderer = ensureRenderer(adapter.rendererSource);
  activeRenderer.stop();
  activeRenderer.setSource(adapter.rendererSource, {
    fit: fitMode.value,
    sourceUpdateMode: adapter.sourceUpdateMode,
  });
  toggleRender.textContent = isDemoPlaying ? copy.buttons.pause : copy.buttons.resume;
  renderDemoFrame();
  syncMetrics();
}

async function selectSourceTab(tab) {
  try {
    if (tab === "canvas") {
      sourceRegistry.builtInCanvas ||= createBuiltInCanvasAdapter();
      applyActiveSource(sourceRegistry.builtInCanvas);
      return;
    }
    if (tab === "video") {
      if (sourceRegistry.lastVideo) {
        applyActiveSource(sourceRegistry.lastVideo);
        return;
      }
      sourceRegistry.builtInVideo ||= await createBuiltInVideoAdapter();
      applyActiveSource(sourceRegistry.builtInVideo);
      return;
    }
    if (sourceRegistry.lastImage) {
      applyActiveSource(sourceRegistry.lastImage);
      return;
    }
    sourceRegistry.builtInImage ||= await createBuiltInImageAdapter();
    applyActiveSource(sourceRegistry.builtInImage);
  } catch (error) {
    setError(error.message);
  }
}

async function createAdapterForFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (isGifFile(file)) return await createGifAdapter(file, objectUrl);
    if (isSvgFile(file)) return await createSvgAdapter(file, objectUrl);
    if (isImageFile(file)) return await createBitmapAdapter(file, objectUrl);
    if (isVideoFile(file)) return await createVideoAdapter(file, objectUrl);
    throw new Error(copy.errors.unsupportedFile);
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function loadLocalFile(file) {
  if (!file) return;
  try {
    setError();
    const nextAdapter = await createAdapterForFile(file);
    sourceRegistry.replaceLocal(nextAdapter);
    applyActiveSource(nextAdapter);
  } catch (error) {
    setError(error.message);
  }
}

function updateRendererConfig() {
  syncOutputs();
  if (!renderer) return;
  renderer.updateConfig(rendererConfig());
  renderer.fit = fitMode.value;
  renderDemoFrame();
  syncMetrics();
}

function syncMetrics() {
  if (!renderer) return;
  const state = renderer.getState();
  backendMetric.textContent = state.backend;
  sourceMetric.textContent = `${state.source.width} x ${state.source.height}`;
  canvasMetric.textContent = `${state.surface.width} x ${state.surface.height}`;
  statusText.textContent = `${state.backend} / ${state.config.quality} / ${state.fit}`;
  if (state.error) setError(`${copy.errors.textureUpload}${state.error}`);
}

function tick(time) {
  appRafId = requestAnimationFrame(tick);
  if (!isDemoPlaying) return;

  sourceRegistry.active?.update(time);
  renderDemoFrame(time);

  frameCount += 1;
  if (time - fpsStart >= 500) {
    fpsMetric.textContent = Math.round((frameCount * 1000) / (time - fpsStart));
    frameCount = 0;
    fpsStart = time;
    syncMetrics();
  }
}

function destroyDemo() {
  isDemoPlaying = false;
  if (appRafId) cancelAnimationFrame(appRafId);
  appRafId = 0;
  exportController?.dispose();
  renderer?.destroy();
  renderer = null;
  sourceRegistry.dispose();
  generatedVideoStream?.getTracks?.().forEach((track) => track.stop());
  generatedVideoStream = null;
  statusText.textContent = copy.status.destroyed;
}

sourceButtons.forEach((button) => {
  button.addEventListener("click", () => selectSourceTab(button.dataset.source));
});

fileInput.addEventListener("change", () => loadLocalFile(fileInput.files?.[0]));

["dragenter", "dragover"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropZone.dataset.active = "true";
  });
});

["dragleave", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    dropZone.dataset.active = "false";
  });
});

window.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  loadLocalFile(event.dataTransfer.files?.[0]);
});

toggleRender.addEventListener("click", () => {
  isDemoPlaying = !isDemoPlaying;
  toggleRender.textContent = isDemoPlaying ? copy.buttons.pause : copy.buttons.resume;
  syncMetrics();
});

downloadFrame?.addEventListener("click", async () => {
  try {
    await exportController.downloadCurrentFrame();
  } catch (error) {
    setError(error.message || copy.errors.captureFrameFailed);
  }
});

toggleRecording?.addEventListener("click", async () => {
  try {
    await exportController.toggleRecording();
  } catch (error) {
    setExportStatus(error.message || copy.errors.recordingFailed);
    setError(error.message || copy.errors.recordingFailed);
  }
});

frameFormat?.addEventListener("change", () => setExportStatus());
frameQuality?.addEventListener("input", syncOutputs);

fitMode.addEventListener("change", () => {
  if (!renderer) return;
  renderer.fit = fitMode.value;
  renderDemoFrame();
  syncMetrics();
});

qualityMode.addEventListener("change", () => {
  if (!renderer) return;
  renderer.setQuality(qualityMode.value);
  const state = renderer.getState();
  pitchControl.value = state.config.matrixPitch;
  bloomControl.value = state.config.bloomStrength;
  diffusionControl.value = state.config.diffusionStrength;
  syncOutputs();
  renderDemoFrame();
  syncMetrics();
});

[pitchControl, bloomControl, diffusionControl, noiseControl].forEach((input) => {
  input.addEventListener("input", updateRendererConfig);
});

window.addEventListener("resize", () => {
  sizeCanvasSource();
  renderDemoFrame();
});

window.PhosphorMediaDemo = {
  getState: () => {
    const state = renderer?.getState();
    return state ? {
      ...state,
      demoPlaying: isDemoPlaying,
      activeSource: sourceRegistry.active ? {
        id: sourceRegistry.active.id,
        mediaKind: sourceRegistry.active.mediaKind,
        tab: sourceRegistry.active.tab,
        label: sourceRegistry.active.label,
      } : null,
      export: exportController.getState(),
    } : null;
  },
  loadLocalFile,
  selectSourceTab,
  downloadCurrentFrame: (format) => {
    if (format && exportFormats[format] && frameFormat) frameFormat.value = format;
    return exportController.downloadCurrentFrame();
  },
  startRecording: () => exportController.startRecording(),
  stopRecording: () => exportController.stopRecording(),
  destroy: destroyDemo,
};

syncOutputs();
setExportStatus();
sizeCanvasSource();
sizeVideoGenerator();
drawBuiltInCanvas(performance.now());
drawGeneratedVideo(performance.now());
statusText.textContent = copy.status.initializing;
appRafId = requestAnimationFrame(tick);

if (!PhosphorMediaRenderer) {
  setError(copy.errors.libraryMissing);
  statusText.textContent = copy.status.libraryMissing;
} else if (!PhosphorMediaRenderer.isSupported()) {
  setError(copy.errors.unsupportedWebgl);
  statusText.textContent = copy.status.unsupported;
} else {
  selectSourceTab("canvas");
}
