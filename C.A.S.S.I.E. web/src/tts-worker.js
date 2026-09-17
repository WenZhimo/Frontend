const KOKORO_IMPORT_URL = "https://cdn.jsdelivr.net/npm/kokoro-js/+esm";
const TRANSFORMERS_IMPORT_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm";
const DEFAULT_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICES = ["am_michael", "bm_daniel", "am_adam"];
const DEFAULT_SAMPLE_RATE = 24000;

const state = {
  tts: null,
  backend: null,
  dtype: null,
  engineKey: "",
  loadPromise: null,
  currentJobId: 0,
  cancelRequested: false,
  genChain: Promise.resolve(),
  KokoroTTS: null,
  transformersEnv: null,
  localModelKey: "",
  localVoiceKey: "",
  localVoices: new Map(),
  localVoiceFetchInstalled: false,
};

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

function normalizeVoiceList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((voice) => typeof voice === "string");
  if (value instanceof Map) return [...value.keys()].filter((voice) => typeof voice === "string");
  if (typeof value === "object") {
    const nestedVoices = value.voices || value.voiceIds || value.voice_ids || value.names;
    if (nestedVoices) return normalizeVoiceList(nestedVoices);
    return Object.keys(value).filter((voice) => /^[a-z]{2}_[a-z0-9_]+$/i.test(voice));
  }
  return [];
}

function localFileName(entry) {
  return String(entry?.path || entry?.file?.name || "").replaceAll("\\", "/");
}

function localFileSignature(entry) {
  const file = entry?.file;
  const byteLength = entry?.bytes?.byteLength || entry?.bytes?.buffer?.byteLength || 0;
  return `${localFileName(entry)}|${file?.size || byteLength || 0}|${file?.lastModified || 0}`;
}

function localFileBytes(entry) {
  if (entry?.bytes instanceof ArrayBuffer) return entry.bytes;
  if (ArrayBuffer.isView(entry?.bytes)) {
    return entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength);
  }
  return entry?.file?.arrayBuffer?.();
}

function normalizeLocalRequestPath(request) {
  const value = typeof request === "string" ? request : request?.url || "";
  try {
    return decodeURIComponent(String(value).split("?")[0]).replaceAll("\\", "/").toLowerCase();
  } catch {
    return String(value).split("?")[0].replaceAll("\\", "/").toLowerCase();
  }
}

function localRequestMatches(request, filePath) {
  const requestPath = normalizeLocalRequestPath(request);
  const normalizedFilePath = String(filePath || "").replaceAll("\\", "/").toLowerCase().replace(/^\/+/, "");
  const requestName = requestPath.split("/").filter(Boolean).at(-1) || "";
  return requestPath.endsWith(`/${normalizedFilePath}`)
    || requestPath.endsWith(`/${requestName}`) && normalizedFilePath.endsWith(`/${requestName}`)
    || requestName === normalizedFilePath;
}

async function getTransformersEnv() {
  if (!state.transformersEnv) {
    const module = await import(TRANSFORMERS_IMPORT_URL);
    state.transformersEnv = module.env;
  }
  return state.transformersEnv;
}

async function configureLocalModel(settings = {}) {
  const entries = Array.isArray(settings.localModelFiles) ? settings.localModelFiles : [];
  const key = entries.length > 0
    ? `${settings.modelId}|${entries.map(localFileSignature).join("|")}`
    : "remote";
  if (state.localModelKey === key) return;

  if (entries.length === 0) {
    const env = await getTransformersEnv();
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.useCustomCache = false;
    env.useBrowserCache = true;
    state.localModelKey = "remote";
    return;
  }

  const files = [];
  for (const entry of entries) {
    const bytes = await localFileBytes(entry);
    if (!bytes) continue;
    files.push({ path: localFileName(entry), bytes });
  }
  if (files.length === 0) throw new Error("本地模型目录中没有可读取的文件。");

  const env = await getTransformersEnv();
  const fileCache = {
    async match(request) {
      const entry = files.find((file) => localRequestMatches(request, file.path));
      if (!entry) return undefined;
      return new Response(entry.bytes.slice(0), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    },
    async put() {},
  };
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useCustomCache = true;
  env.customCache = fileCache;
  state.localModelKey = key;
}

function installLocalVoiceFetch() {
  if (state.localVoiceFetchInstalled) return;
  const originalFetch = self.fetch.bind(self);
  self.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const match = /\/voices\/([^/]+)\.bin(?:\?|$)/i.exec(String(url));
    const requestedId = match ? decodeURIComponent(match[1]) : "";
    const requestedKey = requestedId.toLowerCase();
    const voiceId = [...state.localVoices.keys()].find((id) => {
      const key = String(id).toLowerCase();
      const baseId = key.replace(/^([ab])_local_/, "$1_");
      return key === requestedKey || baseId === requestedKey;
    }) || requestedId;
    const bytes = voiceId && state.localVoices.get(voiceId);
    if (bytes) {
      return Promise.resolve(new Response(bytes.slice(0), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }));
    }
    return originalFetch(input, init);
  };
  state.localVoiceFetchInstalled = true;
}

