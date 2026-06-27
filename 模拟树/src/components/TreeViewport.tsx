import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TreeConfig, TreeStructure } from '../lib/tree';
import { generateTreeStructure } from '../lib/tree';
import { clamp, createSeededRng, randomRange, smoothstep } from '../lib/seed';

export interface TreeViewportHandle {
  resetCamera: () => void;
  downloadPng: () => void;
}

interface TreeViewportProps {
  config: TreeConfig;
  onStats: (structure: TreeStructure) => void;
}

type ParticleSystem = {
  points: THREE.Points;
  velocities: Float32Array;
  bounds: {
    top: number;
    bottom: number;
    width: number;
  };
};

function createLeafGeometry() {
  const vertices: number[] = [];
  const indices: number[] = [];
  const blade = [
    [0, 0, 0.035],
    [0, 0.95, 0],
    [0.26, 0.58, 0.018],
    [0.34, 0.12, 0.028],
    [0.2, -0.48, 0.016],
    [0, -0.82, 0],
    [-0.2, -0.48, -0.016],
    [-0.34, 0.12, -0.028],
    [-0.26, 0.58, -0.018],
  ];

  const addBlade = (angle: number, yOffset: number, scale: number) => {
    const base = vertices.length / 3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const [x, y, z] of blade) {
      vertices.push(
        (x * cos - z * sin) * scale,
        y * scale + yOffset,
        (x * sin + z * cos) * scale
      );
    }
    indices.push(
      base, base + 1, base + 2,
      base, base + 2, base + 3,
      base, base + 3, base + 4,
      base, base + 4, base + 5,
      base, base + 5, base + 6,
      base, base + 6, base + 7,
      base, base + 7, base + 8,
      base, base + 8, base + 1
    );
  };

  addBlade(0, 0, 1);
  addBlade(Math.PI * 0.42, -0.08, 0.82);
  addBlade(-Math.PI * 0.38, -0.05, 0.76);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createNeedleClusterGeometry() {
  const geometry = new THREE.ConeGeometry(1, 1.45, 6, 1, false);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createLeafClusterGeometry(compact = false) {
  const lobeSpecs = compact
    ? [
        { position: new THREE.Vector3(0, 0, 0), scale: new THREE.Vector3(0.78, 0.62, 0.7) },
        { position: new THREE.Vector3(0.38, 0.1, 0.06), scale: new THREE.Vector3(0.46, 0.36, 0.42) },
        { position: new THREE.Vector3(-0.34, -0.02, -0.08), scale: new THREE.Vector3(0.4, 0.32, 0.38) },
        { position: new THREE.Vector3(0.03, 0.22, -0.28), scale: new THREE.Vector3(0.34, 0.28, 0.36) },
      ]
    : [
        { position: new THREE.Vector3(0, 0, 0), scale: new THREE.Vector3(0.62, 0.5, 0.58) },
        { position: new THREE.Vector3(0.48, 0.05, 0.03), scale: new THREE.Vector3(0.42, 0.34, 0.38) },
        { position: new THREE.Vector3(-0.45, 0.02, -0.05), scale: new THREE.Vector3(0.38, 0.31, 0.36) },
        { position: new THREE.Vector3(0.12, 0.24, 0.34), scale: new THREE.Vector3(0.36, 0.28, 0.34) },
        { position: new THREE.Vector3(-0.08, -0.2, -0.36), scale: new THREE.Vector3(0.32, 0.27, 0.32) },
        { position: new THREE.Vector3(0.2, -0.18, 0.24), scale: new THREE.Vector3(0.28, 0.24, 0.28) },
      ];
  const pieces = lobeSpecs.map(({ position, scale }) => {
    const geometry = new THREE.IcosahedronGeometry(1, compact ? 0 : 1);
    geometry.applyMatrix4(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z));
    return geometry;
  });
  const merged = mergeGeometries(pieces, false) ?? new THREE.IcosahedronGeometry(1, 0);
  pieces.forEach((geometry) => geometry.dispose());
  merged.computeVertexNormals();
  return merged;
}

