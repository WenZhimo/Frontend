export const ISOSTASY_WGSL = String.raw`
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
@group(0) @binding(4) var<storage, read_write> output0: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> output1: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> output2: array<vec4<f32>>;

fn clamp01(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn smoothstep_local(edge0: f32, edge1: f32, value: f32) -> f32 {
  let t = clamp01((value - edge0) / max(0.000001, edge1 - edge0));
  return t * t * (3.0 - 2.0 * t);
}

fn saturating_fill(sediment: f32, fill_max: f32, fill_scale: f32) -> f32 {
  return fill_max * (1.0 - exp(-max(0.0, sediment) * fill_scale));
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

  let crust_type = u32(a.x + 0.5);
  let crust_thickness = a.y;
  let crust_age = a.z;
  let crust_density = a.w;
  let sediment = b.x;
  let sediment_load_subsidence = b.y;
  let ridge = b.z;
  let trench = b.w;
  let elev = c.x;

  let continental = crust_type == 1u;
  let transitional = crust_type == 2u;
  let oceanic = crust_type == 0u;
  let age_norm = clamp01(crust_age);
  let sediment_surface_fill = select(
    select(
      saturating_fill(sediment, 0.062, 1.7),
      saturating_fill(sediment, 0.08, 1.9),
      transitional
    ),
    saturating_fill(sediment, 0.03, 1.45),
    continental
  );
  let ridge_uplift = select(select(0.0, ridge * 0.06, oceanic), ridge * 0.018, transitional);
  let trench_depression = select(
    select(0.0, -trench * (0.075 + age_norm * 0.035), oceanic),
    -trench * 0.026,
    transitional
  );

  var base_elevation: f32;
  var thickness_norm: f32;
  var density_norm: f32;
  var buoyancy_scale: f32;
  var density_scale: f32;
  var cooling_scale: f32;
  if (continental) {
    base_elevation = 0.072;
    thickness_norm = smoothstep_local(0.0, 1.0, (crust_thickness - 0.42) / 0.58);
    density_norm = clamp01((crust_density - 0.38) / 0.22);
    buoyancy_scale = 0.105;
    density_scale = 0.018;
    cooling_scale = 0.002;
  } else if (transitional) {
    base_elevation = 0.018;
    thickness_norm = smoothstep_local(0.0, 1.0, (crust_thickness - 0.28) / 0.46);
    density_norm = clamp01((crust_density - 0.5) / 0.32);
    buoyancy_scale = 0.062;
    density_scale = 0.038;
    cooling_scale = 0.028;
  } else {
    base_elevation = -0.032;
    thickness_norm = smoothstep_local(0.0, 1.0, (crust_thickness - 0.12) / 0.3);
    density_norm = clamp01((crust_density - 0.62) / 0.24);
    buoyancy_scale = 0.034;
    density_scale = 0.05;
    cooling_scale = 0.106;
  }

  let crust_buoyancy = thickness_norm * buoyancy_scale;
  let density_subsidence = density_norm * density_scale;
  let lithosphere_cooling = select(select(0.03, 1.0, oceanic), 0.42, transitional) * sqrt(age_norm) * cooling_scale;
  let load = sediment_load_subsidence * select(select(0.3, 0.34, transitional), 0.18, continental);
  let sediment_load = load * (1.0 - clamp01(sediment) * 0.28);
  let isostatic_base =
    base_elevation +
    crust_buoyancy -
    density_subsidence -
    lithosphere_cooling -
    sediment_load +
    sediment_surface_fill;
  let age_subsidence = -lithosphere_cooling;
  let thickness_buoyancy = crust_buoyancy;
  let ocean_depth_terms =
    age_subsidence +
    thickness_buoyancy +
    sediment_surface_fill +
    ridge_uplift +
    trench_depression -
    density_subsidence -
    sediment_load;
  let isostatic_residual = elev - isostatic_base;
  let isostatic_relief_supply =
    abs(crust_buoyancy) +
    abs(density_subsidence) +
    abs(lithosphere_cooling) +
    abs(sediment_load);

  output0[i] = vec4<f32>(sediment_surface_fill, ridge_uplift, trench_depression, crust_buoyancy);
  output1[i] = vec4<f32>(density_subsidence, lithosphere_cooling, isostatic_base, age_subsidence);
  output2[i] = vec4<f32>(thickness_buoyancy, ocean_depth_terms, isostatic_residual, isostatic_relief_supply);
}
`;
