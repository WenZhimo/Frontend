import { detectGpuCapabilities } from "./capability.js";
import { ISOSTASY_WGSL } from "./kernels/isostasyKernel.js";

export const GPU_ISOSTASY_OUTPUT_FIELDS = [
  "sedimentFill",
  "ridgeUplift",
  "trenchDepression",
  "crustBuoyancy",
  "densitySubsidence",
  "lithosphereCooling",
  "isostaticBase",
  "ageSubsidence",
  "thicknessBuoyancy",
  "oceanDepthTerms",
  "isostaticResidual",
  "isostaticReliefSupply",
];

export async function runWebGpuIsostasyCandidate(world, options = {}) {
  const globalObject = options.globalObject ?? globalThis;
  const capabilities = detectGpuCapabilities(globalObject);
  const gpu = globalObject?.navigator?.gpu;
  if (!capabilities.secureContext || !capabilities.webgpuAvailable || !gpu?.requestAdapter) {
    return skippedResult(capabilities, "WebGPU is not available in this environment.");
  }

  let adapter;
  let device;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) {
      return skippedResult(capabilities, "WebGPU adapter request returned null.");
    }
    device = await adapter.requestDevice();
  } catch (error) {
    return skippedResult(capabilities, `WebGPU device request failed: ${error?.message ?? "unknown error"}`);
  }

  try {
    return await computeIsostasyOnDevice(world, device, capabilities);
  } catch (error) {
    return {
      skipped: true,
      valid: true,
      backend: "webgpu-isostasy",
      gpuCapabilities: capabilities,
      reason: `WebGPU isostasy candidate failed safely: ${error?.message ?? "unknown error"}`,
      timings: emptyTimings(),
      fields: {},
    };
  } finally {
    device?.destroy?.();
  }
}

async function computeIsostasyOnDevice(world, device, capabilities) {
  const { grid } = world;
  const size = grid.size;
  const input0 = new Float32Array(size * 4);
  const input1 = new Float32Array(size * 4);
  const input2 = new Float32Array(size * 4);

  const uploadStartedAt = performance.now();
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    input0[offset] = grid.crustType[i];
    input0[offset + 1] = grid.crustThickness[i];
    input0[offset + 2] = grid.crustAge[i];
    input0[offset + 3] = grid.crustDensity[i];
    input1[offset] = grid.sediment[i];
    input1[offset + 1] = grid.sedimentLoadSubsidence[i];
    input1[offset + 2] = grid.ridge[i];
    input1[offset + 3] = grid.trench[i];
    input2[offset] = grid.elev[i];
  }

  const usage = globalThis.GPUBufferUsage;
  const mapMode = globalThis.GPUMapMode;
  if (!usage || !mapMode) {
    return skippedResult(capabilities, "WebGPU constants are unavailable in this JavaScript runtime.");
  }

  const paramData = new Uint32Array([size, 0, 0, 0]);
  const paramBuffer = createBufferWithData(device, paramData, usage.UNIFORM | usage.COPY_DST);
  const inputBuffer0 = createBufferWithData(device, input0, usage.STORAGE | usage.COPY_DST);
  const inputBuffer1 = createBufferWithData(device, input1, usage.STORAGE | usage.COPY_DST);
  const inputBuffer2 = createBufferWithData(device, input2, usage.STORAGE | usage.COPY_DST);
  const outputBytes = size * 4 * Float32Array.BYTES_PER_ELEMENT;
  const outputBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const outputBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const outputBuffer2 = device.createBuffer({ size: outputBytes, usage: usage.STORAGE | usage.COPY_SRC });
  const readBuffer0 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const readBuffer1 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const readBuffer2 = device.createBuffer({ size: outputBytes, usage: usage.COPY_DST | usage.MAP_READ });
  const uploadMs = performance.now() - uploadStartedAt;

  const shaderModule = device.createShaderModule({ code: ISOSTASY_WGSL });
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
      { binding: 3, resource: { buffer: inputBuffer2 } },
      { binding: 4, resource: { buffer: outputBuffer0 } },
      { binding: 5, resource: { buffer: outputBuffer1 } },
      { binding: 6, resource: { buffer: outputBuffer2 } },
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
  encoder.copyBufferToBuffer(outputBuffer2, 0, readBuffer2, 0, outputBytes);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const kernelMs = performance.now() - kernelStartedAt;

  const downloadStartedAt = performance.now();
  await Promise.all([
    readBuffer0.mapAsync(mapMode.READ),
    readBuffer1.mapAsync(mapMode.READ),
    readBuffer2.mapAsync(mapMode.READ),
  ]);
  const packed0 = new Float32Array(readBuffer0.getMappedRange().slice(0));
  const packed1 = new Float32Array(readBuffer1.getMappedRange().slice(0));
  const packed2 = new Float32Array(readBuffer2.getMappedRange().slice(0));
  readBuffer0.unmap();
  readBuffer1.unmap();
  readBuffer2.unmap();
  const downloadMs = performance.now() - downloadStartedAt;

  const fields = unpackIsostasyFields(size, packed0, packed1, packed2);
  destroyBuffers([
    paramBuffer,
    inputBuffer0,
    inputBuffer1,
    inputBuffer2,
    outputBuffer0,
    outputBuffer1,
    outputBuffer2,
    readBuffer0,
    readBuffer1,
    readBuffer2,
  ]);

  return {
    skipped: false,
    valid: true,
    backend: "webgpu-isostasy",
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

function unpackIsostasyFields(size, packed0, packed1, packed2) {
  const fields = {};
  for (const name of GPU_ISOSTASY_OUTPUT_FIELDS) {
    fields[name] = new Float32Array(size);
  }
  for (let i = 0; i < size; i += 1) {
    const offset = i * 4;
    fields.sedimentFill[i] = packed0[offset];
    fields.ridgeUplift[i] = packed0[offset + 1];
    fields.trenchDepression[i] = packed0[offset + 2];
    fields.crustBuoyancy[i] = packed0[offset + 3];
    fields.densitySubsidence[i] = packed1[offset];
    fields.lithosphereCooling[i] = packed1[offset + 1];
    fields.isostaticBase[i] = packed1[offset + 2];
    fields.ageSubsidence[i] = packed1[offset + 3];
    fields.thicknessBuoyancy[i] = packed2[offset];
    fields.oceanDepthTerms[i] = packed2[offset + 1];
    fields.isostaticResidual[i] = packed2[offset + 2];
    fields.isostaticReliefSupply[i] = packed2[offset + 3];
  }
  return fields;
}

function destroyBuffers(buffers) {
  for (const buffer of buffers) {
    buffer?.destroy?.();
  }
}

function skippedResult(capabilities, reason) {
  return {
    skipped: true,
    valid: true,
    backend: "webgpu-isostasy",
    gpuCapabilities: capabilities,
    reason,
    timings: emptyTimings(),
    fields: {},
  };
}

function emptyTimings() {
  return {
    uploadMs: null,
    kernelMs: null,
    downloadMs: null,
    totalGpuPathMs: null,
  };
}
