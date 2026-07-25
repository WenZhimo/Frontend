# Current Rolling Goal

## Auto-Continue State

```yaml
autoContinueEnabled: true
maxAutoRounds: 5
completedAutoRounds: 0
```

`.agent/*` files are local execution notes by default. Do not commit or push `.agent/*` unless the user explicitly asks for that.

## Workspace

- Path: `D:\盒子\HTML\等高线地形图`
- Project type: small static browser demo for rendering a 3D contour terrain map.
- Git root: `D:\盒子\HTML`

## Current Baseline

- Initialized rolling target execution files only.
- Business code has not been changed as part of this initialization.
- Existing project rules are in `AGENTS.md`.
- There is no package manager, build step, or automated test framework yet.

## Last Completed Slice

- Rolling target execution mode initialized.
- Created stable protocol, mutable goal file, and reusable startup prompt.

## Must Remain Unchanged

- Existing user uncommitted changes.
- Existing runtime files: `index.html`, `TerrainDataGenerator.js`, and `ContourVisualizer.js`, unless a future goal explicitly targets them.
- Existing documentation and research notes, unless a future goal explicitly targets them.
- Public API, data contracts, save formats, user data paths, and release flows, unless explicitly authorized.
- `.agent/*` must not be committed or pushed by default.

## Read Before Starting

- `AGENTS.md`
- `.agent/rolling-protocol.md`
- `.agent/current-goal.md`
- Relevant source files for the next minimal slice.

## Next Round Goal

等待用户填入长期目标或下一轮最小切片。

## Goal Explanation

No long-term goal has been supplied yet. The next active assistant should wait for the user to define the desired objective or replace the placeholder above with one minimal, complete, reversible slice.

## Deliverables

- To be filled by the user or the next round before implementation starts.

## Do Not Implement

- Do not execute long-term goals until the user fills in a real goal.
- Do not modify business code during initialization-only work.
- Do not submit commits or pushes unless explicitly authorized.
- Do not commit or push `.agent/*` by default.

## Tests To Cover

- To be filled once a concrete goal exists.
- Prefer deterministic terrain-generation checks for logic changes.
- Prefer browser smoke checks for WebGL/rendering changes.

## Verification Gate

Default gate:

```powershell
git status -sb
node --check TerrainDataGenerator.js
node --check ContourVisualizer.js
```

If rendering behavior changes, also run:

```powershell
python -m http.server 8000
```

Then manually verify `http://localhost:8000/index.html` in a browser.

## Stop And Ask If

- The next step would modify public APIs, data contracts, save formats, user data paths, or release flows.
- The next step would delete existing features, documentation, tests, or user data.
- Needed files contain user uncommitted changes that would be overwritten or mixed with the slice.
- The goal is too broad to complete as one minimal reversible slice.
- Verification fails for reasons outside the current slice.
- Required browser, GPU, network, or dependency access is unavailable.
- `completedAutoRounds` reaches `maxAutoRounds`.

## Completion Instructions

At the end of each round:

- Summarize the slice completed.
- Record files changed.
- Record verification commands and outcomes.
- Increment `completedAutoRounds` by 1 only after a completed implementation round.
- Update `Last Completed Slice` and `Next Round Goal`.
- Leave `.agent/*` unstaged, uncommitted, and unpushed unless explicitly instructed otherwise.
- Stop when `completedAutoRounds` reaches `maxAutoRounds`.
