import * as THREE from './assets/vendor/three.module.js';

const canvas = document.querySelector('#point-canvas');

const screenVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const screenFragmentShader = `
  uniform sampler2D uScene;
  uniform float uDitherAmount;
  uniform vec2 uSceneResolution;
  uniform vec2 uSourceCropScale;
  uniform vec2 uSourceCropOffset;
  uniform float uCameraBlur;
  uniform float uTiltShift;
  uniform float uFocusPosition;
  uniform float uFocusRange;
  varying vec2 vUv;

  float bayer4(vec2 pixel) {
    int x = int(mod(pixel.x, 4.0));
    int y = int(mod(pixel.y, 4.0));
    int index = x + y * 4;
    if (index == 0) return 0.0;
    if (index == 1) return 8.0;
    if (index == 2) return 2.0;
    if (index == 3) return 10.0;
    if (index == 4) return 12.0;
    if (index == 5) return 4.0;
    if (index == 6) return 14.0;
    if (index == 7) return 6.0;
    if (index == 8) return 3.0;
    if (index == 9) return 11.0;
    if (index == 10) return 1.0;
    if (index == 11) return 9.0;
    if (index == 12) return 15.0;
    if (index == 13) return 7.0;
    if (index == 14) return 13.0;
    return 5.0;
  }

  void main() {
    // Resolve one source sample per output block. The low-resolution target
    // and nearest-neighbour sampling make the scene itself pixel art before
    // its monochrome tone is reconstructed.
    vec2 sourcePixel = floor(vUv * uSceneResolution);
    vec2 sourceUv = (sourcePixel + 0.5) / uSceneResolution;
    sourceUv = sourceUv * uSourceCropScale + uSourceCropOffset;
    // A camera blur is resolved before monochrome quantization, so the
    // softened image is still made of square pixels rather than a smooth
    // post-process pasted over the pixel field. Tilt-shift keeps a horizontal
    // focus band sharp and increases the lens blur toward both edges.
    // The UI slider runs from top to bottom, while WebGL UV coordinates run
    // from bottom to top, so invert the displayed position here.
    float focusY = 1.0 - uFocusPosition;
    float outOfFocus = smoothstep(uFocusRange, 0.5, abs(vUv.y - focusY));
    // Tilt-shift uses a wider sampling radius and sheds the sharp center
    // sample faster than the global lens blur. This makes the falloff easy
    // to read even after the result is rebuilt as two-pixel square cells.
    float tiltBlur = clamp(uTiltShift * outOfFocus * 1.35, 0.0, 1.0);
    float blurAmount = clamp(max(uCameraBlur, tiltBlur), 0.0, 1.0);
    float blurRadius = 0.65 + uCameraBlur * 2.8 + tiltBlur * 7.5;
    vec2 sourceTexel = 1.0 / max(uSceneResolution, vec2(1.0));
    vec2 blurStep = sourceTexel * blurRadius / max(uSourceCropScale, vec2(0.02));
    vec4 centerSample = texture2D(uScene, clamp(sourceUv, 0.0, 1.0));
    float centerWeight = mix(4.0, 1.25, tiltBlur);
    vec4 blurredSample = centerSample * centerWeight;
    blurredSample += texture2D(uScene, clamp(sourceUv + vec2( blurStep.x, 0.0), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv + vec2(-blurStep.x, 0.0), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv + vec2(0.0,  blurStep.y), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv + vec2(0.0, -blurStep.y), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv + blurStep * vec2(0.72, 0.72), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv - blurStep * vec2(0.72, 0.72), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv + blurStep * vec2(0.72, -0.72), 0.0, 1.0));
    blurredSample += texture2D(uScene, clamp(sourceUv - blurStep * vec2(0.72, -0.72), 0.0, 1.0));
    blurredSample /= centerWeight + 8.0;
    vec4 source = mix(centerSample, blurredSample, blurAmount);
    if (source.a < 0.02) discard;

    vec3 plateColor = source.rgb / max(source.a, 0.0001);
    float luminance = clamp(dot(plateColor, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    // Spread model lighting across ten stable grayscale levels, reserving
    // ordered dithering for the middle tones between locked black and white.
    float mappedTone = clamp((luminance - 0.06) / 0.45, 0.0, 1.0);
    float darkLock = 1.0 - smoothstep(0.045, 0.11, luminance);
    float lightLock = smoothstep(0.43, 0.56, luminance);
    float midtone = (1.0 - darkLock) * (1.0 - lightLock);
    float levels = 9.0;
    float quantized = mappedTone * levels;
    float lower = floor(quantized) / levels;
    float fraction = fract(quantized);
    vec2 ditherPixel = mod(sourcePixel, 4.0);
    float orderedThreshold = (bayer4(ditherPixel) + 0.5) / 16.0;
    float threshold = mix(0.5, orderedThreshold, uDitherAmount * midtone);
    float toneStep = step(threshold, fraction);
    float value = lower + toneStep * (1.0 / levels);
    value = mix(value, 0.055, darkLock);
    value = mix(value, 0.95, lightLock);
    gl_FragColor = vec4(vec3(value), 1.0);
  }
`;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ditherMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uScene: { value: null },
    uDitherAmount: { value: 0.86 },
    uSceneResolution: { value: new THREE.Vector2(1, 1) },
    uSourceCropScale: { value: new THREE.Vector2(1, 1) },
    uSourceCropOffset: { value: new THREE.Vector2(0, 0) },
    uCameraBlur: { value: 0.0 },
    uTiltShift: { value: 0.0 },
    uFocusPosition: { value: 0.5 },
    uFocusRange: { value: 0.16 },
  },
  vertexShader: screenVertexShader,
  fragmentShader: screenFragmentShader,
  transparent: true,
  depthTest: false,
  depthWrite: false,
});

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Model geometry and lights stay fixed; refresh this map on mount or scene switch.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
const ambientLight = new THREE.AmbientLight(0xffffff, 0.34);
const skyLight = new THREE.HemisphereLight(0xe9e5dc, 0x24262c, 0.72);
const keyLight = new THREE.DirectionalLight(0xfff8eb, 1.45);
keyLight.position.set(-6, 11, 8);
keyLight.target.position.set(0, 1.3, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -44;
keyLight.shadow.camera.right = 44;
keyLight.shadow.camera.top = 18;
keyLight.shadow.camera.bottom = -62;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 180;
keyLight.shadow.camera.updateProjectionMatrix();
keyLight.shadow.bias = -0.00045;
keyLight.shadow.normalBias = 0.025;
keyLight.shadow.radius = 1.5;
const fillLight = new THREE.DirectionalLight(0xdce5f5, 0.28);
fillLight.position.set(7, 5, -8);
scene.add(ambientLight, skyLight, keyLight, keyLight.target, fillLight);
const ditherScene = new THREE.Scene();
const ditherCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const ditherQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMaterial);
ditherScene.add(ditherQuad);
const sceneTarget = new THREE.WebGLRenderTarget(192, 108, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
});
// Use perspective depth so closer geometry projects larger than distant geometry.
const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 220);
const cameraDefaults = {
  bridge: { theta: 0.45, phi: 1.12, distance: 90, zoom: 0.88, target: new THREE.Vector3(0, 1.55, 0) },
  map: { theta: 0.35, phi: 0.64, distance: 18, zoom: 0.82, target: new THREE.Vector3(0, 0.82, 0) },
};
const cameraTarget = cameraDefaults.bridge.target.clone();
let cameraTheta = cameraDefaults.bridge.theta;
let cameraPhi = cameraDefaults.bridge.phi;
let cameraDistance = cameraDefaults.bridge.distance;
let cameraZoom = cameraDefaults.bridge.zoom;
let pixelSize = 2;

const root = new THREE.Group();
root.rotation.y = -0.18;
scene.add(root);

