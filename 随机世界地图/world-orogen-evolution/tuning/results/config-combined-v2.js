// Terrain generation tunable constants.
// Grouped by subsystem for iterative tuning.
// These are internal algorithm constants, NOT user-facing slider parameters.

// ── Collision & Stress ──
export const COLLISION_THRESHOLD = 0.75;
export const COLLISION_DT_BASE = 1e-2;
export const COLLISION_DT_REF_REGIONS = 10000;
export const PAIR_INTENSITY_BASE = 0.5;
export const SUBDUCT_UNDULATION_DENSITY_DECAY = 12;
export const SUBDUCT_UNDULATION_FREQ = 6;
export const SUBDUCT_UNDULATION_AMP = 0.4;
export const SUBDUCT_FACTOR_BASE = 0.5;
export const SUBDUCT_FACTOR_TANH_SCALE = 8;
export const SUBDUCT_THRESHOLD = 0.55;
export const BOUNDARY_TYPE_THRESH_FACTOR = 0.3;

export const STRESS_PROPAGATE_MIN = 0.01;
export const STRESS_PROPAGATE_CUTOFF = 0.005;
export const STRESS_DIR_FACTOR_MIN = 0.1;
export const STRESS_DIR_FACTOR_BASE = 0.3;
export const STRESS_DIR_FACTOR_SCALE = 0.7;
export const STRESS_DIR_BLEND_PARENT = 0.8;
export const STRESS_DIR_BLEND_TRAVEL = 0.2;
export const STRESS_DIR_SMOOTH_PASSES = 2;
export const STRESS_DIR_SELF_WEIGHT = 2;

export const STRESS_DECAY_BASE = 0.5;
export const STRESS_DECAY_SPREAD_FACTOR = 0.04;
export const STRESS_SUBDUCT_DECAY_MULT = 0.45;
export const STRESS_PASSES_PER_SPREAD = 3;

export const STRESS_PERCENTILE = 0.97;

// Blend weights for dual-layer orogeny (small plates vs super plates)
export const SMALL_W = 0.05;
export const SUPER_W = 0.95;

// ── Distance Fields & Zone Widths ──
export const INTERIOR_BAND_BASE = 16;
export const TECTONIC_REACH_BASE = 20;
export const COASTAL_PLAIN_WIDTH_BASE = 18;
export const COAST_BFS_WIDTH_BASE = 8;

// ── Mountain Profiles ──
export const RIDGE_STRENGTH = 0.15;
export const RIDGE_SIGMA_BASE = 5;
export const RIDGE_PEAK_SHIFT_BASE = 2;
export const RIDGE_EXTENT_BASE = 10;
export const RIDGE_ASYM_SUBDUCT_NARROW = 0.6;
export const RIDGE_ASYM_OVERRIDE_WIDEN = 0.5;
export const RIDGE_STRESS_WIDTH_BASE = 0.75;
export const RIDGE_STRESS_WIDTH_SCALE = 0.5;
export const RIDGE_WIDTH_NOISE_AMP = 0.2;

export const BASE_SCALE = 0.6;
export const ASYMMETRY_FACTOR = 0.8;

export const SUBDUCTING_SUPPRESSION = 0.42;

export const STRESS_MAG_SCALE = 0.40;
export const STRESS_DEPRESS_FRAC = 0.4;
export const STRESS_HEIGHT_VAR_BASE = 0.60;
export const STRESS_HEIGHT_VAR_SCALE = 0.8;

export const SUBDUCTING_REACH_MIN = 0.35;
export const SUBDUCTING_REACH_RANGE = 0.3;

// ── Fold Ridges ──
export const FOLD_FREQ_PRIMARY = 160;
export const FOLD_FREQ_SECONDARY = 400;
export const FOLD_MEAN_OFFSET = 0.36;
export const FOLD_PHASE_WARP_AMP = 0.08;
export const FOLD_PHASE_WARP2_AMP = 0.12;
export const FOLD_AMP_MOD_BASE = 0.6;
export const FOLD_AMP_MOD_SCALE = 0.4;
export const FOLD_AMP_MOD2_BASE = 0.5;
export const FOLD_AMP_MOD2_SCALE = 0.5;
export const FOLD_SECONDARY_ALONG = 0.85;
export const FOLD_SECONDARY_CROSS = 0.15;
export const FOLD_SECONDARY_AMP = 0.18;
export const FOLD_NOISE_MAG_SCALE = 0.8;
export const FOLD_ELEV_THRESHOLD = 0.05;
export const FOLD_ELEV_SCALE = 4;
export const FOLD_ELEV_BOOST_OFFSET = 0.03;
export const FOLD_ELEV_BOOST_SCALE = 6;
export const FOLD_SF_SUPPRESS = 1.5;
export const FOLD_FREQ_MULT_SCALE = 1.5;