export const TreeViewport = forwardRef<TreeViewportHandle, TreeViewportProps>(function TreeViewport(
  { config, onStats },
  ref
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);
  const treeGroupRef = useRef<THREE.Group | null>(null);
  const branchesRef = useRef<THREE.Mesh | null>(null);
  const barkRidgesRef = useRef<THREE.Mesh | null>(null);
  const rootFlaresRef = useRef<THREE.Mesh | null>(null);
  const trunkDetailsRef = useRef<THREE.Mesh | null>(null);
  const coniferTiersRef = useRef<THREE.Mesh | null>(null);
  const willowStrandsRef = useRef<THREE.LineSegments | null>(null);
  const leafTwigsRef = useRef<THREE.LineSegments | null>(null);
  const canopyFillRef = useRef<THREE.InstancedMesh | null>(null);
  const canopyRef = useRef<THREE.InstancedMesh | null>(null);
  const leafMassRef = useRef<THREE.InstancedMesh | null>(null);
  const leavesRef = useRef<THREE.InstancedMesh | null>(null);
  const seedRef = useRef<THREE.Mesh | null>(null);
  const particlesRef = useRef<ParticleSystem | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const contactShadowRef = useRef<THREE.Mesh | null>(null);
  const configRef = useRef(config);
  const worldBoundsRef = useRef({ height: 3, spread: 2.2 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 1, 0));
  const manualCameraRef = useRef(new THREE.Vector3(8, 6, 8));
  const hasUserMovedCameraRef = useRef(false);

  const updateAutoCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const span = worldBoundsRef.current.spread;
    const height = worldBoundsRef.current.height;
    const aspect = camera?.aspect ?? 1;
    const narrowBoost = aspect < 1 ? 1 / aspect : 1;
    const base = Math.max(6.5, height * (1.03 + narrowBoost * 0.28) + span * 0.55);
    manualCameraRef.current.set(base * 1.02, height * 0.58 + 2.4, base * 1.14);
    cameraTargetRef.current.set(0, height * 0.43, 0);
    if (!hasUserMovedCameraRef.current && camera && controls) {
      camera.position.copy(manualCameraRef.current);
      controls.target.copy(cameraTargetRef.current);
      controls.update();
    }
  }, []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const disposeNode = (node: THREE.Object3D) => {
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if ((mesh as any).geometry) {
        (mesh as any).geometry.dispose?.();
      }
      const material = (mesh as any).material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose?.());
      } else {
        material?.dispose?.();
      }
    });
  };

  const createParticleSystem = (structure: TreeStructure, scene: THREE.Scene) => {
    if (particlesRef.current) {
      scene.remove(particlesRef.current.points);
      particlesRef.current.points.geometry.dispose();
      const material = particlesRef.current.points.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material.dispose();
      }
      particlesRef.current = null;
    }

    if (structure.weather.particleCount <= 0) return;

    const count = structure.weather.particleCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const bounds = {
      top: Math.max(8, structure.stats.height * 1.2),
      bottom: -2.5,
      width: Math.max(7, structure.stats.spread * 2.2 + 4),
    };
    for (let i = 0; i < count; i += 1) {
      const x = (Math.random() - 0.5) * bounds.width;
      const y = THREE.MathUtils.lerp(bounds.bottom, bounds.top, Math.random());
      const z = (Math.random() - 0.5) * bounds.width;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const speed = structure.weather.id === 'snow' ? 0.02 : structure.weather.id === 'storm' ? 0.22 : 0.08;
      velocities[i * 3] = (Math.random() - 0.5) * speed * 0.12;
      velocities[i * 3 + 1] = -speed * (structure.weather.id === 'snow' ? 0.55 : 1);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.12;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: structure.weather.id === 'snow' ? '#f3f7fb' : structure.weather.id === 'rain' || structure.weather.id === 'storm' ? '#8db8ff' : '#dce6d0',
      size: structure.weather.id === 'snow' ? 0.05 : 0.035,
      transparent: true,
      opacity: structure.weather.id === 'mist' ? 0.24 : 0.45,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    particlesRef.current = { points, velocities, bounds };
  };

  const rebuildTree = useCallback(
    (structure: TreeStructure, visibleGrowth: number) => {
      const scene = sceneRef.current;
      const treeGroup = treeGroupRef.current;
      const branches = branchesRef.current;
      const barkRidges = barkRidgesRef.current;
      const rootFlares = rootFlaresRef.current;
      const trunkDetails = trunkDetailsRef.current;
      const coniferTiers = coniferTiersRef.current;
      const willowStrands = willowStrandsRef.current;
      const leafTwigs = leafTwigsRef.current;
      const canopyFill = canopyFillRef.current;
      const canopy = canopyRef.current;
      const leafMass = leafMassRef.current;
      const leaves = leavesRef.current;
      const seed = seedRef.current;
      if (
        !scene ||
        !treeGroup ||
        !branches ||
        !barkRidges ||
        !rootFlares ||
        !trunkDetails ||
        !coniferTiers ||
        !willowStrands ||
        !leafTwigs ||
        !canopyFill ||
        !canopy ||
        !leafMass ||
        !leaves ||
        !seed
      ) return;

      onStats(structure);

      worldBoundsRef.current = {
        height: Math.max(3, structure.stats.height * 1.02 + 0.8),
        spread: Math.max(2.2, structure.stats.spread * 2 + 1.2),
      };
      cameraTargetRef.current.set(0, worldBoundsRef.current.height * 0.43, 0);

      const activeTreeType = configRef.current.treeType ?? 'broadleaf';
      const branchGeometries: THREE.BufferGeometry[] = [];
      const barkRidgeGeometries: THREE.BufferGeometry[] = [];
      const rootFlareGeometries: THREE.BufferGeometry[] = [];
      const trunkDetailGeometries: THREE.BufferGeometry[] = [];
      const branchMaterial = branches.material as THREE.MeshStandardMaterial;
      branchMaterial.color.set(structure.palette.bark);
      if (activeTreeType === 'ancient') {
        branchMaterial.color.offsetHSL(0, -0.06, -0.08);
      }
      branchMaterial.roughness = 0.92;
      branchMaterial.metalness = 0.02;

      const barkRidgeMaterial = barkRidges.material as THREE.MeshStandardMaterial;
      barkRidgeMaterial.color.set(structure.palette.barkDark);
      if (activeTreeType === 'ancient') {
        barkRidgeMaterial.color.offsetHSL(0, -0.04, -0.06);
      }
      barkRidgeMaterial.roughness = 0.96;
      barkRidgeMaterial.metalness = 0.01;

      const rootFlareMaterial = rootFlares.material as THREE.MeshStandardMaterial;
      rootFlareMaterial.color.set(structure.palette.bark);
      if (activeTreeType === 'ancient') {
        rootFlareMaterial.color.offsetHSL(0, -0.06, -0.07);
      }
      rootFlareMaterial.roughness = 0.94;
      rootFlareMaterial.metalness = 0.01;

      const trunkDetailsMaterial = trunkDetails.material as THREE.MeshStandardMaterial;
      trunkDetailsMaterial.color.set(structure.palette.barkDark);
      trunkDetailsMaterial.roughness = 0.98;
      trunkDetailsMaterial.metalness = 0.01;

      const coniferMaterial = coniferTiers.material as THREE.MeshStandardMaterial;
      coniferMaterial.color.set(structure.palette.leafShadow);
      coniferMaterial.roughness = 0.86;
      coniferMaterial.metalness = 0.01;
      coniferMaterial.emissive.set(structure.palette.leafShadow);
      coniferMaterial.emissiveIntensity = 0.08;

      const willowStrandsMaterial = willowStrands.material as THREE.LineBasicMaterial;
      willowStrandsMaterial.color.set(structure.palette.leafShadow);
      willowStrandsMaterial.transparent = true;
      willowStrandsMaterial.opacity = 0.68;

      const leafTwigsMaterial = leafTwigs.material as THREE.LineBasicMaterial;
      leafTwigsMaterial.color.set(structure.palette.barkDark);
      leafTwigsMaterial.transparent = true;
      leafTwigsMaterial.opacity = activeTreeType === 'conifer' ? 0.1 : activeTreeType === 'ancient' ? 0.14 : 0.15;

      const leafMaterial = leaves.material as THREE.MeshStandardMaterial;
      leafMaterial.color.set('#ffffff');
      leafMaterial.vertexColors = true;
      leafMaterial.roughness = 0.78;
      leafMaterial.metalness = 0.01;
      leafMaterial.emissive.set(structure.palette.leaf);
      leafMaterial.emissiveIntensity = 0.22;

      const leafMassMaterial = leafMass.material as THREE.MeshStandardMaterial;
      leafMassMaterial.color.set('#ffffff');
      leafMassMaterial.vertexColors = true;
      leafMassMaterial.roughness = 0.8;
      leafMassMaterial.metalness = 0.01;
      leafMassMaterial.emissive.set(structure.palette.leaf);
      leafMassMaterial.emissiveIntensity = 0.18;

      const canopyMaterial = canopy.material as THREE.MeshStandardMaterial;
      canopyMaterial.color.set('#ffffff');
      canopyMaterial.vertexColors = true;
      canopyMaterial.roughness = 0.86;
      canopyMaterial.metalness = 0.01;
      canopyMaterial.emissive.set(structure.palette.leaf);
      canopyMaterial.emissiveIntensity = 0.16;

      const canopyFillMaterial = canopyFill.material as THREE.MeshStandardMaterial;
      canopyFillMaterial.color.set('#ffffff');
      canopyFillMaterial.vertexColors = true;
      canopyFillMaterial.transparent = true;
      canopyFillMaterial.opacity = activeTreeType === 'conifer' ? 0 : activeTreeType === 'ancient' ? 0.08 : 0.14;
      canopyFillMaterial.depthWrite = false;
      canopyFillMaterial.roughness = 0.92;
      canopyFillMaterial.metalness = 0.01;
      canopyFillMaterial.emissive.set(structure.palette.leafShadow);
      canopyFillMaterial.emissiveIntensity = 0.08;

      const growth = clamp(visibleGrowth, 0, 1);
      const contactShadow = contactShadowRef.current;
      if (contactShadow) {
        const shadowMaterial = contactShadow.material as THREE.MeshBasicMaterial;
        shadowMaterial.opacity = THREE.MathUtils.lerp(0.05, 0.11, growth);
        const rawShadowScale = Math.sqrt(Math.max(0.2, structure.stats.spread)) * 0.34 + structure.stats.height * 0.018;
        const shadowScale = THREE.MathUtils.clamp(rawShadowScale, 0.28, 1.45);
        contactShadow.scale.set(shadowScale * 1.22, shadowScale * 0.68, 1);
        contactShadow.visible = growth > 0.08;
      }
      const branchMatrix = new THREE.Matrix4();
      const branchPosition = new THREE.Vector3();
      const branchDirection = new THREE.Vector3();
      const branchQuaternion = new THREE.Quaternion();
      const upVector = new THREE.Vector3(0, 1, 0);
      const zVector = new THREE.Vector3(0, 0, 1);
      const detailRng = createSeededRng(`${configRef.current.seed}::${configRef.current.stageId}::${activeTreeType}::bark-detail`);
      const detailIntensity = activeTreeType === 'ancient' ? 1.55 : activeTreeType === 'conifer' ? 0.72 : 1;

      const addSurfaceEllipsoid = (
        target: THREE.BufferGeometry[],
        position: THREE.Vector3,
        outward: THREE.Vector3,
        vertical: THREE.Vector3,
        width: number,
        height: number,
        depth: number,
        segments = 8
      ) => {
        const normal = outward.clone().normalize();
        const tangentY = vertical.clone().normalize();
        if (Math.abs(tangentY.dot(normal)) > 0.92) {
          tangentY.copy(upVector);
        }
        const tangentX = new THREE.Vector3().crossVectors(tangentY, normal).normalize();
        tangentY.crossVectors(normal, tangentX).normalize();
        const basis = new THREE.Matrix4().makeBasis(tangentX, tangentY, normal);
        basis.setPosition(position);
        const geometry = new THREE.SphereGeometry(1, segments, Math.max(6, Math.round(segments * 0.72)));
        geometry.applyMatrix4(new THREE.Matrix4().makeScale(width, height, depth));
        geometry.applyMatrix4(basis);
        target.push(geometry);
      };

      for (const segment of structure.segments) {
        const segmentGrowth = smoothstep(segment.progress - 0.07, segment.progress + 0.02, growth);
        if (segmentGrowth <= 0) continue;

        const start = segment.start;
        const end = segment.start.clone().lerp(segment.end, segmentGrowth);
        const direction = branchDirection.copy(end).sub(start);
        const length = direction.length();
        if (length <= 1e-4) continue;
        direction.normalize();
        branchQuaternion.setFromUnitVectors(upVector, direction);
        branchPosition.copy(start).add(end).multiplyScalar(0.5);
        const bottomRadius = Math.max(0.001, segment.radiusStart * (0.25 + segmentGrowth * 0.75));
        const topRadius = Math.max(0.001, THREE.MathUtils.lerp(segment.radiusStart, segment.radiusEnd, segmentGrowth) * (0.3 + segmentGrowth * 0.7));
        branchMatrix.compose(branchPosition, branchQuaternion, new THREE.Vector3(1, 1, 1));
        const isTrunkCore = segment.depth === 0 && direction.y > 0.45;
        const isRootLike = segment.depth === 0 && direction.y < 0.45 && Math.max(start.y, end.y) < 0.26;
        if (!isRootLike) {
          const radialSegments = segment.depth <= 1 ? 10 : 7;
          const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, length, radialSegments, 1, true);
          geometry.applyMatrix4(branchMatrix);
          branchGeometries.push(geometry);
        }
        const helper = Math.abs(direction.y) < 0.94 ? upVector : new THREE.Vector3(1, 0, 0);
        const sideA = new THREE.Vector3().crossVectors(direction, helper).normalize();
        const sideB = new THREE.Vector3().crossVectors(direction, sideA).normalize();

        const rootStartDistance = Math.hypot(start.x, start.z);
        const nearTrunkRoot = rootStartDistance < Math.max(0.16, bottomRadius * 4.2);
        if (isRootLike && nearTrunkRoot && bottomRadius > 0.014 && segmentGrowth > 0.62) {
          const horizontal = new THREE.Vector3(direction.x, 0, direction.z);
          if (horizontal.lengthSq() > 1e-5) {
            horizontal.normalize();
            const rootT = clamp(1 - Math.max(start.y, end.y) / 0.28, 0.25, 1);
            const flareLength = Math.min(length * 0.42, bottomRadius * (activeTreeType === 'ancient' ? 2.9 : 2.35));
            const flarePosition = start.clone().addScaledVector(horizontal, flareLength * 0.54).addScaledVector(upVector, bottomRadius * 0.46);
            const flareWidth = bottomRadius * (activeTreeType === 'ancient' ? 1.9 : 1.45) * rootT;
            const flareHeight = Math.max(0.018, bottomRadius * 0.78 * rootT);
            const rootQuaternion = new THREE.Quaternion().setFromUnitVectors(zVector, horizontal);
            const flareGeometry = new THREE.SphereGeometry(1, 10, 7);
            flareGeometry.applyMatrix4(new THREE.Matrix4().makeScale(flareWidth, flareHeight, flareLength));
            flareGeometry.applyMatrix4(new THREE.Matrix4().compose(flarePosition, rootQuaternion, new THREE.Vector3(1, 1, 1)));
            rootFlareGeometries.push(flareGeometry);
          }
        }

        if (!isRootLike && segment.depth <= 1 && bottomRadius > 0.035 && segmentGrowth > 0.7) {
          const ridgeCount = Math.round((segment.depth === 0 ? 6 : 2) * detailIntensity);
          for (let ridge = 0; ridge < ridgeCount; ridge += 1) {
            const angle = (Math.PI * 2 * ridge) / ridgeCount + segment.progress * 15 + randomRange(detailRng, -0.22, 0.22);
            const along = randomRange(detailRng, -0.24, 0.24) * length;
            const offset = sideA
              .clone()
              .multiplyScalar(Math.cos(angle) * bottomRadius * 0.84)
              .addScaledVector(sideB, Math.sin(angle) * bottomRadius * 0.84);
            const ridgeMatrix = new THREE.Matrix4();
            const ridgePosition = branchPosition.clone().add(offset).addScaledVector(direction, along);
            ridgeMatrix.compose(ridgePosition, branchQuaternion, new THREE.Vector3(1, 1, 1));
            const ridgeRadius = Math.max(0.002, bottomRadius * (segment.depth === 0 ? 0.034 : 0.022));
            const ridgeLength = length * randomRange(detailRng, segment.depth === 0 ? 0.32 : 0.24, segment.depth === 0 ? 0.72 : 0.46);
            const ridgeGeometry = new THREE.CylinderGeometry(ridgeRadius, ridgeRadius * 1.35, ridgeLength, 4, 1, true);
            ridgeGeometry.applyMatrix4(ridgeMatrix);
            barkRidgeGeometries.push(ridgeGeometry);
          }
        }

        if (isTrunkCore && bottomRadius > 0.045 && segmentGrowth > 0.82 && activeTreeType !== 'conifer') {
          const knotCount = Math.round((activeTreeType === 'ancient' ? 2.15 : 1.2) * detailIntensity);
          for (let knot = 0; knot < knotCount; knot += 1) {
            if (detailRng() < (activeTreeType === 'ancient' ? 0.82 : 0.48)) {
              const angle = randomRange(detailRng, 0, Math.PI * 2);
              const outward = sideA.clone().multiplyScalar(Math.cos(angle)).addScaledVector(sideB, Math.sin(angle)).normalize();
              const t = randomRange(detailRng, -0.32, 0.32);
              const radiusAtPoint = THREE.MathUtils.lerp(bottomRadius, topRadius, clamp(t + 0.5, 0, 1));
              const detailPosition = branchPosition
                .clone()
                .addScaledVector(direction, t * length)
                .addScaledVector(outward, radiusAtPoint * 0.96);
              const size = radiusAtPoint * randomRange(detailRng, 0.34, activeTreeType === 'ancient' ? 0.68 : 0.52);
              addSurfaceEllipsoid(
                trunkDetailGeometries,
                detailPosition,
                outward,
                direction,
                size * randomRange(detailRng, 0.68, 1.08),
                size * randomRange(detailRng, 0.95, 1.55),
                Math.max(0.004, size * 0.16),
                9
              );
            }
          }
        }
      }

      const mergedBranches =
        branchGeometries.length > 0 ? mergeGeometries(branchGeometries, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
      branches.geometry.dispose();
      branches.geometry = mergedBranches;
      branchGeometries.forEach((geometry) => geometry.dispose());

      const mergedBarkRidges =
        barkRidgeGeometries.length > 0 ? mergeGeometries(barkRidgeGeometries, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
      barkRidges.geometry.dispose();
      barkRidges.geometry = mergedBarkRidges;
      barkRidgeGeometries.forEach((geometry) => geometry.dispose());

      const mergedRootFlares =
        rootFlareGeometries.length > 0 ? mergeGeometries(rootFlareGeometries, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
      rootFlares.geometry.dispose();
      rootFlares.geometry = mergedRootFlares;
      rootFlareGeometries.forEach((geometry) => geometry.dispose());

      const mergedTrunkDetails =
        trunkDetailGeometries.length > 0 ? mergeGeometries(trunkDetailGeometries, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
      trunkDetails.geometry.dispose();
      trunkDetails.geometry = mergedTrunkDetails;
      trunkDetailGeometries.forEach((geometry) => geometry.dispose());

      const shouldRenderConiferTiers = activeTreeType === 'conifer' && configRef.current.leafDensity > 0.95;
      if (shouldRenderConiferTiers) {
        const tierGeometries: THREE.BufferGeometry[] = [];
        const height = Math.max(2.4, structure.stats.height);
        const baseY = height * 0.24;
        const topY = height * 0.98;
        const spread = Math.max(0.48, structure.stats.spread * 0.58);
        const tierCount = 10;
        for (let i = 0; i < tierCount; i += 1) {
          const t = i / Math.max(1, tierCount - 1);
          const y = THREE.MathUtils.lerp(baseY, topY, t);
          const radius = spread * Math.max(0.12, 1 - t * 0.84) * (i % 2 === 0 ? 1.04 : 0.88);
          const tierHeight = height * THREE.MathUtils.lerp(0.06, 0.034, t);
          const geometry = new THREE.CylinderGeometry(radius * 0.22, radius, tierHeight, 11, 1, true);
          const matrix = new THREE.Matrix4().makeTranslation(0, y, 0);
          geometry.applyMatrix4(matrix);
          tierGeometries.push(geometry);
        }
        const tipGeometry = new THREE.ConeGeometry(spread * 0.18, height * 0.16, 10, 1, true);
        tipGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, topY + height * 0.055, 0));
        tierGeometries.push(tipGeometry);
        const mergedTiers = mergeGeometries(tierGeometries, false) ?? new THREE.BufferGeometry();
        coniferTiers.geometry.dispose();
        coniferTiers.geometry = mergedTiers;
        tierGeometries.forEach((geometry) => geometry.dispose());
      } else {
        coniferTiers.geometry.dispose();
        coniferTiers.geometry = new THREE.BufferGeometry();
      }

      const canopyGeo = activeTreeType === 'conifer' ? createNeedleClusterGeometry() : createLeafClusterGeometry(false);
      const canopyFillGeo = createLeafClusterGeometry(true);
      const dummy = new THREE.Object3D();
      const leafColor = new THREE.Color();
      const leafHsl = { h: 0, s: 0, l: 0 };
      const baseLeafColor = new THREE.Color(structure.palette.leaf);
      baseLeafColor.getHSL(leafHsl);
      const canopyCapacity = canopy.instanceMatrix.count;
      const canopyFillCapacity = canopyFill.instanceMatrix.count;
      const twigPositions: number[] = [];
      let visibleCanopyFill = 0;
      let visibleCanopy = 0;
      for (const lobe of structure.canopyLobes) {
        const lobeGrowth = smoothstep(lobe.progress - 0.07, lobe.progress + 0.035, growth);
        if (lobeGrowth <= 0) continue;
        dummy.position.copy(lobe.position);
        dummy.lookAt(lobe.position.clone().add(lobe.normal));
        const s = lobe.size * (0.48 + lobeGrowth * 0.46);
        if (activeTreeType === 'conifer') {
          dummy.scale.set(s * lobe.scale.x * 0.64, s * lobe.scale.y * 0.82, s * lobe.scale.z * 1.38);
          dummy.rotateX(-0.22);
        } else {
          const crownPad = activeTreeType === 'broadleaf' ? 1.56 : activeTreeType === 'ancient' ? 1.34 : 1.12;
          const verticalPad = activeTreeType === 'broadleaf' ? 1.3 : activeTreeType === 'ancient' ? 1.2 : activeTreeType === 'willow' ? 1.26 : 1.08;
          dummy.scale.set(s * lobe.scale.x * crownPad, s * lobe.scale.y * verticalPad, s * lobe.scale.z * crownPad);
        }
        dummy.rotateZ(lobe.hueShift * 8);
        dummy.updateMatrix();
        canopy.setMatrixAt(visibleCanopy, dummy.matrix);
        leafColor.setHSL(
          (leafHsl.h + lobe.hueShift + 1) % 1,
          THREE.MathUtils.clamp(leafHsl.s * (0.98 + lobe.shade * 0.12), 0.42, 0.86),
          THREE.MathUtils.clamp(0.47 + lobe.shade * 0.32, 0.36, 0.68)
        );
        canopy.setColorAt(visibleCanopy, leafColor);
        if (activeTreeType !== 'conifer' && lobe.size > 0.08 && lobe.anchor && (lobe.branchDepth ?? 99) >= 2) {
          const anchorDistance = lobe.anchor.distanceTo(lobe.position);
          if (anchorDistance > 0.03 && anchorDistance < Math.max(1.05, lobe.size * 7.2)) {
            const twigStart = lobe.anchor.clone().lerp(lobe.position, 0.1);
            const twigEnd = lobe.anchor.clone().lerp(lobe.position, 0.82);
            if (activeTreeType !== 'willow' && twigEnd.y < twigStart.y - lobe.size * 0.08) {
              continue;
            }
            const twigMid = twigStart
              .clone()
              .lerp(twigEnd, 0.58)
              .addScaledVector(new THREE.Vector3(-lobe.normal.z, 0.15, lobe.normal.x).normalize(), lobe.size * 0.09);
            twigPositions.push(twigStart.x, twigStart.y, twigStart.z, twigMid.x, twigMid.y, twigMid.z);
            twigPositions.push(twigMid.x, twigMid.y, twigMid.z, twigEnd.x, twigEnd.y, twigEnd.z);
          }
        }
        if (activeTreeType !== 'conifer' && visibleCanopyFill < canopyFillCapacity && lobeGrowth > 0.35 && lobe.size > 0.055) {
          const inward = lobe.anchor
            ? lobe.anchor.clone().sub(lobe.position).normalize()
            : lobe.normal.clone().multiplyScalar(-1);
          const fillSize = lobe.size * (activeTreeType === 'broadleaf' ? 1.78 : activeTreeType === 'ancient' ? 1.34 : 1.4) * (0.62 + lobeGrowth * 0.3);
          dummy.position.copy(lobe.position).addScaledVector(inward, lobe.size * 0.42);
          dummy.lookAt(dummy.position.clone().add(lobe.normal));
          dummy.scale.set(fillSize * lobe.scale.x, fillSize * lobe.scale.y * 0.86, fillSize * lobe.scale.z);
          dummy.rotateZ(lobe.hueShift * 5);
          dummy.updateMatrix();
          canopyFill.setMatrixAt(visibleCanopyFill, dummy.matrix);
          leafColor.setHSL(
            (leafHsl.h + lobe.hueShift + 1) % 1,
            THREE.MathUtils.clamp(leafHsl.s * 1.04, 0.42, 0.78),
            THREE.MathUtils.clamp(0.27 + lobe.shade * 0.12, 0.22, 0.36)
          );
          canopyFill.setColorAt(visibleCanopyFill, leafColor);
          visibleCanopyFill += 1;
        }
        visibleCanopy += 1;
        if (visibleCanopy >= canopyCapacity) break;
      }
      canopyFill.count = visibleCanopyFill;
      canopyFill.instanceMatrix.needsUpdate = true;
      if (canopyFill.instanceColor) canopyFill.instanceColor.needsUpdate = true;
      canopyFill.geometry.dispose();
      canopyFill.geometry = canopyFillGeo;

      canopy.count = visibleCanopy;
      canopy.instanceMatrix.needsUpdate = true;
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
      canopy.geometry.dispose();
      canopy.geometry = canopyGeo;

      const strandPositions: number[] = [];
      if (activeTreeType === 'willow') {
        const strandMap = new Map<number, THREE.Vector3[]>();
        for (const leaf of structure.leaves) {
          if (leaf.kind !== 'strand' || typeof leaf.strandId !== 'number') continue;
          const leafGrowth = smoothstep(leaf.progress - 0.05, leaf.progress + 0.03, growth);
          if (leafGrowth <= 0) continue;
          const entries = strandMap.get(leaf.strandId) ?? [];
          entries.push(leaf.position);
          strandMap.set(leaf.strandId, entries);
        }
        for (const strand of strandMap.values()) {
          for (let i = 1; i < strand.length; i += 1) {
            const previous = strand[i - 1];
            const current = strand[i];
            strandPositions.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
          }
        }
      }
      const strandGeometry = new THREE.BufferGeometry();
      strandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(strandPositions, 3));
      willowStrands.geometry.dispose();
      willowStrands.geometry = strandGeometry;

      const leafMassGeo = activeTreeType === 'conifer' ? createNeedleClusterGeometry() : createLeafClusterGeometry(true);
      const leafGeo = activeTreeType === 'conifer' ? createNeedleClusterGeometry() : createLeafGeometry();
      const leafCapacity = leaves.instanceMatrix.count;
      const leafMassCapacity = leafMass.instanceMatrix.count;
      let visibleLeafMass = 0;
      let visibleLeaves = 0;
      for (const leaf of structure.leaves) {
        const leafGrowth = smoothstep(leaf.progress - 0.05, leaf.progress + 0.03, growth);
        if (leafGrowth <= 0) continue;

        const isWillowStrand = activeTreeType === 'willow' && leaf.kind === 'strand';
        if (!isWillowStrand && visibleLeafMass < leafMassCapacity) {
          dummy.position.copy(leaf.position);
          dummy.lookAt(leaf.position.clone().add(leaf.normal));
          const massSize = leaf.size * (activeTreeType === 'conifer' ? 0.88 : 1) * (0.32 + leafGrowth * 0.58);
          if (activeTreeType === 'conifer') {
            dummy.scale.set(massSize * leaf.scale.x * 0.5, massSize * leaf.scale.y * 0.7, massSize * leaf.scale.z * 1.8);
            dummy.rotateX(-0.34 + leaf.shade * 0.5);
          } else {
            const massPad = activeTreeType === 'broadleaf' ? 1.34 : activeTreeType === 'ancient' ? 1.2 : 1.08;
            const massVerticalPad = activeTreeType === 'broadleaf' ? 1.2 : activeTreeType === 'ancient' ? 1.14 : activeTreeType === 'willow' ? 1.22 : 1.06;
            dummy.scale.set(massSize * leaf.scale.x * massPad, massSize * leaf.scale.y * massVerticalPad, massSize * leaf.scale.z * massPad);
            dummy.rotateX(leaf.hueShift * 4);
          }
          dummy.updateMatrix();
          leafMass.setMatrixAt(visibleLeafMass, dummy.matrix);
          leafColor.setHSL(
            (leafHsl.h + leaf.hueShift + 1) % 1,
            THREE.MathUtils.clamp(leafHsl.s * (0.94 + leaf.shade * 0.12), 0.38, 0.8),
            THREE.MathUtils.clamp(0.46 + leaf.shade * 0.32, 0.34, 0.66)
          );
          leafMass.setColorAt(visibleLeafMass, leafColor);
          if (activeTreeType !== 'conifer' && leaf.kind !== 'strand' && visibleLeafMass % 3 === 0) {
            const twigStart = leaf.position.clone().addScaledVector(leaf.normal, -leaf.size * 1.85);
            const twigEnd = leaf.position.clone().addScaledVector(leaf.normal, -leaf.size * 0.42);
            if (activeTreeType === 'willow' || twigEnd.y >= twigStart.y - leaf.size * 0.06) {
              twigPositions.push(twigStart.x, twigStart.y, twigStart.z, twigEnd.x, twigEnd.y, twigEnd.z);
            }
          }
          visibleLeafMass += 1;
        }

        dummy.position.copy(leaf.position);
        dummy.lookAt(leaf.position.clone().add(leaf.normal));
        const s = leaf.size * (activeTreeType === 'conifer' ? 0.62 : 1) * (0.14 + leafGrowth * 0.34);
        if (activeTreeType === 'conifer') {
          dummy.scale.set(s * leaf.scale.x * 0.42, s * leaf.scale.y * 0.6, s * leaf.scale.z * 1.95);
        } else if (isWillowStrand) {
          dummy.scale.set(s * leaf.scale.x * 0.54, s * leaf.scale.y * 2.3, s * leaf.scale.z * 0.55);
        } else {
          dummy.scale.set(s * leaf.scale.x, s * leaf.scale.y * 1.45, s * leaf.scale.z * 0.9);
        }
        dummy.rotateZ(leaf.hueShift * 12);
        dummy.rotateX(leaf.shade * 0.9);
        dummy.updateMatrix();
        leaves.setMatrixAt(visibleLeaves, dummy.matrix);
        leafColor.setHSL(
          (leafHsl.h + leaf.hueShift + 1) % 1,
          THREE.MathUtils.clamp(leafHsl.s * (0.96 + leaf.shade * 0.18), 0.38, 0.82),
          THREE.MathUtils.clamp(0.52 + leaf.shade * 0.42, 0.38, 0.72)
        );
        leaves.setColorAt(visibleLeaves, leafColor);
        visibleLeaves += 1;
        if (visibleLeaves >= leafCapacity) break;
      }
      leafMass.count = visibleLeafMass;
      leafMass.instanceMatrix.needsUpdate = true;
      if (leafMass.instanceColor) leafMass.instanceColor.needsUpdate = true;
      leafMass.geometry.dispose();
      leafMass.geometry = leafMassGeo;

      leaves.count = visibleLeaves;
      leaves.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      leaves.geometry.dispose();
      leaves.geometry = leafGeo;

      const leafTwigGeometry = new THREE.BufferGeometry();
      leafTwigGeometry.setAttribute('position', new THREE.Float32BufferAttribute(twigPositions, 3));
      leafTwigs.geometry.dispose();
      leafTwigs.geometry = leafTwigGeometry;

      seed.visible = structure.stage.id === 'seed' || growth < 0.08;
      seed.scale.setScalar(THREE.MathUtils.lerp(0.18, 0.34, 1 - growth));
      seed.position.set(0, 0.06, 0);
      (seed.material as THREE.MeshStandardMaterial).color.set(structure.palette.barkDark);

      createParticleSystem(structure, scene);

      scene.fog = null;

      scene.background = new THREE.Color(structure.palette.skyBottom);
      const hemi = scene.children.find((child) => child.name === 'hemi-light') as THREE.HemisphereLight | undefined;
      const sun = scene.children.find((child) => child.name === 'sun-light') as THREE.DirectionalLight | undefined;
      if (hemi) {
        hemi.color.set(structure.palette.skyTop);
        hemi.groundColor.set(structure.palette.ground);
      }
      if (sun) {
        sun.color.set(structure.weather.id === 'storm' ? '#bfc9d4' : '#fff6db');
        sun.intensity = structure.weather.id === 'storm' ? 1.5 : 2.4;
      }

      if (!hasUserMovedCameraRef.current) {
        updateAutoCamera();
      }
    },
    [onStats, updateAutoCamera]
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = null;
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(8, 7, 9);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 42;
    controls.maxPolarAngle = Math.PI * 0.9;
    controls.target.set(0, 2, 0);
    controlsRef.current = controls;
    controls.addEventListener('start', () => {
      hasUserMovedCameraRef.current = true;
    });
    controls.addEventListener('end', () => {
      manualCameraRef.current.copy(camera.position);
    });

    const hemi = new THREE.HemisphereLight('#c7ddcf', '#2d352d', 2.7);
    hemi.name = 'hemi-light';
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff2d1', 2.4);
    sun.name = 'sun-light';
    sun.position.set(7, 13, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    scene.add(sun);

    const ambient = new THREE.AmbientLight('#c9d6c5', 0.55);
    scene.add(ambient);

    const groundGeometry = new THREE.PlaneGeometry(80, 80, 1, 1);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: '#4d5747',
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.02;
    scene.add(ground);
    groundRef.current = ground;

    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({
        color: '#1f2d24',
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -0.017;
    contactShadow.renderOrder = 1;
    scene.add(contactShadow);
    contactShadowRef.current = contactShadow;

    const treeGroup = new THREE.Group();
    treeGroup.name = 'tree-root';
    scene.add(treeGroup);
    treeGroupRef.current = treeGroup;

    const branchesMaterial = new THREE.MeshStandardMaterial({
      color: '#6c4d37',
      roughness: 0.95,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const branches = new THREE.Mesh(new THREE.BufferGeometry(), branchesMaterial);
    branches.castShadow = false;
    branches.receiveShadow = true;
    treeGroup.add(branches);
    branchesRef.current = branches;

    const barkRidgesMaterial = new THREE.MeshStandardMaterial({
      color: '#3f3028',
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const barkRidges = new THREE.Mesh(new THREE.BufferGeometry(), barkRidgesMaterial);
    barkRidges.castShadow = false;
    barkRidges.receiveShadow = true;
    treeGroup.add(barkRidges);
    barkRidgesRef.current = barkRidges;

    const rootFlaresMaterial = new THREE.MeshStandardMaterial({
      color: '#6c4d37',
      roughness: 0.94,
      metalness: 0.01,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const rootFlares = new THREE.Mesh(new THREE.BufferGeometry(), rootFlaresMaterial);
    rootFlares.castShadow = false;
    rootFlares.receiveShadow = true;
    treeGroup.add(rootFlares);
    rootFlaresRef.current = rootFlares;

    const trunkDetailsMaterial = new THREE.MeshStandardMaterial({
      color: '#3f3028',
      roughness: 0.98,
      metalness: 0.01,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const trunkDetails = new THREE.Mesh(new THREE.BufferGeometry(), trunkDetailsMaterial);
    trunkDetails.castShadow = false;
    trunkDetails.receiveShadow = true;
    treeGroup.add(trunkDetails);
    trunkDetailsRef.current = trunkDetails;

    const coniferTiersMaterial = new THREE.MeshStandardMaterial({
      color: '#5f8746',
      roughness: 0.86,
      metalness: 0.01,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const coniferTiers = new THREE.Mesh(new THREE.BufferGeometry(), coniferTiersMaterial);
    coniferTiers.castShadow = false;
    coniferTiers.receiveShadow = false;
    treeGroup.add(coniferTiers);
    coniferTiersRef.current = coniferTiers;

    const willowStrandsMaterial = new THREE.LineBasicMaterial({
      color: '#537c3f',
      transparent: true,
      opacity: 0.68,
    });
    const willowStrands = new THREE.LineSegments(new THREE.BufferGeometry(), willowStrandsMaterial);
    willowStrands.frustumCulled = false;
    treeGroup.add(willowStrands);
    willowStrandsRef.current = willowStrands;

    const leafTwigsMaterial = new THREE.LineBasicMaterial({
      color: '#3f3028',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const leafTwigs = new THREE.LineSegments(new THREE.BufferGeometry(), leafTwigsMaterial);
    leafTwigs.frustumCulled = false;
    treeGroup.add(leafTwigs);
    leafTwigsRef.current = leafTwigs;

    const canopyFillGeometry = new THREE.IcosahedronGeometry(1, 0);
    const canopyFillMaterial = new THREE.MeshStandardMaterial({
      color: '#5f7f49',
      roughness: 0.92,
      metalness: 0.01,
      vertexColors: true,
      flatShading: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const canopyFill = new THREE.InstancedMesh(canopyFillGeometry, canopyFillMaterial, 720);
    canopyFill.castShadow = false;
    canopyFill.receiveShadow = false;
    treeGroup.add(canopyFill);
    canopyFillRef.current = canopyFill;

    const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: '#7fa95a',
      roughness: 0.88,
      metalness: 0.01,
      vertexColors: true,
      flatShading: true,
    });
    const canopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, 620);
    canopy.castShadow = false;
    canopy.receiveShadow = false;
    treeGroup.add(canopy);
    canopyRef.current = canopy;

    const leafMassGeometry = new THREE.IcosahedronGeometry(1, 0);
    const leafMassMaterial = new THREE.MeshStandardMaterial({
      color: '#6f9650',
      roughness: 0.82,
      metalness: 0.01,
      vertexColors: true,
      flatShading: true,
    });
    const leafMass = new THREE.InstancedMesh(leafMassGeometry, leafMassMaterial, 1600);
    leafMass.castShadow = false;
    leafMass.receiveShadow = false;
    treeGroup.add(leafMass);
    leafMassRef.current = leafMass;

    const leavesGeometry = createLeafGeometry();
    const leavesMaterial = new THREE.MeshStandardMaterial({
      color: '#79a458',
      roughness: 0.72,
      metalness: 0.01,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const leaves = new THREE.InstancedMesh(leavesGeometry, leavesMaterial, 1600);
    leaves.castShadow = false;
    leaves.receiveShadow = false;
    treeGroup.add(leaves);
    leavesRef.current = leaves;

    const seed = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 12),
      new THREE.MeshStandardMaterial({
        color: '#5b3c25',
        roughness: 0.96,
      })
    );
    seed.castShadow = true;
    seed.receiveShadow = true;
    treeGroup.add(seed);
    seedRef.current = seed;

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!hasUserMovedCameraRef.current) {
        updateAutoCamera();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let last = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const t = now * 0.001;
      const treeGroupNode = treeGroupRef.current;
      if (treeGroupNode) {
        const liveConfig = configRef.current;
        const windAmount = clamp(liveConfig.wind + (liveConfig.weather === 'snow' ? 0.06 : 0), 0, 1);
        treeGroupNode.rotation.z = Math.sin(t * 0.55 + 0.8) * windAmount * 0.06;
        treeGroupNode.rotation.x = Math.cos(t * 0.37 + 1.4) * windAmount * 0.018;
      }

      const particleSystem = particlesRef.current;
      if (particleSystem) {
        const pos = particleSystem.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i += 1) {
          let x = pos.getX(i);
          let y = pos.getY(i);
          let z = pos.getZ(i);
          x += particleSystem.velocities[i * 3];
          y += particleSystem.velocities[i * 3 + 1] * (dt * 60);
          z += particleSystem.velocities[i * 3 + 2];
          x += Math.sin(t * 0.5 + i * 0.07) * 0.0009;
          z += Math.cos(t * 0.42 + i * 0.05) * 0.0009;
          if (y < particleSystem.bounds.bottom) {
            y = particleSystem.bounds.top;
            x = (Math.random() - 0.5) * particleSystem.bounds.width;
            z = (Math.random() - 0.5) * particleSystem.bounds.width;
          }
          pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
      }

      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (camera && controls) {
        if (!hasUserMovedCameraRef.current) {
          camera.position.lerp(manualCameraRef.current, 0.08);
        }
        controls.target.lerp(cameraTargetRef.current, 0.12);
        controls.update();
      }

      renderer.render(scene, camera as THREE.Camera);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      if (treeGroupRef.current) {
        disposeNode(treeGroupRef.current);
        scene.remove(treeGroupRef.current);
      }
      if (groundRef.current) {
        disposeNode(groundRef.current);
      }
      if (contactShadowRef.current) {
        disposeNode(contactShadowRef.current);
        scene.remove(contactShadowRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const structure = generateTreeStructure(config);
    rebuildTree(structure, config.growth);
  }, [config, rebuildTree]);

  useImperativeHandle(ref, () => ({
    resetCamera() {
      hasUserMovedCameraRef.current = false;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      updateAutoCamera();
    },
    downloadPng() {
      const renderer = rendererRef.current;
      if (!renderer) return;
      const link = document.createElement('a');
      link.download = `tree-${config.stageId || 'scene'}.png`;
      link.href = renderer.domElement.toDataURL('image/png');
      link.click();
    },
  }));

  return <div className="viewport-canvas" ref={mountRef} aria-label="3D 树木预览" />;
});
