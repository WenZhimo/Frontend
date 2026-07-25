# Repository Guidelines

## Project Structure & Module Organization

This repository is a small static browser demo for rendering a 3D contour terrain map.

- `index.html` is the entry point. It loads CDN dependencies, creates the terrain generator, and starts the visualizer.
- `TerrainDataGenerator.js` contains seeded height-field generation using Simplex noise.
- `ContourVisualizer.js` contains the Three.js scene, camera, shader material, contour rendering, resize handling, and orbit controls.

There is no `src/`, `tests/`, or build output directory yet. Keep runtime files at the root; place future media under `assets/`.

## Build, Test, and Development Commands

No package manager or build step is required. Use a local static server so browser security rules and CDN loading behave consistently.

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000/index.html`.

Useful checks:

```powershell
git status --short
```

Shows pending changes before committing.

```powershell
git log --oneline -5
```

Reviews recent commit style and project direction.

## Coding Style & Naming Conventions

Use plain browser JavaScript with classes and no transpilation. Follow the existing four-space indentation style. Use `PascalCase` for classes and `camelCase` for methods, variables, and option names such as `calculateStats`, `roughness`, and `colorArray`.

Keep rendering logic in `ContourVisualizer.js` and terrain/noise logic in `TerrainDataGenerator.js`. Keep demo wiring in `index.html`.

## Testing Guidelines

There is no automated test framework yet. For changes, run the local server and manually verify that:

- the scene loads without console errors;
- orbit controls rotate and pan correctly;
- resizing the browser updates the canvas;
- contour density, thickness, seed, roughness, amplitude, and color options still affect rendering.

If adding automated tests later, prefer unit tests for deterministic terrain generation and browser smoke tests for WebGL rendering.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit-style prefixes, including `chore:`, `perf:`, and `docs:`. Continue that pattern, for example `docs: add contributor guide` or `perf: reduce terrain mesh allocations`.

Pull requests should include a short summary, manual test notes, and screenshots or recordings for visual rendering changes. Mention CDN dependency changes and confirm browser GPU/WebGL checks.

## Security & Configuration Tips

This demo depends on external CDN scripts. When changing dependency URLs, pin exact versions and test offline failure behavior where relevant. Do not commit generated media, local preview files, or unrelated assets from neighboring directories.
