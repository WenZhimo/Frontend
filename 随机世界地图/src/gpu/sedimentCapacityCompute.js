import { detectGpuCapabilities } from "./capability.js";
import { SEDIMENT_CAPACITY_WGSL } from "./kernels/sedimentCapacityKernel.js";

export const GPU_SEDIMENT_CAPACITY_OUTPUT_FIELDS = ["sedimentCapacity"];

const sedimentCapacityContextCache = new WeakMap();

export async function runWebGpuSedimentCapacityCandidate(world, options = {}) {
  const candidateStartedAt = performance.now();
  const globalObject = options.globalObject ?? globalThis;
  const capabilities = detectGpuCapabilities(globalObject);
  const gpu = globalObject?.navigator?.gpu;
  if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
    return skippedSedimentCapacityResult(capabilities, "WebGPU sediment capacity candidate currently supports rectangular grids only.");
  }
  if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
    return skippedSedimentCapacityResult(capabilities, "WebGPU is not available in this environment.");
  }

  let context;
  try {
    context = await getSedimentCapacityGpuContext(globalObject, gpu);
  } catch (error) {
    return skippedSedimentCapacityResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
  }

  try {
    return withCandidateTiming(await computeSedimentCapacityOnDevice(world, context, capabilities), candidateStartedAt);
  } catch (error) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-sediment-capacity",
      gpuCapabilities: capabilities,
      adapterInfo: context?.adapterInfo ?? null,
      deviceInfo: context?.deviceInfo ?? null,
      reason: `WebGPU sediment capacity candidate failed safely: ${error?.message ?? "unknown error"}`,
      timings: emptySedimentCapacityTimings(),
      fields: {},
    };
  }
}

function withCandidateTiming(result, candidateStartedAt) {
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

async function getSedimentCapacityGpuContext(globalObject, gpu) {
  const cached = sedimentCapacityContextCache.get(globalObject);
  if (cached?.device && cached?.seedPipeline && cached?.smoothPipeline && cached?.bindGroupLayout) {
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
  const shaderModule = device.createShaderModule({ code: SEDIMENT_CAPACITY_WGSL });
  const bindGroupLayout = createSedimentCapacityBindGroupLayout(device);
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const seedPipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: "seed_capacity" },
  });
  const smoothPipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: "smooth_capacity" },
  });
  const pipelineError = await device.popErrorScope?.();
  if (pipelineError) {
    device?.destroy?.();
    throw new Error(`WebGPU sediment capacity pipeline validation failed: ${pipelineError.message ?? pipelineError}`);
  }

  const context = {
    device,
    bindGroupLayout,
    seedPipeline,
    smoothPipeline,
    adapterInfo,
    deviceInfo,
    setupMs: performance.now() - setupStartedAt,
  };
  device.lost?.then?.(() => {
    if (sedimentCapacityContextCache.get(globalObject) === context) {
      sedimentCapacityContextCache.delete(globalObject);
    }
  });
  sedimentCapacityContextCache.set(globalObject, context);
  return {
    ...context,
    reused: false,
  };
}

