# Technical notes

This document explains how *Open CD Case* builds its image. It is intentionally
written as a companion to the source, not as a line-by-line description. Every
claim below maps to a file in `src/` or `src/shaders/`.

The project is an **independent implementation**. It studies the public material
behaviour of a CD jewel case — clear rounded edges, a white cyclorama, a radial
grating, a thin printed label — and rebuilds it with its own geometry, shaders,
pipeline and assets. No code or album artwork from the reference study is
redistributed.

---

## 1. The shape of the problem

A transparent jewel case is hard for the same three reasons every time:

1. **Sorting.** A closed transparent mesh has front and back surfaces; a lid,
   a tray and a disc overlap in depth. Sorting triangles is not enough.
2. **Thickness.** A ray entering the plastic needs to know how far it travels
   inside, and which surface it leaves through.
3. **Multiple reflections.** At a grazing angle, the plastic becomes a mirror and
   the light bounces between walls before it reaches the eye.

The implementation avoids a general transparent-volume solution by splitting the
case into two optical roles:

| Role | Geometry | Rendering | Why |
| --- | --- | --- | --- |
| **Rods** | Rounded frames, hub rings, hinge, clips | Opaque draw; analytic refraction inside the fragment shader | A rounded cross-section is a lens. It produces the bright/dark edge lines with no sorting. |
| **Sheets** | Lid window, tray back | Transparent premultiplied reflection/attenuation | A thin flat shell only needs Fresnel and a little absorption. |

This is the central design decision. It is also why the shader can afford to
trace a few refracted rays per pixel: only the rods pay for it, and the rods
cover a small part of the frame.

---

## 2. Scale, camera and coordinates

- One world unit is roughly one millimetre. The case is **146 × 146** with an
  **8** corner radius.
- The disc is **r = 60**, **1.2** thick; the hole starts at **7.5**.
- The lid hinge is at **x = -72, z = 4**. The lid frame is a child of a pivot at
  that point, with an inverse translation so the closed lid is at the origin:

```js
lidPivot.position.set(-72, 0, 4);
lidContent.position.set(72, 0, -4);
lidPivot.rotation.y = -open * 3.05; // about 175 degrees
```

- The camera is a 28° vertical-perspective camera at `z ≈ 380–500`, fitted to the
  viewport. The case is shifted right as it opens, so the lid stays in frame.
- The canvas is a full-screen quad. The actual 3D scene is rendered into
  off-screen render targets, then resolved by a full-screen pass. This is what
  makes the star extraction possible.

The case transform is a plain `Object3D` matrix (yaw / pitch / roll + a small
idle sine). The plastic root and the disc root copy that matrix manually; the lid
keeps its own local rotation around the hinge.

---

## 3. Sweeping the rounded frame

`src/geometry.js` contains a small sweep builder:

1. **Outline.** `roundedRectPath(half, radius, segments)` produces a CCW
   rounded-square outline. For every point, the tangent is computed from its
   neighbours; the outward side is `(ty, -tx)`.
2. **Cross-section.** `roundedProfile(hw, hh, rc)` produces a rounded-rectangle
   profile in `(side, z)` with smooth radial normals at the corners.
3. **Sweep.** For each outline point, the profile is placed along the outward
   side; rings are connected with quads. A closed path wraps; an open path gets
   two cap fans.
4. **Attributes.** Each vertex carries what the rod shader needs to reconstruct
   the local cross-section:
   - `aCenter` — the centre of the cross-section;
   - `aSide` — the outward 2D direction;
   - `aHalf` — `(hw, hh)`;
   - `aRadius` — the corner radius;
   - `aCap` — whether this is a flat end.

The mesh normal is only used for the *entry* surface and for shading; the exit
surface is solved analytically in the fragment shader. The material is
double-sided so a winding mistake cannot make a rod disappear.

The frame is a loop at `half = 73 - 3.3`, radius `8 - 3.3`, with profile
`(3.3, 3.1, r = 2.8)`. The lid uses a thinner frame. The hub is a circular sweep;
the four spindle teeth are short open sweeps with caps.

Plates use `ShapeGeometry` for triangulation, then two copies of the vertices at
`z0` and `z1`, with `±Z` normals and an `aThick` attribute. They deliberately
have **no side walls**: the rounded frame covers the rim. This is a visual
shortcut, and it is why the sheets are cheap.

---

## 4. The plastic shaders

### 4.1 Studio environment

`src/shaders/room.js` bakes a **512² × 6** cube map once. Each texel is
supersampled by a 4×4 grid, so the map is effectively 16 samples per texel.

The room is a function of direction, not an image:

```glsl
vec2 p = dir.xy / max(abs(dir.z), 0.08);

// behind the object: grey wall, white cyclorama, black flags, hot strips
// in front of the object: dim room, softboxes, black flags
```

The important values are relative:

| Element | Linear value |
| --- | ---: |
| dim ambient | 0.018–0.026 |
| grey wall | 0.09–0.10 |
| hot centre | 0.72 |
| strip lights | 2.2–2.9 |
| softboxes | 10–20 |
| pin lights (alpha channel) | 9000 |
| white paper | 1.0 |

A white piece of paper is 1.0. A strip light is ~20× brighter. The pin lights are
9000× brighter. This HDR ratio is what allows a 5% Fresnel reflection to still
produce a white highlight. The cube map's alpha stores the pin-light share; the
star pass later uses it.

The resolution is deliberately modest. The plastic only needs a few sharp
shapes: a white disc, a handful of black bars and a few bright strips. A 512 map
with mipmaps is enough, and it keeps the first frame cheap.

### 4.2 Rod transmission

The material is `src/shaders/rod.js`. Its core is `traceRod()`:

```glsl
vec3 dir = refract(I, N, 1.0 / uIor);   // enter
vec3 pos = P - N * 0.002;

for (int i = 0; i < 3; i++) {
  vec2 q  = clamp(vec2(dot(pos - vCenter, vSide),
                       dot(pos - vCenter, vAxis)), -b, b);
  vec2 d2 = vec2(dot(dir, vSide), dot(dir, vAxis));
  vec3 e  = roundedExit(q, d2, b, r);   // distance + normal
  pos += dir * e.x;
  ...
  vec3 outDir = refract(dir, -Ne, uIor);
  bool trapped = dot(outDir, outDir) < 1e-6;
  float F = trapped ? 1.0 : schlick(abs(dot(outDir, Ne)), uIor);
  ...
  dir = reflect(dir, Ne);              // stay inside and bounce
}
```

`roundedExit()` is the analytic part:

- Intersect the 2D ray with the four walls of the rounded rectangle.
- If the hit is in a corner, solve the ray/circle quadratic and return the
  circle's outward normal.
- If the ray is nearly parallel to the rod axis, fall back to the end normal.

Each exit evaluates a Fresnel term and an exponential absorption
`exp(-σ · path)`. The weighted radiance is accumulated. After three exits the
remaining energy is approximated with a dim environment leak. This is not a
physically complete path tracer, but for a jewel case the visible energy after
three bounces is small.

#### Where the environment comes from

The exit direction is looked up in the cube map. If it points toward the back of
the screen, the shader also samples the already-rendered opaque scene — the disc
and the paper — at the projected screen position:

```glsl
float bend = acos(clamp(dot(dir, normalize(pos)), -1.0, 1.0));
float w = 1.0 - smoothstep(0.04 - spread, 0.16 + spread, bend);
vec2 uv = projectToScreen(pos + dir * uDepth);
vec4 seen = textureLod(uBehind, clamp(uv, 0.001, 0.999), 0.0);
```

The screen-space sample is a deliberate approximation. A ray that bends too far
would miss the page, so it is faded into the studio. When the page is visible, it
is mixed at only 25% — a clear plastic edge in a real photograph usually shows
the dark studio flags rather than a flat white page.

The UV footprint is used to pick a mip level manually. The angular derivative
across a rod is much larger than along it; letting the GPU choose a single
isotropic LOD would blur too much across the edge.

#### Why the rods read as plastic

- The cross-section is a **rounded rectangle**, not a cylinder. It has flat walls
  and four small corner lenses.
- The environment contains **thin bright strips** and **black flags**, so the
  refracted image is a set of lines rather than a uniform white.
- The shader keeps the **screen-space disc** visible through the plastic, so the
  album art is bent, not replaced by the studio.
- The star channel keeps the smallest, brightest pin lights alive.

### 4.3 Thin sheets

`src/shaders/sheet.js` is a two-surface Fresnel approximation:

```glsl
float F    = schlick(cosv, uIor);
float Fall = F + (1.0 - F) * (1.0 - F) * F;
float takes = clamp(max(Fall - Fall0, 0.0)
                  + Fall0 * 0.05
                  + absorbed * 0.5, 0.0, 1.0);
```

`takes` is the fraction of the background the sheet hides. The material uses
custom premultiplied blending:

- colour: `ONE, ONE_MINUS_SRC_ALPHA`;
- alpha: `ZERO, ONE` (preserve the destination alpha, which stores the
  scene-semantic channel).

The planar reflection is clamped to a maximum of 0.1. A large softbox reflected
in a flat window would otherwise turn the whole sheet white and hide the disc.
The large bright reflection is left to the rounded rods, where it is physically
plausible and visually interesting.

### 4.4 The paper and its shadow

The background is a 4000 × 4000 plane at `z = -70`. Its shader receives the tray
and lid inverse matrices and a light direction. For each fragment it marches
from the paper toward the light, intersects the tray plane (`z=-2`), the disc
plane (`z=-1.8`) and the lid plane (`z=4`) in their local frames, and evaluates a
rounded-box or circle SDF. The result is a soft contact shadow whose strength
depends on the disc's material and the lid's current angle.