const solidMeshes = [];
const mapModels = [];
const bridgeModels = [];
const animatedVillageFires = [];
let activeModelCollection = mapModels;
let activeModel = 'bridge';
const materialCache = new Map();
let mounted = false;
let running = false;
let frameRequest = 0;
let inputSource = null;
let inputTexture = null;
let inputSourceSize = new THREE.Vector2(1, 1);
let inputIsCanvas = false;
let lastVideoTime = -1;

function updateSourceCrop() {
  if (!inputSource) {
    ditherMaterial.uniforms.uSourceCropScale.value.set(1, 1);
    ditherMaterial.uniforms.uSourceCropOffset.value.set(0, 0);
    return;
  }
  const sourceAspect = inputSourceSize.x / Math.max(1, inputSourceSize.y);
  const targetAspect = Math.max(1, canvas.clientWidth || 960) / Math.max(1, canvas.clientHeight || 540);
  let scaleX = 1;
  let scaleY = 1;
  let offsetX = 0;
  let offsetY = 0;
  if (sourceAspect > targetAspect) {
    scaleX = targetAspect / sourceAspect;
    offsetX = (1 - scaleX) * 0.5;
  } else {
    scaleY = sourceAspect / targetAspect;
    offsetY = (1 - scaleY) * 0.5;
  }
  ditherMaterial.uniforms.uSourceCropScale.value.set(scaleX, scaleY);
  ditherMaterial.uniforms.uSourceCropOffset.value.set(offsetX, offsetY);
}

function setInputSource(source) {
  if (inputTexture) inputTexture.dispose();
  inputSource = source || null;
  inputTexture = null;
  inputIsCanvas = false;
  lastVideoTime = -1;
  if (inputSource) {
    const isVideo = typeof HTMLVideoElement !== 'undefined' && inputSource instanceof HTMLVideoElement;
    inputIsCanvas = typeof HTMLCanvasElement !== 'undefined' && inputSource instanceof HTMLCanvasElement;
    inputTexture = isVideo ? new THREE.VideoTexture(inputSource) : new THREE.Texture(inputSource);
    inputTexture.colorSpace = THREE.SRGBColorSpace;
    inputTexture.generateMipmaps = false;
    inputTexture.minFilter = THREE.LinearFilter;
    inputTexture.magFilter = THREE.LinearFilter;
    inputTexture.needsUpdate = true;
    inputSourceSize.set(
      inputSource.videoWidth || inputSource.naturalWidth || inputSource.width || 1,
      inputSource.videoHeight || inputSource.naturalHeight || inputSource.height || 1,
    );
  }
  updateSourceCrop();
  render();
  return api;
}

function positionCamera() {
  const sinPhi = Math.sin(cameraPhi);
  camera.position.set(
    cameraTarget.x + cameraDistance * sinPhi * Math.sin(cameraTheta),
    cameraTarget.y + cameraDistance * Math.cos(cameraPhi),
    cameraTarget.z + cameraDistance * sinPhi * Math.cos(cameraTheta),
  );
  camera.zoom = cameraZoom;
  camera.lookAt(cameraTarget);
  camera.updateProjectionMatrix();
}

function transform(position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
}

const surfaceStyleIds = { stone: 0, snow: 1, timber: 2, foliage: 3, shingle: 4 };

