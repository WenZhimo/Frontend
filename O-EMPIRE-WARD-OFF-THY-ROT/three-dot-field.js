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
  uniform float uDitherScale;
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
    vec4 source = texture2D(uScene, vUv);
    if (source.a < 0.02) discard;

    // The render target stores the mesh color with coverage in RGB. Recover
    // the plate tone before dithering so antialiased mesh edges stay edges.
    vec3 plateColor = source.rgb / max(source.a, 0.0001);
    float luminance = clamp(dot(plateColor, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float darkLock = 1.0 - smoothstep(0.08, 0.22, luminance);
    float lightLock = smoothstep(0.78, 0.92, luminance);
    float midtone = (1.0 - darkLock) * (1.0 - lightLock);
    float levels = 4.0;
    float quantized = luminance * levels;
    float lower = floor(quantized) / levels;
    float fraction = fract(quantized);
    // Use square screen cells. The pattern is deterministic: no point or
    // model moves, and only middle tones are reconstructed between levels.
    vec2 ditherPixel = floor(gl_FragCoord.xy / max(uDitherScale, 1.0));
    float threshold = (bayer4(ditherPixel) + 0.5) / 16.0;
    float stepToUpper = step(threshold, fraction);
    float dithered = lower + stepToUpper * (1.0 / levels);
    float value = mix(luminance, dithered, uDitherAmount * midtone);
    value = mix(value, 0.055, darkLock);
    value = mix(value, 0.95, lightLock);
    gl_FragColor = vec4(vec3(value), source.a);
  }
`;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ditherMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uScene: { value: null },
    uDitherAmount: { value: 0.86 },
    uDitherScale: { value: 2 },
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

const scene = new THREE.Scene();
const ambientLight = new THREE.AmbientLight(0xffffff, 1.08);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
keyLight.position.set(5.5, 9, 7);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.52);
fillLight.position.set(-7, 4, -5);
scene.add(ambientLight, keyLight, fillLight);
const ditherScene = new THREE.Scene();
const ditherCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const ditherQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ditherMaterial);
ditherScene.add(ditherQuad);
const sceneTarget = new THREE.WebGLRenderTarget(960, 540, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
});
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
camera.position.set(8.4, 6.8, 10.5);
camera.lookAt(0, 1.05, 0);

const root = new THREE.Group();
root.rotation.y = -0.18;
scene.add(root);

const solidMeshes = [];
const mapModels = [];
const bridgeModels = [];
let activeModelCollection = mapModels;
let activeModel = 'bridge';
let mounted = false;
let running = false;

function transform(position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
}

function addPrimitive(geometry, matrix, tone) {
  // Keep the actual low-poly surface. The fullscreen pass below handles all
  // tonal dithering after this continuous mesh has been rasterized.
  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(tone, tone, tone),
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.applyMatrix4(matrix);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  solidMeshes.push(mesh);
  activeModelCollection.push(mesh);
  root.add(mesh);
}

function buildPointField() {
  activeModelCollection = mapModels;

  // The floor establishes the isometric map plane.
  addPrimitive(new THREE.PlaneGeometry(15.5, 11.5, 18, 14), transform(new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0)), 0.48);

  // A low-poly house: wall mass + four-sided roof.
  addPrimitive(new THREE.BoxGeometry(2.2, 1.6, 1.8), transform(new THREE.Vector3(-2.7, 0.82, 0.2)), 0.42);
  addPrimitive(new THREE.ConeGeometry(1.72, 1.08, 4), transform(new THREE.Vector3(-2.7, 2.12, 0.2), new THREE.Euler(0, Math.PI / 4, 0)), 0.28);

  // A six-sided watch tower.
  addPrimitive(new THREE.CylinderGeometry(0.92, 1.06, 3.5, 6), transform(new THREE.Vector3(1.25, 1.78, 0.3)), 0.38);
  addPrimitive(new THREE.ConeGeometry(1.2, 1.15, 6), transform(new THREE.Vector3(1.25, 4.12, 0.3)), 0.24);

  // A monolith and a broken stone cluster give the scene a second depth plane.
  addPrimitive(new THREE.DodecahedronGeometry(1.05, 1), transform(new THREE.Vector3(0.1, 1.05, -2.35), new THREE.Euler(0.08, 0.32, -0.05), new THREE.Vector3(0.8, 1.42, 0.8)), 0.5);
  addPrimitive(new THREE.IcosahedronGeometry(0.85, 1), transform(new THREE.Vector3(3.55, 0.62, -1.8), new THREE.Euler(0.12, 0.2, 0.3), new THREE.Vector3(1.35, 0.68, 0.85)), 0.42);

  // Monochrome flower heads are still real 3D volumes in this scene.
  const flowerPositions = [[-4.25, 0.14, -2.2], [-3.55, 0.14, -1.55], [-1.85, 0.14, -2.8], [2.8, 0.14, -2.6], [4.15, 0.14, -1.2], [3.6, 0.14, 1.75]];
  flowerPositions.forEach(([x, y, z], index) => {
    addPrimitive(new THREE.CylinderGeometry(0.035, 0.05, 0.78, 5), transform(new THREE.Vector3(x, y + 0.38, z)), 0.56);
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 2 / 5;
      const px = x + Math.cos(angle) * 0.19;
      const pz = z + Math.sin(angle) * 0.19;
      addPrimitive(new THREE.IcosahedronGeometry(0.16, 1), transform(new THREE.Vector3(px, y + 0.8, pz), new THREE.Euler(0.2, angle, 0), new THREE.Vector3(1.05, 0.55, 0.74)), 0.9);
    }
    addPrimitive(new THREE.IcosahedronGeometry(0.13, 1), transform(new THREE.Vector3(x, y + 0.8, z)), 0.48);
  });

  // A large bridge study inspired by image-3: the side walls are one
  // continuous extruded profile, with real arch openings cut into the mesh.
  activeModelCollection = bridgeModels;
  addPrimitive(new THREE.PlaneGeometry(15.5, 11.5, 18, 14), transform(new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0)), 0.48);
  const bridgeZ = 0.95;
  const bridgeY = 2.45;
  const bridgeLength = 11.8;
  const bridgeWidth = 2.35;
  const archCenters = [-3.55, 0, 3.55];
  const archRadius = 1.2;
  const archSpring = 1.22;
  const archWallShape = new THREE.Shape();
  archWallShape.moveTo(-bridgeLength / 2, 0.28);
  archWallShape.lineTo(bridgeLength / 2, 0.28);
  archWallShape.lineTo(bridgeLength / 2, 2.28);
  archWallShape.lineTo(-bridgeLength / 2, 2.28);
  archWallShape.closePath();
  archCenters.forEach((center) => {
    const opening = new THREE.Path();
    opening.moveTo(center - archRadius, 0.28);
    opening.lineTo(center - archRadius, archSpring);
    opening.absarc(center, archSpring, archRadius, Math.PI, 0, true);
    opening.lineTo(center + archRadius, 0.28);
    opening.closePath();
    archWallShape.holes.push(opening);
  });
  const archWallGeometry = new THREE.ExtrudeGeometry(archWallShape, {
    depth: 0.18,
    bevelEnabled: false,
    curveSegments: 12,
    steps: 1,
  });
  archWallGeometry.translate(0, 0, -0.09);
  [-1, 1].forEach((side) => {
    addPrimitive(
      archWallGeometry.clone(),
      transform(new THREE.Vector3(0, 0, bridgeZ + side * (bridgeWidth / 2 - 0.09))),
      0.34,
    );
  });
  addPrimitive(new THREE.BoxGeometry(12.4, 0.52, bridgeWidth), transform(new THREE.Vector3(0, bridgeY, bridgeZ)), 0.38);
  addPrimitive(new THREE.BoxGeometry(12.6, 0.24, 0.2), transform(new THREE.Vector3(0, bridgeY + 0.38, bridgeZ - (bridgeWidth / 2 - 0.2))), 0.62);
  addPrimitive(new THREE.BoxGeometry(12.6, 0.24, 0.2), transform(new THREE.Vector3(0, bridgeY + 0.38, bridgeZ + (bridgeWidth / 2 - 0.2))), 0.62);

  [-5.95, 5.95].forEach((x) => {
    addPrimitive(new THREE.BoxGeometry(0.86, 2.75, 2.78), transform(new THREE.Vector3(x, 1.48, bridgeZ)), 0.24);
    addPrimitive(new THREE.ConeGeometry(0.74, 0.6, 4), transform(new THREE.Vector3(x, 3.16, bridgeZ), new THREE.Euler(0, Math.PI / 4, 0)), 0.2);
  });

  for (let x = -5.1; x <= 5.1; x += 1.3) {
    [-1, 1].forEach((side) => {
      addPrimitive(new THREE.BoxGeometry(0.16, 0.82, 0.16), transform(new THREE.Vector3(x, bridgeY + 0.7, bridgeZ + side * (bridgeWidth / 2 - 0.2))), 0.52);
    });
  }

}

function resize() {
  const width = Math.max(1, canvas.clientWidth || 960);
  const height = Math.max(1, canvas.clientHeight || 540);
  const aspect = width / height;
  const viewHeight = 7.8;
  camera.left = -(viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  const drawingSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  sceneTarget.setSize(drawingSize.x, drawingSize.y);
}

function render(time = performance.now()) {
  if (!mounted) return;
  ditherMaterial.uniforms.uScene.value = sceneTarget.texture;
  renderer.setRenderTarget(sceneTarget);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(ditherScene, ditherCamera);
  if (running) requestAnimationFrame(render);
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
  requestAnimationFrame(render);
  return api;
}

function stop() {
  running = false;
  return api;
}

function setOptions(options = {}) {
  // Keep the old option name as a compatibility alias for screen dither.
  if (typeof options.jitter === 'number') ditherMaterial.uniforms.uDitherAmount.value = clamp(options.jitter, 0, 1);
  if (typeof options.dither === 'number') ditherMaterial.uniforms.uDitherAmount.value = clamp(options.dither, 0, 1);
  return api;
}

function randomize() {
  // Kept as a stable API hook; the scene geometry is intentionally immutable.
  return api;
}

function setScene(sceneName) {
  if (sceneName !== 'bridge' && sceneName !== 'map') return api;
  const showBridge = sceneName === 'bridge';
  activeModel = showBridge ? 'bridge' : 'map';
  mapModels.forEach((mesh) => { mesh.visible = !showBridge; });
  bridgeModels.forEach((mesh) => { mesh.visible = showBridge; });
  render();
  return api;
}

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
  setScene,
  randomize,
  getModelCount: () => solidMeshes.length,
  getActiveScene: () => activeModel,
};

window.OEmpirePointField = api;
window.dispatchEvent(new CustomEvent('o-empire-point-field-ready', { detail: api }));
window.addEventListener('resize', resize);