No shadow map is used. The lid can swing to any angle and the shadow follows it
for free (apart from three plane intersections).

---

## 5. The disc

### 5.1 Geometry and UVs

`buildDiscGeometry()` makes three faces:

- a printed front annulus at `z = 0`;
- a silver data annulus at `z = -1.2`;
- an outer rim and an inner rim with radial normals.

The mesh is placed at `z = -1.2`; the visible front is then at `-1.2` and the
back at `-2.4`. UVs are planar: `uv = position.xy / 120 + 0.5`. The 1024² cover
therefore maps exactly to a 120-unit disc. Alpha in the cover is a print mask.

The vertex shader also builds a view-space **radial** and **tangent** basis per
vertex. They are used for the grating and anisotropic highlight.

### 5.2 The silver data side

The back face is always a CD's data side:

```glsl
vec3 silver = vec3(0.58, 0.60, 0.64);
vec3 mirror = min(studio(R), vec3(1.8)) * 0.55
            + silver * (0.55 + 0.35 * max(dot(N, KEY_LIGHT), 0.0));

float dataBand = smoothstep(21.5, 23.0, radius)
               * (1.0 - smoothstep(58.2, 58.8, radius));

col = mirror * 0.82 + rainbow * dataBand * 2.8;
```

The inner clear hub, the stacking ring at `r = 16.6`, the clear outer millimetre
and the rim are added with a few `smoothstep`s. A low-amplitude
`sin(radius * 26)` adds a hint of concentric data tracks.

### 5.3 Radial grating

A CD track is a spiral with a pitch of about **1.6 µm**. At screen scale it is
not resolvable, so the shader treats it as a radial reflection grating. The
half-vector between the light and the view is `H = L + V`; its radial component
selects the wavelength, and its tangential component limits the result to a
spoke:

```glsl
float along  = dot(H, vTangent);
float radial = abs(dot(H, vRadial));
float spoke  = exp(-along * along / (spread * spread));
vec3  c      = visibleSpectrum(1600.0 * radial)
             + 0.75 * visibleSpectrum(800.0 * radial)
             + 0.45 * visibleSpectrum(533.3 * radial);
return c * spoke;
```

The three wavelength scales stand in for the first three diffraction orders.
The spectral function is a smooth multi-lobe fit of the visible spectrum; it is
fast and stable, unlike sampling a measured spectrum. Four lights are used:

| Light | Spread | Effect |
| --- | ---: | --- |
| key | 0.050 | crisp spoke |
| strip | 0.045 | second crisp spoke |
| top | 0.060 | top spoke |
| bounce card | 0.160 | broad, soft arc |

The result is a set of coloured spokes through the mirror point — exactly the
structure a CD shows under a strip light.

### 5.4 Gold and vinyl

The gold and vinyl branches use an anisotropic lobe instead of the grating:

```glsl
float grooveLobe(vec3 L, vec3 V, vec3 N, float across, float along) {
  vec3 H = normalize(L + V);
  float hn = max(dot(H, N), 1e-3);
  float ht = dot(H, vTangent) / along;
  float hr = dot(H, vRadial) / across;
  float e = exp(-(ht * ht + hr * hr) / (hn * hn));
  return e / (12.566 * across * along * sqrt(...));
}
```

`along` is small and `across` is large, so the highlight is narrow around the
circle and stretched along the radius. The gold branch multiplies a brushed
gold base by this lobe, then adds the cover's luminance as an engraving mask.
The vinyl branch uses a near-black base, groove masks and four silent gaps at
`r = 30.5, 37.5, 44.5, 51.5`.

### 5.5 Print and lacquer

For the printed branches:

```glsl
float printed = art.a * (1.0 - smoothstep(uPrintOut, uPrintOut + 0.4, radius));
col = mix(col, art.rgb * printLights(N), printed);
col += min(studioGlare(R), vec3(2.5)) * schlick(cosv, 1.5) * printed * 0.9;
```

The print is diffuse-lit by three directional terms and then given a thin clear
lacquer reflection. The lacquer IOR is 1.5, not the plastic's 1.59, and its glare
is clamped so the cover does not blow out.

---

## 6. Render pipeline

`src/scene.js` uses five passes:

1. **Bake the studio cube** (once, and after a context restore).
2. **Opaque pass into `opaqueTarget`:** paper and the current disc. This is the
   image that the plastic will refract.
3. **Opaque + plastic into `plasticTarget`:** the same scene is rendered again
   (so the target has a fresh depth buffer), then the rods and sheets are drawn.
   `plasticTarget` uses 4× MSAA. The rods write `alpha = 2 + spark`; the sheets
   preserve the destination alpha.
