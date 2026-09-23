import * as THREE from './assets/vendor/three.module.js';

const canvas = document.querySelector('#point-canvas');

const vertexShader = `
  uniform float uPointSize;
  attribute float aSize;
  attribute float aTone;
  varying float vTone;

  void main() {
    // Geometry is deliberately static. Dithering happens in the fullscreen pass below.
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * uPointSize * (112.0 / max(1.0, -mvPosition.z)), 1.15, 8.0);
    vTone = aTone;
  }
`;

const fragmentShader = `
  varying float vTone;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float square = max(abs(point.x), abs(point.y));
    if (square > 0.47) discard;
    float edge = 1.0 - smoothstep(0.43, 0.49, square);
    gl_FragColor = vec4(vec3(vTone), edge * 0.96);
  }
`;

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

    // The render target stores the point color with coverage in RGB. Recover
    // the plate tone before dithering so antialiased square edges stay edges.
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
const pointMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uPointSize: { value: 2.55 },
  },
  vertexShader,
  fragmentShader,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

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

const points = [];
let pointGeometry = null;
let pointCloud = null;
let mounted = false;
let running = false;

function transform(position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
}

function pushSample(position, normal, tone, seed, size) {
  const light = clamp(normal.dot(new THREE.Vector3(0.38, 0.82, 0.42)) * 0.38 + 0.57);
  points.push({ position: position.clone(), tone: clamp(tone * (0.72 + light * 0.42), 0.12, 0.94), seed, size });
}

function sampleGeometry(geometry, matrix, tone, density = 13, seedOffset = 0) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  let seedIndex = seedOffset;

  for (let offset = 0; offset < positions.count; offset += 3) {
    a.fromBufferAttribute(positions, offset).applyMatrix4(matrix);
    b.fromBufferAttribute(positions, offset + 1).applyMatrix4(matrix);
    c.fromBufferAttribute(positions, offset + 2).applyMatrix4(matrix);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const area = ab.clone().cross(ac).length() * 0.5;
    const count = Math.max(1, Math.ceil(area * density));
    normal.crossVectors(ab, ac).normalize();
    worldNormal.copy(normal).applyNormalMatrix(normalMatrix).normalize();
    const lattice = Math.max(1, Math.ceil(Math.sqrt(count * 2)));

    for (let row = 0; row < lattice; row += 1) {
      for (let column = 0; column < lattice - row; column += 1) {
        const u = (column + 0.45) / lattice;
        const v = (row + 0.45) / lattice;
        if (u + v >= 1) continue;
        point.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
        pushSample(point, worldNormal, tone, (seedIndex += 1) * 0.017, 0.78 + ((seedIndex * 13) % 31) / 30);
      }
    }
  }

  if (source !== geometry) source.dispose();
}

function addPrimitive(geometry, matrix, tone, density, seedOffset) {
  sampleGeometry(geometry, matrix, tone, density, seedOffset);
  geometry.dispose();
}

function buildPointField() {
  points.length = 0;
  // The floor establishes the isometric map plane.
  addPrimitive(new THREE.PlaneGeometry(15.5, 11.5, 18, 14), transform(new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0)), 0.5, 6, 10);

  // A low-poly house: wall mass + four-sided roof.
  addPrimitive(new THREE.BoxGeometry(2.2, 1.6, 1.8), transform(new THREE.Vector3(-2.7, 0.82, 0.2)), 0.24, 18, 200);
  addPrimitive(new THREE.ConeGeometry(1.72, 1.08, 4), transform(new THREE.Vector3(-2.7, 2.12, 0.2), new THREE.Euler(0, Math.PI / 4, 0)), 0.13, 22, 320);

  // A six-sided watch tower.
  addPrimitive(new THREE.CylinderGeometry(0.92, 1.06, 3.5, 6), transform(new THREE.Vector3(1.25, 1.78, 0.3)), 0.18, 21, 500);
  addPrimitive(new THREE.ConeGeometry(1.2, 1.15, 6), transform(new THREE.Vector3(1.25, 4.12, 0.3)), 0.09, 23, 680);

  // A monolith and a broken stone cluster give the scene a second depth plane.
  addPrimitive(new THREE.DodecahedronGeometry(1.05, 1), transform(new THREE.Vector3(0.1, 1.05, -2.35), new THREE.Euler(0.08, 0.32, -0.05), new THREE.Vector3(0.8, 1.42, 0.8)), 0.31, 19, 800);
  addPrimitive(new THREE.IcosahedronGeometry(0.85, 1), transform(new THREE.Vector3(3.55, 0.62, -1.8), new THREE.Euler(0.12, 0.2, 0.3), new THREE.Vector3(1.35, 0.68, 0.85)), 0.26, 17, 960);

  // Monochrome flower heads are still real 3D volumes in this scene.
  const flowerPositions = [[-4.25, 0.14, -2.2], [-3.55, 0.14, -1.55], [-1.85, 0.14, -2.8], [2.8, 0.14, -2.6], [4.15, 0.14, -1.2], [3.6, 0.14, 1.75]];
  flowerPositions.forEach(([x, y, z], index) => {
    addPrimitive(new THREE.CylinderGeometry(0.035, 0.05, 0.78, 5), transform(new THREE.Vector3(x, y + 0.38, z)), 0.35, 10, 1120 + index * 90);
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = petal * Math.PI * 2 / 5;
      const px = x + Math.cos(angle) * 0.19;
      const pz = z + Math.sin(angle) * 0.19;
      addPrimitive(new THREE.IcosahedronGeometry(0.16, 1), transform(new THREE.Vector3(px, y + 0.8, pz), new THREE.Euler(0.2, angle, 0), new THREE.Vector3(1.05, 0.55, 0.74)), 0.74, 16, 1180 + index * 90 + petal * 6);
    }
    addPrimitive(new THREE.IcosahedronGeometry(0.13, 1), transform(new THREE.Vector3(x, y + 0.8, z)), 0.3, 18, 1250 + index * 90);
  });

  const positions = new Float32Array(points.length * 3);
  const seeds = new Float32Array(points.length);
  const sizes = new Float32Array(points.length);
  const tones = new Float32Array(points.length);
  points.forEach((point, index) => {
    positions[index * 3] = point.position.x;
    positions[index * 3 + 1] = point.position.y;
    positions[index * 3 + 2] = point.position.z;
    seeds[index] = point.seed;
    sizes[index] = point.size;
    tones[index] = point.tone;
  });

  pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  pointGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  pointGeometry.setAttribute('aTone', new THREE.BufferAttribute(tones, 1));
  pointCloud = new THREE.Points(pointGeometry, pointMaterial);
  pointCloud.frustumCulled = false;
  root.add(pointCloud);
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
  if (typeof options.pointSize === 'number') pointMaterial.uniforms.uPointSize.value = clamp(options.pointSize, 0.8, 6);
  return api;
}

function randomize() {
  // Kept as a stable API hook; the scene geometry is intentionally immutable.
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
  randomize,
  getPointCount: () => points.length,
};

window.OEmpirePointField = api;
window.dispatchEvent(new CustomEvent('o-empire-point-field-ready', { detail: api }));
window.addEventListener('resize', resize);
