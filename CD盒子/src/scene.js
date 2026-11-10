import * as THREE from 'three';
import { CASE, CAMERA, ROOM, DISC_CATALOG, clamp } from './config.js';
import {
  roundedRectPath,
  circlePath,
  linePath,
  roundedProfile,
  buildSweepGeometry,
  roundedShape,
  buildSheetGeometry,
  buildDiscGeometry,
} from './geometry.js';
import {
  createRodMaterial,
  createSheetMaterial,
  createDiscMaterial,
  createBackgroundMaterial,
  createRoomMaterial,
  createStarMaterial,
  createBlurMaterial,
  createFinalMaterial,
} from './materials.js';

const TAU = Math.PI * 2;

function makeFallbackCover(label, hue) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 1024);
  grd.addColorStop(0, `hsl(${hue}, 80%, 20%)`);
  grd.addColorStop(0.45, `hsl(${(hue + 55) % 360}, 90%, 55%)`);
  grd.addColorStop(1, `hsl(${(hue + 160) % 360}, 75%, 18%)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 1024);
  g.globalAlpha = 0.55;
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.arc(512 + Math.cos(i * 2.1) * 360, 512 + Math.sin(i * 1.7) * 360, 40 + (i % 5) * 35, 0, TAU);
    g.fillStyle = `hsl(${(hue + i * 24) % 360}, 90%, ${30 + (i % 4) * 14}%)`;
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#ffffff';
  g.font = '700 84px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(label.toUpperCase(), 512, 540);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeBackgroundMaterial() {
  return createBackgroundMaterial();
}

export class CdCaseScene {
  constructor(canvas, { onReady, onError, onIndex } = {}) {
    this.canvas = canvas;
    this.onReady = onReady;
    this.onError = onError;
    this.onIndex = onIndex;
    this.discs = DISC_CATALOG;
    this.index = 0;
    this.clock = 0;
    this.autoClock = 0;
    this.auto = true;
    this.paused = false;
    this.spinOn = true;
    this.spin = 0;
    this.flip = 0;
    this.targetFlip = 0;
    this.open = 0;
    this.targetOpen = 0;
    this.drags = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
    this.pointer = { active: false, id: -1, x: 0, y: 0, startX: 0, startY: 0, dist: 0 };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ready = false;
    this.frame = 0;
    this._tick = this._tick.bind(this);
    this._onResize = this.resize.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this.init();
  }

  async init() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.setClearColor(0xffffff, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      this.isWebGL2 = this.renderer.capabilities.isWebGL2;
      if (!this.isWebGL2) throw new Error('WebGL2 is required for this demo.');

      this.hasHDR =
        this.renderer.extensions.has('EXT_color_buffer_float') ||
        this.renderer.extensions.has('EXT_color_buffer_half_float');
      this.targetType = this.hasHDR ? THREE.HalfFloatType : THREE.UnsignedByteType;

      this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
      this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.camera.position.set(0, 0, CAMERA.distance);
      this.camera.lookAt(0, 0, 0);

      this.caseRoot = new THREE.Object3D();
      this.caseRoot.matrixAutoUpdate = true;

      this.trayGroup = new THREE.Group();
      this.lidPivot = new THREE.Group();
      this.lidPivot.position.set(CASE.hinge.x, 0, CASE.hinge.z);
      this.lidContent = new THREE.Group();
      this.lidContent.position.set(-CASE.hinge.x, 0, -CASE.hinge.z);
      this.lidPivot.add(this.lidContent);

      this.plasticRoot = new THREE.Group();
      this.plasticRoot.matrixAutoUpdate = false;
      this.plasticRoot.add(this.trayGroup, this.lidPivot);

      this.discRoot = new THREE.Group();
      this.discRoot.matrixAutoUpdate = false;

      this.rodMaterial = createRodMaterial();
      this.sheetMaterial = createSheetMaterial();
      this.backgroundMaterial = makeBackgroundMaterial();

      this.opaqueScene = new THREE.Scene();
      this.plasticScene = new THREE.Scene();
      this.plasticScene.add(this.plasticRoot);

      const paper = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), this.backgroundMaterial);
      paper.position.z = -70;
      paper.renderOrder = -10;
      paper.frustumCulled = false;
      this.paper = paper;
      this.opaqueScene.add(paper);

      this.buildCaseGeometry();
      this.buildDiscGeometry();

      this.roomTarget = new THREE.WebGLCubeRenderTarget(ROOM.size, {
        type: this.targetType,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
      this.roomMaterial = createRoomMaterial();
      this.roomMaterial.uniforms.uSize.value = ROOM.size;
      this.cubeScene = new THREE.Scene();
      const cubeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.roomMaterial);
      cubeQuad.frustumCulled = false;
      this.cubeScene.add(cubeQuad);
      this.buildRoom();

      this.rodMaterial.uniforms.uRoom.value = this.roomTarget.texture;
      this.sheetMaterial.uniforms.uRoom.value = this.roomTarget.texture;
      this.rodMaterial.uniforms.uProjection.value = this.camera.projectionMatrix;

      this.createRenderTargets();
      this.createPostScene();

      await this.loadDiscs();

      this.bindPointer();
      this.resize();
      window.addEventListener('resize', this._onResize);

      this.ready = true;
      this.onReady?.();
      this.frame = requestAnimationFrame(this._tick);
    } catch (err) {
      console.error(err);
      this.onError?.(err);
    }
  }

  buildCaseGeometry() {
    const addRod = (path, profile, z, closed, parent) => {
      const geo = buildSweepGeometry(path, profile, z, closed);
      const mesh = new THREE.Mesh(geo, this.rodMaterial);
      mesh.frustumCulled = false;
      parent.add(mesh);
      return mesh;
    };
    const addSheet = (shape, z0, z1, parent) => {
      const geo = buildSheetGeometry(shape, z0, z1, 24);
      const mesh = new THREE.Mesh(geo, this.sheetMaterial);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      parent.add(mesh);
      return mesh;
    };

    // Tray frame: a rounded-square loop with a thick rounded profile.
    const trayPath = roundedRectPath(
      CASE.half - 3.3,
      CASE.corner - 3.3,
      8,
    );
    addRod(trayPath, roundedProfile(3.3, 3.1, 2.8, 5), -0.7, true, this.trayGroup);
    addSheet(roundedShape(69.5, 4.4), -4.8, -4.2, this.trayGroup);

    // Hub rings and four spindle teeth.
    addRod(circlePath(16.5, 64), roundedProfile(0.78, 0.72, 0.68, 4), -2.45, true, this.trayGroup);
    addRod(circlePath(7.7, 48), roundedProfile(0.50, 0.58, 0.44, 3), -2.70, true, this.trayGroup);
    addRod(circlePath(16.2, 64), roundedProfile(0.55, 0.50, 0.45, 4), -1.12, true, this.trayGroup);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const p0 = [Math.cos(a) * 8.2, Math.sin(a) * 8.2];
      const p1 = [Math.cos(a) * 14.0, Math.sin(a) * 14.0];
      addRod(linePath(p0, p1, 3), roundedProfile(0.55, 0.45, 0.40, 3), -2.62, false, this.trayGroup);
    }

    // Lid frame and window.
    const lidPath = roundedRectPath(72 - 1.0, 5.0 - 1.0, 8);
    addRod(lidPath, roundedProfile(1.0, 1.0, 0.98, 4), 4.0, true, this.lidContent);
    addRod(roundedRectPath(64.5, 4.0, 8), roundedProfile(0.48, 0.48, 0.44, 4), 4.18, true, this.lidContent);
    addRod(linePath([-71.4, -42], [-71.4, 42], 8), roundedProfile(0.85, 0.85, 0.78, 4), 4.0, false, this.lidContent);
    addSheet(roundedShape(69.2, 3.8), 3.96, 4.10, this.lidContent);

    // Small tray clips at the four corners.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const p0 = [Math.cos(a) * 61.5, Math.sin(a) * 61.5];
      const p1 = [Math.cos(a) * 68.0, Math.sin(a) * 68.0];
      addRod(linePath(p0, p1, 3), roundedProfile(0.9, 0.8, 0.72, 3), -1.8, false, this.trayGroup);
    }
  }

  buildDiscGeometry() {
    const geo = buildDiscGeometry({
      radius: CASE.discRadius,
      inner: 7.5,
      thickness: CASE.discThickness,
      thetaSegments: 256,
      radialSegments: 12,
    });
    this.discGeo = geo;
    this.discMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    this.discMesh.position.z = -1.2;
    this.discMesh.frustumCulled = false;
    this.discRoot.add(this.discMesh);
    this.opaqueScene.add(this.discRoot);
  }

  async loadDiscs() {
    const loader = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const load = async (disc) => {
      let tex;
      try {
        tex = await loader.loadAsync(disc.cover);
      } catch {
        tex = makeFallbackCover(disc.slug, 210 + this.discs.indexOf(disc) * 62);
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    this.textures = await Promise.all(this.discs.map(load));
    this.discMaterials = this.discs.map((disc, i) => createDiscMaterial(this.textures[i], disc));
    this.setDiscMaterial(0);
  }

  setDiscMaterial(index) {
    this.index = index;
    this.discMesh.material = this.discMaterials[index];
    this.backgroundMaterial.uniforms.uDiscDark.value = [0.20, 0.24, 0.24, 0.30][this.discs[index].base] ?? 0.24;
    this.onIndex?.(index, this.discs[index]);
  }

  buildRoom() {
    for (let face = 0; face < 6; face++) {
      this.roomMaterial.uniforms.uFace.value = face;
      this.renderer.setRenderTarget(this.roomTarget, face);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.cubeScene, this.ortho);
    }
    this.renderer.setRenderTarget(null);
  }

  createRenderTargets() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, size.x);
    const h = Math.max(1, size.y);
    const base = {
      type: this.targetType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.opaqueTarget = new THREE.WebGLRenderTarget(w, h, { ...base, samples: 0 });
    this.plasticTarget = new THREE.WebGLRenderTarget(w, h, { ...base, samples: 4 });
    this.starTarget = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)), {
      type: this.targetType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.blurTarget = this.starTarget.clone();
  }

  createPostScene() {
    this.fsScene = new THREE.Scene();
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.fsQuad.frustumCulled = false;
    this.fsScene.add(this.fsQuad);

    this.starMaterial = createStarMaterial();
    this.blurMaterial = createBlurMaterial();
    this.finalMaterial = createFinalMaterial();
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    const targetWidth = this.camera.aspect < 0.75 ? 338 : 380;
    this.camera.position.z = Math.max(targetWidth / (2 * tan * this.camera.aspect), 210 / (2 * tan));
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.rodMaterial.uniforms.uProjection.value = this.camera.projectionMatrix;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const bw = Math.max(1, size.x);
    const bh = Math.max(1, size.y);
    this.opaqueTarget?.setSize(bw, bh);
    this.plasticTarget?.setSize(bw, bh);
    const sw = Math.max(1, Math.round(bw / 2));
    const sh = Math.max(1, Math.round(bh / 2));
    this.starTarget?.setSize(sw, sh);
    this.blurTarget?.setSize(sw, sh);
    if (this.finalMaterial) this.finalMaterial.uniforms.uScene.value = this.plasticTarget.texture;
    if (this.starMaterial) this.starMaterial.uniforms.uTexel.value.set(1 / sw, 1 / sh);
  }

  bindPointer() {
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    this.pointer.active = true;
    this.pointer.id = ev.pointerId;
    this.pointer.x = ev.clientX;
    this.pointer.y = ev.clientY;
    this.pointer.startX = ev.clientX;
    this.pointer.startY = ev.clientY;
    this.pointer.dist = 0;
    this.drags.vy = 0;
    this.drags.vp = 0;
    this.auto = false;
    this.canvas.setPointerCapture(ev.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  onPointerMove(ev) {
    if (!this.pointer.active || ev.pointerId !== this.pointer.id) return;
    const dx = ev.clientX - this.pointer.x;
    const dy = ev.clientY - this.pointer.y;
    this.pointer.x = ev.clientX;
    this.pointer.y = ev.clientY;
    this.pointer.dist = Math.max(this.pointer.dist, Math.hypot(ev.clientX - this.pointer.startX, ev.clientY - this.pointer.startY));
    this.drags.yaw = clamp(this.drags.yaw + dx * 0.008, -0.8, 0.8);
    this.drags.pitch = clamp(this.drags.pitch + dy * 0.006, -0.38, 0.38);
    this.drags.vy = dx * 0.05;
    this.drags.vp = dy * 0.05;
  }

  onPointerUp(ev) {
    if (!this.pointer.active || ev.pointerId !== this.pointer.id) return;
    this.pointer.active = false;
    if (this.canvas.hasPointerCapture(ev.pointerId)) this.canvas.releasePointerCapture(ev.pointerId);
    this.canvas.style.cursor = '';
    if (this.pointer.dist < 6) this.toggleOpen();
  }

  toggleOpen() {
    this.auto = false;
    this.targetOpen = this.targetOpen > 0.5 ? 0 : 1;
  }

  setOpen(value) {
    this.auto = false;
    this.targetOpen = value ? 1 : 0;
  }

  setSpin(value) {
    this.spinOn = !!value;
  }

  setFlip(value) {
    this.targetFlip = value ? 1 : 0;
  }

  toggleFlip() {
    this.setFlip(this.targetFlip < 0.5);
  }

  setPaused(value) {
    this.paused = !!value;
  }

  setAuto(value) {
    this.auto = !!value;
    this.autoClock = 0;
  }

  next() {
    this.switchTo((this.index + 1) % this.discs.length);
  }

  prev() {
    this.switchTo((this.index - 1 + this.discs.length) % this.discs.length);
  }

  switchTo(index) {
    if (index === this.index) return;
    this.setDiscMaterial(index);
    this.targetFlip = 0;
    this.flip = 0;
    this.swap = { t: 0 };
  }

  update(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    this.autoClock += dt;

    if (this.auto && !this.reducedMotion && this.autoClock > 2.4 && this.targetOpen < 0.5) {
      this.targetOpen = 1;
      this.auto = false;
    }

    const k = 1 - Math.exp(-7 * dt);
    this.open += (this.targetOpen - this.open) * k;
    if (Math.abs(this.open - this.targetOpen) < 0.0005) this.open = this.targetOpen;

    if (!this.pointer.active) {
      this.drags.yaw = clamp(this.drags.yaw + this.drags.vy * dt, -0.8, 0.8);
      this.drags.pitch = clamp(this.drags.pitch + this.drags.vp * dt, -0.38, 0.38);
      this.drags.vy *= Math.exp(-5 * dt);
      this.drags.vp *= Math.exp(-5 * dt);
      this.drags.vy += -this.drags.yaw * 12 * dt;
      this.drags.vp += -this.drags.pitch * 12 * dt;
    }

    if (this.spinOn) this.spin += dt * 0.55;

    const flipK = 1 - Math.exp(-6 * dt);
    this.flip += (this.targetFlip - this.flip) * flipK;
    if (Math.abs(this.flip - this.targetFlip) < 0.0005) this.flip = this.targetFlip;

    const idle = this.reducedMotion ? 0.2 : 1;
    const yaw = -0.16 + Math.sin(this.clock * 0.55) * 0.07 * idle + this.drags.yaw;
    const pitch = -0.08 + Math.sin(this.clock * 0.7 + 0.7) * 0.035 * idle + this.drags.pitch;
    const roll = 0.012 + Math.sin(this.clock * 0.4) * 0.012 * idle;
    const open = this.open;

    this.caseRoot.position.set(open * 52, 0, 0);
    this.caseRoot.rotation.set(pitch, yaw, roll);
    this.caseRoot.scale.setScalar(1 + open * 0.01);
    this.caseRoot.updateMatrixWorld(true);

    this.plasticRoot.matrix.copy(this.caseRoot.matrix);
    this.plasticRoot.matrixWorld.copy(this.caseRoot.matrix);
    this.lidPivot.rotation.y = -open * CASE.openAngle;
    this.plasticRoot.updateMatrixWorld(true);

    this.discRoot.matrix.copy(this.caseRoot.matrix);
    this.discRoot.matrixWorld.copy(this.caseRoot.matrix);
    this.discRoot.updateMatrixWorld(true);

    let discScale = 1;
    if (this.swap) {
      this.swap.t += dt * 2.6;
      const t = this.swap.t;
      discScale = 1 - 0.35 * Math.sin(Math.min(t, 1) * Math.PI);
      if (t >= 1) this.swap = null;
    }
    this.discMesh.rotation.set(this.flip * Math.PI, 0, this.spin);
    this.discMesh.scale.setScalar(discScale);

    this.backgroundMaterial.uniforms.uTrayInv.value.copy(this.caseRoot.matrixWorld).invert();
    this.backgroundMaterial.uniforms.uLidInv.value.copy(this.lidPivot.matrixWorld).invert();
    this.rodMaterial.uniforms.uProjection.value.copy(this.camera.projectionMatrix);
    this.rodMaterial.uniforms.uBehind.value = this.opaqueTarget.texture;
  }

  render() {
    if (!this.ready) return;
    const r = this.renderer;
    r.setClearColor(0xffffff, 0);
    r.setRenderTarget(this.opaqueTarget);
    r.clear(true, true, true);
    r.render(this.opaqueScene, this.camera);

    r.setRenderTarget(this.plasticTarget);
    r.clear(true, true, true);
    r.render(this.opaqueScene, this.camera);
    r.render(this.plasticScene, this.camera);

    // Star extraction at half resolution.
    r.setRenderTarget(this.starTarget);
    r.clear(true, false, false);
    this.starMaterial.uniforms.uScene.value = this.plasticTarget.texture;
    this.fsQuad.material = this.starMaterial;
    r.render(this.fsScene, this.ortho);

    this.blurMaterial.uniforms.uTex.value = this.starTarget.texture;
    this.blurMaterial.uniforms.uStep.value.set(1.5 / this.starTarget.width, 0);
    r.setRenderTarget(this.blurTarget);
    r.clear(true, false, false);
    this.fsQuad.material = this.blurMaterial;
    r.render(this.fsScene, this.ortho);

    this.blurMaterial.uniforms.uTex.value = this.blurTarget.texture;
    this.blurMaterial.uniforms.uStep.value.set(0, 1.5 / this.starTarget.height);
    r.setRenderTarget(this.starTarget);
    r.clear(true, false, false);
    r.render(this.fsScene, this.ortho);

    this.finalMaterial.uniforms.uScene.value = this.plasticTarget.texture;
    this.finalMaterial.uniforms.uStars.value = this.starTarget.texture;
    r.setRenderTarget(null);
    r.clear(true, true, true);
    this.fsQuad.material = this.finalMaterial;
    r.render(this.fsScene, this.ortho);
  }

  _tick(now) {
    if (!this.last) this.last = now;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.update(dt);
    this.render();
    this.frame = requestAnimationFrame(this._tick);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.opaqueTarget?.dispose();
    this.plasticTarget?.dispose();
    this.starTarget?.dispose();
    this.blurTarget?.dispose();
    this.roomTarget?.dispose();
    this.renderer?.dispose();
  }
}
