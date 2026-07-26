# Current Rolling Goal

## Auto-Continue State

```yaml
autoContinueEnabled: true
maxAutoRounds: 20
completedAutoRounds: 0
pauseAfterEachSlice: false
commitAgentFiles: false
pushAgentFiles: false
```

`.agent/*` files are local execution notes by default. Do not stage, commit, or push `.agent/*` unless the user explicitly asks for that.

## Workspace

- Path: `D:\盒子\HTML\等高线地形图`
- Project type: small static browser demo for rendering a 3D contour terrain map.
- Git root: `D:\盒子\HTML`

## Current Baseline

- Phase A first slice is complete in `TerrainDataGenerator.js`.
- Phase B first slice is complete in `TerrainDataGenerator.js`.
- Phase C heightmap caching is complete in `TerrainDataGenerator.js`.
- Phase D thermal erosion helper scaffolding is complete in `TerrainDataGenerator.js`.
- Phase D live thermal erosion is complete in `TerrainDataGenerator.js`.
- Phase E internal slope-map scaffolding is complete in `TerrainDataGenerator.js`.
- Phase E internal bilinear slope sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal normalized slope sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal slope-band sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal derived-terrain sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal normalized height sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal derived-terrain normalized height bundling is complete in `TerrainDataGenerator.js`.
- Phase E internal elevation band sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal derived-terrain elevation band bundling is complete in `TerrainDataGenerator.js`.
- Phase E internal terrain zone sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal derived-terrain terrain zone bundling is complete in `TerrainDataGenerator.js`.
- Phase E internal rock exposure sampling is complete in `TerrainDataGenerator.js`.
- Phase E internal derived-terrain rock exposure bundling is complete in `TerrainDataGenerator.js`.
- Phase E internal surface class sampling is complete in `TerrainDataGenerator.js`.
- Terrain generation keeps the existing public API while using layered helper methods, local domain warping, cached heightmap sampling, conservative thermal erosion, and internal slope derived data on the live heightmap cache.
- `getHeight(u, v)` reads the eroded internal heightmap cache with bilinear interpolation.
- The internal heightmap cache now carries `min`, `max`, `slopeMap`, `slopeMin`, and `slopeMax`; private helpers can sample raw height, normalized height, elevation bands, raw slope, normalized slope, slope bands, terrain zones, rock exposure, surface classes, and a bundled derived terrain sample with normalized height, elevation band, terrain zone, and rock exposure, but rendering and UI do not use derived maps yet.
- Existing project rules are in `AGENTS.md`.
- The project currently uses `index.html`, `TerrainDataGenerator.js`, and `ContourVisualizer.js` at the workspace root.
- There is no package manager, build step, or automated test framework yet.
- Before implementation, rerun `git status -sb`; protect all user uncommitted changes, including any unresolved conflicts outside this workspace.

## Last Completed Slice

- Added private `_sampleSurfaceClassCache(u, v, segments = 200)`.
- Reused elevation band, slope band, and rock exposure samplers rather than duplicating formulas.
- Returned a finite integer surface class in the documented `0..7` range.
- Kept surface class internal and unused by shader/material/color output.
- Verified surface class sampling does not mutate cached height or slope arrays.
- Verified syntax, browser load, nonblank render, resize, OrbitControls rotate/pan, and seed/roughness/amplitude/density/thickness/color behavior.

## Must Remain Unchanged

- All user uncommitted changes unless the user explicitly authorizes touching them.
- Files outside `D:\盒子\HTML\等高线地形图`.
- Public API of `TerrainDataGenerator`: `constructor`, `getHeight(u, v)`, `calculateStats()`, and `updateConfig()`.
- Demo wiring in `index.html`, renderer/shader behavior in `ContourVisualizer.js`, CDN dependencies, and release/deployment flow during the next slice.
- Existing documentation, tests, user data, generated media, save formats, and user data paths.
- `.agent/*` must not be staged, committed, or pushed by default.

## Read Before Starting

- `AGENTS.md`
- `.agent/rolling-protocol.md`
- `.agent/current-goal.md`
- `真实地形生成技术调�?md`, especially sections 5-8.
- `TerrainDataGenerator.js`
- Only read `index.html` and `ContourVisualizer.js` if needed to verify compatibility; do not edit them in the next slice.

## Long-Term Goal

Based on `真实地形生成技术调�?md`, gradually make terrain generation more natural by evolving the current simple two-layer Simplex noise into a layered terrain pipeline: macro landform control, mountain and valley masks, domain warping, ridged fBm mountain ridges, heightmap caching, lightweight erosion, and later slope/flow/deposition-driven visual refinement. Preserve the static browser demo's simplicity and real-time feel while making the terrain stop looking like uniform random noise.