async function configureLocalVoices(entries = []) {
  const files = Array.isArray(entries) ? entries : [];
  const key = files.map((entry) => `${entry.id}|${localFileName(entry)}|${entry.file?.size || 0}|${entry.file?.lastModified || 0}`).join("|");
  if (state.localVoiceKey === key) return;
  state.localVoiceKey = key;
  state.localVoices.clear();
  for (const entry of files) {
    const bytes = await localFileBytes(entry);
    if (bytes && entry.id) state.localVoices.set(String(entry.id), bytes);
  }
  if (state.localVoices.size === 0) return;

  installLocalVoiceFetch();
}

function allowLocalVoiceIds(engine) {
  if (!engine || engine.__cassieLocalVoiceValidation) return;
  const originalValidate = typeof engine._validate_voice === "function"
    ? engine._validate_voice.bind(engine)
    : null;
  if (!originalValidate) return;
  engine._validate_voice = (voice) => {
    const id = String(voice || "");
    if (state.localVoices.has(id)) return id.toLowerCase().startsWith("b") ? "b" : "a";
    return originalValidate(voice);
  };
  engine.__cassieLocalVoiceValidation = true;
}

async function getKokoroTTS() {
  if (!state.KokoroTTS) {
    const module = await import(KOKORO_IMPORT_URL);
    state.KokoroTTS = module.KokoroTTS;
  }
  return state.KokoroTTS;
}

async function webgpuAvailable() {
  try {
    if (!("gpu" in navigator) || !navigator.gpu) return false;
    return Boolean(await navigator.gpu.requestAdapter());
  } catch {
    return false;
  }
}

function makeProgressCallback(jobId, backend) {
  const files = new Map();
  return (data) => {
    if (!data) return;
    if (data.status === "progress" && data.file) {
      files.set(data.file, { loaded: data.loaded || 0, total: data.total || 0 });
    } else if (data.status === "done" && data.file && files.has(data.file)) {
      const item = files.get(data.file);
      files.set(data.file, { loaded: item.total, total: item.total });
    }

    let loaded = 0;
    let total = 0;
    for (const item of files.values()) {
      loaded += item.loaded;
      total += item.total;
    }

    post({
      type: "progress",
      jobId,
      phase: "load",
      backend,
      progress: total > 0 ? loaded / total : 0,
      loaded,
      total,
    });
  };
}

async function backendAttempts(settings) {
  const requestedDevice = settings.device || "auto";
  if (requestedDevice === "webgpu") return ["webgpu"];
  if (requestedDevice === "wasm") return ["wasm"];
  return (await webgpuAvailable()) ? ["webgpu", "wasm"] : ["wasm"];
}

function dtypeFor(settings, backend) {
  if (settings.dtype && settings.dtype !== "auto") return settings.dtype;
  return backend === "webgpu" ? "fp32" : "q8";
}

async function loadEngine(jobId, settings = {}) {
  const modelId = String(settings.modelId || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
  await configureLocalModel(settings);
  const attempts = await backendAttempts(settings);
  const KokoroTTS = await getKokoroTTS();
  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const backend = attempts[index];
    const dtype = dtypeFor(settings, backend);
    const engineKey = `${modelId}|${backend}|${dtype}|${state.localModelKey}`;
    if (state.tts && state.engineKey === engineKey) {
      return {
        backend: state.backend,
        dtype: state.dtype,
        modelId,
        voices: state.voices || [],
        reused: true,
      };
    }

    try {
      post({ type: "backend", jobId, backend, dtype, modelId, stage: "loading" });
      const engine = await KokoroTTS.from_pretrained(modelId, {
        dtype,
        device: backend,
        progress_callback: makeProgressCallback(jobId, backend),
      });

      state.tts = engine;
      state.backend = backend;
      state.dtype = dtype;
      state.engineKey = engineKey;
      allowLocalVoiceIds(engine);
      state.voices = normalizeVoiceList(
        engine.voices || (typeof engine.list_voices === "function" ? await engine.list_voices() : []),
      );

      return {
        backend,
        dtype,
        modelId,
        voices: state.voices,
        reused: false,
      };
    } catch (error) {
      lastError = error;
      if (settings.device === "auto" && backend === "webgpu" && attempts[index + 1]) {
        post({
          type: "backend",
          jobId,
          backend: attempts[index + 1],
          dtype: dtypeFor(settings, attempts[index + 1]),
          modelId,
          stage: "fallback",
          message: String(error?.message || error),
        });
        continue;
      }
      break;
    }
  }

  throw lastError || new Error("Kokoro model could not be loaded");
}

async function ensureLoaded(jobId, settings) {
  await configureLocalVoices(settings?.localVoiceFiles || []);
  if (!state.loadPromise) {
    state.loadPromise = loadEngine(jobId, settings).finally(() => {
      state.loadPromise = null;
    });
  }
  return state.loadPromise;
}

