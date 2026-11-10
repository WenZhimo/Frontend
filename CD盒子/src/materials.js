import * as THREE from 'three';
import { rodVertex, rodFragment } from './shaders/rod.js';
import { sheetVertex, sheetFragment } from './shaders/sheet.js';
import { discVertex, discFragment } from './shaders/disc.js';
import { backgroundVertex, backgroundFragment } from './shaders/background.js';
import { roomFragment } from './shaders/room.js';
import { fullscreenVertex } from './shaders/common.js';
import { starVertex, starExtractFragment, blurFragment, finalFragment } from './shaders/post.js';

const base = {
  depthTest: true,
  depthWrite: true,
  toneMapped: false,
};

export function createRodMaterial() {
  return new THREE.ShaderMaterial({
    ...base,
    side: THREE.DoubleSide,
    uniforms: {
      uBehind: { value: null },
      uRoom: { value: null },
      uProjection: { value: new THREE.Matrix4() },
      uIor: { value: 1.59 },
      uFade: { value: 1 },
      uDepth: { value: 14 },
      uAbsorb: { value: new THREE.Vector3(0.0042, 0.0030, 0.0026) },
    },
    vertexShader: rodVertex,
    fragmentShader: rodFragment,
  });
}

export function createSheetMaterial() {
  return new THREE.ShaderMaterial({
    ...base,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: {
      uRoom: { value: null },
      uIor: { value: 1.59 },
      uFade: { value: 1 },
      uTint: { value: 1 },
      uAbsorb: { value: new THREE.Vector3(0.0042, 0.0030, 0.0026) },
    },
    vertexShader: sheetVertex,
    fragmentShader: sheetFragment,
  });
}

export function createDiscMaterial(texture, disc) {
  return new THREE.ShaderMaterial({
    ...base,
    side: THREE.DoubleSide,
    uniforms: {
      uArt: { value: texture },
      uBase: { value: disc.base },
      uArtIn: { value: disc.artIn },
      uPrintOut: { value: disc.printOut },
      uMirrorIn: { value: disc.mirrorIn },
      uFade: { value: 1 },
    },
    vertexShader: discVertex,
    fragmentShader: discFragment,
  });
}

export function createBackgroundMaterial() {
  return new THREE.ShaderMaterial({
    ...base,
    side: THREE.DoubleSide,
    uniforms: {
      uLight: { value: new THREE.Vector3(-0.42, 0.38, 0.82).normalize() },
      uTrayInv: { value: new THREE.Matrix4() },
      uLidInv: { value: new THREE.Matrix4() },
      uDiscDark: { value: 0.24 },
      uFade: { value: 1 },
    },
    vertexShader: backgroundVertex,
    fragmentShader: backgroundFragment,
  });
}

export function createRoomMaterial() {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uFace: { value: 0 },
      uSize: { value: 512 },
    },
    vertexShader: fullscreenVertex,
    fragmentShader: roomFragment,
  });
}

export function createFullscreenMaterial(fragmentShader, uniforms = {}) {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms,
    vertexShader: fullscreenVertex,
    fragmentShader,
  });
}

export function createStarMaterial() {
  return createFullscreenMaterial(starExtractFragment, {
    uScene: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uThreshold: { value: 2.0 },
  });
}

export function createBlurMaterial() {
  return createFullscreenMaterial(blurFragment, {
    uTex: { value: null },
    uStep: { value: new THREE.Vector2() },
    uFalloff: { value: 0.7 },
  });
}

export function createFinalMaterial() {
  return createFullscreenMaterial(finalFragment, {
    uScene: { value: null },
    uStars: { value: null },
    uStarStrength: { value: 1.6 },
  });
}

export { starVertex };
