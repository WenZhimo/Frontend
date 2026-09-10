const KOKORO_IMPORT_URL = "https://cdn.jsdelivr.net/npm/kokoro-js/+esm";
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
  const attempts = await backendAttempts(settings);
  const KokoroTTS = await getKokoroTTS();
  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const backend = attempts[index];
    const dtype = dtypeFor(settings, backend);
    const engineKey = `${modelId}|${backend}|${dtype}`;
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
      state.voices = normalizeVoiceList(
        typeof engine.list_voices === "function" ? await engine.list_voices() : [],
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
    post({ type: "loaded", jobId, ...loaded, enabledVoices: DEFAULT_VOICES });
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
    post({ type: "loaded", jobId, ...loaded, enabledVoices: DEFAULT_VOICES });
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
        contextText: unit.contextText || "",
        crop: unit.crop || null,
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