async function computeSedimentCapacityOnDevice(world, context, capabilities) {
  const { device, bindGroupLayout, seedPipeline, smoothPipeline } = context;
  const { grid, seaLevel } = world;
  const size = grid.size;
  const width = grid.width;
  const height = grid.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height !== size) {
    return skippedSedimentCapacityResult(capabilities, "World grid is not a rectangular width x height layout.");
  }

  const uploadStartedAt = performance.now();
  const inputs = Array.from({ length: 6 }, () => new Float32Array(size * 4));
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    inputs[0][offset] = grid.elev?.[i] ?? 0;
    inputs[0][offset + 1] = grid.basin?.[i] ?? 0;
    inputs[0][offset + 2] = grid.forelandBasin?.[i] ?? 0;
    inputs[0][offset + 3] = grid.riftAxis?.[i] ?? 0;
    inputs[1][offset] = grid.trench?.[i] ?? 0;
    inputs[1][offset + 1] = grid.trenchAxis?.[i] ?? 0;
    inputs[1][offset + 2] = grid.ridge?.[i] ?? 0;
    inputs[1][offset + 3] = grid.ridgeAxis?.[i] ?? 0;
    inputs[2][offset] = grid.islandArc?.[i] ?? 0;
    inputs[2][offset + 1] = grid.passiveMargin?.[i] ?? 0;
    inputs[2][offset + 2] = grid.continentalShelf?.[i] ?? 0;
    inputs[2][offset + 3] = grid.continentalRise?.[i] ?? 0;
    inputs[3][offset] = grid.sedimentWedge?.[i] ?? 0;
    inputs[3][offset + 1] = grid.abyssalPlain?.[i] ?? 0;
    inputs[3][offset + 2] = grid.boundaryInfluence?.[i] ?? 0;
    inputs[3][offset + 3] = grid.axisCurvature?.[i] ?? 0;
    inputs[4][offset] = grid.weakness?.[i] ?? 0;
    inputs[4][offset + 1] = grid.fractureZoneMemory?.[i] ?? 0;
    inputs[4][offset + 2] = grid.transformMemory?.[i] ?? 0;
    inputs[4][offset + 3] = grid.inactiveBoundaryRelief?.[i] ?? 0;
    inputs[5][offset] = grid.crustAge?.[i] ?? 0;
    inputs[5][offset + 1] = grid.crustType?.[i] ?? 0;
    inputs[5][offset + 2] = grid.inlandWaterCandidate?.[i] ?? 0;
    inputs[5][offset + 3] = grid.activeOrogeny?.[i] ?? 0;
  }

  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) {
    return skippedSedimentCapacityResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
  }

  const paramBuffer = createBufferWithData(device, createParamData(size, width, height, seaLevel), usage.UNIFORM | usage.COPY_DST);
  const inputBuffers = inputs.map((input) => createBufferWithData(device, input, usage.STORAGE | usage.COPY_DST));
  const zeroSource = createBufferWithData(device, new Float32Array(size), usage.STORAGE | usage.COPY_DST);
  const capacityBytes = size * Float32Array.BYTES_PER_ELEMENT;
  const capacityA = device.createBuffer({ size: capacityBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const capacityB = device.createBuffer({ size: capacityBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const outputBuffer = device.createBuffer({ size: capacityBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: capacityBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const uploadMs = performance.now() - uploadStartedAt;

  const kernelStartedAt = performance.now();
  device.pushErrorScope?.("validation");
  const encoder = device.createCommandEncoder();
  encodeSedimentPass(encoder, seedPipeline, bindGroupLayout, device, paramBuffer, inputBuffers, zeroSource, capacityA, size);
  encodeSedimentPass(encoder, smoothPipeline, bindGroupLayout, device, paramBuffer, inputBuffers, capacityA, capacityB, size);
  encodeSedimentPass(encoder, smoothPipeline, bindGroupLayout, device, paramBuffer, inputBuffers, capacityB, outputBuffer, size);
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, capacityBytes);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const dispatchError = await device.popErrorScope?.();
  if (dispatchError) {
    destroyBuffers([paramBuffer, ...inputBuffers, zeroSource, capacityA, capacityB, outputBuffer, readBuffer]);
    return skippedSedimentCapacityResult(capabilities, `WebGPU sediment capacity dispatch validation failed: ${dispatchError.message ?? dispatchError}`);
  }
  const kernelMs = performance.now() - kernelStartedAt;

  const downloadStartedAt = performance.now();
  await readBuffer.mapAsync(mapMode.READ);
  const sedimentCapacity = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  const downloadMs = performance.now() - downloadStartedAt;

  destroyBuffers([paramBuffer, ...inputBuffers, zeroSource, capacityA, capacityB, outputBuffer, readBuffer]);

  return {
    skipped: false,
    valid: true,
    backend: "webgpu-sediment-capacity",
    gpuCapabilities: capabilities,
    adapterInfo: context.adapterInfo ?? null,
    deviceInfo: context.deviceInfo ?? null,
    reason: null,
    timings: {
      setupMs: context.reused ? 0 : context.setupMs,
      uploadMs,
      kernelMs,
      downloadMs,
      totalGpuPathMs: uploadMs + kernelMs + downloadMs,
      totalCandidateMs: (context.reused ? 0 : context.setupMs) + uploadMs + kernelMs + downloadMs,
    },
    reusedContext: context.reused,
    fields: { sedimentCapacity },
  };
}

function encodeSedimentPass(encoder, pipeline, bindGroupLayout, device, paramBuffer, inputBuffers, sourceBuffer, outputBuffer, size) {
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: paramBuffer } },
      ...inputBuffers.map((buffer, index) => ({ binding: index + 1, resource: { buffer } })),
      { binding: 7, resource: { buffer: sourceBuffer } },
      { binding: 8, resource: { buffer: outputBuffer } },
    ],
  }));
  pass.dispatchWorkgroups(Math.ceil(size / 64));
  pass.end();
}

function createSedimentCapacityBindGroupLayout(device) {
  const entries = [
    {
      binding: 0,
      visibility: globalThis.GPUShaderStage.COMPUTE,
      buffer: { type: "uniform" },
    },
  ];
  for (let binding = 1; binding <= 7; binding += 1) {
    entries.push({
      binding,
      visibility: globalThis.GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" },
    });
  }
  entries.push({
    binding: 8,
    visibility: globalThis.GPUShaderStage.COMPUTE,
    buffer: { type: "storage" },
  });
  return device.createBindGroupLayout({ entries });
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

function createParamData(size, width, height, seaLevel) {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  view.setUint32(0, size, true);
  view.setUint32(4, width, true);
  view.setUint32(8, height, true);
  view.setUint32(12, 0, true);
  view.setFloat32(16, seaLevel, true);
  return new Uint8Array(buffer);
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

function destroyBuffers(buffers) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
  }
}

function skippedSedimentCapacityResult(capabilities, reason) {
  return {
    skipped: true,
    valid: true,
    backend: "webgpu-sediment-capacity",
    gpuCapabilities: capabilities,
    reason,
    timings: emptySedimentCapacityTimings(),
    fields: {},
  };
}

function emptySedimentCapacityTimings() {
  return {
    setupMs: null,
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
    totalCandidateMs: null,
  };
}
