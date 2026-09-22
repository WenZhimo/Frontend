import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import MODEL_BASE64 from '../leaf-cluster.glb';
import sourceData from './palettes.json';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#model-canvas');
const status = document.querySelector('#model-status');
const autoButton = document.querySelector('#auto-rotate');
const resetButton = document.querySelector('#reset-view');
const paletteButtons = [...document.querySelectorAll('[data-palette]')];
const lightColorInput = document.querySelector('#light-color');
const lightIntensityInput = document.querySelector('#light-intensity');
const lightAzimuthInput = document.querySelector('#light-azimuth');
const lightElevationInput = document.querySelector('#light-elevation');
const lightIntensityValue = document.querySelector('#light-intensity-value');
const lightAzimuthValue = document.querySelector('#light-azimuth-value');
const lightElevationValue = document.querySelector('#light-elevation-value');
const leafSizeInput = document.querySelector('#leaf-size');
const leafDensityInput = document.querySelector('#leaf-density');
const leafSizeValue = document.querySelector('#leaf-size-value');
const leafDensityValue = document.querySelector('#leaf-density-value');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const { palettes, variation } = sourceData;
const viewDirection = new THREE.Vector3(21.7, 15.7, 20.5).normalize();
const lightDirection = new THREE.Vector3();
const lightColor = new THREE.Color('#ffd8a3');
let model, renderer, camera, controls, scene, leafMaterial;
let frameRadius = 1;
let previousFit = 0;
let currentPalette = 'moss';
let animationFrame;
let lastTime = 0;
let autoRotateModel = false;
let draggingModel = false;
const trackballPrevious = new THREE.Vector3();
const trackballCurrent = new THREE.Vector3();
const dragRotation = new THREE.Quaternion();
const autoRotation = new THREE.Quaternion();
const worldUp = new THREE.Vector3(0, 1, 0);
const modelBaseQuaternion = new THREE.Quaternion();

function decodeBase64(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}

function setStatus(message) { status.textContent = message; }

