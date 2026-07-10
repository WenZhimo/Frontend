import { detectGpuCapabilities } from "./capability.js";
import { LOCAL_FIELDS_WGSL } from "./kernels/localFieldsKernel.js";

export const GPU_LOCAL_FIELDS_OUTPUT_FIELDS = [
  "slope",
  "aspect",
  "ruggedness",
  "localRelief",
];

const localFieldsContextCache = new WeakMap();

export async function runWebGpuLocalFieldsCandidate(world, options = {}) {
  const candidateStartedAt = performance.now();
  const globalObject = options.globalObject ?? globalThis;
  const capabilities = detectGpuCapabilities(globalObject);
  const gpu = globalObject?.navigator?.gpu;
  if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
    return skippedLocalFieldsResult(capabilities, "WebGPU local fields candidate currently supports rectangular grids only.");
  }
  if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
    return skippedLocalFieldsResult(capabilities, "WebGPU is not available in this environment.");
  }

  let context;
  try {
    context = await getLocalFieldsGpuContext(globalObject, gpu);
  } catch (error) {
    return skippedLocalFieldsResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
  }

  try {
    return withLocalFieldsCandidateTiming(
      await computeLocalFieldsOnDevice(world, context, capabilities, options),
      candidateStartedAt,
    );
  } catch (error) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-local-fields",
      gpuCapabilities: capabilities,
      adapterInfo: context?.adapterInfo ?? null,
      deviceInfo: context?.deviceInfo ?? null,
      reason: `WebGPU local fields candidate failed safely: ${error?.message ?? "unknown error"}`,
      timings: emptyLocalFieldsTimings(),
      fields: {},
    };
  }
}

function withLocalFieldsCandidateTiming(result, candidateStartedAt) {
  if (!result || result.skipped) return result;
  if (Number.isFinite(result.timings?.totalCandidateMs)) return result;
  const totalCandidateMs = performance.now() - candidateStartedAt;
  const totalGpuPathMs = Number(result.timings?.totalGpuPathMs);
  return {
    ...result,
    timings: {
      ...result.timings,
      setupMs: Number.isFinite(totalGpuPathMs) ? Math.max(0, totalCandidateMs - totalGpuPathMs) : null,
      totalCandidateMs,
    },
  };
}

async function getLocalFieldsGpuContext(globalObject, gpu) {
  const cached = localFieldsContextCache.get(globalObject);
  if (cached?.device && cached?.pipeline) {
    return {
      ...cached,
      reused: true,
    };
  }

  const setupStartedAt = performance.now();
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error("WebGPU adapter request returned null.");
  }
  const adapterInfo = await collectAdapterInfo(adapter);
  const device = await adapter.requestDevice();
  const deviceInfo = collectDeviceInfo(device);

  device.pushErrorScope?.("validation");
  const shaderModule = device.createShaderModule({ code: LOCAL_FIELDS_WGSL });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });
  const pipelineError = await device.popErrorScope?.();
  if (pipelineError) {
    device?.destroy?.();
    throw new Error(`WebGPU local fields pipeline validation failed: ${pipelineError.message ?? pipelineError}`);
  }

  const context = {
    device,
    pipeline,
    adapterInfo,
    deviceInfo,
    setupMs: performance.now() - setupStartedAt,
  };
  device.lost?.then?.(() => {
    if (localFieldsContextCache.get(globalObject) === context) {
      localFieldsContextCache.delete(globalObject);
    }
  });
  localFieldsContextCache.set(globalObject, context);
  return {
    ...context,
    reused: false,
  };
}

