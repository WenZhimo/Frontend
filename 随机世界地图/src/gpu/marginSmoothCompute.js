import { detectGpuCapabilities } from "./capability.js";
import { MARGIN_SMOOTH_WGSL } from "./kernels/marginSmoothKernel.js";

export const GPU_MARGIN_SMOOTH_OUTPUT_FIELDS = [
  "passiveMargin",
  "continentalShelf",
  "continentalSlope",
  "continentalRise",
  "sedimentWedge",
  "abyssalPlain",
];

export async function runWebGpuMarginSmoothCandidate(world, options = {}) {
  const candidateStartedAt = performance.now();
  const globalObject = options.globalObject ?? globalThis;
  const capabilities = detectGpuCapabilities(globalObject);
  const gpu = globalObject?.navigator?.gpu;
  if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
    return skippedMarginSmoothResult(capabilities, "WebGPU margin smoothing candidate currently supports rectangular grids only.");
  }
  if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
    return skippedMarginSmoothResult(capabilities, "WebGPU is not available in this environment.");
  }

  let adapter;
  let device;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) {
      return skippedMarginSmoothResult(capabilities, "WebGPU adapter request returned null.");
    }
    device = await adapter.requestDevice();
  } catch (error) {
    return skippedMarginSmoothResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
  }

  try {
    return withCandidateTiming(await computeMarginSmoothOnDevice(world, device, capabilities), candidateStartedAt);
  } catch (error) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-margin-smooth",
      gpuCapabilities: capabilities,
      reason: `WebGPU margin smoothing candidate failed safely: ${error?.message ?? "unknown error"}`,
      timings: emptyMarginSmoothTimings(),
      fields: {},
    };
  } finally {
    device?.destroy?.();
  }
}

function withCandidateTiming(result, candidateStartedAt) {
  if (!result || result.skipped) return result;
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

async function computeMarginSmoothOnDevice(world, device, capabilities) {
  const { grid } = world;
  const size = grid.size;
  const width = grid.width;
  const height = grid.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height !== size) {
    return skippedMarginSmoothResult(capabilities, "World grid is not a rectangular width x height layout.");
  }

  const uploadStartedAt = performance.now();
  const input0 = new Float32Array(size * 4);
  const input1 = new Float32Array(size * 4);
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    input0[offset] = grid.passiveMargin?.[i] ?? 0;
    input0[offset + 1] = grid.continentalShelf?.[i] ?? 0;
    input0[offset + 2] = grid.continentalSlope?.[i] ?? 0;
    input0[offset + 3] = grid.continentalRise?.[i] ?? 0;
    input1[offset] = grid.sedimentWedge?.[i] ?? 0;
    input1[offset + 1] = grid.abyssalPlain?.[i] ?? 0;
  }

  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) {
    return skippedMarginSmoothResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
  }

  const paramData = new Uint32Array([size, width, height, 0]);
  const paramBuffer = createBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
  const inputBuffer0 = createBufferWithData(device, input0, usage.STORAGE | usage.COPY_DST);
  const inputBuffer1 = createBufferWithData(device, input1, usage.STORAGE | usage.COPY_DST);
  const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
  const outputBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const outputBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const readBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const readBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const uploadMs = performance.now() - uploadStartedAt;

  const shaderModule = device.createShaderModule({ code: MARGIN_SMOOTH_WGSL });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuffer } },
      { binding: 1, resource: { buffer: inputBuffer0 } },
      { binding: 2, resource: { buffer: inputBuffer1 } },
      { binding: 3, resource: { buffer: outputBuffer0 } },
      { binding: 4, resource: { buffer: outputBuffer1 } },
    ],
  });

  const kernelStartedAt = performance.now();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(size / 64));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer0, 0, readBuffer0, 0, outputBytes);
  encoder.copyBufferToBuffer(outputBuffer1, 0, readBuffer1, 0, outputBytes);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const kernelMs = performance.now() - kernelStartedAt;

  const downloadStartedAt = performance.now();
  await Promise.all([
    readBuffer0.mapAsync(mapMode.READ),
    readBuffer1.mapAsync(mapMode.READ),
  ]);
  const packed0 = new Float32Array(readBuffer0.getMappedRange().slice(0));
  const packed1 = new Float32Array(readBuffer1.getMappedRange().slice(0));
  readBuffer0.unmap();
  readBuffer1.unmap();
  const downloadMs = performance.now() - downloadStartedAt;

  const fields = unpackMarginSmoothFields(size, packed0, packed1);
  destroyBuffers([paramBuffer, inputBuffer0, inputBuffer1, outputBuffer0, outputBuffer1, readBuffer0, readBuffer1]);

  return {
    skipped: false,
    valid: true,
    backend: "webgpu-margin-smooth",
    gpuCapabilities: capabilities,
    reason: null,
    timings: {
      uploadMs,
      kernelMs,
      downloadMs,
      totalGpuPathMs: uploadMs + kernelMs + downloadMs,
    },
    fields,
  };
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

function unpackMarginSmoothFields(size, packed0, packed1) {
  const fields = {};
  for (const name of GPU_MARGIN_SMOOTH_OUTPUT_FIELDS) {
    fields[name] = new Float32Array(size);
  }
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    fields.passiveMargin[i] = packed0[offset];
    fields.continentalShelf[i] = packed0[offset + 1];
    fields.continentalSlope[i] = packed0[offset + 2];
    fields.continentalRise[i] = packed0[offset + 3];
    fields.sedimentWedge[i] = packed1[offset];
    fields.abyssalPlain[i] = packed1[offset + 1];
  }
  return fields;
}

function destroyBuffers(buffers) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
  }
}

function skippedMarginSmoothResult(capabilities, reason) {
  return {
    skipped: true,
    valid: true,
    backend: "webgpu-margin-smooth",
    gpuCapabilities: capabilities,
    reason,
    timings: emptyMarginSmoothTimings(),
    fields: {},
  };
}

function emptyMarginSmoothTimings() {
  return {
    setupMs: null,
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
    totalCandidateMs: null,
  };
}