const vertexShader = `
  uniform float uLeafScale;
  uniform vec3 uLightDirection;
  attribute vec3 leafCenter;
  attribute vec3 leafNormal;
  attribute vec3 leafShadeNormal;
  attribute vec3 leafTangent;
  attribute float leafBillboard;
  attribute float leafRandom;
  varying float vBillboard;
  varying float vLeafRandom;
  varying float vStylizedLight;

  void main() {
    vec3 worldPosition;
    if (leafBillboard > 0.5) {
      vec3 centerWorld = (modelMatrix * vec4(leafCenter, 1.0)).xyz;
      vec3 localOffset = (position - leafCenter) * uLeafScale;
      vec3 localNormal = normalize(leafNormal);
      vec3 localTangent = normalize(leafTangent);
      vec3 localBitangent = normalize(cross(localNormal, localTangent));
      vec3 normalToCamera = normalize(cameraPosition - centerWorld);
      vec3 tangentWorld = normalize(mat3(modelMatrix) * localTangent);
      tangentWorld = tangentWorld - normalToCamera * dot(tangentWorld, normalToCamera);
      if (length(tangentWorld) < 0.001) {
        tangentWorld = normalize(cross(normalToCamera, vec3(0.0, 1.0, 0.0)));
      } else {
        tangentWorld = normalize(tangentWorld);
      }
      vec3 bitangentWorld = normalize(cross(normalToCamera, tangentWorld));
      worldPosition = centerWorld
        + tangentWorld * dot(localOffset, localTangent)
        + bitangentWorld * dot(localOffset, localBitangent)
        + normalToCamera * dot(localOffset, localNormal);
    } else {
      worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    }
    vBillboard = leafBillboard;
    vLeafRandom = leafRandom;
    // This is the original Blender rule: the Color Ramp is driven by the
    // stored Geometry Nodes normal and the world-space light direction.
    // The billboard basis must never drive this or flip it toward the camera.
    // The viewer uses uniform scale, so this transform preserves normals.
    vec3 styleNormalWorld = normalize(mat3(modelMatrix) * leafShadeNormal);
    vStylizedLight = clamp(dot(styleNormalWorld, normalize(uLightDirection)) * 0.5 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform float uPalettePosition0;
  uniform float uPalettePosition1;
  uniform float uPalettePosition2;
  uniform float uPalettePosition3;
  uniform vec3 uPaletteColor0;
  uniform vec3 uPaletteColor1;
  uniform vec3 uPaletteColor2;
  uniform vec3 uPaletteColor3;
  uniform float uVariationPower;
  uniform float uVariationOffset;
  uniform float uVariationHue;
  uniform float uVariationValue;
  uniform float uVariationMaxDelta;
  uniform vec3 uLightColor;
  uniform float uLightIntensity;
  uniform float uAmbient;
  uniform float uLeafDensity;
  varying float vBillboard;
  varying float vLeafRandom;
  varying float vStylizedLight;

  vec3 rampColor(float light) {
    if (light <= uPalettePosition0) return uPaletteColor0;
    if (light <= uPalettePosition1) {
      float t = (light - uPalettePosition0) / (uPalettePosition1 - uPalettePosition0);
      return mix(uPaletteColor0, uPaletteColor1, clamp(t, 0.0, 1.0));
    }
    if (light <= uPalettePosition2) {
      float t = (light - uPalettePosition1) / (uPalettePosition2 - uPalettePosition1);
      return mix(uPaletteColor1, uPaletteColor2, clamp(t, 0.0, 1.0));
    }
    if (light <= uPalettePosition3) {
      float t = (light - uPalettePosition2) / (uPalettePosition3 - uPalettePosition2);
      return mix(uPaletteColor2, uPaletteColor3, clamp(t, 0.0, 1.0));
    }
    return uPaletteColor3;
  }

  vec3 rgbToHsv(vec3 color) {
    float maxChannel = max(color.r, max(color.g, color.b));
    float minChannel = min(color.r, min(color.g, color.b));
    float delta = maxChannel - minChannel;
    float hue = 0.0;
    if (delta > 0.00001) {
      if (maxChannel == color.r) {
        hue = mod((color.g - color.b) / delta, 6.0);
      } else if (maxChannel == color.g) {
        hue = (color.b - color.r) / delta + 2.0;
      } else {
        hue = (color.r - color.g) / delta + 4.0;
      }
      if (hue < 0.0) hue += 6.0;
      hue /= 6.0;
    }
    float saturation = maxChannel > 0.00001 ? delta / maxChannel : 0.0;
    return vec3(hue, saturation, maxChannel);
  }

  vec3 hsvToRgb(vec3 hsv) {
    vec3 wheel = abs(fract(hsv.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    vec3 rgb = clamp(wheel - 1.0, 0.0, 1.0);
    return hsv.z * mix(vec3(1.0), rgb, clamp(hsv.y, 0.0, 1.0));
  }

  vec3 leafColor(float light) {
    vec3 hsv = rgbToHsv(rampColor(light));
    // The source node graph uses a negative power for subtle per-leaf accents.
    // A few seeds are almost zero, which would otherwise turn that power into
    // an unbounded hue/value jump and create a single neon-pink outlier.
    float seedDelta = (vLeafRandom > 0.0 ? pow(vLeafRandom, uVariationPower) : 0.0) - uVariationOffset;
    seedDelta = clamp(seedDelta, -uVariationMaxDelta, uVariationMaxDelta);
    hsv.x = fract(hsv.x + seedDelta * uVariationHue);
    hsv.z = max(0.0, hsv.z * (1.0 + seedDelta * uVariationValue));
    return hsvToRgb(hsv);
  }

  void main() {
    if (vBillboard < 0.5 || vLeafRandom > uLeafDensity) discard;
    // The source camera-ray material is emission: its Color Ramp already
    // encodes stylized light and shadow. A second Lambert factor would shade
    // everything twice. The small neutral fill is independent of the sun.
    vec3 direct = leafColor(vStylizedLight) * uLightColor * uLightIntensity;
    vec3 fill = leafColor(0.5) * uAmbient;
    gl_FragColor = vec4(direct + fill, 1.0);
    #include <colorspace_fragment>
  }
`;