async function computeLocalFieldsOnDevice(world, context, capabilities, options = {}) {
  const { device, pipeline } = context;
  const { grid, seaLevel } = world;
  const timingMode = options.timingMode === "split" ? "split" : "overlapped";
  const size = grid.size;
  const width = grid.width;
  const height = grid.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height !== size) {
    return skippedLocalFieldsResult(capabilities, "World grid is not a rectangular width x height layout.");
  }

  const uploadStartedAt = performance.now();
  const relativeElevation = new Float32Array(size * 4);
  for (let i = 0; i < size; i += 1) {
    relativeElevation[i * 4] = grid.elev[i] - seaLevel;
  }

  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) {
    return skippedLocalFieldsResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
  }

  const paramData = new Uint32Array([size, width, height, 0]);
  const paramBuffer = createBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
  const inputBuffer = createBufferWithData(device, relativeElevation, usage.STORAGE | usage.COPY_DST);
  const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
  const outputBuffer = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const uploadMs = performance.now() - uploadStartedAt;

  device.pushErrorScope?.("validation");
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuffer } },
      { binding: 1, resource: { buffer: inputBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });
  const bindGroupError = await device.popErrorScope?.();
  if (bindGroupError) {
    destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
    return skippedLocalFieldsResult(capabilities, `WebGPU local fields bind group validation failed: ${bindGroupError.message ?? bindGroupError}`);
  }

  const kernelStartedAt = performance.now();
  device.pushErrorScope?.("validation");
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(size / 64));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBytes);
  device.queue.submit([encoder.finish()]);
  const submitMs = performance.now() - kernelStartedAt;
  let kernelMs = null;
  let downloadMs = null;
  let executeAndDownloadMs = null;
  let dispatchError;

  if (timingMode === "split") {
    await device.queue.onSubmittedWorkDone();
    dispatchError = await device.popErrorScope?.();
    kernelMs = performance.now() - kernelStartedAt;
    const downloadStartedAt = performance.now();
    await readBuffer.mapAsync(mapMode.READ);
    downloadMs = performance.now() - downloadStartedAt;
  } else {
    const dispatchErrorPromise = device.popErrorScope?.() ?? Promise.resolve(null);
    const executeAndDownloadStartedAt = performance.now();
    [, dispatchError] = await Promise.all([
      readBuffer.mapAsync(mapMode.READ),
      dispatchErrorPromise,
    ]);
    executeAndDownloadMs = performance.now() - executeAndDownloadStartedAt;
  }

  if (dispatchError) {
    destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
    return skippedLocalFieldsResult(capabilities, `WebGPU local fields dispatch validation failed: ${dispatchError.message ?? dispatchError}`);
  }
  const packed = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();

  const fields = unpackLocalFields(size, packed);
  destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
  const totalGpuPathMs = timingMode === "split"
    ? uploadMs + kernelMs + downloadMs
    : uploadMs + executeAndDownloadMs;

  return {
    skipped: false,
    valid: true,
    backend: "webgpu-local-fields",
    gpuCapabilities: capabilities,
    adapterInfo: context.adapterInfo ?? null,
    deviceInfo: context.deviceInfo ?? null,
    reason: null,
    timings: {
      timingMode,
      setupMs: context.reused ? 0 : context.setupMs,
      uploadMs,
      submitMs,
      kernelMs,
      downloadMs,
      executeAndDownloadMs,
      totalGpuPathMs,
      totalCandidateMs: (context.reused ? 0 : context.setupMs) + totalGpuPathMs,
    },
    reusedContext: context.reused,
    fields,
  };
}

async function collectAdapterInfo(adapter) {
  try {
    const rawInfo =
      adapter?.info ??
      (typeof adapter?.requestAdapterInfo === "function" ? await adapter.requestAdapterInfo() : null);
    const info = {};
    for (const key of [
      "vendor",
      "architecture",
      "device",
      "description",
      "subgroupMinSize",
      "subgroupMaxSize",
    ]) {
      const value = rawInfo?.[key];
      if (value !== undefined && value !== "") info[key] = value;
    }
    if (typeof adapter?.isFallbackAdapter === "boolean") {
      info.isFallbackAdapter = adapter.isFallbackAdapter;
    }
    return Object.keys(info).length ? info : null;
  } catch (error) {
    return {
      unavailableReason: `GPU adapter info unavailable: ${error?.message ?? "unknown error"}`,
    };
  }
}

function collectDeviceInfo(device) {
  try {
    return {
      features: [...(device?.features ?? [])].sort(),
      limits: pickDeviceLimits(device?.limits),
    };
  } catch (error) {
    return {
      unavailableReason: `GPU device info unavailable: ${error?.message ?? "unknown error"}`,
    };
  }
}

function pickDeviceLimits(limits) {
  if (!limits) return {};
  const keys = [
    "maxBindGroups",
    "maxBufferSize",
    "maxComputeInvocationsPerWorkgroup",
    "maxComputeWorkgroupSizeX",
    "maxStorageBufferBindingSize",
  ];
  const picked = {};
  for (const key of keys) {
    const value = limits[key];
    if (Number.isFinite(value)) picked[key] = value;
  }
  return picked;
}

function createBufferWithData(device, typedArray, usage) {
  const buffer = device.createBuffer({
    size: typedArray.byteLength,
    usage,
    mappedAtCreation: true,
  });
  new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
  buffer.unmap();
  return buffer;
}

function unpackLocalFields(size, packed) {
  const fields = {};
  for (const name of GPU_LOCAL_FIELDS_OUTPUT_FIELDS) {
    fields[name] = new Float32Array(size);
  }
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    fields.slope[i] = packed[offset];
    fields.aspect[i] = packed[offset + 1];
    fields.ruggedness[i] = packed[offset + 2];
    fields.localRelief[i] = packed[offset + 3];
  }
  return fields;
}

function destroyBuffers(buffers) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
  }
}

function skippedLocalFieldsResult(capabilities, reason) {
  return {
    skipped: true,
    valid: true,
    backend: "webgpu-local-fields",
    gpuCapabilities: capabilities,
    reason,
    timings: emptyLocalFieldsTimings(),
    fields: {},
  };
}

function emptyLocalFieldsTimings() {
  return {
    timingMode: null,
    setupMs: null,
    uploadMs: null,
    submitMs: null,
    kernelMs: null,
    downloadMs: null,
    executeAndDownloadMs: null,
    totalGpuPathMs: null,
    totalCandidateMs: null,
  };
}