function float32ToWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  let offset = 0;
  const writeString = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
    offset += text.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataLength, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * bytesPerSample, true); offset += 4;
  view.setUint16(offset, bytesPerSample, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataLength, true); offset += 4;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

async function audioToWavBuffer(audio) {
  if (audio && typeof audio.toBlob === "function") {
    return (await audio.toBlob()).arrayBuffer();
  }

  const samples = audio?.audio || audio?.data || audio?.samples;
  if (samples && typeof samples.length === "number") {
    const sampleRate = audio.sampling_rate || audio.sample_rate || audio.sampleRate || DEFAULT_SAMPLE_RATE;
    return float32ToWav(samples, sampleRate);
  }

  throw new Error("Kokoro returned an unknown audio object");
}

async function handleLoad(jobId, settings) {
  try {
    const loaded = await ensureLoaded(jobId, settings);
    post({
      type: "loaded",
      jobId,
      ...loaded,
      voices: [...new Set([...(loaded.voices || []), ...state.localVoices.keys()])],
      enabledVoices: [...DEFAULT_VOICES, ...(settings?.localVoiceFiles || []).map((entry) => entry.id).filter(Boolean)],
      localVoices: [...state.localVoices.keys()],
      localModelLabel: settings?.localModelLabel || "",
    });
  } catch (error) {
    post({ type: "error", jobId, message: error?.message || String(error) });
  }
}

async function handleGenerate(jobId, message) {
  if (jobId !== state.currentJobId) {
    post({ type: "cancelled", jobId });
    return;
  }

  let loaded;
  try {
    loaded = await ensureLoaded(jobId, message.settings);
    post({
      type: "loaded",
      jobId,
      ...loaded,
      voices: [...new Set([...(loaded.voices || []), ...state.localVoices.keys()])],
      enabledVoices: [...DEFAULT_VOICES, ...(message.settings?.localVoiceFiles || []).map((entry) => entry.id).filter(Boolean)],
      localVoices: [...state.localVoices.keys()],
      localModelLabel: message.settings?.localModelLabel || "",
    });
  } catch (error) {
    post({ type: "error", jobId, message: error?.message || String(error) });
    return;
  }

  const units = Array.isArray(message.units) ? message.units.filter((unit) => unit?.text) : [];
  if (units.length === 0) {
    post({ type: "error", jobId, message: "There is no text to speak." });
    return;
  }

  const parts = [];
  const transfers = [];
  post({ type: "progress", jobId, phase: "generate", done: 0, total: units.length, mode: message.mode });

  for (let index = 0; index < units.length; index += 1) {
    if (state.cancelRequested || jobId !== state.currentJobId) {
      post({ type: "cancelled", jobId, done: index, total: units.length });
      return;
    }

    try {
      const unit = units[index];
      const audio = await state.tts.generate(unit.text, {
        voice: message.voice,
        speed: message.speed || 1,
      });
      const wav = await audioToWavBuffer(audio);
      parts.push({
        index,
        text: unit.text,
        targetText: unit.targetText || unit.text,
        displayText: unit.displayText || unit.targetText || unit.text,
        source: unit.source || "sentence",
        tokenCount: unit.tokenCount || 0,
        wordGapSlots: unit.wordGapSlots || 0,
        minGapAfterMs: unit.minGapAfterMs || 0,
        controlsBefore: unit.controlsBefore || [],
        controlsAfter: unit.controlsAfter || [],
        inlineEffects: unit.inlineEffects || [],
        trimLeadingSilence: Boolean(unit.trimLeadingSilence),
        trimTrailingSilence: Boolean(unit.trimTrailingSilence),
        wav,
      });
      transfers.push(wav);
    } catch (error) {
      post({ type: "error", jobId, message: error?.message || String(error) });
      return;
    }

    post({
      type: "progress",
      jobId,
      phase: "generate",
      done: index + 1,
      total: units.length,
      mode: message.mode,
      currentText: units[index].displayText || units[index].targetText || units[index].text,
    });
  }

  if (state.cancelRequested || jobId !== state.currentJobId) {
    post({ type: "cancelled", jobId, done: parts.length, total: units.length });
    return;
  }

  post(
    {
      type: "done",
      jobId,
      backend: loaded.backend,
      dtype: loaded.dtype,
      modelId: loaded.modelId,
      mode: message.mode,
      parts,
    },
    transfers,
  );
}

self.onmessage = (event) => {
  const message = event.data || {};
  switch (message.type) {
    case "load":
      state.currentJobId = message.jobId;
      state.cancelRequested = false;
      handleLoad(message.jobId, message.settings);
      break;
    case "generate":
      state.currentJobId = message.jobId;
      state.cancelRequested = false;
      state.genChain = state.genChain
        .then(() => handleGenerate(message.jobId, message))
        .catch((error) => {
          post({ type: "error", jobId: message.jobId, message: error?.message || String(error) });
        });
      break;
    case "cancel":
      state.cancelRequested = true;
      break;
    default:
      break;
  }
};