// ── Basins & Rifts ──
export const RIFT_HALF_WIDTH_BASE = 4;
export const RIFT_FLOOR_MULT = 1.5;
export const RIFT_SHOULDER_MULT = 2.5;
export const RIFT_AXIS_DEPTH = -0.15;
export const RIFT_AXIS_VOLCANIC_AMP = 0.04;
export const RIFT_FLOOR_DEPTH = -0.12;
export const RIFT_FLOOR_TAPER = 0.3;
export const RIFT_FLOOR_VOLCANIC_AMP = 0.03;
export const RIFT_SHOULDER_UPLIFT = 0.03;
export const RIFT_FADEOUT_RESIDUAL = 0.2;

export const BASIN_FREQ = 1.8;
export const BASIN_FACTOR_BIAS = 0.5;
export const BASIN_FACTOR_SCALE = 0.6;
export const FORELAND_STRESS_THRESH = 0.15;
export const FORELAND_WIDTH_FRAC = 0.3;
export const FORELAND_BASIN_DEPTH = 0.05;
export const FORELAND_PEAK_POS = 0.2;
export const FORELAND_BASIN_DEEPENING_BASE = 0.5;
export const FORELAND_BASIN_DEEPENING_SCALE = 0.5;

// ── Back-Arc & Foreland ──
export const BACK_ARC_START_BASE = 2;
export const BACK_ARC_PEAK_BASE = 3;
export const BACK_ARC_END_BASE = 5;
export const BACK_ARC_DEPTH = 0.10;
export const BACK_ARC_SUBDUCT_THRESH = 0.50;

// ── Noise Layering ──
export const WARP_SCALE = 0.4;
export const OROGENIC_FREQ = 1.5;
export const NOISE_ACTIVITY_SCALE = 4;
export const NOISE_BASE_SCALE = 0.25;
export const NOISE_ACTIVITY_CONTRIB = 0.75;
export const PLATEAU_SUPPRESS_MIN = 0.30;
export const PLATEAU_SUPPRESS_SCALE = 0.60;
export const BASIN_AMP_SUPPRESS = 0.7;
export const CRATON_AMP_SUPPRESS = 0.25;
export const RIDGED_NOISE_AMP = 1.5;
export const DETAIL_NOISE_FREQ_MULT = 4;
export const DETAIL_NOISE_AMP = 0.5;
export const FINE_NOISE_FREQ_MULT = 8;
export const FINE_NOISE_AMP = 0.25;
export const OCEAN_NOISE_AMP = 0.3;

// ── Dissection & Summits ──
export const DISSECT_THRESHOLD = 0.10;
export const DISSECT_AMP = 0.55;
export const DISSECT_ELEV_SCALE = 2;
export const SUMMIT_THRESHOLD = 0.65;
export const SUMMIT_STRESS_MIN = 0.05;
export const SUMMIT_SPIKE_OFFSET = 0.45;
export const SUMMIT_STRESS_FLOOR = 0.3;

// ── Interior Elevation ──
export const PLATE_BASE_HEIGHT_MEAN = -0.15;
export const PLATE_BASE_HEIGHT_STDDEV = 0.025;
export const INTERIOR_BASE_SHIELD = 0.14;
export const INTERIOR_BASE_BASIN = 0.04;
export const INTERIOR_TECTONIC = 0.20;
export const COASTAL_DEPRESSION = -0.08;
export const COASTAL_DEPRESSION_BASIN_REDUCE = 0.4;
export const INTERIOR_UPLIFT_RAMP_FRAC = 0.4;
export const INTERIOR_UPLIFT_MOD_AMP = 0.2;
export const INTERIOR_FLOOR = 0.008;
export const PLATEAU_BOOST = 0.04;
export const PLATEAU_START_BASE = 3;
export const MOUNTAIN_BOOST_FRAC = 0.3;
export const FOLD_BELT_MULT = 3;
export const CRATON_TECTONIC_MULT = 2.5;
export const BASIN_TECTONIC_MULT = 2;

// ── Continental Margins ──
export const SHELF_NARROW_BASE = 4;
export const SHELF_WIDE_BASE = 12;
export const SLOPE_WIDTH_BASE = 7;
export const SHELF_DEPTH_START = -0.08;
export const SHELF_DEPTH_RANGE = 0.08;
export const SLOPE_DEPTH_RANGE = 0.19;
export const ABYSS_BASE = -0.35;
export const ABYSS_NOISE_AMP = 0.03;
export const OCEAN_FLOOR_CLAMP = -0.005;

// ── Mid-Ocean Features ──
export const RIDGE_HALF_WIDTH_BASE = 4;
export const RIDGE_UPLIFT_NOISE = 0.12;
export const RIDGE_UPLIFT_BASE = 0.06;
export const FRACTURE_HALF_WIDTH_BASE = 3;
export const FRACTURE_DEPTH = 0.03;
export const TRENCH_BASE_DEPTH = 0.15;
export const TRENCH_STRESS_DEPTH = 0.15;

