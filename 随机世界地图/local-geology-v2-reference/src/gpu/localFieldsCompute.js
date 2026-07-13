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
    disposeLocalFieldsResources(context);
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
    cached.reused = true;
    return cached;
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
    resources: null,
    reused: false,
  };
  device.lost?.then?.(() => {
    disposeLocalFieldsResources(context);
    if (localFieldsContextCache.get(globalObject) === context) {
      localFieldsContextCache.delete(globalObject);
    }
  });
  localFieldsContextCache.set(globalObject, context);
  return context;
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

  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) {
    return skippedLocalFieldsResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
  }

  const bufferSetupStartedAt = performance.now();
  const resourceState = await ensureLocalFieldsResources(context, size, usage);
  const bufferSetupMs = resourceState.reused ? 0 : performance.now() - bufferSetupStartedAt;
  const {
    paramData,
    relativeElevation,
    paramBuffer,
    inputBuffer,
    outputBuffer,
    readBuffer,
    bindGroup,
    outputBytes,
  } = resourceState.resources;

  const uploadStartedAt = performance.now();
  paramData[0] = size;
  paramData[1] = width;
  paramData[2] = height;
  paramData[3] = 0;
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    relativeElevation[offset] = grid.elev[i] - seaLevel;
    relativeElevation[offset + 1] = 0;
    relativeElevation[offset + 2] = 0;
    relativeElevation[offset + 3] = 0;
  }
  device.queue.writeBuffer(paramBuffer, 0, paramData);
  device.queue.writeBuffer(inputBuffer, 0, relativeElevation);
  const uploadMs = performance.now() - uploadStartedAt;

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
    disposeLocalFieldsResources(context);
    return skippedLocalFieldsResult(capabilities, `WebGPU local fields dispatch validation failed: ${dispatchError.message ?? dispatchError}`);
  }
  const packed = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();

  const fields = unpackLocalFields(size, packed);
  const totalGpuPathMs = timingMode === "split"
    ? bufferSetupMs + uploadMs + kernelMs + downloadMs
    : bufferSetupMs + uploadMs + executeAndDownloadMs;

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
      bufferSetupMs,
      uploadMs,
      submitMs,
      kernelMs,
      downloadMs,
      executeAndDownloadMs,
      totalGpuPathMs,
      totalCandidateMs: (context.reused ? 0 : context.setupMs) + totalGpuPathMs,
    },
    reusedContext: context.reused,
    reusedBuffers: resourceState.reused,
    fields,
  };
}

async function ensureLocalFieldsResources(context, size, usage) {
  const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
  const cached = context.resources;
  if (cached?.size === size && cached?.outputBytes === outputBytes) {
    return {
      resources: cached,
      reused: true,
    };
  }

  disposeLocalFieldsResources(context);
  const { device, pipeline } = context;
  const resources = {
    size,
    outputBytes,
    paramData: new Uint32Array(4),
    relativeElevation: new Float32Array(size * 4),
    paramBuffer: null,
    inputBuffer: null,
    outputBuffer: null,
    readBuffer: null,
    bindGroup: null,
  };

  try {
    resources.paramBuffer = device.createBuffer({
      size: resources.paramData.byteLength,
      usage: usage.UNIFORM | usage.COPY_DST,
    });
    resources.inputBuffer = device.createBuffer({
      size: resources.relativeElevation.byteLength,
      usage: usage.STORAGE | usage.COPY_DST,
    });
    resources.outputBuffer = device.createBuffer({
      size: outputBytes,
      usage: usage.STORAGE | usage.COPY_SRC,
    });
    resources.readBuffer = device.createBuffer({
      size: outputBytes,
      usage: usage.COPY_DST | usage.MAP_READ,
    });

    device.pushErrorScope?.("validation");
    resources.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: resources.paramBuffer } },
        { binding: 1, resource: { buffer: resources.inputBuffer } },
        { binding: 2, resource: { buffer: resources.outputBuffer } },
      ],
    });
    const bindGroupError = await device.popErrorScope?.();
    if (bindGroupError) {
      throw new Error(`WebGPU local fields bind group validation failed: ${bindGroupError.message ?? bindGroupError}`);
    }
  } catch (error) {
    destroyBuffers([
      resources.paramBuffer,
      resources.inputBuffer,
      resources.outputBuffer,
      resources.readBuffer,
    ]);
    throw error;
  }

  context.resources = resources;
  return {
    resources,
    reused: false,
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

function disposeLocalFieldsResources(context) {
  const resources = context?.resources;
  if (!resources) return;
  destroyBuffers([
    resources.paramBuffer,
    resources.inputBuffer,
    resources.outputBuffer,
    resources.readBuffer,
  ]);
  context.resources = null;
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
    bufferSetupMs: null,
    uploadMs: null,
    submitMs: null,
    kernelMs: null,
    downloadMs: null,
    executeAndDownloadMs: null,
    totalGpuPathMs: null,
    totalCandidateMs: null,
  };
}
