export const LOCAL_FIELDS_WGSL = String.raw`
struct Params {
  size: u32,
  width: u32,
  height: u32,
  _pad0: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> packed: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> output0: array<vec4<f32>>;

fn field_at(id: u32) -> f32 {
  return packed[id].x;
}

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

fn finite_sample(x: i32, y: i32, fallback: f32) -> f32 {
  let id = index_of(x, y);
  if (id < 0) {
    return fallback;
  }
  let value = field_at(u32(id));
  if (value != value || abs(value) > 3.3e38) {
    return fallback;
  }
  return value;
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
  let center = field_at(i);

  let left = finite_sample(x - 1, y, center);
  let right = finite_sample(x + 1, y, center);
  let up = finite_sample(x, y - 1, center);
  let down = finite_sample(x, y + 1, center);
  let dx = (right - left) * 0.5;
  let dy = (down - up) * 0.5;
  let slope = sqrt(dx * dx + dy * dy);
  let aspect = atan2(dy, dx);

  var sum = 0.0;
  var count = 0.0;
  let west = index_of(x - 1, y);
  if (west >= 0) {
    sum += abs(center - field_at(u32(west)));
    count += 1.0;
  }
  let east = index_of(x + 1, y);
  if (east >= 0) {
    sum += abs(center - field_at(u32(east)));
    count += 1.0;
  }
  let north = index_of(x, y - 1);
  if (north >= 0) {
    sum += abs(center - field_at(u32(north)));
    count += 1.0;
  }
  let south = index_of(x, y + 1);
  if (south >= 0) {
    sum += abs(center - field_at(u32(south)));
    count += 1.0;
  }
  let ruggedness = select(0.0, sum / count, count > 0.0);
  let local_relief = max(max(abs(center - left), abs(center - right)), max(abs(center - up), abs(center - down)));

  output0[i] = vec4<f32>(slope, aspect, ruggedness, local_relief);
}
`;