function createLeafMaterial() {
  leafMaterial = new THREE.ShaderMaterial({
    name: 'Live leaf billboard material',
    uniforms: {
      uPalettePosition0: { value: 0.0 },
      uPalettePosition1: { value: 0.33 },
      uPalettePosition2: { value: 0.66 },
      uPalettePosition3: { value: 1.0 },
      uPaletteColor0: { value: new THREE.Vector3() },
      uPaletteColor1: { value: new THREE.Vector3() },
      uPaletteColor2: { value: new THREE.Vector3() },
      uPaletteColor3: { value: new THREE.Vector3() },
      uVariationPower: { value: variation.power },
      uVariationOffset: { value: variation.offset },
      uVariationHue: { value: variation.hue },
      uVariationValue: { value: variation.value },
      uVariationMaxDelta: { value: variation.maxDelta ?? 8.0 },
      uLightDirection: { value: lightDirection },
      uLightColor: { value: lightColor },
      uLightIntensity: { value: 1.15 },
      uAmbient: { value: 0.12 },
      uLeafScale: { value: Number(leafSizeInput.value) },
      uLeafDensity: { value: Number(leafDensityInput.value) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}

// Blender's glTF exporter converts POSITION/NORMAL into glTF's Y-up space
// (x, z, -y), while generic custom attributes stay in Blender coordinates.
// Convert the per-leaf basis attributes once after loading so their centers
// and offsets share the same space as the actual geometry.
function toGltfVectorAttribute(attribute) {
  const values = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    const offset = i * 3;
    values[offset] = attribute.getX(i);
    values[offset + 1] = attribute.getZ(i);
    values[offset + 2] = -attribute.getY(i);
  }
  return new THREE.BufferAttribute(values, 3);
}

function setPalette(name) {
  currentPalette = palettes[name] ? name : 'moss';
  const palette = palettes[currentPalette];
  document.documentElement.style.setProperty('--accent', palette.accent);
  paletteButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.palette === currentPalette)));
  if (leafMaterial) {
    palette.stops.slice(0, 4).forEach(([position, color], index) => {
      leafMaterial.uniforms[`uPalettePosition${index}`].value = position;
      leafMaterial.uniforms[`uPaletteColor${index}`].value.set(color[0], color[1], color[2]);
    });
    leafMaterial.uniforms.uVariationPower.value = variation.power;
    leafMaterial.uniforms.uVariationOffset.value = variation.offset;
    leafMaterial.uniforms.uVariationHue.value = variation.hue;
    leafMaterial.uniforms.uVariationValue.value = variation.value;
    leafMaterial.uniforms.uVariationMaxDelta.value = variation.maxDelta ?? 8.0;
  }
  setStatus(`${palette.label} · 实时风格光影`);
}

function updateLight() {
  const azimuth = THREE.MathUtils.degToRad(Number(lightAzimuthInput.value));
  const elevation = THREE.MathUtils.degToRad(Number(lightElevationInput.value));
  lightDirection.set(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth),
  ).normalize();
  lightColor.set(lightColorInput.value);
  const intensity = Number(lightIntensityInput.value);
  if (leafMaterial) {
    leafMaterial.uniforms.uLightDirection.value.copy(lightDirection);
    leafMaterial.uniforms.uLightColor.value.copy(lightColor);
    leafMaterial.uniforms.uLightIntensity.value = intensity;
  }
  lightIntensityValue.textContent = intensity.toFixed(2);
  lightAzimuthValue.textContent = `${lightAzimuthInput.value}°`;
  lightElevationValue.textContent = `${lightElevationInput.value}°`;
}

function updateLeafParameters() {
  const size = Number(leafSizeInput.value);
  const density = Number(leafDensityInput.value);
  if (leafMaterial) {
    leafMaterial.uniforms.uLeafScale.value = size;
    leafMaterial.uniforms.uLeafDensity.value = density;
  }
  leafSizeValue.textContent = `${size.toFixed(2)}×`;
  leafDensityValue.textContent = `${Math.round(density * 100)}%`;
}

function fitDistance() {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  return frameRadius / Math.sin(Math.min(vertical, horizontal)) * 1.22;
}

function resetView() {
  if (model) model.quaternion.copy(modelBaseQuaternion);
  controls.target.set(0, 0, 0);
  camera.position.copy(viewDirection).multiplyScalar(fitDistance());
  controls.update(0);
}

function pointerToTrackball(event, target) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
  const y = 1 - ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2;
  const lengthSquared = x * x + y * y;
  if (lengthSquared <= 1) {
    target.set(x, y, Math.sqrt(1 - lengthSquared));
  } else {
    target.set(x, y, 0).normalize();
  }
}

function resize() {
  const width = stage.clientWidth, height = stage.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (model) {
    const nextFit = fitDistance();
    if (previousFit) camera.position.sub(controls.target).multiplyScalar(nextFit / previousFit).add(controls.target);
    previousFit = nextFit;
    controls.minDistance = frameRadius * 1.08;
    controls.maxDistance = nextFit * 3;
  }
}

function makeScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.autoRotate = false;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI - 0.1;
  resize();
  new ResizeObserver(resize).observe(stage);
  setupModelRotation();
}

