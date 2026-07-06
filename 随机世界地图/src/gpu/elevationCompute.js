import { detectGpuCapabilities } from "./capability.js";
import { ELEVATION_WGSL } from "./kernels/elevationKernel.js";

export const GPU_ELEVATION_OUTPUT_FIELDS = [
  "baseElev",
  "relief",
  "boundaryRelief",
  "elev",
];

export async function runWebGpuElevationCandidate(world, options = {}) {
  const globalObject = options.globalObject ?? globalThis;
  const capabilities = detectGpuCapabilities(globalObject);
  const gpu = globalObject?.navigator?.gpu;
  if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
    return skippedElevationResult(capabilities, "WebGPU is not available in this environment.");
  }

  let adapter;
  let device;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) {
      return skippedElevationResult(capabilities, "WebGPU adapter request returned null.");
    }
    device = await adapter.requestDevice();
  } catch (error) {
    return skippedElevationResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
  }

  try {
    return await computeElevationOnDevice(world, device, capabilities);
  } catch (error) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-elevation",
      gpuCapabilities: capabilities,
      reason: `WebGPU elevation candidate failed safely: ${error?.message ?? "unknown error"}`,
      timings: emptyElevationTimings(),
      fields: {},
    };
  } finally {
    device?.destroy?.();
  }
}

async function computeElevationOnDevice(world, device, capabilities) {
  const { grid } = world;
  const size = grid.size;
  const inputPacked = new Float32Array(size * 8 * 4);

  const uploadStartedAt = performance.now();
  for (let i = 0; i < size; i += 1) {
    const offset = i * 8 * 4;
    inputPacked[offset] = grid.crustType[i];
    inputPacked[offset + 1] = grid.orogeny[i];
    inputPacked[offset + 2] = grid.activeOrogeny?.[i] ?? 0;
    inputPacked[offset + 3] = grid.oldOrogeny?.[i] ?? 0;
    inputPacked[offset + 4] = grid.orogenyAge?.[i] ?? 0;
    inputPacked[offset + 5] = grid.sediment[i];
    inputPacked[offset + 6] = grid.sedimentLoadSubsidence?.[i] ?? 0;
    inputPacked[offset + 7] = grid.sedimentFill[i];
    inputPacked[offset + 8] = grid.ridgeUplift[i];
    inputPacked[offset + 9] = grid.trenchDepression[i];
    inputPacked[offset + 10] = grid.isostaticBase[i];
    inputPacked[offset + 11] = grid.passiveMargin?.[i] ?? 0;
    inputPacked[offset + 12] = grid.continentalShelf?.[i] ?? 0;
    inputPacked[offset + 13] = grid.continentalSlope?.[i] ?? 0;
    inputPacked[offset + 14] = grid.continentalRise?.[i] ?? 0;
    inputPacked[offset + 15] = grid.abyssalPlain?.[i] ?? 0;
    inputPacked[offset + 16] = grid.sedimentWedge?.[i] ?? 0;
    inputPacked[offset + 17] = grid.forelandBasin?.[i] ?? 0;
    inputPacked[offset + 18] = grid.activeTransform?.[i] ?? 0;
    inputPacked[offset + 19] = grid.transformMemory?.[i] ?? 0;
    inputPacked[offset + 20] = grid.fractureZoneMemory?.[i] ?? 0;
    inputPacked[offset + 21] = grid.inactiveBoundaryRelief?.[i] ?? 0;
    inputPacked[offset + 22] = grid.geologyBroadNoise[i];
    inputPacked[offset + 23] = grid.geologyMicroNoise[i];
    inputPacked[offset + 24] = grid.mountainBelt[i];
    inputPacked[offset + 25] = grid.trench[i];
    inputPacked[offset + 26] = grid.ridge[i];
    inputPacked[offset + 27] = grid.rift[i];
    inputPacked[offset + 28] = grid.islandArc[i];
    inputPacked[offset + 29] = grid.basin[i];
  }

  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) {
    return skippedElevationResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
  }

  const paramData = new Uint32Array([size, 0, 0, 0]);
  const paramBuffer = createElevationBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
  const inputBuffer = createElevationBufferWithData(device, inputPacked, usage.STORAGE | usage.COPY_DST);
  const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
  const outputBuffer = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const readBuffer = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const uploadMs = performance.now() - uploadStartedAt;

  const shaderModule = device.createShaderModule({ code: ELEVATION_WGSL });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuffer } },
      { binding: 1, resource: { buffer: inputBuffer } },
      { binding: 2, resource: { buffer: outputBuffer } },
    ],
  });

  const kernelStartedAt = performance.now();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(size / 64));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputBytes);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const kernelMs = performance.now() - kernelStartedAt;

  const downloadStartedAt = performance.now();
  await readBuffer.mapAsync(mapMode.READ);
  const packed = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  const downloadMs = performance.now() - downloadStartedAt;

  const fields = unpackElevationFields(size, packed);
  destroyElevationBuffers([paramBuffer, inputBuffer, outputBuffer, readBuffer]);

  return {
    skipped: false,
    valid: true,
    backend: "webgpu-elevation",
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

function createElevationBufferWithData(device, typedArray, usage) {
  const buffer = device.createBuffer({
    size: typedArray.byteLength,
    usage,
    mappedAtCreation: true,
  });
  new typedArray.constructor(buffer.getMappedRange()).set(typedArray);
  buffer.unmap();
  return buffer;
}

function unpackElevationFields(size, packed) {
  const fields = {};
  for (const name of GPU_ELEVATION_OUTPUT_FIELDS) {
    fields[name] = new Float32Array(size);
  }
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    fields.baseElev[i] = packed[offset];
    fields.relief[i] = packed[offset + 1];
    fields.boundaryRelief[i] = packed[offset + 2];
    fields.elev[i] = packed[offset + 3];
  }
  return fields;
}

function destroyElevationBuffers(buffers) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
  }
}

function skippedElevationResult(capabilities, reason) {
  return {
    skipped: true,
    valid: true,
    backend: "webgpu-elevation",
    gpuCapabilities: capabilities,
    reason,
    timings: emptyElevationTimings(),
    fields: {},
  };
}

function emptyElevationTimings() {
  return {
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
  };
}