function getSurfaceMaterial(tone, side = THREE.FrontSide, flatShading = true, surfaceStyle = 'stone') {
  const styleId = surfaceStyleIds[surfaceStyle] ?? surfaceStyleIds.stone;
  const key = `${tone.toFixed(3)}:${side}:${flatShading}:${styleId}`;
  if (!materialCache.has(key)) {
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(tone, tone, tone),
      flatShading,
      side,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOESurfaceStyle = { value: styleId };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vOESurfacePosition;\nvarying vec3 vOESurfaceNormal;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvOESurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvOESurfaceNormal = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vOESurfacePosition;
          varying vec3 vOESurfaceNormal;
          uniform float uOESurfaceStyle;
          float oeSurfaceHash(vec3 p) {
            return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          }
          float oeSurfaceHash2(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float oeSurfaceNoise(vec2 p) {
            vec2 cell = floor(p);
            vec2 blend = fract(p);
            blend = blend * blend * (3.0 - 2.0 * blend);
            float a = oeSurfaceHash2(cell);
            float b = oeSurfaceHash2(cell + vec2(1.0, 0.0));
            float c = oeSurfaceHash2(cell + vec2(0.0, 1.0));
            float d = oeSurfaceHash2(cell + vec2(1.0, 1.0));
            return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
          }
          float oeSurfaceFbm(vec2 p) {
            float value = oeSurfaceNoise(p) * 0.57;
            value += oeSurfaceNoise(p * 2.07 + vec2(13.4, 7.1)) * 0.29;
            value += oeSurfaceNoise(p * 4.13 + vec2(29.7, 19.3)) * 0.14;
            return value;
          }
          float oeRepeatedLine(float value, float width) {
            float edge = min(fract(value), 1.0 - fract(value));
            return 1.0 - smoothstep(width, width * 2.5, edge);
          }
          float oeMasonryJoint(vec2 uv) {
            vec2 cell = uv * vec2(1.55, 2.4);
            float row = floor(cell.y);
            cell.x += mod(row, 2.0) * 0.5;
            vec2 edge = min(fract(cell), 1.0 - fract(cell));
            return 1.0 - smoothstep(0.025, 0.085, min(edge.x, edge.y));
          }
          float oeShingleJoint(vec2 uv) {
            vec2 cell = uv * vec2(3.2, 4.8);
            float row = floor(cell.y);
            cell.x += mod(row, 2.0) * 0.5;
            vec2 edge = min(fract(cell), 1.0 - fract(cell));
            float rowJoint = 1.0 - smoothstep(0.025, 0.09, edge.y);
            float columnJoint = 1.0 - smoothstep(0.025, 0.075, edge.x);
            return max(rowJoint, columnJoint * 0.72);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 oeNormalWeight = abs(normalize(vOESurfaceNormal));
          vec2 oeSurfaceUv = vOESurfacePosition.xz;
          if (oeNormalWeight.x > oeNormalWeight.y && oeNormalWeight.x > oeNormalWeight.z) oeSurfaceUv = vOESurfacePosition.zy;
          else if (oeNormalWeight.z > oeNormalWeight.y) oeSurfaceUv = vOESurfacePosition.xy;

          vec2 oeStyleOffset = vec2(uOESurfaceStyle * 7.3, uOESurfaceStyle * 3.9);
          float oeMacroGrain = oeSurfaceFbm(oeSurfaceUv * 0.62 + oeStyleOffset);
          float oeMidGrain = oeSurfaceFbm(oeSurfaceUv * 2.65 + oeStyleOffset.yx + vec2(5.2, 11.8));
          float oeFineGrain = oeSurfaceHash(floor(vOESurfacePosition * vec3(17.0, 21.0, 17.0)));
          float oeSpeckle = oeSurfaceHash(floor(vOESurfacePosition * vec3(39.0, 43.0, 39.0)) + vec3(uOESurfaceStyle * 9.0));

          float oeStoneJoint = oeMasonryJoint(oeSurfaceUv);
          float oeStoneVein = pow(abs(sin((oeSurfaceUv.x * 0.72 + oeSurfaceUv.y * 0.31 + oeMacroGrain * 0.85) * 7.5)), 12.0);
          float oeStoneStreak = (1.0 - oeNormalWeight.y) * smoothstep(0.69, 0.9, oeSurfaceFbm(vec2(oeSurfaceUv.x * 0.42, vOESurfacePosition.y * 2.2) + vec2(17.0, 3.0)));
          float oeStoneChip = smoothstep(0.9, 0.985, oeSpeckle);
          float oeStoneTexture = 0.88 + oeMacroGrain * 0.22 + oeMidGrain * 0.09 + (oeFineGrain - 0.5) * 0.1;
          oeStoneTexture -= oeStoneJoint * 0.28 + oeStoneVein * 0.055 + oeStoneStreak * 0.1 + oeStoneChip * 0.08;

          float oeSnowWind = 0.5 + 0.5 * sin(dot(oeSurfaceUv, vec2(1.4, 7.5)) + oeMacroGrain * 5.0);
          float oeSnowPock = smoothstep(0.91, 0.985, oeSpeckle);
          float oeSnowTexture = 0.9 + oeMacroGrain * 0.16 + oeMidGrain * 0.08 + oeSnowWind * 0.05 - oeSnowPock * 0.1;

          float oeTimberLogJoint = oeRepeatedLine(vOESurfacePosition.y * 5.2, 0.025);
          float oeTimberBoardJoint = oeRepeatedLine(oeSurfaceUv.x * 1.7 + floor(vOESurfacePosition.y * 5.2) * 0.31, 0.02);
          float oeTimberGrain = 0.5 + 0.5 * sin(oeSurfaceUv.x * 15.0 + sin(oeSurfaceUv.y * 4.0) * 1.7 + oeMacroGrain * 5.0);
          float oeTimberKnot = smoothstep(0.79, 0.95, oeMidGrain) * (0.5 + 0.5 * sin(oeSurfaceUv.y * 23.0));
          float oeTimberTexture = 0.88 + oeMacroGrain * 0.16 + oeTimberGrain * 0.12 + (oeFineGrain - 0.5) * 0.07;
          oeTimberTexture -= oeTimberLogJoint * 0.18 + oeTimberBoardJoint * 0.08 + oeTimberKnot * 0.08;

          float oeNeedleBands = 0.5 + 0.5 * sin(dot(oeSurfaceUv, vec2(22.0, 7.0)) + oeMidGrain * 8.0);
          float oeFoliageTexture = 0.79 + oeMacroGrain * 0.25 + oeMidGrain * 0.16 + oeNeedleBands * 0.08 + (oeFineGrain - 0.5) * 0.1;

          vec2 oeShingleGrid = oeSurfaceUv * vec2(3.2, 4.8);
          vec2 oeShingleCell = floor(oeShingleGrid + vec2(mod(floor(oeShingleGrid.y), 2.0) * 0.5, 0.0));
          float oeShingleVariation = oeSurfaceHash2(oeShingleCell);
          float oeShingleChip = smoothstep(0.9, 0.985, oeSpeckle);
          float oeShingleTexture = 0.88 + oeMacroGrain * 0.13 + oeShingleVariation * 0.18 + oeMidGrain * 0.07;
          oeShingleTexture -= oeShingleJoint(oeSurfaceUv) * 0.24 + oeShingleChip * 0.09;

          float oeSurfaceTexture = oeStoneTexture;
          if (uOESurfaceStyle > 0.5 && uOESurfaceStyle < 1.5) oeSurfaceTexture = oeSnowTexture;
          else if (uOESurfaceStyle > 1.5 && uOESurfaceStyle < 2.5) oeSurfaceTexture = oeTimberTexture;
          else if (uOESurfaceStyle > 2.5 && uOESurfaceStyle < 3.5) oeSurfaceTexture = oeFoliageTexture;
          else if (uOESurfaceStyle > 3.5) oeSurfaceTexture = oeShingleTexture;
          diffuseColor.rgb *= clamp(oeSurfaceTexture, 0.58, 1.3);`,
        );
    };
    material.customProgramCacheKey = () => `oe-monochrome-surface-${styleId}`;
    materialCache.set(key, material);
  }
  return materialCache.get(key);
}

function registerMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  solidMeshes.push(mesh);
  return mesh;
}

function addPrimitive(geometry, matrix, tone, side = THREE.FrontSide, flatShading = true, surfaceStyle = 'stone') {
  const material = getSurfaceMaterial(tone, side, flatShading, surfaceStyle);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.applyMatrix4(matrix);
  registerMesh(mesh);
  activeModelCollection.push(mesh);
  root.add(mesh);
  return mesh;
}

function addModelGroup(collection = activeModelCollection) {
  const group = new THREE.Group();
  collection.push(group);
  root.add(group);
  return group;
}

function addGroupPart(group, geometry, position, tone, rotation = new THREE.Euler(), side = THREE.FrontSide, surfaceStyle = 'stone') {
  const mesh = registerMesh(new THREE.Mesh(geometry, getSurfaceMaterial(tone, side, true, surfaceStyle)));
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  group.add(mesh);
  return mesh;
}

function makeRoofGeometry(width, depth, wallHeight, roofHeight) {
  const geometry = new THREE.BufferGeometry();
  const w = width / 2;
  const d = depth / 2;
  const vertices = [
    -w, wallHeight, -d, 0, wallHeight + roofHeight, -d, 0, wallHeight + roofHeight, d, -w, wallHeight, d,
    0, wallHeight + roofHeight, -d, w, wallHeight, -d, w, wallHeight, d, 0, wallHeight + roofHeight, d,
  ];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeRoofSnowGeometry(width, depth, wallHeight, roofHeight, side) {
  const geometry = new THREE.BufferGeometry();
  const innerX = side * width * 0.12;
  const outerX = side * width * 0.43;
  const innerY = wallHeight + roofHeight * (1 - Math.abs(innerX) / (width / 2)) + 0.018;
  const outerY = wallHeight + roofHeight * (1 - Math.abs(outerX) / (width / 2)) + 0.018;
  const halfDepth = depth * 0.46;
  const vertices = [
    innerX, innerY, -halfDepth,
    outerX, outerY, -halfDepth,
    outerX, outerY, halfDepth,
    innerX, innerY, halfDepth,
  ];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(side < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function addGableFace(group, width, depth, wallHeight, roofHeight, front, tone, surfaceStyle = 'timber') {
  const half = width / 2;
  const z = (depth / 2 + 0.012) * (front ? 1 : -1);
  const vertices = front
    ? [-half, wallHeight, z, half, wallHeight, z, 0, wallHeight + roofHeight, z]
    : [half, wallHeight, z, -half, wallHeight, z, 0, wallHeight + roofHeight, z];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  addGroupPart(group, geometry, new THREE.Vector3(), tone, new THREE.Euler(), THREE.DoubleSide, surfaceStyle);
}

function makeFlameGeometry() {
  const radialSegments = 9;
  const rings = [
    [0.0, 0.12, 0.0],
    [0.13, 0.34, 0.0],
    [0.34, 0.3, -0.035],
    [0.56, 0.235, 0.025],
    [0.76, 0.16, 0.065],
    [0.92, 0.07, 0.025],
    [1.0, 0.0, 0.13],
  ];
  const positions = [];
  const indices = [];
  rings.forEach(([height, radius, centerX], ringIndex) => {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(centerX + Math.cos(angle) * radius, height, Math.sin(angle) * radius * 0.68);
      if (ringIndex > 0) {
        const current = ringIndex * radialSegments + segment;
        const next = ringIndex * radialSegments + (segment + 1) % radialSegments;
        const previous = (ringIndex - 1) * radialSegments + segment;
        const previousNext = (ringIndex - 1) * radialSegments + (segment + 1) % radialSegments;
        indices.push(previous, previousNext, current, previousNext, next, current);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeFireMaterial(brightness) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBrightness: { value: brightness } },
    vertexShader: `
      uniform float uTime;
      varying float vFlameHeight;
      varying float vFlameCore;
      varying float vFlamePhase;
      void main() {
        vec3 flamePosition = position;
        float sway = position.y * position.y;
        flamePosition.x += sin(uTime * 5.7 + position.y * 11.0 + position.z * 6.0) * 0.15 * sway;
        flamePosition.z += cos(uTime * 4.3 + position.y * 8.0 + position.x * 7.0) * 0.09 * sway;
        vFlameHeight = position.y;
        vFlameCore = 1.0 - smoothstep(0.025, 0.21, length(position.xz));
        vFlamePhase = position.x * 19.0 + position.z * 23.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(flamePosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBrightness;
      varying float vFlameHeight;
      varying float vFlameCore;
      varying float vFlamePhase;
      void main() {
        float tongue = 0.5 + 0.5 * sin(vFlamePhase + uTime * 8.0 + vFlameHeight * 21.0);
        float body = mix(0.12, 0.66, smoothstep(0.0, 0.63, vFlameHeight));
        body *= 1.0 - 0.24 * smoothstep(0.72, 1.0, vFlameHeight);
        float core = vFlameCore * (1.0 - smoothstep(0.35, 0.94, vFlameHeight));
        float value = mix(body, 0.98, core);
        value *= 0.78 + 0.22 * tongue;
        value *= uBrightness;
        gl_FragColor = vec4(vec3(clamp(value, 0.0, 1.0)), 1.0);
      }
    `,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

function addRoofFire(group, width, depth, wallHeight, roofHeight) {
  const peakX = -width * 0.08;
  const peakY = wallHeight + roofHeight * (1 - Math.abs(peakX) / (width / 2)) - 0.04;
  const baseY = peakY + 0.025;
  const flameGeometry = makeFlameGeometry();
  const flames = [
    { x: 0, y: baseY, z: 0, radius: 0.62, height: 3.05, brightness: 1.0 },
    { x: -0.22, y: baseY + 0.035, z: 0.06, radius: 0.37, height: 2.25, brightness: 0.84 },
    { x: 0.24, y: baseY + 0.02, z: -0.05, radius: 0.34, height: 2.45, brightness: 0.9 },
  ];
  const materials = [];
  flames.forEach(({ x, y, z, radius, height, brightness }) => {
    const material = makeFireMaterial(brightness);
    const flame = new THREE.Mesh(flameGeometry, material);
    flame.position.set(peakX + x, y, z);
    flame.scale.set(radius, height, radius);
    flame.castShadow = false;
    flame.receiveShadow = false;
    group.add(flame);
    materials.push(material);
  });

  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0x777777,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const smokeGeometry = new THREE.SphereGeometry(1, 8, 6);
  const smokePuffs = [];
  [
    { x: -0.08, y: 2.45, z: 0.02, size: 0.28 },
    { x: 0.11, y: 3.05, z: -0.03, size: 0.35 },
    { x: 0.34, y: 3.7, z: 0.04, size: 0.42 },
    { x: 0.49, y: 4.38, z: -0.04, size: 0.49 },
    { x: 0.32, y: 5.0, z: 0.02, size: 0.53 },
  ].forEach(({ x, y, z, size }, index) => {
    const puff = new THREE.Mesh(smokeGeometry, smokeMaterial);
    puff.position.set(peakX + x, baseY + y, z);
    puff.scale.set(size * 1.0, size * 1.24, size * 0.9);
    puff.renderOrder = 2;
    puff.castShadow = false;
    puff.receiveShadow = false;
    group.add(puff);
    smokePuffs.push({ mesh: puff, x: peakX + x, y: baseY + y, z, index });
  });

  const fireLight = new THREE.PointLight(0xffffff, 2.2, 5.5, 2);
  fireLight.position.set(peakX, baseY + 0.42, 0);
  group.add(fireLight);
  animatedVillageFires.push({ materials, smokePuffs, fireLight });
}

function placeCottage({ x, z, width = 1.5, depth = 1.3, wallHeight = 0.95, roofHeight = 0.62, rotation = 0, tone = 0.22, y = 0, chapel = false, scale = 0.7, burning = false }) {
  const group = addModelGroup(mapModels);
  group.position.set(x, y + 0.025, z);
  group.rotation.y = rotation;
  const wallTone = tone;
  const roofTone = tone * 0.74;
  const w = width;
  const d = depth;
  addGroupPart(group, new THREE.BoxGeometry(w, wallHeight, d), new THREE.Vector3(0, wallHeight / 2, 0), wallTone, new THREE.Euler(), THREE.FrontSide, 'timber');
  addGableFace(group, w, d, wallHeight * 0.96, roofHeight, true, wallTone * 1.12);
  addGableFace(group, w, d, wallHeight * 0.96, roofHeight, false, wallTone * 0.92);
  addGroupPart(group, makeRoofGeometry(w + 0.18, d + 0.2, wallHeight, roofHeight), new THREE.Vector3(), roofTone, new THREE.Euler(), THREE.DoubleSide, 'shingle');

  // Raised snow patches and eaves make each roof plane legible at a distance.
  [-1, 1].forEach((side) => {
    addGroupPart(group, makeRoofSnowGeometry(w + 0.18, d + 0.2, wallHeight, roofHeight, side), new THREE.Vector3(), 0.61, new THREE.Euler(), THREE.DoubleSide, 'snow');
    addGroupPart(group, new THREE.BoxGeometry(0.12, 0.075, d + 0.27), new THREE.Vector3(side * (w / 2 + 0.035), wallHeight + 0.02, 0), 0.62);
  });
  addGroupPart(group, new THREE.BoxGeometry(0.12, 0.1, d + 0.12), new THREE.Vector3(0, wallHeight + roofHeight + 0.02, 0), 0.58);

  const frontZ = d / 2 + 0.055;
  const doorWidth = chapel ? 0.29 : Math.min(0.31, w * 0.24);
  addGroupPart(group, new THREE.BoxGeometry(doorWidth + 0.12, wallHeight * 0.74, 0.09), new THREE.Vector3(0, wallHeight * 0.37, frontZ), 0.11);
  addGroupPart(group, new THREE.BoxGeometry(doorWidth, wallHeight * 0.7, 0.1), new THREE.Vector3(0, wallHeight * 0.35, frontZ + 0.055), 0.33);
  addGroupPart(group, new THREE.BoxGeometry(doorWidth + 0.22, 0.09, 0.14), new THREE.Vector3(0, wallHeight * 0.74, frontZ + 0.06), 0.48);
  [-1, 1].forEach((side) => {
    const wx = side * w * 0.28;
    const wy = wallHeight * 0.61;
    addGroupPart(group, new THREE.BoxGeometry(0.28, 0.32, 0.09), new THREE.Vector3(wx, wy, frontZ), 0.54);
    addGroupPart(group, new THREE.BoxGeometry(0.17, 0.21, 0.1), new THREE.Vector3(wx, wy, frontZ + 0.055), 0.08);
    addGroupPart(group, new THREE.BoxGeometry(0.05, 0.31, 0.12), new THREE.Vector3(wx, wy, frontZ + 0.09), 0.42);
    addGroupPart(group, new THREE.BoxGeometry(0.25, 0.045, 0.12), new THREE.Vector3(wx, wy, frontZ + 0.09), 0.42);
  });
  addGroupPart(group, new THREE.BoxGeometry(0.54, 0.12, 0.48), new THREE.Vector3(0, 0.06, d / 2 + 0.28), 0.39);

  const chimneyX = w * 0.19;
  const chimneyY = wallHeight + roofHeight * 0.58;
  addGroupPart(group, new THREE.BoxGeometry(0.22, 0.48, 0.24), new THREE.Vector3(chimneyX, chimneyY, -d * 0.14), 0.34);
  addGroupPart(group, new THREE.BoxGeometry(0.29, 0.08, 0.31), new THREE.Vector3(chimneyX, chimneyY + 0.27, -d * 0.14), 0.52);

  if (chapel) {
    addGroupPart(group, new THREE.BoxGeometry(0.48, 0.68, 0.52), new THREE.Vector3(0, wallHeight + roofHeight + 0.29, -d * 0.14), 0.34);
    addGroupPart(group, new THREE.ConeGeometry(0.39, 0.88, 4), new THREE.Vector3(0, wallHeight + roofHeight + 1.02, -d * 0.14), 0.22, new THREE.Euler(0, Math.PI / 4, 0));
    addGroupPart(group, new THREE.BoxGeometry(0.055, 0.55, 0.06), new THREE.Vector3(0, wallHeight + roofHeight + 1.64, -d * 0.14), 0.64);
  }
  if (burning) addRoofFire(group, w, d, wallHeight, roofHeight);
  group.scale.setScalar(scale);
  return group;
}

function createRibbon(points, width, heightAt, tone, targetCollection = activeModelCollection) {
  const positions = [];
  const indices = [];
  points.forEach(([x, z], index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const ribbonWidth = typeof width === 'function' ? width(index, points.length) : width;
    const offsetX = (-dz / length) * ribbonWidth / 2;
    const offsetZ = (dx / length) * ribbonWidth / 2;
    [[x - offsetX, z - offsetZ], [x + offsetX, z + offsetZ]].forEach(([px, pz]) => {
      positions.push(px, heightAt(px, pz) + 0.055, pz);
    });
    if (index > 0) {
      const base = index * 2;
      indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, getSurfaceMaterial(tone, THREE.DoubleSide));
  registerMesh(mesh);
  targetCollection.push(mesh);
  root.add(mesh);
  return mesh;
}

function createIslandTerrain(heightAt) {
  const width = 15.6;
  const depth = 11.2;
  const columns = 32;
  const rows = 22;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const z = -depth / 2 + depth * row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const x = -width / 2 + width * column / columns;
      positions.push(x, heightAt(x, z), z);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  addPrimitive(geometry, new THREE.Matrix4(), 0.46, THREE.DoubleSide, false, 'snow');

  // A dark, broken cliff skirt gives the snowfield an edge without flattening it.
  const edgePoints = [];
  for (let column = 0; column <= columns; column += 1) edgePoints.push([-width / 2 + width * column / columns, -depth / 2]);
  for (let row = 1; row <= rows; row += 1) edgePoints.push([width / 2, -depth / 2 + depth * row / rows]);
  for (let column = columns - 1; column >= 0; column -= 1) edgePoints.push([-width / 2 + width * column / columns, depth / 2]);
  for (let row = rows - 1; row > 0; row -= 1) edgePoints.push([-width / 2, -depth / 2 + depth * row / rows]);
  const skirtPositions = [];
  const skirtIndices = [];
  edgePoints.forEach(([x, z], index) => {
    const y = heightAt(x, z);
    skirtPositions.push(x, y, z, x * 0.91, -2.55 + 0.12 * Math.sin(index * 0.23), z * 0.91);
    if (index < edgePoints.length - 1) {
      const base = index * 2;
      skirtIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirt.setIndex(skirtIndices);
  skirt.computeVertexNormals();
  addPrimitive(skirt, new THREE.Matrix4(), 0.22, THREE.DoubleSide);
}

function buildPointField() {
  activeModelCollection = mapModels;
  const terrainHeight = (x, z) => {
    const radius = Math.sqrt((x / 7.8) ** 2 + (z / 5.6) ** 2);
    const edge = clamp((radius - 0.38) / 0.62, 0, 1);
    const ridges = 0.11 * Math.sin(x * 0.82 + z * 0.44) + 0.08 * Math.cos(z * 1.12 - x * 0.3);
    return 0.04 + ridges - edge * edge * 1.2;
  };
  createIslandTerrain(terrainHeight);

  const farRidge = new THREE.Shape();
  farRidge.moveTo(-8.2, -1.25);
  [[-7.1, -0.3], [-6.25, 1.7], [-5.4, 0.72], [-4.05, 2.0], [-2.9, 0.85], [-1.55, 1.64], [-0.35, 0.55], [1.0, 1.95], [2.15, 0.72], [3.35, 1.42], [4.75, 0.38], [6.1, 1.76], [7.15, 0.7], [8.2, -0.55]].forEach(([x, y]) => farRidge.lineTo(x, y));
  farRidge.lineTo(8.2, -1.25);
  farRidge.closePath();
  const ridgeGeometry = new THREE.ExtrudeGeometry(farRidge, { depth: 0.48, bevelEnabled: false, curveSegments: 1, steps: 1 });
  ridgeGeometry.translate(0, 0, -5.45);
  addPrimitive(ridgeGeometry, new THREE.Matrix4(), 0.2, THREE.DoubleSide);

  const cottages = [
    { x: -4.65, z: 0.75, width: 1.48, depth: 1.32, wallHeight: 0.95, roofHeight: 0.72, rotation: 0.2, tone: 0.21, scale: 0.68 },
    { x: -4.3, z: -3.45, width: 1.72, depth: 1.45, wallHeight: 1.06, roofHeight: 0.8, rotation: -0.35, tone: 0.25, scale: 0.68 },
    { x: -2.05, z: 1.5, width: 1.62, depth: 1.35, wallHeight: 0.98, roofHeight: 0.75, rotation: 0.26, tone: 0.18, scale: 0.68 },
    { x: -1.35, z: -3.55, width: 1.3, depth: 1.18, wallHeight: 0.88, roofHeight: 0.69, rotation: 0.08, tone: 0.24, scale: 0.68 },
    { x: 0.45, z: -0.9, width: 1.85, depth: 1.58, wallHeight: 1.12, roofHeight: 0.86, rotation: -0.2, tone: 0.2, chapel: true, scale: 0.76 },
    { x: 2.2, z: -3.1, width: 1.52, depth: 1.25, wallHeight: 0.92, roofHeight: 0.7, rotation: 0.18, tone: 0.26, scale: 0.68 },
    { x: 3.8, z: -0.65, width: 1.74, depth: 1.4, wallHeight: 1.0, roofHeight: 0.78, rotation: -0.28, tone: 0.22, scale: 0.68, burning: true },
    { x: 5.55, z: 1.35, width: 1.42, depth: 1.24, wallHeight: 0.91, roofHeight: 0.68, rotation: 0.34, tone: 0.19, scale: 0.68 },
    { x: 3.05, z: 3.45, width: 1.34, depth: 1.15, wallHeight: 0.84, roofHeight: 0.66, rotation: 0.1, tone: 0.24, scale: 0.68 },
    { x: -1.35, z: 3.55, width: 1.55, depth: 1.24, wallHeight: 0.96, roofHeight: 0.74, rotation: -0.16, tone: 0.2, scale: 0.68 },
  ];
  cottages.forEach((house) => placeCottage({ ...house, y: terrainHeight(house.x, house.z) }));

  // One narrow, wandering footpath reaches each front step. Its spline follows
  // the houses rather than imposing a straight, evenly paved village street.
  const pathOrder = [0, 1, 3, 5, 6, 4, 2, 9, 8, 7];
  const pathAnchors = [[-7.15, 2.75]];
  pathOrder.forEach((houseIndex) => {
    const house = cottages[houseIndex];
    const stepDistance = (house.depth / 2 + 0.28) * house.scale;
    pathAnchors.push([
      house.x + Math.sin(house.rotation) * stepDistance,
      house.z + Math.cos(house.rotation) * stepDistance,
    ]);
  });
  pathAnchors.push([7.15, -0.45]);
  const pathCurve = new THREE.CatmullRomCurve3(
    pathAnchors.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.22,
  );
  const pathSegments = (pathAnchors.length - 1) * 9;
  const footpath = [];
  for (let step = 0; step <= pathSegments; step += 1) {
    const point = pathCurve.getPoint(step / pathSegments);
    footpath.push([point.x, point.z]);
  }
  const pathWidths = [0.64, 0.43, 0.72, 0.48, 0.68, 0.4, 0.76, 0.46, 0.63, 0.42, 0.68, 0.5];
  const widthAt = (index, count) => {
    const position = index / Math.max(1, count - 1) * (pathWidths.length - 1);
    const anchor = Math.floor(position);
    const fraction = position - anchor;
    const width = THREE.MathUtils.lerp(pathWidths[anchor], pathWidths[Math.min(anchor + 1, pathWidths.length - 1)], fraction);
    return clamp(width + 0.045 * Math.sin(index * 1.91) + 0.028 * Math.cos(index * 0.67), 0.34, 0.79);
  };
  createRibbon(footpath, widthAt, terrainHeight, 0.29, mapModels);

  // A squat timber watchtower and a bell cote anchor the settlement skyline.
  const towerX = -6.0;
  const towerZ = -0.65;
  const towerY = terrainHeight(towerX, towerZ);
  addPrimitive(new THREE.CylinderGeometry(0.62, 0.78, 2.85, 7), transform(new THREE.Vector3(towerX, towerY + 1.4, towerZ)), 0.25);
  addPrimitive(new THREE.CylinderGeometry(0.82, 0.78, 0.22, 7), transform(new THREE.Vector3(towerX, towerY + 2.65, towerZ)), 0.48);
  addPrimitive(new THREE.ConeGeometry(0.92, 1.0, 7), transform(new THREE.Vector3(towerX, towerY + 3.25, towerZ), new THREE.Euler(0, Math.PI / 7, 0)), 0.2);
  for (let slit = 0; slit < 4; slit += 1) {
    const angle = slit * Math.PI / 2;
    const sx = towerX + Math.sin(angle) * 0.59;
    const sz = towerZ + Math.cos(angle) * 0.59;
    addPrimitive(new THREE.BoxGeometry(0.1, 0.34, 0.05), transform(new THREE.Vector3(sx, towerY + 1.88, sz), new THREE.Euler(0, angle, 0)), 0.06);
  }

  // Fences, field walls, trees and exposed stone make the settlement read as a place.
  const fenceRuns = [[[-6.0, 0.6], [-5.4, 1.45]], [[-3.65, 1.7], [-2.9, 2.35]], [[0.9, 1.8], [1.55, 2.55]], [[4.4, -0.6], [5.7, -0.25]]];
  fenceRuns.forEach(([[x1, z1], [x2, z2]]) => {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const angle = Math.atan2(x2 - x1, z2 - z1);
    const pieces = Math.max(2, Math.ceil(length / 0.58));
    for (let piece = 0; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const y = terrainHeight(x, z);
      addPrimitive(new THREE.BoxGeometry(0.08, 0.54, 0.08), transform(new THREE.Vector3(x, y + 0.26, z)), 0.22);
    }
    [-0.12, 0.12].forEach((level) => {
      const x = (x1 + x2) / 2;
      const z = (z1 + z2) / 2;
      const y = terrainHeight(x, z) + 0.38 + level;
      addPrimitive(new THREE.BoxGeometry(0.07, 0.07, length), transform(new THREE.Vector3(x, y, z), new THREE.Euler(0, angle, 0)), 0.31);
    });
  });

  const treeSites = [[-6.8, -3.7], [-6.6, 3.8], [-4.6, 3.9], [-2.4, -4.35], [0.0, 4.25], [3.9, 3.8], [6.3, 2.45], [6.45, -3.35], [1.3, -4.35]];
  treeSites.forEach(([x, z], index) => {
    const y = terrainHeight(x, z);
    const height = 1.55 + (index % 3) * 0.24;
    addPrimitive(new THREE.CylinderGeometry(0.075, 0.13, height * 0.58, 5), transform(new THREE.Vector3(x, y + height * 0.29, z)), 0.22, THREE.FrontSide, true, 'timber');
    [0, 1, 2].forEach((tier) => {
      const tierHeight = height * (0.55 - tier * 0.1);
      addPrimitive(new THREE.ConeGeometry(0.63 - tier * 0.1, tierHeight, 6), transform(new THREE.Vector3(x, y + height * (0.42 + tier * 0.22), z), new THREE.Euler(0, index * 0.37, 0)), 0.16 + tier * 0.035, THREE.FrontSide, true, 'foliage');
    });
  });

  const rocks = [[-7.0, -1.8, 0.9], [-6.9, 2.6, 0.76], [-3.0, 4.5, 0.64], [5.9, 3.4, 0.8], [7.0, 0.1, 0.68], [5.6, -4.0, 0.82]];
  rocks.forEach(([x, z, scale], index) => {
    const y = terrainHeight(x, z);
    addPrimitive(new THREE.DodecahedronGeometry(scale, 1), transform(new THREE.Vector3(x, y + scale * 0.28, z), new THREE.Euler(index * 0.08, index * 0.31, -index * 0.04), new THREE.Vector3(1.4, 0.7, 1.1)), 0.31 + (index % 2) * 0.08);
  });

  // Low monochrome flower heads keep the meadow tied to the source images.
  const flowerPositions = [[-4.7, 0.14, 2.55], [-3.4, 0.14, 3.15], [0.5, 0.14, 3.85], [3.6, 0.14, 2.8], [5.5, 0.14, 1.55]];
  flowerPositions.forEach(([x, , z], index) => {
    const y = terrainHeight(x, z);
    addPrimitive(new THREE.CylinderGeometry(0.035, 0.055, 0.58, 5), transform(new THREE.Vector3(x, y + 0.29, z)), 0.42);
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 2 / 5;
      const px = x + Math.cos(angle) * 0.17;
      const pz = z + Math.sin(angle) * 0.17;
      addPrimitive(new THREE.IcosahedronGeometry(0.13, 1), transform(new THREE.Vector3(px, y + 0.61, pz), new THREE.Euler(0.15, angle, 0), new THREE.Vector3(1.08, 0.44, 0.78)), 0.66);
    }
    addPrimitive(new THREE.IcosahedronGeometry(0.1, 1), transform(new THREE.Vector3(x, y + 0.61, z)), 0.31 + index * 0.025);
  });

  // A cambered three-span stone bridge crosses an unfilled ravine.
  activeModelCollection = bridgeModels;
  const bridgeLength = 71.0;
  const bridgeWidth = 3.35;
  const bridgeZ = 0.15;
  const halfLength = bridgeLength / 2;
  const roadY = (x) => 2.62 + 0.32 * (1 - (x / halfLength) ** 2);
  const archCount = 15;
  const archEdgeMargin = 3.05;
  const archSpacing = (bridgeLength - archEdgeMargin * 2) / (archCount - 1);
  const archCenters = Array.from({ length: archCount }, (_, index) => (
    (index - (archCount - 1) / 2) * archSpacing
  ));
  const archRadius = 1.43;
  const archSpring = 0.73;
  const wallBottom = 0.08;
  const wallThickness = 0.34;
  const curveSteps = 32;

  function curvedDeckShape() {
    const shape = new THREE.Shape();
    shape.moveTo(-halfLength, roadY(-halfLength) - 0.47);
    for (let step = 1; step <= curveSteps; step += 1) {
      const x = -halfLength + bridgeLength * step / curveSteps;
      shape.lineTo(x, roadY(x) - 0.47);
    }
    shape.lineTo(halfLength, roadY(halfLength));
    for (let step = curveSteps - 1; step >= 0; step -= 1) {
      const x = -halfLength + bridgeLength * step / curveSteps;
      shape.lineTo(x, roadY(x));
    }
    shape.closePath();
    return shape;
  }

  const deckGeometry = new THREE.ExtrudeGeometry(curvedDeckShape(), { depth: bridgeWidth, bevelEnabled: false, curveSegments: 12, steps: 1 });
  deckGeometry.translate(0, 0, bridgeZ - bridgeWidth / 2);
  addPrimitive(deckGeometry, new THREE.Matrix4(), 0.39, THREE.DoubleSide);

  const wallShape = new THREE.Shape();
  wallShape.moveTo(-halfLength, wallBottom);
  wallShape.lineTo(halfLength, wallBottom);
  wallShape.lineTo(halfLength, roadY(halfLength) - 0.47);
  for (let step = curveSteps - 1; step >= 0; step -= 1) {
    const x = -halfLength + bridgeLength * step / curveSteps;
    wallShape.lineTo(x, roadY(x) - 0.47);
  }
  wallShape.closePath();
  archCenters.forEach((center) => {
    const opening = new THREE.Path();
    opening.moveTo(center - archRadius, wallBottom);
    opening.lineTo(center - archRadius, archSpring);
    opening.absarc(center, archSpring, archRadius, Math.PI, 0, true);
    opening.lineTo(center + archRadius, wallBottom);
    opening.closePath();
    wallShape.holes.push(opening);
  });
  const wallGeometry = new THREE.ExtrudeGeometry(wallShape, { depth: wallThickness, bevelEnabled: false, curveSegments: 24, steps: 1 });
  wallGeometry.translate(0, 0, -wallThickness / 2);
  [-1, 1].forEach((side) => {
    const sideZ = bridgeZ + side * (bridgeWidth / 2 - wallThickness / 2);
    addPrimitive(wallGeometry.clone(), transform(new THREE.Vector3(0, 0, sideZ)), 0.31, THREE.DoubleSide);

    // An arch ring is a real swept stone band. Dark radial seams suggest cut voussoirs.
    archCenters.forEach((center) => {
      const ringShape = new THREE.Shape();
      const outer = archRadius + 0.18;
      const inner = archRadius - 0.04;
      ringShape.moveTo(center - outer, archSpring);
      ringShape.absarc(center, archSpring, outer, Math.PI, 0, true);
      ringShape.lineTo(center + inner, archSpring);
      ringShape.absarc(center, archSpring, inner, 0, Math.PI, false);
      ringShape.closePath();
      const ringGeometry = new THREE.ExtrudeGeometry(ringShape, { depth: 0.12, bevelEnabled: false, curveSegments: 20, steps: 1 });
      const wallFaceZ = bridgeZ + side * bridgeWidth / 2;
      ringGeometry.translate(0, 0, wallFaceZ + (side < 0 ? -0.12 : 0.015));
      addPrimitive(ringGeometry, new THREE.Matrix4(), 0.49, THREE.DoubleSide);

      for (let joint = 1; joint < 12; joint += 1) {
        const angle = Math.PI * joint / 12;
        const radius = archRadius + 0.07;
        const x = center + Math.cos(angle) * radius;
        const y = archSpring + Math.sin(angle) * radius;
        addPrimitive(new THREE.BoxGeometry(0.035, 0.24, 0.055), transform(
          new THREE.Vector3(x, y, bridgeZ + side * (bridgeWidth / 2 + 0.09)),
          new THREE.Euler(0, 0, angle - Math.PI / 2),
        ), 0.17);
      }
      addPrimitive(new THREE.BoxGeometry(0.34, 0.34, 0.09), transform(new THREE.Vector3(center, archSpring + archRadius - 0.02, bridgeZ + side * (bridgeWidth / 2 + 0.12))), 0.58);
    });

    // Heavy piers interrupt the spandrels and carry the upper parapet.
    const pierXs = [
      -halfLength + 0.4,
      ...archCenters.flatMap((center) => [
        center - archRadius - 0.2,
        center + archRadius + 0.2,
      ]),
      halfLength - 0.4,
    ];
    pierXs.forEach((x, index) => {
      const bottomY = index === 0 || index === pierXs.length - 1 ? 0.55 : 0.88;
      const top = roadY(x) - 0.13;
      addPrimitive(new THREE.BoxGeometry(index % 2 ? 0.3 : 0.44, top - bottomY, 0.5), transform(
        new THREE.Vector3(x, (top + bottomY) / 2, side * (bridgeZ + bridgeWidth / 2 + 0.02)),
      ), index % 2 ? 0.4 : 0.35);
      addPrimitive(new THREE.BoxGeometry(0.56, 0.18, 0.62), transform(new THREE.Vector3(x, top + 0.01, side * (bridgeZ + bridgeWidth / 2 + 0.02))), 0.56);
    });
  });

  // Four massive masonry supports continue far below the bridge deck. Their
  // lower shafts are deliberately outside the camera's visible depth and fade
  // into the near-black abyss fog rather than ending on a visible ground plane.
  const deepPierXs = [
    -halfLength + 0.32,
    ...Array.from({ length: archCount - 1 }, (_, index) => (
      (archCenters[index] + archCenters[index + 1]) / 2
    )),
    halfLength - 0.32,
  ];
  deepPierXs.forEach((x, index) => {
    const top = roadY(x) - 0.47;
    const bottom = -58;
    const width = index === 0 || index === deepPierXs.length - 1 ? 0.78 : 1.12;
    const depth = index === 0 || index === deepPierXs.length - 1 ? 2.55 : 2.9;
    const shaft = addPrimitive(
      new THREE.BoxGeometry(width, top - bottom, depth),
      transform(new THREE.Vector3(x, (top + bottom) / 2, bridgeZ)),
      0.23,
      THREE.DoubleSide,
      true,
      'stone',
    );
    shaft.castShadow = false;

    for (let bandY = -1.8; bandY >= -19; bandY -= 4.3) {
      const band = addPrimitive(
        new THREE.BoxGeometry(width + 0.14, 0.18, depth + 0.16),
        transform(new THREE.Vector3(x, bandY, bridgeZ)),
        0.37,
        THREE.DoubleSide,
        true,
        'stone',
      );
      band.castShadow = false;
    }
  });

  // Crenellated parapets rise on both sides, following the shallow road crown.
  function parapetShape(height, baseOffset = 0) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfLength, roadY(-halfLength) + baseOffset);
    for (let step = 1; step <= curveSteps; step += 1) {
      const x = -halfLength + bridgeLength * step / curveSteps;
      shape.lineTo(x, roadY(x) + baseOffset);
    }
    shape.lineTo(halfLength, roadY(halfLength) + baseOffset + height);
    for (let step = curveSteps - 1; step >= 0; step -= 1) {
      const x = -halfLength + bridgeLength * step / curveSteps;
      shape.lineTo(x, roadY(x) + baseOffset + height);
    }
    shape.closePath();
    return shape;
  }
  [-1, 1].forEach((side) => {
    const parapet = new THREE.ExtrudeGeometry(parapetShape(0.57), { depth: 0.24, bevelEnabled: false, curveSegments: 12, steps: 1 });
    parapet.translate(0, 0, bridgeZ + side * (bridgeWidth / 2 - 0.15) - 0.12);
    addPrimitive(parapet, new THREE.Matrix4(), 0.27, THREE.DoubleSide);

    const coping = new THREE.ExtrudeGeometry(parapetShape(0.13, 0.57), { depth: 0.34, bevelEnabled: false, curveSegments: 12, steps: 1 });
    coping.translate(0, 0, bridgeZ + side * (bridgeWidth / 2 - 0.15) - 0.17);
    addPrimitive(coping, new THREE.Matrix4(), 0.49, THREE.DoubleSide);

    for (let x = -halfLength + 0.34; x < halfLength; x += 0.78) {
      const y = roadY(x) + 0.72;
      addPrimitive(new THREE.BoxGeometry(0.31, 0.34, 0.29), transform(new THREE.Vector3(x, y, bridgeZ + side * (bridgeWidth / 2 - 0.15))), 0.35);
    }
  });

  // Shallow joints and wheel grooves articulate the broad stone roadway.
  for (let x = -halfLength + 0.28; x < halfLength; x += 0.63) {
    addPrimitive(new THREE.BoxGeometry(0.026, 0.018, bridgeWidth - 0.54), transform(new THREE.Vector3(x, roadY(x) + 0.012, bridgeZ)), 0.19);
  }
  [-0.6, 0.6].forEach((zOffset) => {
    addPrimitive(new THREE.BoxGeometry(bridgeLength - 0.6, 0.018, 0.025), transform(new THREE.Vector3(0, roadY(0) + 0.013, bridgeZ + zOffset)), 0.3);
  });

  // Rock shoulders grip the bridge ends; the center beneath every arch remains empty.
  [-1, 1].forEach((side) => {
    const x = side * (halfLength + 1.1);
    addPrimitive(new THREE.DodecahedronGeometry(1.9, 1), transform(new THREE.Vector3(x, -0.04, bridgeZ - 0.15), new THREE.Euler(0.16, side * 0.2, 0.12), new THREE.Vector3(1.1, 1.8, 1.5)), 0.19);
    addPrimitive(new THREE.DodecahedronGeometry(1.35, 1), transform(new THREE.Vector3(x + side * 0.4, 1.05, bridgeZ + 0.85), new THREE.Euler(0.08, side * 0.4, -0.1), new THREE.Vector3(1.25, 1.25, 1.15)), 0.29);
    addPrimitive(new THREE.DodecahedronGeometry(1.2, 1), transform(new THREE.Vector3(x - side * 0.45, -1.15, bridgeZ - 1.05), new THREE.Euler(-0.14, side * 0.35, 0.1), new THREE.Vector3(1.3, 1.6, 1.2)), 0.13);
  });
}

function resize() {
  const width = Math.max(1, canvas.clientWidth || 960);
  const height = Math.max(1, canvas.clientHeight || 540);
  const aspect = width / height;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  positionCamera();
  renderer.setSize(width, height, false);
  const drawingSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const pixelPitch = pixelSize * renderer.getPixelRatio();
  sceneTarget.setSize(
    Math.max(1, Math.round(drawingSize.x / pixelPitch)),
    Math.max(1, Math.round(drawingSize.y / pixelPitch)),
  );
  ditherMaterial.uniforms.uSceneResolution.value.set(sceneTarget.width, sceneTarget.height);
  updateSourceCrop();
  if (mounted) render();
}

function render() {
  if (!mounted) return;
  const fireTime = performance.now() * 0.001;
  animatedVillageFires.forEach(({ materials, smokePuffs, fireLight }) => {
    materials.forEach((material) => { material.uniforms.uTime.value = fireTime; });
    smokePuffs.forEach(({ mesh, x, y, z, index }) => {
      mesh.position.set(
        x + Math.sin(fireTime * 0.72 + index * 1.7) * 0.075,
        y + Math.sin(fireTime * 1.1 + index * 1.3) * 0.055,
        z + Math.cos(fireTime * 0.65 + index) * 0.045,
      );
    });
    fireLight.intensity = 2.1 + 0.45 * Math.sin(fireTime * 7.0) + 0.2 * Math.sin(fireTime * 11.3);
  });
  if (inputTexture) {
    if (inputIsCanvas) inputTexture.needsUpdate = true;
    if (typeof HTMLVideoElement !== 'undefined' && inputSource instanceof HTMLVideoElement) {
      // Keep the mapped video frame fresh even when requestVideoFrameCallback
      // is throttled or skipped by the browser's VideoTexture path.
      if (inputSource.readyState >= HTMLVideoElement.HAVE_CURRENT_DATA && inputSource.currentTime !== lastVideoTime) {
        inputTexture.needsUpdate = true;
        lastVideoTime = inputSource.currentTime;
      }
      const width = inputSource.videoWidth || 1;
      const height = inputSource.videoHeight || 1;
      if (width !== inputSourceSize.x || height !== inputSourceSize.y) {
        inputSourceSize.set(width, height);
        updateSourceCrop();
      }
    }
    ditherMaterial.uniforms.uScene.value = inputTexture;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(ditherScene, ditherCamera);
    return;
  }
  ditherMaterial.uniforms.uScene.value = sceneTarget.texture;
  renderer.setRenderTarget(sceneTarget);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(ditherScene, ditherCamera);
}

function animate() {
  if (!running) return;
  render();
  frameRequest = requestAnimationFrame(animate);
}

function mount() {
  if (mounted) return api;
  buildPointField();
  setScene(activeModel);
  mounted = true;
  resize();
  render();
  return api;
}

function start() {
  mount();
  if (running) return api;
  running = true;
  frameRequest = requestAnimationFrame(animate);
  return api;
}

function stop() {
  running = false;
  cancelAnimationFrame(frameRequest);
  return api;
}

function setOptions(options = {}) {
  // Keep the old option name as a compatibility alias for screen dither.
  if (typeof options.jitter === 'number') ditherMaterial.uniforms.uDitherAmount.value = clamp(options.jitter, 0, 1);
  if (typeof options.dither === 'number') ditherMaterial.uniforms.uDitherAmount.value = clamp(options.dither, 0, 1);
  if (typeof options.pixelSize === 'number') {
    pixelSize = clamp(options.pixelSize, 2, 12);
    resize();
  }
  if (typeof options.cameraBlur === 'number') ditherMaterial.uniforms.uCameraBlur.value = clamp(options.cameraBlur, 0, 1);
  if (typeof options.tiltShift === 'number') ditherMaterial.uniforms.uTiltShift.value = clamp(options.tiltShift, 0, 1);
  if (typeof options.focusPosition === 'number') ditherMaterial.uniforms.uFocusPosition.value = clamp(options.focusPosition, 0, 1);
  if (typeof options.focusRange === 'number') ditherMaterial.uniforms.uFocusRange.value = clamp(options.focusRange, 0.04, 0.45);
  if (typeof options.cameraBlur === 'number' || typeof options.tiltShift === 'number' || typeof options.focusPosition === 'number' || typeof options.focusRange === 'number') render();
  return api;
}

function randomize() {
  // Kept as a stable API hook; the scene geometry is intentionally immutable.
  return api;
}

function setScene(sceneName) {
  if (sceneName !== 'bridge' && sceneName !== 'map') return api;
  const changed = activeModel !== sceneName;
  const showBridge = sceneName === 'bridge';
  activeModel = showBridge ? 'bridge' : 'map';
  scene.background = showBridge ? null : new THREE.Color(0xb5b5b5);
  scene.fog = showBridge ? new THREE.FogExp2(0x060708, 0.0045) : null;
  mapModels.forEach((mesh) => { mesh.visible = !showBridge; });
  bridgeModels.forEach((mesh) => { mesh.visible = showBridge; });
  if (changed) resetCamera();
  renderer.shadowMap.needsUpdate = true;
  render();
  return api;
}

function resetCamera() {
  const defaults = cameraDefaults[activeModel];
  cameraTarget.copy(defaults.target);
  cameraTheta = defaults.theta;
  cameraPhi = defaults.phi;
  cameraDistance = defaults.distance;
  cameraZoom = defaults.zoom;
  positionCamera();
  render();
  return api;
}

let pointerState = null;
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointerdown', (event) => {
  if (inputSource) return;
  if (event.button !== 0 && event.button !== 2) return;
  pointerState = { x: event.clientX, y: event.clientY, action: event.button === 2 || event.shiftKey ? 'pan' : 'orbit' };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add(pointerState.action === 'pan' ? 'is-panning' : 'is-orbiting');
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointerState) return;
  const dx = event.clientX - pointerState.x;
  const dy = event.clientY - pointerState.y;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  if (pointerState.action === 'orbit') {
    cameraTheta -= dx * 0.008;
    cameraPhi = clamp(cameraPhi + dy * 0.008, 0.12, Math.PI - 0.12);
    positionCamera();
  } else {
    const rect = canvas.getBoundingClientRect();
    const viewHeightAtTarget = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const unitsPerPixel = viewHeightAtTarget / Math.max(1, rect.height * cameraZoom);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    cameraTarget.addScaledVector(right, -dx * unitsPerPixel);
    cameraTarget.addScaledVector(up, dy * unitsPerPixel);
    positionCamera();
  }
  render();
});
const endPointerGesture = (event) => {
  if (!pointerState) return;
  pointerState = null;
  canvas.classList.remove('is-panning', 'is-orbiting');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
};
canvas.addEventListener('pointerup', endPointerGesture);
canvas.addEventListener('pointercancel', endPointerGesture);
canvas.addEventListener('wheel', (event) => {
  if (inputSource) return;
  event.preventDefault();
  cameraZoom = clamp(cameraZoom * Math.exp(-event.deltaY * 0.001), 0.55, 3.5);
  positionCamera();
  render();
}, { passive: false });

const api = {
  canvas,
  scene,
  camera,
  renderer,
  ditherMaterial,
  sceneTarget,
  mount,
  start,
  stop,
  resize,
  setOptions,
  setInputSource,
  setScene,
  resetCamera,
  randomize,
  getModelCount: () => solidMeshes.length,
  getActiveScene: () => activeModel,
  getPixelSize: () => pixelSize,
};

window.OEmpirePointField = api;
window.dispatchEvent(new CustomEvent('o-empire-point-field-ready', { detail: api }));
window.addEventListener('resize', resize);