// ── Coastal Roughening ──
export const COAST_ROUGHEN_BASE = 8;
export const COAST_PASSIVE_FREQ = 6;
export const COAST_ACTIVE_FREQ = 9;
export const COAST_PASSIVE_AMP = 0.08;
export const COAST_ACTIVE_AMP = 0.12;
export const COAST_WARP_PASSIVE_REACH = 1.2;
export const COAST_WARP_ACTIVE_REACH = 1.5;
export const COAST_WARP_AMT = 0.35;
export const COAST_SUBDUCT_SUP_LOW = 0.45;
export const COAST_SUBDUCT_SUP_RANGE = 0.55;

// ── Island Scattering ──
export const ISLAND_DIST_BASE = 4;
export const ISLAND_FREQ = 17.5;
export const ISLAND_THRESHOLD_BASE = 0.25;
export const ISLAND_THRESHOLD_STRESS = 0.2;
export const ISLAND_BUMP_AMP = 0.18;
export const ISLAND_SUBDUCT_MAX = 0.3;

// ── Island Arcs ──
export const ARC_DIST_BASE = 5;
export const ARC_PEAK_DIST_BASE = 1.5;
export const ARC_SIGMA_BASE_VAL = 1.5;
export const ARC_THRESHOLD = 0.30;
export const ARC_UPLIFT_AMP = 0.55;
export const ARC_SUBDUCT_THRESH = 0.45;

// ── Volcanic Features ──
export const VOLC_MIN_SPACING = 0.015;
export const VOLC_SIGMA_BASE = 0.003;
export const VOLC_HEIGHT_BASE = 0.15;
export const VOLC_HEIGHT_VAR_BASE = 0.7;
export const VOLC_HEIGHT_VAR_RANGE = 0.6;
export const VOLC_SIGMA_VAR_BASE = 0.6;
export const VOLC_SIGMA_VAR_RANGE = 0.8;
export const VOLC_SUBDUCT_THRESH = 0.45;

// ── Large Igneous Provinces ──
export const LIP_SIGMA = 0.025;
export const LIP_HEIGHT = 0.04;

// ── Hotspot Chains ──
export const NUM_HOTSPOTS = 5;
export const CHAIN_LENGTH = 6;
export const CHAIN_DECAY = 0.75;
export const CHAIN_SPACING = 0.06;
export const DOME_SIGMA = 0.006;
export const DOME_STRENGTH = 0.60;
export const SWELL_SIGMA_MULT = 2;
export const SWELL_STR_MULT = 0.10;
export const DOME_OCEAN_BOOST = 1.8;
export const DOME_PEAK_THRESH_SIGMA = 5.5;
export const DOME_SWELL_THRESH_SIGMA = 3;
export const DOME_DRIFT_STRETCH = 1.4;
export const DOME_RIFT_BOOST = 0.5;
export const DOME_CALDERA_SIGMA_FRAC = 0.25;
export const DOME_CALDERA_DEPTH_FRAC = 0.20;
export const DOME_CALDERA_STRENGTH_MIN = 0.15;
export const DOME_AGE_BROADENING = 0.06;
export const DOME_SHAPE_WARP_FREQ = 8;
export const DOME_SHAPE_WARP_AMP = 0.4;
export const DOME_SHAPE_WARP_DETAIL_FREQ = 20;
export const DOME_SHAPE_WARP_DETAIL_AMP = 0.40;
export const DOME_TEXTURE_BASE_WEIGHT = 0.7;
export const DOME_TEXTURE_DETAIL_WEIGHT = 0.3;
export const DOME_TEXTURE_ACTIVE_MIN = 0.4;
export const DOME_TEXTURE_ACTIVE_MAX = 1.2;
export const DOME_TEXTURE_AGE_MIN_SHIFT = 0.3;
export const DOME_TEXTURE_AGE_MAX_SHIFT = 0.2;

// ── Hypsometry & Isostasy ──
export const PEAK_COMPRESS_POWER = 0.90;
export const ISOSTATIC_K = 0.07;
export const HYPS_BLEND = 0.40;
export const HYPS_LOW_BREAK = 0.60;
export const HYPS_MID_BREAK = 0.85;
export const HYPS_LOW_ELEV_FRAC = 0.25;
export const HYPS_MID_ELEV_FRAC = 0.35;
export const HYPS_HIGH_POWER = 0.7;
export const FILL_LEVEL = 0.005;

// ── Passive Margin Coastal Plain ──
export const PLAIN_TARGET = 0.02;
export const PLAIN_SUPPRESSION_STRENGTH = 0.6;