4. **Star extraction and blur at half resolution:** the extraction shader reads
   only the alpha channel, finds local maxima, and writes a glow. A separable
   blur with eight offsets per side runs horizontally and vertically. Half resolution is enough
   because the glow is intentionally soft.
5. **Final composite:** sample the plastic target, add the star texture with a
   cool tint, then convert linear → sRGB manually.

Why opaque twice? The plastic shader needs a *stable copy* of the scene behind it
for its screen-space `uBehind` sample. It cannot sample the target it is writing
to. Rendering the opaque scene into the second target costs one extra background
plane and one disc; it removes the need for a ping-pong copy.

The project does **not** implement the original's scissor-rect optimisation or
its ping-pong transparent targets. They are discussed in section 8 below. The simplification is deliberate: it keeps the pipeline readable.

### Alpha as a G-buffer

| Alpha | Meaning |
| --- | --- |
| 0 | paper / empty |
| 2 | a solid object (disc, plastic) |
| > 2 | HDR spill for the star pass |

The star pass reads `alpha - 2`; the plastic's screen-space refraction uses
`clamp(alpha, 0, 1)` to decide whether the pixel behind is paper or an object.

---

## 7. Contacts, controls and performance

- **Pointer:** drag changes yaw/pitch. On release, velocity decays with a spring
  (`-12x` plus damping). A click under 6 px toggles the lid.
- **Open:** `open` is a damped scalar; the lid angle is `open * 3.05`, and the
  case shifts right by `open * 52`.
- **Flip:** the disc's local `rotation.x` goes to π; the same disc geometry's
  back face is then visible. Switching discs resets the flip.
- **Idle:** the case sways by a few degrees; `prefers-reduced-motion` reduces the
  amplitude and disables the automatic first open.
- **DPR:** capped at 2. There is no adaptive resolution yet; this is a good first
  extension (measure median frame time and step the pixel ratio down).
- **Fill cost:** the rod shader is the expensive one: up to three exits per pixel
  on the frame. The sheets are cheap. The star pass is half resolution.

If you need more speed:

1. Add the original's **scissor rect** around the case before the plastic pass.
2. Render the plastic target at 0.75× and upscale.
3. Reduce the rod loop to two exits on low-end devices.
4. Skip the star blur on devices without half-float render targets.

---

## 8. Differences from a production reference

This project is inspired by the public material study, but it is not a port.
The important differences are:

| Topic | Reference study | This project |
| --- | --- | --- |
| Code | Minified production bundle | Readable ES modules, MIT |
| Art | Four specific album covers | Open-license source textures + original composites |
| Plastic sorting | Per-case ping-pong targets, scissor, depth sort | One MSAA plastic target; rods/sheets in a fixed order |
| Rod exits | Up to 4 | Up to 3 + leak |
| Sub-samples | 1 / 2 per pixel | 1 |
| Disc variants | 4 custom art-directed covers | 4 covers with simplified branches |
| Star pass | Local maxima + ring suppression + 10-tap blur | Local maxima + 16-tap separable blur |
| Environment | 512² cube, 4×4 | 512² cube, 4×4 |
| Shadows | Analytic plane intersections | Analytic plane intersections (tray, disc, lid) |
| UI | Next.js page | Plain HTML/CSS/ES modules, no build |

The goal is pedagogical: every important idea is present, but the code favours
clarity over the last 20% of production polish.

---

## 9. Where to change things

- **Colours / light balance:** `src/shaders/common.js` (`studioRoom`, `softBox`,
  `hotBands`, `flagBands`) and `src/shaders/room.js` (`pinLights`).
- **Plastic IOR / absorption:** `createRodMaterial()` and
  `createSheetMaterial()` in `src/materials.js`.
- **Case proportions:** `src/config.js` (`CASE`) and `buildCaseGeometry()`.
- **Disc catalogue:** `src/config.js` (`DISC_CATALOG`) and
  `src/shaders/disc.js`.
- **Star strength:** `uStarStrength` in `createFinalMaterial()`.
- **Covers:** replace `assets/covers/cover-*.webp` and the thumbnails; keep the
  square 1024² format. Run `tools/compose-covers.py` to rebuild from the source
  textures.

---

## 10. References

- A. Zucconi, *Improving the Rainbow* (2015) — spectral fitting approach.
- C. Schlick, *An Inexpensive BRDF Model for Physically-based Rendering* (1994).
- Three.js r160.1 documentation — render targets, cube render targets,
  `ShaderMaterial`, GLSL3 prefix behaviour.
- Public real-time material studies that motivated this re-implementation.
  Attribution for the specific visual reference is kept in the project README;
  no original code or art is included.

Source-texture credits: [assets/CREDITS.md](assets/CREDITS.md).
Three.js license: [vendor/three-LICENSE.txt](vendor/three-LICENSE.txt).
