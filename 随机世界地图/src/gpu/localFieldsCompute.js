import { detectGpuCapabilities } from "./capability.js";
import { LOCAL_FIELDS_WGSL } from "./kernels/localFieldsKernel.js";

export const GPU_LOCAL_FIELDS_OUTPUT_FIELDS = [
  "slope",
  "aspect",
  "ruggedness",
  "localRelief",
];

export async function runWebGpuLocalFieldsCandidate(world, options = {}) {
  const globalObject = options.globalObject ?? globalThis;
  const capabilities = detectGpuCapabilities(globalObject);
  const gpu = globalObject?.navigator?.gpu;
  if (world?.grid?.topologyOptions?.graphBacked || world?.grid?.topologyKind === "cubed-sphere") {
    return skippedLocalFieldsResult(capabilities, "WebGPU local fields candidate currently supports rectangular grids only.");
  }
  if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
    return skippedLocalFieldsResult(capabilities, "WebGPU is not available in this environment.");
  }

  let adapter;
  let device;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) {
      return skippedLocalFieldsResult(capabilities, "WebGPU adapter request returned null.");
    }
    device = await adapter.requestDevice();
  } catch (error) {
    return skippedLocalFieldsResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
  }

  try {
    return await computeLocalFieldsOnDevice(world, device, capabilities);
  } catch (error) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-local-fields",
      gpuCapabilities: capabilities,
      reason: `WebGPU local fields candidate failed safely: ${error?.message ?? "unknown error"}`,
      timings: emptyLocalFieldsTimings(),
      fields: {},
    };
  } finally {
    device?.destroy?.();
  }
}

async function computeLocalFieldsOnDevice(world, device, capabilities) {
  const { grid, seaLevel } = world;
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
  const shaderModule = device.createShaderModule({ code: LOCAL_FIELDS_WGSL });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });
  const pipelineError = await device.popErrorScope?.();
  if (pipelineError) {
    destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
    return skippedLocalFieldsResult(capabilities, `WebGPU local fields pipeline validation failed: ${pipelineError.message ?? pipelineError}`);
  }

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
  await device.queue.onSubmittedWorkDone();
  const dispatchError = await device.popErrorScope?.();
  if (dispatchError) {
    destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);
    return skippedLocalFieldsResult(capabilities, `WebGPU local fields dispatch validation failed: ${dispatchError.message ?? dispatchError}`);
  }
  const kernelMs = performance.now() - kernelStartedAt;

  const downloadStartedAt = performance.now();
  await readBuffer.mapAsync(mapMode.READ);
  const packed = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  const downloadMs = performance.now() - downloadStartedAt;

  const fields = unpackLocalFields(size, packed);
  destroyBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);

  return {
    skipped: false,
    valid: true,
    backend: "webgpu-local-fields",
    gpuCapabilities: capabilities,
    reason: null,
    timings: {
      setupMs: 0,
      uploadMs,
      kernelMs,
      downloadMs,
      totalGpuPathMs: uploadMs + kernelMs + downloadMs,
      totalCandidateMs: uploadMs + kernelMs + downloadMs,
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
    setupMs: null,
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
    totalCandidateMs: null,
  };
}
