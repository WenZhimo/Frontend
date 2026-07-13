export const SEDIMENT_CAPACITY_WGSL = String.raw`
struct Params {
  size: u32,
  width: u32,
  height: u32,
  _pad0: u32,
  sea_level: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input0: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> input1: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> input2: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> input3: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> input4: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> input5: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read> source_capacity: array<f32>;
@group(0) @binding(8) var<storage, read_write> output_capacity: array<f32>;

fn clamp01(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn smoothstep01(edge0: f32, edge1: f32, x: f32) -> f32 {
  let t = clamp01((x - edge0) / max(0.000001, edge1 - edge0));
  return t * t * (3.0 - 2.0 * t);
}

fn mix_value(a: f32, b: f32, t: f32) -> f32 {
  return a * (1.0 - t) + b * t;
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

fn basin_at(id: u32) -> f32 {
  return input0[id].y;
}

fn structural_line_memory(id: u32) -> f32 {
  let boundary_influence = input3[id].z;
  let fracture_zone_memory = input4[id].y;
  let transform_memory = input4[id].z;
  let inactive_boundary_relief = input4[id].w;
  return clamp01(
    max(0.0, boundary_influence - 0.12) * 1.25 +
      inactive_boundary_relief * 2.2 +
      fracture_zone_memory * 0.9 +
      transform_memory * 0.55
  );
}

fn local_average8_basin(i: u32, x: i32, y: i32) -> f32 {
  var total = basin_at(i) * 1.5;
  var weight = 1.5;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) {
        continue;
      }
      let nid = index_of(x + dx, y + dy);
      if (nid < 0) {
        continue;
      }
      let diagonal = dx != 0 && dy != 0;
      let w = select(0.8, 0.45, diagonal);
      total += basin_at(u32(nid)) * w;
      weight += w;
    }
  }
  return total / weight;
}

fn soft_depositional_sink(i: u32, x: i32, y: i32) -> f32 {
  let a = input0[i];
  let c = input2[i];
  let d = input3[i];
  let basin = a.y;
  let foreland_basin = a.z;
  let passive_margin = c.y;
  let continental_shelf = c.z;
  let continental_rise = c.w;
  let sediment_wedge = d.x;
  let abyssal_plain = d.y;
  let inland_water_candidate = input5[i].z;
  let broad_basin = local_average8_basin(i, x, y);
  let structural_line = structural_line_memory(i);
  let natural =
    passive_margin * 0.54 +
    continental_shelf * 0.72 +
    continental_rise * 0.54 +
    sediment_wedge * 0.5 +
    foreland_basin * 0.62 +
    inland_water_candidate * 0.44 +
    abyssal_plain * 0.22;
  let basin_part = (broad_basin * 0.2 + basin * 0.08) * (0.35 + natural * 0.65) * (1.0 - structural_line * 0.55);
  return clamp01(natural + basin_part);
}

fn initial_capacity(i: u32, x: i32, y: i32) -> f32 {
  let a = input0[i];
  let b = input1[i];
  let c = input2[i];
  let d = input3[i];
  let e = input4[i];
  let f = input5[i];

  let elev = a.x;
  let basin = a.y;
  let foreland_basin = a.z;
  let rift_axis = a.w;
  let trench = b.x;
  let trench_axis = b.y;
  let ridge = b.z;
  let ridge_axis = b.w;
  let island_arc = c.x;
  let passive_margin = c.y;
  let continental_shelf = c.z;
  let continental_rise = c.w;
  let sediment_wedge = d.x;
  let abyssal_plain = d.y;
  let boundary_influence = d.z;
  let crust_age = f.x;
  let crust_type = u32(f.y + 0.5);
  let inland_water_candidate = f.z;
  let active_orogeny = f.w;

  let rel = elev - params.sea_level;
  let near_or_below_sea = clamp01((params.sea_level + 0.08 - elev) / 0.16);
  let shelf_capacity =
    continental_shelf * 0.34 +
    continental_rise * 0.24 +
    sediment_wedge * 0.22 +
    passive_margin * 0.16;
  let natural_capacity_support = clamp01(
    near_or_below_sea * 0.28 +
      continental_shelf * 0.55 +
      continental_rise * 0.42 +
      sediment_wedge * 0.36 +
      passive_margin * 0.28 +
      foreland_basin * 0.34 +
      inland_water_candidate * 0.42 +
      abyssal_plain * 0.12
  );
  let structural_line = structural_line_memory(i);
  let broad_basin = local_average8_basin(i, x, y);
  let basin_capacity =
    broad_basin * (0.11 + natural_capacity_support * 0.2) +
    basin * (0.035 + natural_capacity_support * 0.065) * (1.0 - structural_line * 0.55) +
    foreland_basin * 0.27 +
    rift_axis * 0.052 +
    inland_water_candidate * 0.2;
  let trench_forearc_capacity =
    trench * 0.055 +
    trench_axis * 0.045 +
    island_arc * 0.04;
  let deep_ocean_capacity = abyssal_plain * 0.075 * select(0.0, clamp01(crust_age), crust_type == 0u);
  let active_constructive_penalty =
    ridge_axis * 0.34 +
    ridge * 0.24 +
    active_orogeny * 0.18 +
    select(0.0, smoothstep01(0.12, 0.32, rel) * 0.08, rel > 0.12);
  return clamp01(
    shelf_capacity +
      basin_capacity +
      trench_forearc_capacity +
      deep_ocean_capacity +
      near_or_below_sea * 0.08 -
      active_constructive_penalty
  );
}

fn smoothed_capacity(i: u32, x: i32, y: i32) -> f32 {
  var total = source_capacity[i] * 1.8;
  var weight = 1.8;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      if (dx == 0 && dy == 0) {
        continue;
      }
      let nid = index_of(x + dx, y + dy);
      if (nid < 0) {
        continue;
      }
      let diagonal = dx != 0 && dy != 0;
      let w = select(0.72, 0.38, diagonal);
      total += source_capacity[u32(nid)] * w;
      weight += w;
    }
  }
  let local = source_capacity[i];
  let smoothed = total / weight;
  let natural_sink = soft_depositional_sink(i, x, y);
  let boundary_influence = input3[i].z;
  let fracture_zone_memory = input4[i].y;
  let transform_memory = input4[i].z;
  let inactive_boundary_relief = input4[i].w;
  let structural_line = clamp01(
    max(0.0, boundary_influence - 0.14) * 1.8 +
      fracture_zone_memory * 0.65 +
      transform_memory * 0.42 +
      inactive_boundary_relief * 2.2
  );
  let blend = clamp01(0.16 + natural_sink * 0.16 + structural_line * 0.22);
  let edge_clamp = 0.06 + natural_sink * 0.04;
  return clamp01(mix_value(local, min(local + edge_clamp, smoothed), blend));
}

@compute @workgroup_size(64)
fn seed_capacity(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  if (i >= params.size) {
    return;
  }
  let width = params.width;
  let x = i32(i % width);
  let y = i32(i / width);
  output_capacity[i] = initial_capacity(i, x, y);
}

@compute @workgroup_size(64)
fn smooth_capacity(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  if (i >= params.size) {
    return;
  }
  let width = params.width;
  let x = i32(i % width);
  let y = i32(i / width);
  output_capacity[i] = smoothed_capacity(i, x, y);
}
`;