// ── Domain Warp (terrain-post.js) ──
export const WARP_FREQ = 4;
export const WARP_OCTAVES = 5;
export const WARP_MAX_AMP_MULT = 0.12;
export const WARP_BIAS_BASE = 0.25;
export const WARP_BIAS_STRENGTH_SCALE = 0.5;
export const WARP_HOTSPOT_DAMPEN = 0.8;

// ── Smoothing (terrain-post.js) ──
export const SMOOTH_EDGE_SENSITIVITY = 8;

// ── Glacial Erosion (terrain-post.js) ──
export const GLACIAL_LAT_DIVISOR = 4.5;
export const GLACIAL_ELEV_LOW = 0.5;
export const GLACIAL_ELEV_HIGH = 0.9;
export const GLACIAL_ELEV_FACTOR_SCALE = 0.3;
export const GLACIAL_ELEV_FACTOR_LAT_BASE = 0.3;
export const GLACIAL_ELEV_FACTOR_LAT_SCALE = 0.7;
export const GLACIAL_CARVE_RATE = 0.02;
export const GLACIAL_CONVERGENCE_BONUS = 0.01;
export const GLACIAL_DEPOSIT_AMOUNT = 0.005;
export const GLACIAL_FJORD_CARVE = 0.015;
export const GLACIAL_FLOW_THRESHOLD = 0.1;
export const GLACIAL_FJORD_THRESHOLD = 0.5;
export const GLACIAL_WIDENING_FRAC = 0.4;
export const GLACIAL_TERMINUS_RATIO = 0.3;
export const GLACIAL_FJORD_ICE_MIN = 0.2;
export const GLACIAL_POST_SMOOTH = 0.3;
export const GLACIAL_MID_FLOOD_FRAC = 0.75;
export const GLACIAL_MID_FLOOD_CARVE = 0.85;
export const GLACIAL_INITIAL_CARVE = 0.5;

// ── Hydraulic Erosion (terrain-post.js) ──
export const HYDRAULIC_DEPOSIT_FRAC = 0.5;
export const HYDRAULIC_SLOPE_SENSITIVITY = 50;

// ── Thermal Erosion (terrain-post.js) ──
export const THERMAL_TRANSFER_FRAC = 0.5;

// ── Ridge Sharpening (terrain-post.js) ──
export const RIDGE_SHARPEN_CAP = 1.5;
export const VALLEY_DEEPEN_FACTOR = 0.4;
export const VALLEY_FLOOR_FRAC = 0.5;
export const VALLEY_FLOOR_MIN = 0.001;

// ── Priority Flood (terrain-post.js) ──
export const FLOOD_NOISE_AMP = 0.01;
export const FLOOD_CARVE_RADIUS_FRAC = 0.3;

// ── Plate Generation ──
export const PLATE_LOW_PLATE_T_HIGH = 80;
export const PLATE_LOW_PLATE_T_RANGE = 60;
export const PLATE_RATE_MIN_BASE = 0.7;
export const PLATE_RATE_MIN_LOW_T = 0.4;
export const PLATE_RATE_RANGE_BASE = 2.3;
export const PLATE_RATE_RANGE_LOW_T = 2.4;
export const PLATE_DIR_BASE_BASE = 0.15;
export const PLATE_DIR_BASE_LOW_T = 0.25;
export const PLATE_DIR_SCALE_BASE = 0.25;
export const PLATE_DIR_SCALE_LOW_T = 0.25;
export const PLATE_DIR_STRENGTH_CAP = 0.85;
export const PLATE_COMPACT_BASE = 0.3;
export const PLATE_COMPACT_LOW_T = 0.22;
export const PLATE_AREA_GOVERNOR_BASE = 2.0;
export const PLATE_AREA_GOVERNOR_LOW_T = 2.0;
export const PLATE_COMPACT_THRESHOLD_MULT = 1.8;
export const PLATE_COMPACT_PENALTY_MULT = 4;
export const PLATE_OMEGA_MIN = 0.5;
export const PLATE_OMEGA_RANGE = 1.5;
export const PLATE_SMOOTH_BASE = 3;
export const PLATE_SMOOTH_LOW_T = 2;
export const PLATE_SMOOTH_FIRST_THRESH = 0.4;
export const PLATE_SMOOTH_LATER_THRESH = 0.5;

// ── Coarse Projection ──
export const N_COARSE = 20000;
export const COARSE_JITTER = 0.75;
export const COARSE_PERTURB_BASE = 1.5;
export const COARSE_PERTURB_LOW_T = 1.0;
export const COARSE_FBM_BASE_FREQ = 8;
export const COARSE_FBM_OCTAVES = 4;
export const COARSE_FBM_DECAY = 0.5;
export const COARSE_FBM_FREQ_MULT = 2;
