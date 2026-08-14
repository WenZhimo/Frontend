# Terrain Tuning Session — Findings

## Current Best: v7 (`config-combined-v7.js`)

### All Changes from Original Baseline

```
# Mountain Structure
FOLD_FREQ_PRIMARY:       120 → 160     # tighter fold ridges
FOLD_FREQ_SECONDARY:     300 → 400     # finer secondary folds
FOLD_FREQ_MULT_SCALE:    1.5 → 2.0     # more chaotic fold belts
RIDGE_STRENGTH:          0.12 → 0.15   # taller convergent ridges
DISSECT_THRESHOLD:       0.12 → 0.10   # more mountain valley carving
DISSECT_AMP:             0.4 → 0.55    # deeper dissection valleys
SUMMIT_THRESHOLD:        0.65 → 0.55   # peaks on slightly lower mountains
SUMMIT_STRESS_MIN:       0.05 → 0.03   # peaks with less stress requirement
SUMMIT_SPIKE_OFFSET:     0.45 → 0.40   # more frequent summit spikes
SUMMIT_STRESS_FLOOR:     0.3 → 0.25    # lower stress floor for peaks

# Interior Terrain
INTERIOR_BASE_SHIELD:    0.10 → 0.14   # higher stable cratons
INTERIOR_BASE_BASIN:     0.06 → 0.04   # lower sedimentary basins
INTERIOR_TECTONIC:       0.16 → 0.20   # higher tectonic interiors
PLATEAU_BOOST:           0.025 → 0.04  # more prominent plateaus
CRATON_AMP_SUPPRESS:     0.4 → 0.25    # more texture on stable interiors
BASIN_AMP_SUPPRESS:      0.7 → 0.5     # more texture in basins

# Tectonic Features
RIFT_AXIS_DEPTH:         -0.15 → -0.18 # deeper rift valleys
RIFT_AXIS_VOLCANIC_AMP:  0.04 → 0.06   # more rift volcanism texture
RIFT_SHOULDER_UPLIFT:    0.03 → 0.05   # higher rift shoulders
BACK_ARC_DEPTH:          0.10 → 0.14   # deeper back-arc basins
TRENCH_BASE_DEPTH:       0.15 → 0.20   # deeper ocean trenches
TRENCH_STRESS_DEPTH:     0.15 → 0.20   # more trench variation with stress

# Post-Processing
PEAK_COMPRESS_POWER:     0.85 → 0.90   # less peak compression = taller peaks
WARP_MAX_AMP_MULT:       0.12 → 0.13   # slightly more domain warp
SMOOTH_EDGE_SENSITIVITY: 8 → 12        # more edge preservation in smoothing
RIDGE_SHARPEN_CAP:       1.5 → 2.0     # sharper ridge post-processing
VALLEY_DEEPEN_FACTOR:    0.4 → 0.5     # deeper valley carving
```

### Metrics Comparison: Baseline → Best (v7)

| Metric | Baseline | v7 | Change |
|--------|----------|-----|--------|
| relief_headroom | 0.487 | 0.547 | +12% more dramatic |
| coast_complexity | 27.9 | 28.5 | +2% more complex |
| hypsometry_trough | 0.79 | 0.78 | ~same (good) |
| mountain_boundary_ratio | 0.52 | 0.52 | same |
| land_500m_plus_frac | 0.26 | 0.31 | slightly more highland |
| flat_ocean_plate_land | 0.65 | 0.59 | -9% improved |
| island_count | 286 | 288 | same |
| erosion_slope_corr | 0.46 | 0.46 | same |
| shelf_width_active_km | 293 | 222 | -24% narrower (more realistic) |
| shelf_width_passive_km | 478 | 443 | -7% narrower |

### Visual Improvements (confirmed at 31K and 90K regions)

1. **Mountain ridges** more defined with visible linear structure
2. **Continental interiors** have more elevation variety (craton vs basin contrast)
3. **Rift valleys** more visible as distinct features
4. **Ocean floor** more differentiated (deeper trenches, visible ridges)
5. **Coastlines** slightly more complex
6. **Peaks** more prominent and frequent

## Saved Config Snapshots

All in `tuning/results/`:
- `config-sharper-mountains.js` — fold freq + ridge + dissection only
- `config-sharper-mtn-interior-contrast.js` — + interior contrast
- `config-combined-v2.js` — + peak compress + less craton suppress
- `config-combined-v3-rifts-summits.js` — + rifts + summits
- `config-combined-v4-ocean.js` — + deeper trenches/back-arcs
- `config-combined-v5-warp.js` — + subtle warp boost
- `config-combined-v6-full.js` — + edge preserve + ridge sharpen
- `config-combined-v7.js` — + basin suppress + chaotic folds (**BEST**)

## Key Learnings

1. **Elevation thresholds must use quartic mapping** — elevToHeightKm is t^4-based, so 500m = elev 0.40, not 0.0625
2. **Hypsometric curve blend has minimal effect** — pre-existing distribution dominates
3. **Dissection is the #1 lever** for breaking up blobby mountains into realistic ridges
4. **Stress decay is delicate** — 0.5 original is right; 0.6 spreads too wide
5. **Deeper ocean features improve shelf differentiation** — more room for gradient
6. **Volcanic feature boosts backfire** — more arc uplift = more flat land, not taller islands
7. **Hotspot increases reduce island count** — merging features into fewer larger masses
8. **Interior shield/basin contrast** creates visual variety on continents
9. **Edge sensitivity in smoothing** preserves features that other steps create
10. **Fold frequency boost** is most visible at low detail levels (default view)

## Parameters Still Worth Exploring

- Glacial erosion parameters (only tested at user-slider level, not internal constants)
- Coastal plain width and depression (small effect individually)
- Island arc geometry (ARC_DIST_BASE, ARC_SIGMA_BASE_VAL)
- Super-plate blend weights (SMALL_W, SUPER_W)
- Hydraulic erosion deposit fraction and slope sensitivity