function setupModelRotation() {
  canvas.addEventListener('pointerdown', event => {
    if (!model || (event.pointerType === 'mouse' && event.button !== 0)) return;
    draggingModel = true;
    pointerToTrackball(event, trackballPrevious);
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!draggingModel || !model) return;
    pointerToTrackball(event, trackballCurrent);
    dragRotation.setFromUnitVectors(trackballPrevious, trackballCurrent);
    // Accumulate rotations as quaternions in world space. This keeps the
    // model fully rotatable without Euler-angle limits or gimbal lock.
    model.quaternion.premultiply(dragRotation).normalize();
    trackballPrevious.copy(trackballCurrent);
    event.preventDefault();
  });
  const endDrag = event => {
    draggingModel = false;
    canvas.classList.remove('is-dragging');
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

function animate(time = 0) {
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (model && autoRotateModel) {
    autoRotation.setFromAxisAngle(worldUp, delta * 0.35);
    model.quaternion.premultiply(autoRotation).normalize();
  }
  controls.update(delta);
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(animate);
}

function fail(error) {
  console.error(error);
  cancelAnimationFrame(animationFrame);
  autoButton.disabled = resetButton.disabled = true;
  paletteButtons.forEach(button => { button.disabled = true; });
  setStatus('预览未能加载');
  const message = document.createElement('div');
  message.className = 'error-message';
  message.textContent = '无法显示 3D 模型。请使用支持 WebGL 2 的新版 Chrome、Edge 或 Firefox，并开启浏览器硬件加速。';
  stage.appendChild(message);
}

async function init() {
  try {
    makeScene();
    createLeafMaterial();
    updateLight();
    updateLeafParameters();
    setStatus('解析真实 GLB…');
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) reject(new Error('GLB parsing exceeded 20 seconds.'));
      }, 20000);
      loader.parse(decodeBase64(MODEL_BASE64), '',
        result => { settled = true; clearTimeout(timeout); resolve(result); },
        error => { settled = true; clearTimeout(timeout); reject(error); });
    });
    setStatus('建立叶片朝向…');
    model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    model.scale.setScalar(3.45 / Math.max(...bounds.getSize(new THREE.Vector3()).toArray()));
    model.position.multiplyScalar(model.scale.x);
    scene.add(model);
    modelBaseQuaternion.copy(model.quaternion);
    model.updateMatrixWorld(true);
    frameRadius = 0;
    const point = new THREE.Vector3();
    model.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      const required = ['_leaf_random', '_leaf_center', '_leaf_normal', '_leaf_shade_normal', '_leaf_tangent', '_leaf_billboard'];
      if (required.some(name => !geometry.getAttribute(name))) {
        throw new Error('Missing billboard attributes; re-export with export_model.py.');
      }
      // Blender's glTF exporter preserves custom attributes with underscore
      // names. Map them to the readable names used by the GLSL attributes,
      // converting Blender coordinates to the glTF coordinate system first.
      geometry.setAttribute('leafCenter', toGltfVectorAttribute(geometry.getAttribute('_leaf_center')));
      geometry.setAttribute('leafNormal', toGltfVectorAttribute(geometry.getAttribute('_leaf_normal')));
      geometry.setAttribute('leafShadeNormal', toGltfVectorAttribute(geometry.getAttribute('_leaf_shade_normal')));
      geometry.setAttribute('leafTangent', toGltfVectorAttribute(geometry.getAttribute('_leaf_tangent')));
      geometry.setAttribute('leafBillboard', geometry.getAttribute('_leaf_billboard'));
      geometry.setAttribute('leafRandom', geometry.getAttribute('_leaf_random'));
      object.material = leafMaterial;
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        frameRadius = Math.max(frameRadius, point.length());
      }
    });
    setStatus('计算材质颜色…');
    resize();
    resetView();
    setPalette(currentPalette);
    autoButton.disabled = resetButton.disabled = false;
    paletteButtons.forEach(button => { button.disabled = false; });
    autoButton.addEventListener('click', () => {
      autoRotateModel = !autoRotateModel;
      autoButton.setAttribute('aria-pressed', String(autoRotateModel));
    });
    resetButton.addEventListener('click', resetView);
    paletteButtons.forEach(button => button.addEventListener('click', () => setPalette(button.dataset.palette)));
    [lightColorInput, lightIntensityInput, lightAzimuthInput, lightElevationInput].forEach(input => input.addEventListener('input', updateLight));
    [leafSizeInput, leafDensityInput].forEach(input => input.addEventListener('input', updateLeafParameters));
    reducedMotion.addEventListener('change', event => {
      if (event.matches) {
        autoRotateModel = false;
        autoButton.setAttribute('aria-pressed', 'false');
      }
    });
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(animationFrame);
      if (!document.hidden) { lastTime = performance.now(); animate(lastTime); }
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      fail(new Error('WebGL context lost'));
    });
    animate();
  } catch (error) { fail(error); }
}
init();