## Short-Term Phased Goals

1. Phase A / P0: Keep the current architecture and upgrade only `TerrainDataGenerator.js` height synthesis. Preserve existing public API. Add internal helpers such as `fbm()`, `ridged()`, `smoothstep()`, and `warp2D()`. Combine continent, mountainMask, ridgedMountains, valleyMask, hills, and detail into the returned height.
2. Phase B / P0: Add domain warping, initially applied only to mountain and valley sampling so broad continent edges are not over-distorted.
3. Phase C / P1: Introduce heightmap caching so future erosion can run on a grid and Three.js mesh sampling can read from cached heights.
4. Phase D / P1: Add lightweight thermal erosion before attempting full hydraulic erosion.
5. Phase E / P2: Add slope, flow, or deposition derived maps and use them for more natural visual styling.
6. Phase F / P2+: Explore particle hydraulic erosion, river basin generation, DEM mixing, or ML-assisted terrain only after explicit user authorization.

## Next Round Goal

Paused: `completedAutoRounds` has been reset to `0`. Wait for explicit user confirmation before starting another implementation slice.

## Goal Explanation

The rolling execution counter has been reset after completing the internal surface class sampler. The next action remains an intentional stop point so the user can review the accumulated terrain-generation changes before authorizing additional rounds.

## Deliverables

- No further implementation deliverables are authorized until the user confirms continuation.
- Leave `.agent/*` unstaged, uncommitted, and unpushed unless explicitly instructed otherwise.
- Preserve the current public API and rendering behavior while paused.

## Do Not Implement

- Do not implement hydraulic erosion in the next slice.
- Do not add new public options or change public APIs in the next slice.
- Do not change shader coloring or contour rendering in the next slice.
- Do not change UI controls, CDN URLs, or demo wiring in the next slice.
- Do not use slope, flow, deposition, normalized height, elevation bands, terrain zones, or rock exposure in rendering yet.
- Do not add flow or deposition maps in the next slice.
- Do not introduce a package manager, build step, test framework, or new dependency in the next slice.
- Do not change data contracts, save formats, user data paths, or release flow.
- Do not delete existing features, documentation, tests, or user data.

## Tests To Cover

- JavaScript syntax remains valid for `TerrainDataGenerator.js`.
- JavaScript syntax remains valid for `ContourVisualizer.js`.
- If continuation is authorized, JavaScript syntax should remain valid for `TerrainDataGenerator.js` and `ContourVisualizer.js`.
- Existing browser demo should continue to load and use the same public API.
- Any future internal sampler should not mutate cached heights or slope values.
- `getHeight(u, v)` should remain unchanged and continue to sample the height cache.
- `seed`, `roughness`, `amplitude`, contour density, contour thickness, and color options should remain effective.

## Verification Gate

Required commands:

```powershell
git status -sb
node --check TerrainDataGenerator.js
node --check ContourVisualizer.js
```

Required manual check for terrain behavior:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/index.html` and verify:

- the scene loads without console errors;
- orbit controls rotate and pan correctly;
- resizing the browser updates the canvas;
- seed, roughness, amplitude, contour density, contour thickness, and color options still affect rendering;
- terrain appears less uniformly random than the previous two-layer noise.

If browser/GPU verification cannot be performed, stop and report that limitation instead of claiming visual verification.

## Stop And Ask If

- `git status -sb` shows user changes overlapping with files needed for the slice.
- Repository conflicts, staged files, or user changes make it unsafe to edit `TerrainDataGenerator.js`.
- Completing the slice would require editing `index.html`, `ContourVisualizer.js`, shader code, CDN dependencies, or release flow.
- The change would alter public APIs, data contracts, save formats, user data paths, or published behavior beyond terrain shape.
- The slice expands into flow/deposition maps, rendering changes, UI changes, or broader refactoring.
- Verification fails for a reason that is not local, obvious, and reversible.
- `completedAutoRounds` reaches `maxAutoRounds`.
- The user asks to pause after every small slice.

## Completion Instructions

At the end of each round:

- Summarize the completed slice in at most 6 short bullets under `Last Completed Slice`.
- Update `Current Baseline`, `Next Round Goal`, `Verification Gate`, and `Stop And Ask If` so this file controls the next round.
- Increment `completedAutoRounds` by 1 only after a completed implementation round.
- Keep this file as current-state control, not a full chronological log.
- Write full history only to a formal document or execution log if the user explicitly asks.
- Leave `.agent/*` unstaged, uncommitted, and unpushed unless explicitly instructed otherwise.
- Stop when `completedAutoRounds` reaches `maxAutoRounds`.
