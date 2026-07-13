export const MARGIN_SMOOTH_WGSL = String.raw`
struct Params {
  size: u32,
  width: u32,
  height: u32,
  _pad0: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input0: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> input1: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> output0: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> output1: array<vec4<f32>>;

fn index_of(x: i32, y: i32) -> i32 {
  if (y < 0 || y >= i32(params.height)) {
    return -1;
  }
  let width = i32(params.width);
  let wrapped_x = ((x % width) + width) % width;
  let id = y * width + wrapped_x;
  if (id < 0 || id >= i32(params.size)) {
    return -1;
  }
  return id;
}

fn smooth_vec4(center: vec4<f32>, x: i32, y: i32, source: ptr<storage, array<vec4<f32>>, read>) -> vec4<f32> {
  var total = center * 2.5;
  var weight = 2.5;
  let west = index_of(x - 1, y);
  if (west >= 0) {
    total += (*source)[u32(west)];
    weight += 1.0;
  }
  let east = index_of(x + 1, y);
  if (east >= 0) {
    total += (*source)[u32(east)];
    weight += 1.0;
  }
  let north = index_of(x, y - 1);
  if (north >= 0) {
    total += (*source)[u32(north)];
    weight += 1.0;
  }
  let south = index_of(x, y + 1);
  if (south >= 0) {
    total += (*source)[u32(south)];
    weight += 1.0;
  }
  return clamp(total / weight, vec4<f32>(0.0), vec4<f32>(1.0));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  if (i >= params.size) {
    return;
  }

  let width = params.width;
  let x = i32(i % width);
  let y = i32(i / width);

  let a = input0[i];
  let b = input1[i];
  output0[i] = smooth_vec4(a, x, y, &input0);
  output1[i] = smooth_vec4(b, x, y, &input1);
}
`;
