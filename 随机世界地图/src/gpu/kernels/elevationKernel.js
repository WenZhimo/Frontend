export const ELEVATION_WGSL = String.raw`
struct Params {
  size: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> input0: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> input1: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> input2: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> input3: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> input4: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> input5: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read> input6: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read> input7: array<vec4<f32>>;
@group(0) @binding(9) var<storage, read_write> output0: array<vec4<f32>>;

fn clamp01(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x;
  if (i >= params.size) {
    return;
  }

  let a = input0[i];
  let b = input1[i];
  let c = input2[i];
  let d = input3[i];
  let e = input4[i];
  let f = input5[i];
  let g = input6[i];
  let h = input7[i];

  let crust_type = u32(a.x + 0.5);
  let orogeny = a.y;
  let active_orogeny = a.z;
  let old_orogeny = a.w;
  let orogeny_age = b.x;
  let sediment = b.y;
  let sediment_load_subsidence = b.z;
  let sediment_fill = b.w;
  let ridge_uplift = c.x;
  let trench_depression = c.y;
  let isostatic_base = c.z;
  let passive_margin = c.w;
  let continental_shelf = d.x;
  let continental_slope = d.y;
  let continental_rise = d.z;
  let abyssal_plain = d.w;
  let sediment_wedge = e.x;
  let foreland_basin = e.y;
  let active_transform = e.z;
  let transform_memory = e.w;
  let fracture_zone_memory = f.x;
  let inactive_boundary_relief = f.y;
  let geology_broad_noise = f.z;
  let geology_micro_noise = f.w;
  let mountain_belt = g.x;
  let trench = g.y;
  let ridge = g.z;
  let rift = g.w;
  let island_arc = h.x;
  let basin = h.y;

  let continental = crust_type == 1u;
  let transitional = crust_type == 2u;

  let age_reduction = 0.35 + clamp01(orogeny_age) * 0.55;
  let old_orogen_relief = old_orogeny * select(select(0.004, 0.035, transitional), 0.075, continental) * (1.0 - age_reduction * 0.62);
  let root_relief = orogeny * select(select(0.004, 0.032, transitional), 0.105, continental);
  let foreland_subsidence = foreland_basin * select(select(0.002, 0.018, transitional), 0.026, continental);
  let load_subsidence = sediment_load_subsidence * select(select(0.07, 0.08, transitional), 0.06, continental);
  let long_term =
    root_relief +
    old_orogen_relief +
    sediment_fill * 0.36 -
    basin * select(0.018, 0.002, transitional) -
    foreland_subsidence -
    load_subsidence;
  let active_feature =
    mountain_belt * 0.15 +
    active_orogeny * select(select(0.006, 0.024, transitional), 0.055, continental) -
    select(-trench_depression, trench * 0.105, continental) +
    select(ridge_uplift, ridge * 0.048, continental) -
    rift * 0.055 +
    island_arc * 0.06 -
    basin * 0.025;

  let roughness_damp = max(0.0, 1.0 - abyssal_plain * 0.58 - passive_margin * 0.12);
  let margin_elevation =
    continental_shelf * 0.018 +
    continental_rise * 0.015 +
    sediment_wedge * 0.012 -
    continental_slope * 0.012 -
    abyssal_plain * 0.006;
  let transform_active_relief =
    active_transform *
    select(select(0.006, 0.008, transitional), 0.012, continental) *
    (0.45 + abs(geology_micro_noise));
  let inactive_transform_penalty = select(
    max(0.0, transform_memory * 0.003 + fracture_zone_memory * 0.005 + inactive_boundary_relief * 0.006) *
      (0.4 + abyssal_plain + sediment),
    0.0,
    continental
  );

  let base_elev =
    isostatic_base +
    geology_broad_noise * select(select(0.009, 0.014, transitional), 0.018, continental) * roughness_damp +
    geology_micro_noise * select(select(0.006, 0.008, transitional), 0.011, continental) * roughness_damp;
  let relief = long_term;
  let boundary_relief = active_feature + margin_elevation + transform_active_relief - inactive_transform_penalty;
  let elev = base_elev + relief + boundary_relief;
  let is_continental = select(0.0, 1.0, continental);

  output0[i] = vec4<f32>(base_elev, relief, boundary_relief, elev + is_continental * 0.0);
}
`;
