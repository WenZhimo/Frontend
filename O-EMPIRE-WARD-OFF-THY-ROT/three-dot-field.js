import * as THREE from './assets/vendor/three.module.js';

const canvas = document.querySelector('#point-canvas');

const vertexShader = `
  uniform float uTime;
  uniform float uJitter;
  uniform float uPointSize;
  attribute float aSeed;
  attribute float aSize;
  attribute float aTone;
  varying float vTone;

  void main() {
    vec3 p = position;
    float waveA = sin(uTime * 1.35 + aSeed * 31.7);
    float waveB = cos(uTime * 1.03 + aSeed * 17.1);
    float waveC = sin(uTime * 1.82 + aSeed * 7.4);
    p += vec3(waveA, waveB, waveC) * uJitter * (0.018 + aSize * 0.007);

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
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

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const pointMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uJitter: { value: 0.34 },
    uPointSize: { value: 2.55 },
  },
  vertexShader,
  fragmentShader,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
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
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
camera.position.set(8.4, 6.8, 10.5);
camera.lookAt(0, 1.05, 0);

const root = new THREE.Group();
root.rotation.y = -0.18;
scene.add(root);

const points = [];
let pointGeometry = null;
let pointCloud = null;
let clockStart = performance.now();
let scenePhase = 0;
let mounted = false;
let running = false;

function transform(position, rotation = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
}

function pushSample(position, normal, tone, seed, size) {
  const light = clamp(normal.dot(new THREE.Vector3(0.38, 0.82, 0.42)) * 0.38 + 0.57);
  const dither = (Math.sin(seed * 91.37) * 0.5 + 0.5) * 0.11 - 0.055;
  points.push({ position: position.clone(), tone: clamp(tone * (0.72 + light * 0.42) + dither, 0.12, 0.94), seed, size });
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
}

function render(time = performance.now()) {
  if (!mounted) return;
  pointMaterial.uniforms.uTime.value = (time - clockStart) * 0.001;
  root.rotation.y = -0.18 + Math.sin(time * 0.00019) * 0.035;
  root.rotation.x = Math.cos(time * 0.00023) * 0.012;
  renderer.render(scene, camera);
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
  clockStart = performance.now();
  requestAnimationFrame(render);
  return api;
}

function stop() {
  running = false;
  return api;
}

function setOptions(options = {}) {
  if (typeof options.jitter === 'number') pointMaterial.uniforms.uJitter.value = clamp(options.jitter, 0, 1.6);
  if (typeof options.pointSize === 'number') pointMaterial.uniforms.uPointSize.value = clamp(options.pointSize, 0.8, 6);
  return api;
}

function randomize() {
  scenePhase += 1;
  root.rotation.y = -0.18 + (scenePhase % 5 - 2) * 0.065;
  pointMaterial.uniforms.uPointSize.value = 2.2 + (scenePhase % 3) * 0.24;
  return api;
}

const api = {
  canvas,
  scene,
  camera,
  renderer,
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
