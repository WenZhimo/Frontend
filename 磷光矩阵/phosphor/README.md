# Phosphor Renderer

Reusable phosphor display renderer for the `磷光矩阵` project.

The renderer follows the project specifications:

- `磷光矩阵视觉规范.md`
- `磷光矩阵技术实施规格.md`

The demo page only initializes the renderer and exposes a few controls. Rendering logic lives under `phosphor/renderer`.

## Public API

```js
import { PhosphorRenderer } from "./phosphor/renderer/phosphor-renderer.js";

const renderer = new PhosphorRenderer({
  target: document.querySelector("[data-shader-target='page']"),
  mount: document.querySelector("[data-shader-mount]"),
  backend: "auto",
});

renderer.start();
renderer.stop();
renderer.updateConfig({ matrixPitch: 6 });
renderer.setQuality("medium");
renderer.destroy();
```

## Configuration

Important public parameters:

- `target`: DOM element used as the visual source.
- `mount`: canvas used as the phosphor display surface.
- `backend`: `auto`, `webgl2`, or `canvas2d`. `auto` prefers WebGL2 and falls back to Canvas 2D.
- `quality`: `low`, `medium`, or `high`.
- `matrixPitch`: spacing between phosphor cells.
- `cellFillRatio`: emitted area inside each matrix cell.
- `coreIntensity`: white-blue core strength.
- `bloomRadius`: optical bloom radius.
- `bloomStrength`: optical bloom strength.
- `diffusionStrength`: lens diffusion amount.
- `blackLevel`: dark display floor.
- `noiseAmount`: low-light camera noise.
- `motionMode`: `static`, `realtime`, or `powerSave`.
- `accessibilityMode`: currently `preserveDom`.

## Module Traceability

| Module | Visual requirement | Implementation spec section |
| --- | --- | --- |
| `display-surface.js` | Display surface, accessibility-preserving overlay | DisplaySurface |
| `source-sampler.js` | Visual content rasterization | SourceSampler |
| `webgl/webgl-pipeline.js` | WebGL2 source texture, matrix/emission, bloom, and compose passes | WebGL backend |
| `webgl/shader-sources.js` | Centralized WebGL shader source | Shader programs |
| `webgl/gl-utils.js` | WebGL resources and lifecycle helpers | WebGL resources |
| `pixel-matrix.js` | Square pixel matrix reconstruction | PixelMatrix |
| `emission.js` | Independent phosphor emission | CellRenderer, GlowEmitter |
| `bloom.js` | Optical bloom from emitting cells | BloomRenderer |
| `lens.js` | Lens diffusion and dark display composition | LensDiffusion |
| `texture.js` | Display texture, matrix memory, light noise | DisplayTexture, NoiseGenerator |
| `phosphor-pipeline.js` | Ordered rendering stages | Rendering model |
| `phosphor-renderer.js` | Public renderer lifecycle and API | Public API |

## Rendering Backends

- `webgl2`: primary backend. Source sampling still happens on the CPU because browsers do not expose a direct DOM-to-GPU texture for arbitrary page content. Matrix quantization, phosphor emission, bloom, lens diffusion, noise, and final composition are GPU passes.
- `canvas2d`: fallback backend for browsers or devices without WebGL2.

## Current Limitations

- DOM source texture generation is still an approximation based on visible layout, text, media, and canvas sources. Browser security rules may prevent exact pixel reads for some media.
- The renderer preserves DOM accessibility by drawing an `aria-hidden` visual layer. It does not replace the page with canvas content.
- The implementation intentionally does not include CRT curvature, RGB channel separation, VHS artifacts, heavy scanlines, or green-terminal styling.
