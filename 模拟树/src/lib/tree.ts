import { Color, Vector3 } from 'three';
import { clamp, createSeededRng, randomRange, smoothstep } from './seed';

export type WeatherId = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'storm' | 'snow' | 'mist';
export type TreeTypeId = 'broadleaf' | 'conifer' | 'willow' | 'ancient';

export interface TreeTypePreset {
  id: TreeTypeId;
  label: string;
  heightScale: number;
  crownWidthScale: number;
  crownHeightScale: number;
  trunkScale: number;
  branchDroop: number;
  branchLift: number;
  leafScale: number;
  lobeScale: number;
  lowerSkirt: number;
  coneBias: number;
}

export interface StagePreset {
  id: string;
  label: string;
  growth: number;
  scale: number;
  maxDepth: number;
  branchFactor: number;
  branchSpread: number;
  trunkLength: number;
  canopyLift: number;
  leafDensity: number;
  rootStrength: number;
  segmentBudget: number;
  rootBudget: number;
  leafBudget: number;
  barkWarmth: number;
}

export interface WeatherPreset {
  id: WeatherId;
  label: string;
  fog: number;
  skyTop: string;
  skyBottom: string;
  saturation: number;
  moistureBoost: number;
  windBoost: number;
  leafWetness: number;
  particleCount: number;
}

export interface TreeConfig {
  seed: string;
  treeType: TreeTypeId;
  stageId: string;
  growth: number;
  trunkThickness: number;
  branchSpread: number;
  twist: number;
  leafDensity: number;
  asymmetry: number;
  soil: number;
  moisture: number;
  temperature: number;
  wind: number;
  weather: WeatherId;
}

export const TREE_TYPE_PRESETS: TreeTypePreset[] = [
  {
    id: 'broadleaf',
    label: '阔叶',
    heightScale: 1,
    crownWidthScale: 1.12,
    crownHeightScale: 1.08,
    trunkScale: 1,
    branchDroop: 0,
    branchLift: 0.04,
    leafScale: 1,
    lobeScale: 1.08,
    lowerSkirt: 1.08,
    coneBias: 0,
  },
  {
    id: 'conifer',
    label: '针叶',
    heightScale: 1.18,
    crownWidthScale: 0.62,
    crownHeightScale: 1.42,
    trunkScale: 0.86,
    branchDroop: 0.24,
    branchLift: -0.04,
    leafScale: 0.62,
    lobeScale: 0.86,
    lowerSkirt: 1.28,
    coneBias: 0.82,
  },
  {
    id: 'willow',
    label: '垂枝',
    heightScale: 0.96,
    crownWidthScale: 1.16,
    crownHeightScale: 1.08,
    trunkScale: 0.92,
    branchDroop: 0.42,
    branchLift: -0.08,
    leafScale: 0.82,
    lobeScale: 0.88,
    lowerSkirt: 1.4,
    coneBias: 0,
  },
  {
    id: 'ancient',
    label: '古树',
    heightScale: 0.9,
    crownWidthScale: 1.34,
    crownHeightScale: 0.92,
    trunkScale: 1.28,
    branchDroop: 0.1,
    branchLift: 0.02,
    leafScale: 0.92,
    lobeScale: 1.08,
    lowerSkirt: 1.18,
    coneBias: 0,
  },
];

export interface TreeSegment {
  start: Vector3;
  end: Vector3;
  radiusStart: number;
  radiusEnd: number;
  progress: number;
  depth: number;
  branchId?: number;
  parentId?: number;
  isTerminal?: boolean;
}

export interface TreeLeaf {
  position: Vector3;
  normal: Vector3;
  size: number;
  scale: Vector3;
  progress: number;
  hueShift: number;
  shade: number;
  kind?: 'leaf' | 'strand';
  strandId?: number;
}

export interface TreeCanopyLobe {
  position: Vector3;
  normal: Vector3;
  anchor?: Vector3;
  size: number;
  scale: Vector3;
  progress: number;
  hueShift: number;
  shade: number;
  branchDepth?: number;
  clusterId?: number;
}

export interface TreeStructure {
  stage: StagePreset;
  weather: WeatherPreset;
  segments: TreeSegment[];
  canopyLobes: TreeCanopyLobe[];
  leaves: TreeLeaf[];
  stats: {
    height: number;
    spread: number;
    segmentCount: number;
    leafCount: number;
  };
  palette: {
    bark: string;
    barkDark: string;
    leaf: string;
    leafShadow: string;
    ground: string;
    fog: string;
    skyTop: string;
    skyBottom: string;
  };
}

interface BranchNode {
  id: number;
  parentId?: number;
  start: Vector3;
  end: Vector3;
  direction: Vector3;
  length: number;
  radius: number;
  depth: number;
  children: BranchNode[];
  light: number;
  vigor: number;
  progress: number;
  terminal: boolean;
}

interface CrownVolume {
  center: Vector3;
  baseY: number;
  topY: number;
  radiusX: number;
  radiusZ: number;
  radiusY: number;
}

function generateBotanicalTreeStructure(config: TreeConfig): TreeStructure {
  const stage = getStagePreset(config.stageId);
  const weather = getWeatherPreset(config.weather);
  const treeType = getTreeTypePreset(config.treeType ?? 'broadleaf');
  const rng = createSeededRng(`${config.seed}::${config.stageId}::${treeType.id}::botanical-v2`);

  const segments: TreeSegment[] = [];
  const canopyLobes: TreeCanopyLobe[] = [];
  const leaves: TreeLeaf[] = [];
  const nodes: BranchNode[] = [];
  const terminalNodes: BranchNode[] = [];
  const up = new Vector3(0, 1, 0);

  const soil = clamp(config.soil, 0, 1);
  const moisture = clamp(config.moisture + weather.moistureBoost, 0, 1);
  const temperature = clamp(config.temperature, 0, 1);
  const wind = clamp(config.wind + weather.windBoost, 0, 1);
  const temperatureFitness = 1 - Math.abs(temperature - 0.56) * 1.35;
  const environmentVigor = clamp(0.38 + soil * 0.24 + moisture * 0.2 + temperatureFitness * 0.2, 0.22, 1.18);
  const treeScale = stage.scale * (0.74 + soil * 0.34 + moisture * 0.08) * treeType.heightScale;
  const stageThicknessLimit = stage.id === 'bonsai' ? 1.06 : clamp(0.46 + stage.scale / 7.5, 0.52, 1.18);
  const trunkThickness = (0.03 + config.trunkThickness * 0.11) * (0.9 + soil * 0.2) * stageThicknessLimit * treeType.trunkScale;
  const trunkLength = stage.trunkLength * treeScale * (0.84 + soil * 0.24 + moisture * 0.08);
  const trunkRadius = Math.max(0.012, trunkThickness * treeScale * (0.82 + soil * 0.22));
  const branchSpread = clamp((stage.branchSpread + config.branchSpread * 0.42) * treeType.crownWidthScale, 0.04, 0.95);
  const twist = clamp(config.twist * 1.08 + wind * 0.12, 0, 1);
  const rawAsymmetry = clamp(config.asymmetry, 0, 1);
  const asymmetry = Math.pow(rawAsymmetry, 1.65) * (treeType.id === 'willow' ? 0.72 : 0.52);
  const leafDensity = clamp((stage.leafDensity + config.leafDensity * 0.75 + moisture * 0.14) * environmentVigor, 0, 1.6);
  const growthCutoff = clamp(config.growth, 0, 1);
  const maxDepth = stage.id === 'seed' ? 0 : Math.max(0, stage.maxDepth);
  const maxSegmentBudget = stage.segmentBudget;
  const maxLeafBudget = stage.leafBudget;
  const nodeBudget = Math.max(2, Math.floor(Math.max(1, maxSegmentBudget - stage.rootBudget) / 2.45));

  const canopyLobeBudgetByStage: Record<string, number> = {
    seed: 0,
    sprout: 8,
    sapling: 26,
    solitary: 58,
    mature: 190,
    lush: 260,
    ancient: 220,
    world: 310,
    winter: 12,
    bonsai: 38,
    barren: 0,
  };
  const typeCanopyDensity = treeType.id === 'conifer' ? 1.65 : treeType.id === 'willow' ? 1.12 : 1;
  const maxCanopyLobeBudget = Math.round(
    (canopyLobeBudgetByStage[stage.id] ?? 40) *
      clamp(0.34 + leafDensity * 0.62, 0.22, 1.2) *
      typeCanopyDensity
  );

  const barkBase = mixHex('#5b4336', '#7a5b3e', stage.barkWarmth * 0.8 + soil * 0.15);
  const barkDark = tintByHsl(barkBase, -0.01, 0.82, 0.74);
  const hotness = clamp(temperature, 0, 1);
  const wetness = clamp(moisture, 0, 1);
  const leafBase = new Color(mixHex('#4c7a31', '#79a64a', soil * 0.65 + wetness * 0.25));
  const tempShift = hotness < 0.35 ? 0.56 : hotness > 0.72 ? 0.1 : 0.26;
  const leaf = leafBase
    .clone()
    .lerp(new Color(hotness < 0.35 ? '#c9d9ea' : hotness > 0.72 ? '#d7c268' : '#88bf61'), Math.abs(hotness - 0.5) * 0.8 + 0.1)
    .lerp(new Color('#8bb55e'), 0.3)
    .offsetHSL(tempShift - 0.26, -0.03 + wetness * 0.02, 0.02);
  const leafColor = leaf.getStyle();
  const leafShadow = tintByHsl(leafColor, -0.02, 0.75, 0.72);
  const skyTop = tintByHsl(weather.skyTop, (1 - hotness) * 0.03, 1, 0.98 + hotness * 0.04);
  const skyBottom = tintByHsl(weather.skyBottom, -0.01, 1, 0.99);
  const fogColor = mixHex('#d0d7d0', weather.skyBottom, weather.fog * 0.85);
  const ground = mixHex('#354038', '#5d5a46', soil * 0.55 + moisture * 0.1);

  const state = {
    height: 0,
    spread: 0,
  };

  const updateBounds = (point: Vector3) => {
    state.height = Math.max(state.height, point.y);
    state.spread = Math.max(state.spread, Math.abs(point.x), Math.abs(point.z));
  };

  const addSegment = (
    start: Vector3,
    end: Vector3,
    radiusStart: number,
    radiusEnd: number,
    progress: number,
    depth: number,
    branchId?: number,
    parentId?: number,
    isTerminal?: boolean
  ) => {
    if (segments.length >= maxSegmentBudget) return false;
    segments.push({
      start: start.clone(),
      end: end.clone(),
      radiusStart: Math.max(0.0015, radiusStart),
      radiusEnd: Math.max(0.001, radiusEnd),
      progress: clamp(progress, 0, 1),
      depth,
      branchId,
      parentId,
      isTerminal,
    });
    updateBounds(start);
    updateBounds(end);
    return true;
  };

  const asymAngle = randomRange(rng, 0, Math.PI * 2);
  const asymDir = new Vector3(Math.cos(asymAngle), 0, Math.sin(asymAngle));
  const lean = asymDir.clone().multiplyScalar((0.018 + asymmetry * 0.08 + wind * 0.018) * trunkLength);
  const crownRadiusBase =
    treeScale *
    (0.28 + branchSpread * 0.72 + stage.branchFactor * 0.052) *
    treeType.crownWidthScale *
    (stage.id === 'mature' || stage.id === 'lush' ? 1.14 : stage.id === 'ancient' || stage.id === 'world' ? 1.1 : 1);
  const crownHeight =
    Math.max(treeScale * 0.42, trunkLength * (treeType.id === 'conifer' ? 0.72 : 0.48 + stage.canopyLift * 0.14)) *
    treeType.crownHeightScale;
  const crownCenter = new Vector3(lean.x * 0.32, trunkLength * 0.66, lean.z * 0.32);
  if (treeType.id === 'conifer') {
    crownCenter.y = trunkLength * 0.54;
  } else if (treeType.id === 'willow') {
    crownCenter.y = trunkLength * 0.58;
  } else if (treeType.id === 'ancient' || stage.id === 'ancient') {
    crownCenter.y = trunkLength * 0.55;
  }
  crownCenter.addScaledVector(asymDir, crownRadiusBase * asymmetry * 0.16);

  const crown: CrownVolume = {
    center: crownCenter,
    baseY:
      treeType.id === 'conifer'
        ? trunkLength * 0.18
        : treeType.id === 'willow'
          ? trunkLength * 0.24
          : stage.id === 'sapling' || stage.id === 'sprout'
            ? trunkLength * 0.42
            : trunkLength * 0.36,
    topY: trunkLength + crownHeight * (treeType.id === 'conifer' ? 0.42 : 0.36),
    radiusX: crownRadiusBase * (1 + Math.max(0, asymDir.x) * asymmetry * 0.18),
    radiusZ: crownRadiusBase * (1 + Math.max(0, asymDir.z) * asymmetry * 0.18),
    radiusY: crownHeight * (treeType.id === 'ancient' ? 0.5 : treeType.id === 'willow' ? 0.56 : 0.58),
  };
  if (treeType.id === 'ancient' || stage.id === 'ancient') {
    crown.radiusX *= 1.18;
    crown.radiusZ *= 1.18;
    crown.topY -= crownHeight * 0.08;
  }
  if (stage.id === 'bonsai') {
    crown.radiusX *= 0.82;
    crown.radiusZ *= 0.82;
    crown.topY -= crownHeight * 0.18;
  }

  const radiusAtY = (y: number) => {
    if (treeType.id === 'conifer') {
      const yT = clamp((y - crown.baseY) / Math.max(0.001, crown.topY - crown.baseY), 0, 1);
      return Math.max(crownRadiusBase * 0.08, crownRadiusBase * Math.pow(1 - yT * 0.88, 1.05) * treeType.lowerSkirt);
    }
    const dy = (y - crown.center.y) / Math.max(0.001, crown.radiusY);
    const profile = Math.sqrt(Math.max(0.04, 1 - dy * dy));
    const lowerSkirt = y < crown.center.y ? treeType.lowerSkirt : 1;
    return crownRadiusBase * profile * lowerSkirt;
  };

  const crownScore = (point: Vector3) => {
    if (treeType.id === 'conifer') {
      const allowed = radiusAtY(point.y);
      const radial = Math.hypot(point.x - crown.center.x, point.z - crown.center.z);
      const yPenalty = point.y < crown.baseY ? (crown.baseY - point.y) / Math.max(0.001, crown.radiusY) : point.y > crown.topY ? (point.y - crown.topY) / Math.max(0.001, crown.radiusY) : 0;
      return Math.max(radial / Math.max(0.001, allowed), 1 + yPenalty);
    }
    const dx = (point.x - crown.center.x) / Math.max(0.001, crown.radiusX);
    const dz = (point.z - crown.center.z) / Math.max(0.001, crown.radiusZ);
    const dy = (point.y - crown.center.y) / Math.max(0.001, crown.radiusY);
    const lowPenalty = point.y < crown.baseY ? (crown.baseY - point.y) / Math.max(0.001, crown.radiusY) * 0.6 : 0;
    return Math.sqrt(dx * dx + dz * dz + dy * dy) + lowPenalty;
  };

  const clampToCrown = (point: Vector3, anchor?: Vector3, softness = 0.96) => {
    const next = point.clone();
    if (treeType.id === 'conifer') {
      next.y = clamp(next.y, crown.baseY, crown.topY);
      const allowed = radiusAtY(next.y) * softness;
      const radial = new Vector3(next.x - crown.center.x, 0, next.z - crown.center.z);
      const length = radial.length();
      if (length > allowed) {
        radial.setLength(allowed);
        next.x = crown.center.x + radial.x;
        next.z = crown.center.z + radial.z;
      }
      if (anchor && next.distanceTo(anchor) < point.distanceTo(anchor) * 0.35) {
        next.lerp(point, 0.22);
      }
      return next;
    }

    const delta = next.clone().sub(crown.center);
    const score = crownScore(next);
    if (score > softness) {
      delta.x /= Math.max(score / softness, 1);
      delta.y /= Math.max(score / softness, 1);
      delta.z /= Math.max(score / softness, 1);
      next.copy(crown.center).add(delta);
    }
    const minY = treeType.id === 'willow' ? crown.baseY - crown.radiusY * 0.32 : crown.baseY - crown.radiusY * 0.05;
    next.y = clamp(next.y, minY, crown.topY);
    if (anchor && next.distanceTo(anchor) < point.distanceTo(anchor) * 0.42) {
      next.lerp(point, 0.18);
    }
    return next;
  };

  const outwardFromCrown = (point: Vector3) => {
    const out = new Vector3(point.x - crown.center.x, 0, point.z - crown.center.z);
    if (out.lengthSq() < 1e-5) out.copy(randomPerpendicular(up, rng));
    return out.normalize();
  };

  const crownNormal = (point: Vector3) => {
    if (treeType.id === 'conifer') {
      return outwardFromCrown(point).addScaledVector(up, 0.35).normalize();
    }
    return new Vector3(
      (point.x - crown.center.x) / Math.max(0.001, crown.radiusX * crown.radiusX),
      (point.y - crown.center.y) / Math.max(0.001, crown.radiusY * crown.radiusY),
      (point.z - crown.center.z) / Math.max(0.001, crown.radiusZ * crown.radiusZ)
    ).normalize();
  };

  const constrainBotanicalDirection = (direction: Vector3, depth: number, terminal = false) => {
    if (direction.lengthSq() < 1e-8) direction.copy(up);
    direction.normalize();
    if (treeType.id === 'willow') {
      const minY = depth <= 1 ? -0.02 : terminal ? -0.52 : -0.24;
      if (direction.y < minY) direction.y = minY;
      return direction.normalize();
    }
    if (treeType.id === 'conifer') {
      const minY = depth <= 1 ? -0.04 : terminal ? -0.12 : -0.06;
      if (direction.y < minY) direction.y = minY;
      return direction.normalize();
    }
    const matureMinY = treeType.id === 'ancient' || stage.id === 'ancient' ? -0.01 : 0.025;
    const minY = terminal ? matureMinY - 0.035 : depth <= 1 ? 0.22 : matureMinY;
    if (direction.y < minY) direction.y = minY;
    return direction.normalize();
  };

  const lightAt = (point: Vector3, direction: Vector3) => {
    const heightT = clamp((point.y - crown.baseY) / Math.max(0.001, crown.topY - crown.baseY), 0, 1);
    const radial = clamp(Math.hypot(point.x - crown.center.x, point.z - crown.center.z) / Math.max(0.001, radiusAtY(point.y)), 0, 1.3);
    const upward = clamp(direction.y * 0.5 + 0.5, 0, 1);
    const shell = clamp(crownScore(point), 0, 1.35);
    return clamp(0.25 + heightT * 0.38 + radial * 0.26 + upward * 0.16 + shell * 0.12, 0.18, 1.28);
  };

  const trunkSections = Math.max(1, Math.round(2 + maxDepth * 1.45 + stage.scale * 0.16));
  const trunkPoints: Array<{ point: Vector3; radius: number; progress: number }> = [];
  const swayAxis = randomPerpendicular(up, rng);
  let previous = new Vector3(0, 0, 0);
  let previousRadius = trunkRadius;
  trunkPoints.push({ point: previous.clone(), radius: previousRadius, progress: 0 });

  for (let i = 1; i <= trunkSections; i += 1) {
    const t = i / trunkSections;
    const sideAmount = Math.sin(t * Math.PI * randomRange(rng, 0.78, 1.2)) * twist * 0.034 * trunkLength;
    const point = new Vector3(0, trunkLength * (1 - Math.pow(1 - t, 1.08)), 0)
      .addScaledVector(lean, Math.pow(t, 1.42))
      .addScaledVector(swayAxis, sideAmount * (0.2 + t * 0.8));
    const radius = Math.max(0.004, trunkRadius * (0.09 + Math.pow(1 - t, 0.76) * 0.91));
    const progress = 0.012 + t * 0.26;
    addSegment(previous, point, previousRadius, radius, progress, 0, 0, undefined, false);
    trunkPoints.push({ point: point.clone(), radius, progress });
    previous = point;
    previousRadius = radius;
  }

  const makeBranchNode = (
    start: Vector3,
    direction: Vector3,
    length: number,
    radius: number,
    depth: number,
    parentId: number | undefined,
    progress: number,
    vigor: number
  ) => {
    if (nodes.length >= nodeBudget || length <= treeScale * 0.018 || radius <= 0.0015) return undefined;
    const dir = constrainBotanicalDirection(direction.clone(), depth);
    const rawEnd = start.clone().addScaledVector(dir, length);
    const end = depth > 0 ? clampToCrown(rawEnd, start, depth <= 1 ? 1.02 : 0.98) : rawEnd;
    const actualLength = Math.max(0.001, start.distanceTo(end));
    if (actualLength < Math.max(treeScale * 0.025, length * 0.28)) return undefined;
    const node: BranchNode = {
      id: nodes.length + 1,
      parentId,
      start: start.clone(),
      end,
      direction: end.clone().sub(start).normalize(),
      length: actualLength,
      radius: Math.max(0.0018, radius),
      depth,
      children: [],
      light: lightAt(end, dir),
      vigor: clamp(vigor, 0.08, 1.5),
      progress: clamp(progress, 0, 1),
      terminal: false,
    };
    nodes.push(node);
    const parent = parentId ? nodes.find((entry) => entry.id === parentId) : undefined;
    parent?.children.push(node);
    return node;
  };

  const spawnChildren = (node: BranchNode) => {
    const activeDepth = maxDepth;
    const nodeLight = lightAt(node.end, node.direction) * node.vigor;
    const terminalByDepth = node.depth >= activeDepth;
    const terminalBySize = node.length < treeScale * 0.055 || node.radius < trunkRadius * 0.035 || nodes.length >= nodeBudget;
    const lowCompetition = nodeLight < (treeType.id === 'willow' ? 0.18 : 0.28) && node.depth >= 2;
    if (terminalByDepth || terminalBySize || lowCompetition) {
      node.terminal = true;
      terminalNodes.push(node);
      return;
    }

    const forkRoll = 0.42 + nodeLight * 0.28 + leafDensity * 0.08 - node.depth * 0.035;
    if (node.depth >= 2 && rng() > forkRoll) {
      node.terminal = true;
      terminalNodes.push(node);
      return;
    }

    const remainingDepth = activeDepth - node.depth;
    let childCount = 1;
    if (remainingDepth >= 2 && nodeLight > 0.44) {
      childCount = rng() < (node.depth <= 1 ? 0.64 : 0.42) ? 2 : 1;
    }
    if (node.depth <= 1 && remainingDepth >= 3 && nodeLight > 0.72 && rng() < 0.2) {
      childCount = 3;
    }
    if (treeType.id === 'conifer' && node.depth <= 2 && rng() < 0.18) {
      childCount = Math.max(childCount, 2);
    }

    let created = 0;
    const fanBase = randomRange(rng, 0, Math.PI * 2);
    const childRadiusMultiplier = childCount > 1 ? randomRange(rng, 0.52, 0.62) : randomRange(rng, 0.65, 0.78);
    for (let i = 0; i < childCount; i += 1) {
      const along = childCount === 1
        ? randomRange(rng, 0.66, 0.92)
        : clamp(0.58 + i * (0.32 / Math.max(1, childCount - 1)) + randomRange(rng, -0.045, 0.045), 0.54, 0.94);
      const start = node.start.clone().lerp(node.end, along);
      const parentRadiusAtStart = node.radius * (0.92 - along * 0.5);
      const side = randomPerpendicular(node.direction, rng);
      side.applyAxisAngle(node.direction, fanBase + (Math.PI * 2 * i) / Math.max(1, childCount));
      const outward = outwardFromCrown(start);
      const sunBias = new Vector3(0.32, 0.84, 0.22).normalize();
      const randomBend = randomUnitVector(rng).multiplyScalar(0.08 + branchSpread * 0.12);
      const upBias =
        treeType.id === 'willow'
          ? node.depth <= 1 ? 0.08 : -0.22 - treeType.branchDroop * 0.28
          : treeType.id === 'conifer'
            ? node.depth <= 1 ? 0.04 : 0.12
            : 0.22 + stage.canopyLift * 0.08 + treeType.branchLift * 0.22;
      const inherited = node.direction.clone().multiplyScalar(0.65);
      const growthBias = outward
        .clone()
        .multiplyScalar(0.42)
        .addScaledVector(up, upBias)
        .addScaledVector(sunBias, 0.1)
        .addScaledVector(side, randomRange(rng, 0.12, 0.28) * (i % 2 === 0 ? 1 : -1))
        .add(randomBend)
        .normalize()
        .multiplyScalar(0.35);
      const childDir = inherited.add(growthBias);
      constrainBotanicalDirection(childDir, node.depth + 1, remainingDepth <= 1);

      const nextLight = lightAt(start, childDir);
      const competition = clamp(0.5 + nextLight * 0.58, 0.38, 1.18);
      const lengthRatio = randomRange(rng, node.depth <= 1 ? 0.55 : 0.5, node.depth <= 1 ? 0.8 : 0.74);
      const childLength =
        node.length *
        lengthRatio *
        competition *
        (treeType.id === 'willow' && node.depth >= 2 ? 1.08 : 1) *
        (treeType.id === 'conifer' ? 0.92 : 1);
      const child = makeBranchNode(
        start,
        childDir,
        childLength,
        Math.max(0.0018, parentRadiusAtStart * childRadiusMultiplier),
        node.depth + 1,
        node.id,
        clamp(node.progress + 0.09 + node.depth * 0.035 + randomRange(rng, -0.018, 0.028), 0, 1),
        node.vigor * clamp(0.68 + nextLight * 0.36, 0.46, 1.06)
      );
      if (child) {
        created += 1;
        spawnChildren(child);
      }
    }

    if (created === 0) {
      node.terminal = true;
      terminalNodes.push(node);
    }
  };

  const addBranchSegments = (node: BranchNode) => {
    const pieces = Math.max(2, Math.min(8, Math.round(node.length / Math.max(treeScale * 0.09, 0.04) + node.depth * 0.42)));
    const curveAxis = randomPerpendicular(node.direction, rng);
    const bend = node.length * (0.018 + twist * 0.02 + branchSpread * 0.012) * (node.depth <= 1 ? 1.12 : 0.78);
    const droop =
      treeType.id === 'willow'
        ? -node.length * (0.015 + node.depth * 0.012)
        : treeType.id === 'conifer'
          ? -node.length * Math.max(0, node.depth - 1) * 0.004
          : node.length * (0.006 + stage.canopyLift * 0.003);
    let prev = node.start.clone();
    let prevRadius = node.radius;
    for (let i = 1; i <= pieces; i += 1) {
      const t = i / pieces;
      const base = node.start.clone().lerp(node.end, t);
      const curve = Math.sin(t * Math.PI);
      const point = base.addScaledVector(curveAxis, bend * curve).addScaledVector(up, droop * curve);
      if (i === pieces) point.copy(node.end);
      const taper = Math.pow(1 - t, 0.78);
      const nextRadius = Math.max(0.0012, node.radius * (node.terminal ? 0.2 + taper * 0.8 : 0.34 + taper * 0.66));
      const progress = node.progress + t * 0.12 + node.depth * 0.018;
      if (!addSegment(prev, point, prevRadius, nextRadius, progress, node.depth, node.id, node.parentId, node.terminal)) return;
      prev = point;
      prevRadius = nextRadius;
    }
  };

  const primaryCountByStage: Record<string, number> = {
    seed: 0,
    sprout: 1,
    sapling: 3,
    solitary: 5,
    mature: 7,
    lush: 9,
    ancient: 10,
    world: 12,
    winter: 6,
    bonsai: 6,
    barren: 7,
  };
  const primaryBoost = treeType.id === 'conifer' ? 1.35 : treeType.id === 'ancient' ? 1.18 : treeType.id === 'willow' ? 1.1 : 1;
  const primaryCount = maxDepth <= 0 ? 0 : Math.max(0, Math.round((primaryCountByStage[stage.id] ?? 6) * primaryBoost * (0.84 + branchSpread * 0.22)));
  const ringCount = Math.max(
    1,
    Math.min(treeType.id === 'conifer' ? 6 : treeType.id === 'ancient' || stage.id === 'world' ? 4 : 3, primaryCount || 1)
  );
  const phase = randomRange(rng, 0, Math.PI * 2);
  let planned = 0;
  for (let ring = 0; ring < ringCount && planned < primaryCount; ring += 1) {
    const remaining = primaryCount - planned;
    const ringsLeft = ringCount - ring;
    const countInRing = Math.max(1, Math.ceil(remaining / ringsLeft));
    const ringT =
      treeType.id === 'conifer'
        ? clamp(0.24 + (ring / Math.max(1, ringCount - 1)) * 0.62 + randomRange(rng, -0.025, 0.025), 0.16, 0.92)
        : clamp(0.38 + (ring / Math.max(1, ringCount - 1)) * 0.46 + randomRange(rng, -0.035, 0.035), 0.28, 0.92);
    const ringPhase = phase + randomRange(rng, -0.35, 0.35);
    for (let i = 0; i < countInRing && planned < primaryCount; i += 1) {
      const angle = ringPhase + (Math.PI * 2 * i) / countInRing + randomRange(rng, -0.14, 0.14);
      const attachIndex = clamp(Math.round(ringT * (trunkPoints.length - 1)), 1, trunkPoints.length - 1);
      const attach = trunkPoints[attachIndex];
      const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
      const elevation =
        treeType.id === 'conifer'
          ? randomRange(rng, -0.02, 0.18 + ringT * 0.12)
          : treeType.id === 'willow'
            ? randomRange(rng, 0.2, 0.48)
            : treeType.id === 'ancient' || stage.id === 'ancient'
              ? randomRange(rng, 0.38, 0.68)
              : randomRange(rng, 0.52, 0.9);
      const direction = radial.clone().multiplyScalar(Math.cos(elevation)).addScaledVector(up, Math.sin(elevation));
      constrainBotanicalDirection(direction, 1);
      const heightT = clamp((attach.point.y - crown.baseY) / Math.max(0.001, crown.topY - crown.baseY), 0, 1);
      const crownReach = radiusAtY(attach.point.y + treeScale * 0.16) * (treeType.id === 'conifer' ? 0.72 + (1 - heightT) * 0.38 : 0.84);
      const lowerCompetition = treeType.id === 'willow' ? 1 : clamp(0.66 + ringT * 0.46, 0.58, 1.06);
      const length =
        Math.max(treeScale * 0.12, crownReach * randomRange(rng, 0.68, 1.02)) *
        lowerCompetition *
        environmentVigor;
      const radius = Math.max(0.003, attach.radius * randomRange(rng, 0.28, treeType.id === 'ancient' ? 0.48 : 0.42) * (1.05 - ringT * 0.22));
      const primary = makeBranchNode(
        attach.point.clone(),
        direction,
        length,
        radius,
        1,
        0,
        clamp(0.17 + ringT * 0.22, 0, 1),
        clamp(environmentVigor * (0.72 + lightAt(attach.point, direction) * 0.38), 0.28, 1.34)
      );
      if (primary) spawnChildren(primary);
      planned += 1;
    }
  }

  for (const node of nodes) {
    addBranchSegments(node);
  }

  if (stage.rootBudget > 0 && stage.rootStrength > 0.2) {
    const buttressCount = Math.max(3, Math.round(3 + stage.rootStrength * 4));
    for (let i = 0; i < buttressCount && segments.length < maxSegmentBudget; i += 1) {
      const angle = (Math.PI * 2 * i) / buttressCount + randomRange(rng, -0.18, 0.18);
      const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
      const start = radial.clone().multiplyScalar(trunkRadius * randomRange(rng, 0.18, 0.34));
      start.y = randomRange(rng, 0.015, 0.08);
      const end = radial.clone().multiplyScalar(trunkRadius * randomRange(rng, 1.2, 2.45) * (0.7 + stage.rootStrength * 0.45));
      end.y = randomRange(rng, -0.025, 0.035);
      addSegment(
        start,
        end,
        trunkRadius * randomRange(rng, 0.2, 0.38),
        trunkRadius * randomRange(rng, 0.035, 0.09),
        randomRange(rng, 0.02, 0.14),
        0,
        -1,
        undefined,
        false
      );
    }
  }

  const deepestTerminalDepth = terminalNodes.reduce((deepest, node) => Math.max(deepest, node.depth), 0);
  const terminalDepthFloor = Math.max(2, Math.min(maxDepth - 2, deepestTerminalDepth - 1));
  const eligibleTerminals = terminalNodes
    .filter((node) => node.depth >= terminalDepthFloor && node.end.y > crown.baseY - crown.radiusY * 0.18)
    .sort((a, b) => b.light * b.vigor - a.light * a.vigor);

  let nextClusterId = 1;
  const pushCanopyLobe = (
    position: Vector3,
    normal: Vector3,
    size: number,
    progress: number,
    branchDepth: number,
    clusterId: number,
    anchor?: Vector3,
    shadeBias = 0,
    flatten = 1
  ) => {
    if (canopyLobes.length >= maxCanopyLobeBudget || leafDensity <= 0.08 || stage.id === 'barren') return;
    const lobePos = treeType.id === 'willow' ? position.clone() : clampToCrown(position, anchor, 0.99);
    canopyLobes.push({
      position: lobePos,
      normal: normal.clone().normalize(),
      anchor: anchor?.clone(),
      size: size * treeType.lobeScale,
      scale: new Vector3(
        randomRange(rng, 0.9, 1.36),
        randomRange(rng, 0.58, 0.98) * flatten,
        randomRange(rng, 0.86, 1.3)
      ),
      progress: clamp(progress + randomRange(rng, -0.035, 0.055), 0, 1),
      hueShift: randomRange(rng, -0.032, 0.036),
      shade: randomRange(rng, -0.12, 0.12) + shadeBias,
      branchDepth,
      clusterId,
    });
  };

  const pushLeafDetail = (position: Vector3, normal: Vector3, size: number, progress: number, clusterId: number) => {
    void clusterId;
    if (leaves.length >= maxLeafBudget || leafDensity <= 0.06 || stage.id === 'barren') return;
    leaves.push({
      position: position.clone(),
      normal: normal.clone().normalize(),
      size,
      scale: new Vector3(randomRange(rng, 0.9, 1.45), randomRange(rng, 0.7, 1.14), randomRange(rng, 0.82, 1.36)),
      progress: clamp(progress + randomRange(rng, -0.03, 0.06), 0, 1),
      hueShift: randomRange(rng, -0.04, 0.04),
      shade: randomRange(rng, -0.18, 0.14),
    });
  };

  for (const terminal of eligibleTerminals) {
    if (canopyLobes.length >= maxCanopyLobeBudget && leaves.length >= maxLeafBudget) break;
    const clusterId = nextClusterId;
    nextClusterId += 1;
    const axis = terminal.direction.clone().normalize();
    const sideA = randomPerpendicular(axis, rng);
    const sideB = new Vector3().crossVectors(axis, sideA).normalize();
    const vigor = clamp(terminal.vigor * terminal.light, 0.28, 1.45);
    const lobeCount = Math.max(
      1,
      Math.round(randomRange(rng, treeType.id === 'conifer' ? 1.0 : 1.7, treeType.id === 'ancient' ? 3.8 : 3.2) * vigor)
    );
    const baseSize =
      randomRange(rng, treeType.id === 'conifer' ? 0.052 : 0.066, treeType.id === 'ancient' ? 0.15 : 0.13) *
      treeScale *
      (0.68 + leafDensity * 0.26);

    for (let i = 0; i < lobeCount && canopyLobes.length < maxCanopyLobeBudget; i += 1) {
      const theta = randomRange(rng, 0, Math.PI * 2);
      const radius = randomRange(rng, 0.015, treeType.id === 'conifer' ? 0.09 : 0.14) * treeScale * (0.62 + vigor * 0.28);
      const droop = treeType.id === 'willow' ? randomRange(rng, 0.02, 0.16) * treeScale : 0;
      const position = terminal.end
        .clone()
        .addScaledVector(axis, randomRange(rng, -0.015, treeType.id === 'conifer' ? 0.14 : 0.08) * treeScale)
        .addScaledVector(sideA, Math.cos(theta) * radius)
        .addScaledVector(sideB, Math.sin(theta) * radius * randomRange(rng, 0.74, 1.14))
        .addScaledVector(up, randomRange(rng, -0.04, 0.09) * treeScale - droop);
      const normal = crownNormal(position).addScaledVector(axis, 0.18).normalize();
      const lobeSize = baseSize * randomRange(rng, 0.82, 1.22) * clamp(vigor, 0.58, 1.3);
      pushCanopyLobe(
        position,
        normal,
        lobeSize,
        terminal.progress + 0.1,
        terminal.depth,
        clusterId,
        terminal.end,
        terminal.light < 0.48 ? -0.08 : 0.04,
        treeType.id === 'conifer' ? randomRange(rng, 1.15, 1.68) : randomRange(rng, 0.88, 1.18)
      );

      const detailCount = Math.min(
        4,
        Math.max(1, Math.round(randomRange(rng, 0.8, 2.4) * leafDensity * (treeType.id === 'conifer' ? 0.7 : 1)))
      );
      for (let detail = 0; detail < detailCount && leaves.length < maxLeafBudget; detail += 1) {
        const detailTheta = theta + randomRange(rng, -0.85, 0.85);
        const detailOffset = randomRange(rng, 0.18, 0.72) * lobeSize;
        const leafPosition = position
          .clone()
          .addScaledVector(sideA, Math.cos(detailTheta) * detailOffset)
          .addScaledVector(sideB, Math.sin(detailTheta) * detailOffset)
          .addScaledVector(normal, randomRange(rng, -0.08, 0.22) * lobeSize);
        pushLeafDetail(
          treeType.id === 'willow' ? leafPosition : clampToCrown(leafPosition, terminal.end, 1.02),
          normal,
          randomRange(rng, 0.028, 0.07) * treeScale * treeType.leafScale * (0.64 + leafDensity * 0.26),
          terminal.progress + 0.12,
          clusterId
        );
      }
    }
  }

  if (treeType.id !== 'conifer' && leafDensity > 0.18 && stage.id !== 'barren') {
    const supportLevels = stage.id === 'mature' || stage.id === 'lush' || stage.id === 'world' ? 4 : 3;
    const sectors = stage.id === 'ancient' || stage.id === 'world' ? 16 : 14;
    const supportBudget = Math.min(maxCanopyLobeBudget - canopyLobes.length, supportLevels * sectors);
    let supportCount = 0;
    const supportPhase = randomRange(rng, 0, Math.PI * 2);
    const findAnchor = (position: Vector3) => {
      let best: BranchNode | undefined;
      let bestDistance = Math.max(treeScale * 0.42, crownRadiusBase * 0.42);
      for (const terminal of eligibleTerminals) {
        const distance = terminal.end.distanceTo(position);
        if (distance < bestDistance) {
          best = terminal;
          bestDistance = distance;
        }
      }
      return best;
    };

    for (let level = 0; level < supportLevels && supportCount < supportBudget; level += 1) {
      const yT = supportLevels === 4 ? [0.3, 0.48, 0.64, 0.78][level] : [0.36, 0.58, 0.76][level];
      const y = crown.baseY + (crown.topY - crown.baseY) * yT;
      const shellRadius = radiusAtY(y) * randomRange(rng, 0.76, 0.94);
      const levelSectors = level === supportLevels - 1 ? Math.max(8, sectors - 3) : sectors;
      for (let sector = 0; sector < levelSectors && supportCount < supportBudget; sector += 1) {
        const theta = supportPhase + (Math.PI * 2 * sector) / levelSectors + randomRange(rng, -0.055, 0.055);
        const position = clampToCrown(
          new Vector3(
            crown.center.x + Math.cos(theta) * shellRadius * randomRange(rng, 0.92, 1.08),
            y + randomRange(rng, -0.03, 0.045) * treeScale,
            crown.center.z + Math.sin(theta) * shellRadius * randomRange(rng, 0.92, 1.08)
          ),
          undefined,
          0.98
        );
        const anchor = findAnchor(position);
        if (!anchor) continue;
        const clusterId = nextClusterId;
        nextClusterId += 1;
        const size =
          randomRange(rng, 0.062, treeType.id === 'ancient' ? 0.128 : 0.112) *
          treeScale *
          treeType.lobeScale *
          (0.64 + leafDensity * 0.2);
        pushCanopyLobe(
          position,
          crownNormal(position),
          size,
          0.4 + yT * 0.38,
          anchor.depth,
          clusterId,
          anchor.end,
          level === 0 ? -0.08 : level === supportLevels - 1 ? 0.06 : 0,
          randomRange(rng, 0.8, 1.08)
        );
        supportCount += 1;
      }
    }
  }

  if (treeType.id === 'willow' && leafDensity > 0.15 && stage.id !== 'barren' && stage.id !== 'winter') {
    let strandId = 1;
    for (const terminal of eligibleTerminals.slice(0, Math.min(eligibleTerminals.length, 90))) {
      const strandCount = Math.max(1, Math.round(randomRange(rng, 1.2, 3.6) * terminal.vigor));
      for (let strand = 0; strand < strandCount && leaves.length < maxLeafBudget; strand += 1) {
        const side = randomPerpendicular(terminal.direction, rng);
        const strandLength = randomRange(rng, 0.22, 0.62) * treeScale * (0.6 + leafDensity * 0.22);
        const beads = Math.max(2, Math.round(strandLength / Math.max(0.08, treeScale * 0.055)));
        const start = terminal.end
          .clone()
          .addScaledVector(side, randomRange(rng, -0.07, 0.07) * treeScale)
          .addScaledVector(terminal.direction, randomRange(rng, -0.02, 0.08) * treeScale);
        const id = strandId;
        strandId += 1;
        for (let bead = 0; bead < beads && leaves.length < maxLeafBudget; bead += 1) {
          const t = (bead + rng() * 0.35) / beads;
          const sway = Math.sin(t * Math.PI * randomRange(rng, 0.8, 1.35)) * randomRange(rng, -0.042, 0.042) * treeScale;
          const position = start.clone().addScaledVector(up, -strandLength * t).addScaledVector(side, sway);
          leaves.push({
            position,
            normal: side.clone().add(new Vector3(0, -0.45, 0)).normalize(),
            size: randomRange(rng, 0.026, 0.058) * treeScale * treeType.leafScale,
            scale: new Vector3(randomRange(rng, 0.7, 1.1), randomRange(rng, 1.35, 2.05), randomRange(rng, 0.55, 0.95)),
            progress: clamp(terminal.progress + 0.08 + t * 0.12 + randomRange(rng, -0.035, 0.035), 0, 1),
            hueShift: randomRange(rng, -0.025, 0.04),
            shade: randomRange(rng, -0.16, 0.08),
            kind: 'strand',
            strandId: id,
          });
        }
      }
    }
  }

  const visibleSegments = segments.filter((segment) => smoothstep(segment.progress - 0.07, segment.progress + 0.02, growthCutoff) > 0);
  const visibleCanopyLobes = canopyLobes.filter((lobe) => smoothstep(lobe.progress - 0.07, lobe.progress + 0.035, growthCutoff) > 0);
  const visibleLeaves = leaves.filter((entry) => smoothstep(entry.progress - 0.06, entry.progress + 0.03, growthCutoff) > 0);

  return {
    stage,
    weather,
    segments: visibleSegments,
    canopyLobes: visibleCanopyLobes,
    leaves: visibleLeaves,
    stats: {
      height: state.height,
      spread: state.spread,
      segmentCount: segments.length,
      leafCount: leaves.length,
    },
    palette: {
      bark: barkBase,
      barkDark,
      leaf: leafColor,
      leafShadow,
      ground,
      fog: fogColor,
      skyTop,
      skyBottom,
    },
  };
}

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: 'seed',
    label: '种子',
    growth: 1,
    scale: 0.2,
    maxDepth: 0,
    branchFactor: 0,
    branchSpread: 0.05,
    trunkLength: 0.15,
    canopyLift: 0.05,
    leafDensity: 0,
    rootStrength: 0.15,
    segmentBudget: 1,
    rootBudget: 0,
    leafBudget: 0,
    barkWarmth: 0.1,
  },
  {
    id: 'sprout',
    label: '小苗',
    growth: 1,
    scale: 0.8,
    maxDepth: 2,
    branchFactor: 0.8,
    branchSpread: 0.18,
    trunkLength: 0.55,
    canopyLift: 0.12,
    leafDensity: 0.14,
    rootStrength: 0.35,
    segmentBudget: 24,
    rootBudget: 6,
    leafBudget: 46,
    barkWarmth: 0.12,
  },
  {
    id: 'sapling',
    label: '树苗',
    growth: 1,
    scale: 1.5,
    maxDepth: 3,
    branchFactor: 1.15,
    branchSpread: 0.26,
    trunkLength: 0.9,
    canopyLift: 0.18,
    leafDensity: 0.28,
    rootStrength: 0.45,
    segmentBudget: 54,
    rootBudget: 10,
    leafBudget: 170,
    barkWarmth: 0.16,
  },
  {
    id: 'solitary',
    label: '独木',
    growth: 1,
    scale: 2.6,
    maxDepth: 4,
    branchFactor: 1.45,
    branchSpread: 0.32,
    trunkLength: 1.3,
    canopyLift: 0.25,
    leafDensity: 0.42,
    rootStrength: 0.6,
    segmentBudget: 96,
    rootBudget: 18,
    leafBudget: 300,
    barkWarmth: 0.2,
  },
  {
    id: 'mature',
    label: '大树',
    growth: 1,
    scale: 4.2,
    maxDepth: 5,
    branchFactor: 2.12,
    branchSpread: 0.44,
    trunkLength: 1.8,
    canopyLift: 0.34,
    leafDensity: 0.76,
    rootStrength: 0.72,
    segmentBudget: 230,
    rootBudget: 24,
    leafBudget: 860,
    barkWarmth: 0.26,
  },
  {
    id: 'lush',
    label: '繁茂大树',
    growth: 1,
    scale: 5.7,
    maxDepth: 6,
    branchFactor: 2.32,
    branchSpread: 0.48,
    trunkLength: 2.1,
    canopyLift: 0.38,
    leafDensity: 1,
    rootStrength: 0.8,
    segmentBudget: 330,
    rootBudget: 30,
    leafBudget: 1180,
    barkWarmth: 0.32,
  },
  {
    id: 'ancient',
    label: '古树',
    growth: 1,
    scale: 7.4,
    maxDepth: 7,
    branchFactor: 2.45,
    branchSpread: 0.52,
    trunkLength: 2.5,
    canopyLift: 0.46,
    leafDensity: 0.82,
    rootStrength: 0.9,
    segmentBudget: 420,
    rootBudget: 44,
    leafBudget: 980,
    barkWarmth: 0.38,
  },
  {
    id: 'world',
    label: '世界树',
    growth: 1,
    scale: 6.4,
    maxDepth: 8,
    branchFactor: 3,
    branchSpread: 0.78,
    trunkLength: 1.55,
    canopyLift: 0.2,
    leafDensity: 1.15,
    rootStrength: 1,
    segmentBudget: 420,
    rootBudget: 64,
    leafBudget: 1220,
    barkWarmth: 0.44,
  },
  {
    id: 'winter',
    label: '冬木',
    growth: 1,
    scale: 4.8,
    maxDepth: 5,
    branchFactor: 1.55,
    branchSpread: 0.34,
    trunkLength: 1.9,
    canopyLift: 0.2,
    leafDensity: 0.15,
    rootStrength: 0.74,
    segmentBudget: 140,
    rootBudget: 22,
    leafBudget: 92,
    barkWarmth: 0.08,
  },
  {
    id: 'bonsai',
    label: '盆景',
    growth: 1,
    scale: 1.1,
    maxDepth: 5,
    branchFactor: 2.1,
    branchSpread: 0.58,
    trunkLength: 0.7,
    canopyLift: 0.14,
    leafDensity: 0.34,
    rootStrength: 0.7,
    segmentBudget: 110,
    rootBudget: 20,
    leafBudget: 170,
    barkWarmth: 0.22,
  },
  {
    id: 'barren',
    label: '枯木',
    growth: 1,
    scale: 3.9,
    maxDepth: 6,
    branchFactor: 1.75,
    branchSpread: 0.31,
    trunkLength: 2,
    canopyLift: 0.18,
    leafDensity: 0.02,
    rootStrength: 0.65,
    segmentBudget: 190,
    rootBudget: 22,
    leafBudget: 8,
    barkWarmth: 0.02,
  },
];

export const WEATHER_PRESETS: WeatherPreset[] = [
  {
    id: 'clear',
    label: '晴',
    fog: 0.06,
    skyTop: '#88b8da',
    skyBottom: '#dfe9d6',
    saturation: 1,
    moistureBoost: -0.05,
    windBoost: 0,
    leafWetness: 0,
    particleCount: 0,
  },
  {
    id: 'cloudy',
    label: '阴',
    fog: 0.09,
    skyTop: '#738897',
    skyBottom: '#b8c1b2',
    saturation: 0.9,
    moistureBoost: 0.04,
    windBoost: 0.05,
    leafWetness: 0.05,
    particleCount: 0,
  },
  {
    id: 'drizzle',
    label: '细雨',
    fog: 0.12,
    skyTop: '#5f7080',
    skyBottom: '#a6b0aa',
    saturation: 0.85,
    moistureBoost: 0.12,
    windBoost: 0.08,
    leafWetness: 0.15,
    particleCount: 240,
  },
  {
    id: 'rain',
    label: '雨',
    fog: 0.16,
    skyTop: '#4c5a67',
    skyBottom: '#8b9496',
    saturation: 0.78,
    moistureBoost: 0.22,
    windBoost: 0.12,
    leafWetness: 0.26,
    particleCount: 360,
  },
  {
    id: 'storm',
    label: '风暴',
    fog: 0.2,
    skyTop: '#37414d',
    skyBottom: '#70767b',
    saturation: 0.7,
    moistureBoost: 0.18,
    windBoost: 0.28,
    leafWetness: 0.3,
    particleCount: 520,
  },
  {
    id: 'snow',
    label: '雪',
    fog: 0.15,
    skyTop: '#a6b8c7',
    skyBottom: '#edf3f7',
    saturation: 0.82,
    moistureBoost: 0.08,
    windBoost: 0.1,
    leafWetness: 0.14,
    particleCount: 300,
  },
  {
    id: 'mist',
    label: '雾',
    fog: 0.26,
    skyTop: '#7d8787',
    skyBottom: '#d6dbd8',
    saturation: 0.76,
    moistureBoost: 0.15,
    windBoost: 0.04,
    leafWetness: 0.1,
    particleCount: 180,
  },
];

export function getStagePreset(stageId: string) {
  return STAGE_PRESETS.find((preset) => preset.id === stageId) ?? STAGE_PRESETS[4];
}

export function getWeatherPreset(weatherId: WeatherId) {
  return WEATHER_PRESETS.find((preset) => preset.id === weatherId) ?? WEATHER_PRESETS[0];
}

export function getTreeTypePreset(treeTypeId: TreeTypeId) {
  return TREE_TYPE_PRESETS.find((preset) => preset.id === treeTypeId) ?? TREE_TYPE_PRESETS[0];
}

function randomUnitVector(rng: () => number) {
  const theta = randomRange(rng, 0, Math.PI * 2);
  const z = randomRange(rng, -1, 1);
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return new Vector3(Math.cos(theta) * radius, z, Math.sin(theta) * radius);
}

function randomPerpendicular(direction: Vector3, rng: () => number) {
  const helper = Math.abs(direction.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const axis = new Vector3().crossVectors(direction, helper);
  if (axis.lengthSq() < 1e-6) {
    axis.copy(randomUnitVector(rng));
  }
  return axis.normalize();
}

function mixHex(a: string, b: string, amount: number) {
  const colorA = new Color(a);
  const colorB = new Color(b);
  return colorA.lerp(colorB, clamp(amount, 0, 1)).getStyle();
}

function tintByHsl(hex: string, hShift: number, sMul: number, lMul: number) {
  const color = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  hsl.h = (hsl.h + hShift + 1) % 1;
  hsl.s = clamp(hsl.s * sMul, 0, 1);
  hsl.l = clamp(hsl.l * lMul, 0, 1);
  return new Color().setHSL(hsl.h, hsl.s, hsl.l).getStyle();
}

export function createDefaultConfig(): TreeConfig {
  const preset = getStagePreset('mature');
  return {
    seed: '榕',
    treeType: 'broadleaf',
    stageId: preset.id,
    growth: preset.growth,
    trunkThickness: 0.58,
    branchSpread: 0.56,
    twist: 0.42,
    leafDensity: 0.62,
    asymmetry: 0.18,
    soil: 0.6,
    moisture: 0.5,
    temperature: 0.58,
    wind: 0.18,
    weather: 'clear',
  };
}

export function generateTreeStructure(config: TreeConfig): TreeStructure {
  return generateBotanicalTreeStructure(config);
}

function generateLegacyTreeStructure(config: TreeConfig): TreeStructure {
  const stage = getStagePreset(config.stageId);
  const weather = getWeatherPreset(config.weather);
  const treeType = getTreeTypePreset(config.treeType ?? 'broadleaf');
  const rng = createSeededRng(`${config.seed}::${config.stageId}::${treeType.id}`);

  const segments: TreeSegment[] = [];
  const canopyLobes: TreeCanopyLobe[] = [];
  const leaves: TreeLeaf[] = [];

  const soil = clamp(config.soil, 0, 1);
  const moisture = clamp(config.moisture + weather.moistureBoost, 0, 1);
  const temperature = clamp(config.temperature, 0, 1);
  const wind = clamp(config.wind + weather.windBoost, 0, 1);
  const treeScale = stage.scale * (0.75 + soil * 0.4 + moisture * 0.08);
  const stageThicknessLimit = stage.id === 'bonsai' ? 1.06 : clamp(0.46 + stage.scale / 7.5, 0.52, 1.18);
  const trunkThickness = (0.03 + config.trunkThickness * 0.11) * (0.9 + soil * 0.2) * stageThicknessLimit * treeType.trunkScale;
  const branchSpread = clamp((stage.branchSpread + config.branchSpread * 0.42) * treeType.crownWidthScale, 0.04, 0.9);
  const twist = clamp(config.twist * 1.2 + wind * 0.15, 0, 1);
  const rawAsymmetry = clamp(config.asymmetry, 0, 1);
  const asymmetry = Math.pow(rawAsymmetry, 1.55) * (treeType.id === 'willow' ? 0.82 : 0.58);
  const leafDensity = clamp((stage.leafDensity + config.leafDensity * 0.75 + moisture * 0.15) * (treeType.id === 'conifer' ? 1.08 : 1), 0, 1.75);
  const maxDepth = stage.maxDepth;
  const maxBudget = stage.segmentBudget;
  const maxLeafBudget = stage.leafBudget;
  const rootBudget = stage.rootBudget;
  const growthCutoff = clamp(config.growth, 0, 1);
  const canopyLobeBudgetByStage: Record<string, number> = {
    seed: 0,
    sprout: 5,
    sapling: 16,
    solitary: 30,
    mature: 170,
    lush: 240,
    ancient: 190,
    world: 280,
    winter: 10,
    bonsai: 20,
    barren: 0,
  };
  const typeCanopyDensity = treeType.id === 'conifer' ? 3 : treeType.id === 'willow' ? 1.18 : 1;
  const maxCanopyLobeBudget = Math.round(
    (canopyLobeBudgetByStage[stage.id] ?? 24) * clamp(0.45 + leafDensity * 0.52, 0.35, 1.28) * typeCanopyDensity
  );

  const barkBase = mixHex('#5b4336', '#7a5b3e', stage.barkWarmth * 0.8 + soil * 0.15);
  const barkDark = tintByHsl(barkBase, -0.01, 0.82, 0.74);

  const hotness = clamp(temperature, 0, 1);
  const wetness = clamp(moisture, 0, 1);
  const leafBase = new Color(
    mixHex('#4c7a31', '#79a64a', soil * 0.65 + wetness * 0.25)
  );
  const tempShift = hotness < 0.35 ? 0.56 : hotness > 0.72 ? 0.1 : 0.26;
  const leaf = leafBase
    .clone()
    .lerp(new Color(hotness < 0.35 ? '#c9d9ea' : hotness > 0.72 ? '#d7c268' : '#88bf61'), Math.abs(hotness - 0.5) * 0.8 + 0.1)
    .lerp(new Color('#8bb55e'), 0.3)
    .offsetHSL(tempShift - 0.26, -0.03 + wetness * 0.02, 0.02);
  const leafColor = leaf.getStyle();
  const leafShadow = tintByHsl(leafColor, -0.02, 0.75, 0.72);

  const skyTop = tintByHsl(weather.skyTop, (1 - hotness) * 0.03, 1, 0.98 + hotness * 0.04);
  const skyBottom = tintByHsl(weather.skyBottom, -0.01, 1, 0.99);
  const fogColor = mixHex('#d0d7d0', weather.skyBottom, weather.fog * 0.85);
  const ground = mixHex('#354038', '#5d5a46', soil * 0.55 + moisture * 0.1);

  const state = {
    height: 0,
    spread: 0,
  };
  const branchTips: Array<{ position: Vector3; direction: Vector3; progress: number; depth: number; vigor: number }> = [];

  const updateBounds = (point: Vector3) => {
    state.height = Math.max(state.height, point.y);
    state.spread = Math.max(state.spread, Math.abs(point.x), Math.abs(point.z));
  };

  const addSegment = (
    start: Vector3,
    end: Vector3,
    radiusStart: number,
    radiusEnd: number,
    progress: number,
    depth: number
  ) => {
    if (segments.length >= maxBudget) return false;
    segments.push({
      start: start.clone(),
      end: end.clone(),
      radiusStart,
      radiusEnd,
      progress: clamp(progress, 0, 1),
      depth,
    });
    updateBounds(start);
    updateBounds(end);
    return true;
  };

  const pushLeafCluster = (tip: Vector3, direction: Vector3, progress: number, depth: number, vigor = 1) => {
    if (leaves.length >= maxLeafBudget || leafDensity <= 0.04) return;
    if (depth < Math.max(2, maxDepth - 3)) return;
    const depthBoost = depth >= maxDepth - 1 ? 1.6 : depth >= maxDepth - 2 ? 1.28 : 0.92;
    const clusterCount = Math.max(1, Math.round((1.25 + leafDensity * 3.05) * depthBoost * vigor));
    const axis = direction.clone().normalize();
    const sideA = randomPerpendicular(axis, rng);
    const sideB = new Vector3().crossVectors(axis, sideA).normalize();

    for (let i = 0; i < clusterCount && leaves.length < maxLeafBudget; i += 1) {
      const radial = Math.sqrt(rng());
      const angle = randomRange(rng, 0, Math.PI * 2);
      const shell = randomRange(rng, 0.35, 1);
      const canopyRadius = randomRange(rng, 0.035, 0.13) * treeScale * (0.75 + leafDensity * 0.55) * vigor;
      const offset = axis
        .clone()
        .multiplyScalar(randomRange(rng, -0.03, 0.13) * treeScale * shell)
        .addScaledVector(sideA, Math.cos(angle) * radial * canopyRadius)
        .addScaledVector(sideB, Math.sin(angle) * radial * canopyRadius * randomRange(rng, 0.65, 1.1));
      leaves.push({
        position: tip.clone().add(offset),
        normal: axis.clone().add(offset.clone().normalize().multiplyScalar(0.35)).normalize(),
        size: randomRange(rng, 0.03, 0.082) * treeScale * treeType.leafScale * (0.66 + leafDensity * 0.32) * randomRange(rng, 0.72, 1.18),
        scale: new Vector3(
          randomRange(rng, 0.95, 1.45),
          randomRange(rng, 0.72, 1.12),
          randomRange(rng, 0.85, 1.35)
        ),
        progress: clamp(progress + randomRange(rng, -0.035, 0.075), 0, 1),
        hueShift: randomRange(rng, -0.035, 0.035),
        shade: randomRange(rng, -0.16, 0.12),
      });
    }
  };

  const pushCanopyLobe = (
    position: Vector3,
    normal: Vector3,
    size: number,
    progress: number,
    shadeBias = 0,
    flatten = 1,
    anchor?: Vector3
  ) => {
    if (canopyLobes.length >= maxCanopyLobeBudget || leafDensity <= 0.08 || stage.id === 'barren') return;
    const horizon = Math.abs(normal.y);
    const crownTopFade = treeType.coneBias > 0
      ? 0
      : clamp((position.y - trunkLength * 0.78) / Math.max(0.001, treeScale * 0.58), 0, 1);
    const topSizeFactor = 1 + ((treeType.id === 'ancient' ? 0.72 : 0.64) - 1) * crownTopFade;
    canopyLobes.push({
      position: position.clone(),
      normal: normal.clone().normalize(),
      anchor: anchor?.clone(),
      size: size * treeType.lobeScale * topSizeFactor,
      scale: new Vector3(
        randomRange(rng, 0.92, 1.42),
        randomRange(rng, 0.62, 1.02) * flatten * (1 - 0.18 * crownTopFade),
        randomRange(rng, 0.86, 1.36)
      ),
      progress: clamp(progress + randomRange(rng, -0.045, 0.06), 0, 1),
      hueShift: randomRange(rng, -0.03, 0.036),
      shade: randomRange(rng, -0.11, 0.13) + shadeBias - horizon * 0.035,
    });
  };

  interface BranchSpec {
    start: Vector3;
    direction: Vector3;
    length: number;
    radius: number;
    depth: number;
    progressBase: number;
    progressSpan: number;
    vigor: number;
    kind: 'branch' | 'root';
  }

  const constrainBranchDirection = (direction: Vector3, depth: number, terminal = false) => {
    if (treeType.id === 'willow' || direction.lengthSq() < 1e-8) {
      return direction.normalize();
    }

    if (treeType.coneBias > 0) {
      const minY = depth <= 1 ? -0.035 : -0.08;
      if (direction.y < minY) {
        direction.y = minY;
      }
      return direction.normalize();
    }

    const baseMinY = treeType.id === 'ancient' ? 0.012 : 0.035;
    const depthRelax = Math.max(0, depth - 1) * (treeType.id === 'ancient' ? 0.018 : 0.014);
    const terminalRelax = terminal ? 0.032 : 0;
    const minY = Math.max(treeType.id === 'ancient' ? -0.025 : -0.008, baseMinY - depthRelax - terminalRelax);
    if (direction.y < minY) {
      direction.y = minY;
    }
    return direction.normalize();
  };

  const growBranch = (spec: BranchSpec) => {
    if (segments.length >= maxBudget || spec.length <= 0.02) return;

    const isLeafyBranch = spec.kind === 'branch' && treeType.coneBias <= 0;
    const pieces = Math.max(2, Math.round(spec.length * (0.82 + spec.depth * 0.34 + (isLeafyBranch ? 0.16 : 0))));
    let point = spec.start.clone();
    let direction = spec.kind === 'branch'
      ? constrainBranchDirection(spec.direction.clone(), spec.depth)
      : spec.direction.clone().normalize();
    let radius = spec.radius;
    const curveAxis = randomPerpendicular(direction, rng);
    const outward = new Vector3(direction.x, 0, direction.z);
    if (outward.lengthSq() < 1e-5) outward.copy(randomPerpendicular(direction, rng));
    outward.normalize();
    let spawnedChild = false;

    for (let i = 0; i < pieces && segments.length < maxBudget; i += 1) {
      const localT = (i + 1) / pieces;
      const taper = Math.pow(1 - localT, 0.82);
      const curve = (0.026 + twist * 0.065 + branchSpread * 0.045) * (spec.kind === 'root' ? 0.45 : 1);
      const droop = spec.kind === 'root'
        ? -0.08 - soil * 0.03
        : -Math.max(0, spec.depth - 1) * (0.011 + treeType.branchDroop * 0.03) * localT
          + stage.canopyLift * 0.012
          + treeType.branchLift * 0.03
          - treeType.branchDroop * 0.045;

      direction
        .addScaledVector(curveAxis, Math.sin(localT * Math.PI) * curve * randomRange(rng, -1.1, 1.1))
        .addScaledVector(new Vector3(0, 1, 0), droop)
        .addScaledVector(outward, 0.003 + branchSpread * 0.005)
        .normalize();

      direction.x += (rng() - 0.5) * wind * 0.045;
      direction.z += (rng() - 0.5) * wind * 0.045;
      if (spec.kind === 'branch') {
        constrainBranchDirection(direction, spec.depth, localT > 0.72);
      } else {
        direction.normalize();
      }

      const stepLength = (spec.length / pieces) * randomRange(rng, 0.92, 1.08);
      const next = point.clone().add(direction.clone().multiplyScalar(stepLength));
      const progress = spec.progressBase + spec.progressSpan * localT + spec.depth * 0.035 + randomRange(rng, -0.012, 0.012);
      const nextRadius = Math.max(0.003, spec.radius * (0.18 + taper * 0.82));
      if (!addSegment(point, next, radius, nextRadius, progress, spec.depth)) return;

      const canFork = spec.kind === 'branch' && spec.depth < maxDepth && localT > 0.34 && localT < 0.88;
      const forkChance =
        (0.12 + branchSpread * 0.12 + leafDensity * 0.055) *
        spec.vigor *
        (1.05 - spec.depth / (maxDepth + 1)) *
        (treeType.coneBias > 0 ? 0.74 : 1.18);
      if (canFork && rng() < forkChance) {
        const forkCount = rng() < (isLeafyBranch && spec.depth >= 2 ? 0.52 : 0.72) ? 1 : 2;
        for (let j = 0; j < forkCount && segments.length < maxBudget; j += 1) {
          const side = randomPerpendicular(direction, rng);
          const fanSign = rng() < 0.5 ? -1 : 1;
          const childLengthRatio = randomRange(rng, spec.depth <= 1 ? 0.58 : 0.48, spec.depth <= 1 ? 0.82 : 0.72);
          const childRadiusRatio = forkCount > 1 ? randomRange(rng, 0.52, 0.61) : randomRange(rng, 0.62, 0.76);
          const childDir = direction
            .clone()
            .multiplyScalar(randomRange(rng, 0.62, 0.78))
            .addScaledVector(side, fanSign * randomRange(rng, 0.22, 0.48) * branchSpread)
            .addScaledVector(outward, randomRange(rng, 0.08, 0.22) * branchSpread)
            .addScaledVector(
              new Vector3(0, 1, 0),
              randomRange(rng, 0.02, 0.18) +
                stage.canopyLift * 0.07 +
                treeType.branchLift -
                treeType.branchDroop * (treeType.id === 'willow' ? 0.18 : 0.08)
            )
          constrainBranchDirection(childDir, spec.depth + 1);
          spawnedChild = true;
          growBranch({
            start: next.clone(),
            direction: childDir,
            length: spec.length * childLengthRatio * (1 - spec.depth * 0.045),
            radius: Math.max(0.003, nextRadius * childRadiusRatio),
            depth: spec.depth + 1,
            progressBase: clamp(progress + randomRange(rng, 0.025, 0.08), 0, 1),
            progressSpan: spec.progressSpan * randomRange(rng, 0.5, 0.72),
            vigor: spec.vigor * randomRange(rng, 0.72, 0.92),
            kind: 'branch',
          });
        }
      }

      point = next;
      radius = nextRadius;
    }

    const structuralNeed = spec.depth <= 2 && treeType.coneBias <= 0 ? 0.42 : 0;
    const terminalSplitChance =
      spec.kind === 'branch' && spec.depth > 0 && spec.depth < maxDepth && spec.length > treeScale * 0.12
        ? Math.min(0.92, (treeType.coneBias > 0 ? 0.18 : treeType.id === 'ancient' ? 0.58 : 0.54) + structuralNeed) *
          spec.vigor *
          (1.02 - spec.depth / (maxDepth + 1))
        : 0;
    if (terminalSplitChance > 0 && segments.length < maxBudget - 4 && rng() < terminalSplitChance) {
      const terminalCount = rng() < (treeType.id === 'ancient' || treeType.id === 'broadleaf' ? 0.34 : 0.62) ? 2 : 1;
      for (let j = 0; j < terminalCount && segments.length < maxBudget; j += 1) {
        const side = randomPerpendicular(direction, rng);
        const fanSign = rng() < 0.5 ? -1 : 1;
        const childRadiusRatio = terminalCount > 1 ? randomRange(rng, 0.48, 0.58) : randomRange(rng, 0.58, 0.7);
        const childDir = direction
          .clone()
          .multiplyScalar(randomRange(rng, 0.56, 0.72))
          .addScaledVector(side, fanSign * randomRange(rng, 0.24, 0.54) * branchSpread)
          .addScaledVector(outward, randomRange(rng, 0.08, 0.2) * branchSpread)
          .addScaledVector(
            new Vector3(0, 1, 0),
            randomRange(rng, 0, 0.14) + treeType.branchLift * 0.5 - treeType.branchDroop * 0.12
          );
        constrainBranchDirection(childDir, spec.depth + 1, true);
        spawnedChild = true;
        growBranch({
          start: point.clone(),
          direction: childDir,
          length: spec.length * randomRange(rng, 0.34, 0.54) * (1 - spec.depth * 0.035),
          radius: Math.max(0.0025, radius * childRadiusRatio),
          depth: spec.depth + 1,
          progressBase: clamp(spec.progressBase + spec.progressSpan * randomRange(rng, 0.86, 1.04), 0, 1),
          progressSpan: spec.progressSpan * randomRange(rng, 0.28, 0.48),
          vigor: spec.vigor * randomRange(rng, 0.62, 0.84),
          kind: 'branch',
        });
      }
    }

    if (spec.kind === 'branch' && (!spawnedChild || spec.depth >= maxDepth - 1)) {
      branchTips.push({
        position: point.clone(),
        direction: direction.clone(),
        progress: clamp(spec.progressBase + spec.progressSpan + spec.depth * 0.04, 0, 1),
        depth: spec.depth,
        vigor: spec.vigor,
      });
    }
  };

  const trunkLength = stage.trunkLength * treeScale * treeType.heightScale * (0.85 + soil * 0.28 + moisture * 0.08);
  const trunkRadius = trunkThickness * treeScale * (0.82 + soil * 0.22);
  const trunkSections = Math.max(1, Math.round(2 + maxDepth * 1.55 + stage.scale * 0.18));
  const trunkPoints: Array<{ point: Vector3; radius: number; progress: number }> = [];
  const leanAngle = randomRange(rng, 0, Math.PI * 2);
  const lean = new Vector3(Math.cos(leanAngle), 0, Math.sin(leanAngle)).multiplyScalar((0.025 + asymmetry * 0.065 + wind * 0.025) * trunkLength);
  const swayAxis = randomPerpendicular(new Vector3(0, 1, 0), rng);
  let previous = new Vector3(0, 0, 0);
  let previousRadius = trunkRadius;
  trunkPoints.push({ point: previous.clone(), radius: previousRadius, progress: 0 });

  for (let i = 1; i <= trunkSections; i += 1) {
    const t = i / trunkSections;
    const heightT = 1 - Math.pow(1 - t, 1.08);
    const sideAmount = Math.sin(t * Math.PI * randomRange(rng, 0.75, 1.25)) * twist * 0.045 * trunkLength;
    const point = new Vector3(0, trunkLength * heightT, 0)
      .addScaledVector(lean, Math.pow(t, 1.45))
      .addScaledVector(swayAxis, sideAmount * (0.25 + t * 0.75));
    const radius = Math.max(0.004, trunkRadius * (0.08 + Math.pow(1 - t, 0.72) * 0.92));
    const progress = 0.015 + t * 0.28;
    addSegment(previous, point, previousRadius, radius, progress, 0);
    trunkPoints.push({ point: point.clone(), radius, progress });
    previous = point;
    previousRadius = radius;
  }

  const typeBranchBoost = treeType.id === 'conifer' ? 1.3 : treeType.id === 'willow' ? 1.08 : treeType.id === 'ancient' ? 1.18 : 1.05;
  const mainBranchCount = maxDepth <= 0 ? 0 : Math.min(
    Math.floor(maxBudget / 14),
    Math.max(1, Math.round((2 + stage.branchFactor * 1.45 + config.branchSpread * 1.65 + soil * 0.7) * typeBranchBoost))
  );
  const canopyStart = stage.id === 'sprout' ? 0.46 : stage.id === 'bonsai' ? 0.22 : 0.28;
  const canopyEnd = stage.id === 'world' ? 0.95 : 0.9;
  const crownCenterY = trunkLength * (
    treeType.id === 'conifer'
      ? 0.55
      : stage.id === 'sapling' || stage.id === 'sprout'
        ? 0.7
        : 0.64 + stage.canopyLift * 0.08
  );
  const crownHeight = Math.max(treeScale * 0.46, trunkLength * (0.42 + stage.canopyLift * 0.16)) * treeType.crownHeightScale;
  const matureCrownBoost =
    treeType.coneBias > 0
      ? 1
      : stage.id === 'mature' || stage.id === 'lush'
        ? 1.18
        : stage.id === 'ancient' || stage.id === 'world'
          ? 1.12
          : 1.04;
  const crownRadiusTarget =
    treeScale * (0.34 + branchSpread * 0.68 + stage.branchFactor * 0.055) * treeType.crownWidthScale * matureCrownBoost;

  const mainBranchPlans: Array<{ t: number; angle: number }> = [];
  const branchRingCount = Math.max(2, Math.min(mainBranchCount, treeType.id === 'willow' ? 4 : treeType.id === 'ancient' ? 5 : 4));
  const branchSectorCount = Math.max(2, Math.ceil(mainBranchCount / branchRingCount));
  const branchPhase = randomRange(rng, 0, Math.PI * 2);

  for (let ring = 0; ring < branchRingCount && mainBranchPlans.length < mainBranchCount; ring += 1) {
    const ringT = canopyStart + (canopyEnd - canopyStart) * ((ring + 0.5) / branchRingCount);
    const ringSpread = treeType.id === 'willow' ? 0.12 : treeType.id === 'ancient' ? 0.1 : 0.08;
    for (let sector = 0; sector < branchSectorCount && mainBranchPlans.length < mainBranchCount; sector += 1) {
      const sectorPhase = (sector + (ring % 2 ? 0.5 : 0)) / branchSectorCount;
      mainBranchPlans.push({
        t: clamp(ringT + randomRange(rng, -ringSpread, ringSpread), 0.08, 0.96),
        angle:
          branchPhase +
          Math.PI * 2 * sectorPhase +
          randomRange(rng, -0.12, 0.12) +
          asymmetry * randomRange(rng, -0.2, 0.2),
      });
    }
  }

  while (mainBranchPlans.length < mainBranchCount) {
    const ring = mainBranchPlans.length % branchRingCount;
    const ringT = canopyStart + (canopyEnd - canopyStart) * ((ring + 0.5) / branchRingCount);
    mainBranchPlans.push({
      t: clamp(ringT + randomRange(rng, -0.06, 0.06), 0.08, 0.96),
      angle: branchPhase + Math.PI * 2 * randomRange(rng, 0, 1),
    });
  }

  for (const plan of mainBranchPlans) {
    const t = plan.t;
    const trunkIndex = clamp(Math.round(t * (trunkPoints.length - 1)), 1, trunkPoints.length - 1);
    const attach = trunkPoints[trunkIndex];
    const crownRole = 1 - Math.abs(t - 0.58) * 1.35;
    const angle = plan.angle;
    const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
    const verticalSample = clamp(
      treeType.id === 'conifer'
        ? -0.95 + t * 1.85 + randomRange(rng, -0.18, 0.18)
        : randomRange(rng, -0.72, 0.72) + (t - 0.58) * 0.8 - treeType.branchDroop * 0.18,
      -0.96,
      0.92
    );
    const coneT = (verticalSample + 1) * 0.5;
    const broadleafShell = Math.sqrt(Math.max(0.08, 1 - verticalSample * verticalSample));
    const coniferShell = clamp(1.05 - coneT * 0.78, 0.16, 1);
    const shellRadius = crownRadiusTarget * (treeType.coneBias > 0 ? coniferShell : broadleafShell);
    const lateralReach = treeType.coneBias > 0
      ? randomRange(rng, 0.66, 1.02)
      : randomRange(rng, 0.86 - asymmetry * 0.12, 1.12 + asymmetry * 0.1);
    const targetPoint = new Vector3(0, crownCenterY + verticalSample * crownHeight, 0)
      .addScaledVector(radial, shellRadius * lateralReach)
      .addScaledVector(new Vector3(lean.x, 0, lean.z), 0.42);
    if (treeType.id !== 'willow') {
      const minTargetY = attach.point.y + treeScale * (treeType.coneBias > 0 ? -0.02 : treeType.id === 'ancient' ? 0.035 : 0.065);
      if (targetPoint.y < minTargetY) {
        targetPoint.y += (minTargetY - targetPoint.y) * 0.82;
      }
    }
    const toTarget = targetPoint.sub(attach.point);
    const liftBias = treeType.coneBias > 0
      ? stage.canopyLift * 0.12 + treeType.branchLift - treeType.branchDroop * 0.12
      : stage.canopyLift * 0.06 + treeType.branchLift * 0.45 - treeType.branchDroop * 0.16;
    const direction = toTarget
      .clone()
      .addScaledVector(new Vector3(0, 1, 0), liftBias + randomRange(rng, -0.055, treeType.coneBias > 0 ? 0.08 : 0.045))
    constrainBranchDirection(direction, 1);
    const lengthJitter = treeType.coneBias > 0 ? randomRange(rng, 0.82, 1.08) : randomRange(rng, 0.92, 1.18);
    const lightFactor = clamp(0.54 + t * 0.58 + Math.max(0, crownRole) * 0.12, 0.48, 1.18);
    const lowerSuppression = treeType.id === 'willow' ? 1 : clamp(0.72 + t * 0.42, 0.62, 1.08);
    const primaryReach = treeType.coneBias > 0 ? 1 : treeType.id === 'willow' ? 0.92 : 0.74;
    const length = Math.max(
      treeScale * 0.18,
      toTarget.length() * lengthJitter * (0.82 + Math.max(0, crownRole) * 0.18) * lightFactor * lowerSuppression * primaryReach
    );
    const radius = Math.max(0.005, attach.radius * randomRange(rng, 0.22, 0.4) * (1.05 - t * 0.28));
    growBranch({
      start: attach.point.clone(),
      direction,
      length,
      radius,
      depth: 1,
      progressBase: clamp(0.18 + t * 0.23, 0, 1),
      progressSpan: 0.28 + (1 - t) * 0.12,
      vigor: clamp((0.58 + Math.max(0, crownRole) * 0.36 + leafDensity * 0.12) * lightFactor, 0.28, 1.45),
      kind: 'branch',
    });
  }

  const trunkTip = trunkPoints[trunkPoints.length - 1];
  if (trunkTip && leafDensity > 0.08 && stage.id !== 'barren') {
    branchTips.unshift({
      position: trunkTip.point.clone().add(new Vector3(0, trunkRadius * 0.45, 0)),
      direction: new Vector3(0.08 * asymmetry, 1, 0.04 * wind).normalize(),
      progress: 0.52,
      depth: Math.max(2, maxDepth - 1),
      vigor: stage.id === 'world' ? 1.2 : stage.id === 'sapling' || stage.id === 'sprout' ? 1.05 : 0.9,
    });
  }

  if (rootBudget > 0 && stage.rootStrength > 0.2) {
    const buttressCount = Math.max(3, Math.round(3 + stage.rootStrength * 4));
    for (let i = 0; i < buttressCount && segments.length < maxBudget; i += 1) {
      const angle = (Math.PI * 2 * i) / buttressCount + randomRange(rng, -0.18, 0.18);
      const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
      const start = radial.clone().multiplyScalar(trunkRadius * randomRange(rng, 0.18, 0.34));
      start.y = randomRange(rng, 0.015, 0.08);
      const end = radial.clone().multiplyScalar(trunkRadius * randomRange(rng, 1.2, 2.4) * (0.7 + stage.rootStrength * 0.45));
      end.y = randomRange(rng, -0.025, 0.035);
      addSegment(
        start,
        end,
        trunkRadius * randomRange(rng, 0.2, 0.38),
        trunkRadius * randomRange(rng, 0.035, 0.09),
        randomRange(rng, 0.02, 0.14),
        0
      );
    }

    const rootCount = Math.max(2, Math.round(2 + stage.rootStrength * 5 + soil * 2));
    for (let i = 0; i < rootCount && segments.length < maxBudget; i += 1) {
      const angle = (Math.PI * 2 * i) / rootCount + randomRange(rng, -0.22, 0.22);
      const rootDirection = new Vector3(Math.cos(angle), randomRange(rng, -0.34, -0.12), Math.sin(angle)).normalize();
      const rootLength = trunkLength * randomRange(rng, 0.22, 0.45) * (0.7 + stage.rootStrength * 0.45);
      const rootRadius = Math.max(0.006, trunkRadius * randomRange(rng, 0.18, 0.36));
      growBranch({
        start: new Vector3(0, 0.025, 0),
        direction: rootDirection,
        length: rootLength,
        radius: rootRadius,
        depth: 0,
        progressBase: 0.01,
        progressSpan: 0.18,
        vigor: 0.6,
        kind: 'root',
      });
    }
  }

  for (const tip of branchTips) {
    pushLeafCluster(tip.position, tip.direction, tip.progress, tip.depth, tip.vigor);
  }

  if (branchTips.length > 1 && leafDensity > 0.16 && stage.id !== 'barren') {
    const terminalTips = branchTips
      .filter((tip) => tip.depth >= 1 || treeType.id === 'conifer')
      .sort((a, b) => b.vigor - a.vigor);
    const terminalBudget = Math.min(
      maxCanopyLobeBudget - canopyLobes.length,
      Math.round(
        terminalTips.length *
          (treeType.id === 'conifer' ? 1.45 : treeType.id === 'willow' ? 1.78 : 2.28) *
          clamp(0.55 + leafDensity * 0.28, 0.5, 1.05)
      )
    );
    let terminalLobes = 0;

    for (const tip of terminalTips) {
      if (terminalLobes >= terminalBudget || canopyLobes.length >= maxCanopyLobeBudget) break;
      const axis = tip.direction.clone().normalize();
      const sideA = randomPerpendicular(axis, rng);
      const sideB = new Vector3().crossVectors(axis, sideA).normalize();
      const localCount = Math.max(
        1,
        Math.round(randomRange(rng, treeType.id === 'conifer' ? 1.1 : 1.6, treeType.id === 'ancient' ? 4.3 : 3.4) * tip.vigor)
      );

      for (let i = 0; i < localCount; i += 1) {
        if (terminalLobes >= terminalBudget || canopyLobes.length >= maxCanopyLobeBudget) break;
        const theta = randomRange(rng, 0, Math.PI * 2);
        const radial = randomRange(rng, 0.025, treeType.id === 'conifer' ? 0.13 : 0.16) * treeScale * (0.7 + tip.vigor * 0.3);
        const downwardSkirt = treeType.id === 'willow' ? randomRange(rng, 0.02, 0.18) * treeScale : 0;
        const verticalScatter =
          treeType.coneBias > 0
            ? randomRange(rng, -0.025, 0.055) * treeScale
            : randomRange(rng, -0.1, 0.13) * treeScale * (0.72 + tip.vigor * 0.16);
        const position = tip.position
          .clone()
          .addScaledVector(axis, randomRange(rng, -0.02, treeType.id === 'conifer' ? 0.18 : 0.09) * treeScale)
          .addScaledVector(sideA, Math.cos(theta) * radial)
          .addScaledVector(sideB, Math.sin(theta) * radial * randomRange(rng, 0.72, 1.18))
          .addScaledVector(new Vector3(0, 1, 0), verticalScatter - downwardSkirt);
        if (treeType.coneBias <= 0) {
          const terminalTop = crownCenterY + crownHeight * (treeType.id === 'broadleaf' ? 0.52 : treeType.id === 'ancient' ? 0.46 : 0.42);
          if (position.y > terminalTop) {
            position.y = terminalTop + (position.y - terminalTop) * 0.22;
          }
        }
        const normal = position
          .clone()
          .sub(new Vector3(0, trunkLength * 0.48, 0))
          .addScaledVector(axis, treeScale * 0.18)
          .normalize();
        const lobeSize =
          randomRange(rng, treeType.id === 'conifer' ? 0.045 : 0.07, treeType.id === 'ancient' ? 0.17 : 0.145) *
          treeScale *
          (0.7 + leafDensity * 0.28) *
          clamp(tip.vigor, 0.45, 1.35);
        pushCanopyLobe(
          position,
          normal,
          lobeSize,
          clamp(tip.progress + randomRange(rng, -0.015, 0.085), 0, 1),
          randomRange(rng, -0.12, 0.12),
          treeType.id === 'conifer'
            ? randomRange(rng, 1.25, 1.72)
            : treeType.id === 'broadleaf'
              ? randomRange(rng, 1.02, 1.3)
              : treeType.id === 'ancient'
                ? randomRange(rng, 0.94, 1.22)
                : randomRange(rng, 1.08, 1.48),
          tip.position
        );
        terminalLobes += 1;
      }
    }
  }

  if (treeType.id === 'willow' && leafDensity > 0.15 && stage.id !== 'barren' && stage.id !== 'winter') {
    const droopTips = branchTips.filter((tip) => tip.depth >= Math.max(1, maxDepth - 3));
    let nextStrandId = 1;
    for (const tip of droopTips) {
      const strandCount = Math.max(1, Math.round(randomRange(rng, 1.6, 4.8) * tip.vigor));
      for (let strand = 0; strand < strandCount && leaves.length < maxLeafBudget; strand += 1) {
        const strandId = nextStrandId;
        nextStrandId += 1;
        const side = randomPerpendicular(tip.direction, rng);
        const strandLength = randomRange(rng, 0.24, 0.68) * treeScale * (0.6 + leafDensity * 0.25);
        const beads = Math.max(2, Math.round(strandLength / Math.max(0.08, treeScale * 0.055)));
        const start = tip.position
          .clone()
          .addScaledVector(side, randomRange(rng, -0.08, 0.08) * treeScale)
          .addScaledVector(tip.direction, randomRange(rng, -0.04, 0.09) * treeScale);
        for (let bead = 0; bead < beads && leaves.length < maxLeafBudget; bead += 1) {
          const t = (bead + rng() * 0.35) / beads;
          const sway = Math.sin(t * Math.PI * randomRange(rng, 0.8, 1.35)) * randomRange(rng, -0.045, 0.045) * treeScale;
          const position = start
            .clone()
            .addScaledVector(new Vector3(0, -1, 0), strandLength * t)
            .addScaledVector(side, sway);
          leaves.push({
            position,
            normal: side.clone().add(new Vector3(0, -0.45, 0)).normalize(),
            size: randomRange(rng, 0.026, 0.058) * treeScale * treeType.leafScale,
            scale: new Vector3(randomRange(rng, 0.7, 1.1), randomRange(rng, 1.35, 2.05), randomRange(rng, 0.55, 0.95)),
            progress: clamp(tip.progress + 0.05 + t * 0.12 + randomRange(rng, -0.035, 0.035), 0, 1),
            hueShift: randomRange(rng, -0.025, 0.04),
            shade: randomRange(rng, -0.16, 0.08),
            kind: 'strand',
            strandId,
          });
        }
      }
    }
  }

  if (branchTips.length > 2 && leafDensity > 0.2 && stage.id !== 'barren') {
    const tipCenter = branchTips.reduce((center, tip) => center.add(tip.position), new Vector3()).multiplyScalar(1 / branchTips.length);
    const trunkCrownCenter = new Vector3(lean.x * 0.28, tipCenter.y, lean.z * 0.28);
    const crownCenter = treeType.id === 'willow'
      ? tipCenter.clone().lerp(trunkCrownCenter, 0.38)
      : tipCenter.clone().lerp(trunkCrownCenter, 0.72 - asymmetry * 0.34);
    const nearestTipAnchor = (position: Vector3, maxDistance: number) => {
      let nearest: Vector3 | undefined;
      let nearestDistance = maxDistance;
      for (const tip of branchTips) {
        if (tip.depth < 1) continue;
        const distance = tip.position.distanceTo(position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = tip.position;
        }
      }
      return nearest;
    };
    const crownBaseY = trunkLength * (
      treeType.id === 'conifer'
        ? 0.16
        : stage.id === 'sapling' || stage.id === 'sprout'
          ? 0.46
          : treeType.id === 'willow'
            ? 0.28
            : 0.38
    );
    const crownTopY = Math.max(crownCenter.y + treeScale * 0.32, state.height + treeScale * 0.16);
    const crownRadius = Math.max(treeScale * (0.28 + branchSpread * 0.42), state.spread * 0.8) * (treeType.id === 'conifer' ? 0.78 : 1);

    const lobeCount = Math.min(
      maxCanopyLobeBudget - canopyLobes.length,
      Math.round(maxCanopyLobeBudget * (
        stage.id === 'winter'
          ? 0.45
          : treeType.id === 'conifer'
            ? 0.76
            : treeType.id === 'willow'
              ? 0.66
              : 0.62
      ))
    );
    for (let i = 0; i < lobeCount && canopyLobes.length < maxCanopyLobeBudget; i += 1) {
      const theta = (Math.PI * 2 * i) / Math.max(1, lobeCount) + randomRange(rng, -0.16, 0.16) + asymmetry * randomRange(rng, -0.26, 0.26);
      const shell = i % 5 === 0 ? randomRange(rng, 0.1, 0.48) : randomRange(rng, 0.28, 1);
      const ring = Math.pow(shell, treeType.coneBias > 0 ? 0.62 : 0.72);
      const ySample = (rng() + rng()) * 0.5;
      const yT = treeType.id === 'conifer'
        ? Math.pow(ySample, 0.82)
        : stage.id === 'sapling' || stage.id === 'sprout'
          ? Math.pow(ySample, 0.66)
          : ySample;
      const profile = Math.sin(yT * Math.PI);
      const lowerSkirt = (yT < 0.28 ? 1.12 : 1) * treeType.lowerSkirt;
      const broadness =
        stage.id === 'world' || stage.id === 'ancient' ? 1.18 : stage.id === 'mature' || stage.id === 'lush' || stage.id === 'solitary' ? 1.12 : 0.94;
      const coneProfile = clamp(1.06 - yT * 0.82, 0.15, 1);
      const radiusProfile = treeType.coneBias > 0
        ? coneProfile
        : 0.3 + profile * 0.78 + (treeType.id === 'willow' && yT < 0.34 ? 0.18 : 0);
      const radius = crownRadius * broadness * ring * radiusProfile * lowerSkirt * randomRange(rng, 0.88, 1.18);
      const position = new Vector3(
        crownCenter.x + Math.cos(theta) * radius * randomRange(rng, 0.94 - asymmetry * 0.08, 1.08 + asymmetry * 0.12),
        crownBaseY + (crownTopY - crownBaseY) * yT + randomRange(rng, -0.06, 0.06) * treeScale,
        crownCenter.z + Math.sin(theta) * radius * randomRange(rng, 0.94 - asymmetry * 0.08, 1.08 + asymmetry * 0.12)
      );
      const normal = position
        .clone()
        .sub(crownCenter)
        .add(new Vector3(0, treeScale * (yT > 0.72 ? 0.28 : 0.12), 0))
        .normalize();
      const edgeBoost = ring > 0.72 ? 1.04 : 0.82;
      const lobeSize = randomRange(rng, 0.058, 0.12) * treeScale * treeType.lobeScale * (0.66 + leafDensity * 0.18) * edgeBoost;
      const anchor = treeType.coneBias > 0 ? undefined : nearestTipAnchor(position, Math.max(treeScale * 0.68, lobeSize * 6.4));
      if (!anchor && treeType.coneBias <= 0 && ring > 0.62) {
        position.lerp(crownCenter, 0.18);
      }
      pushCanopyLobe(
        position,
        normal,
        lobeSize,
        0.32 + yT * 0.48,
        yT < 0.26 ? -0.08 : yT > 0.78 ? 0.08 : 0,
        stage.id === 'world' || stage.id === 'ancient' ? randomRange(rng, 0.72, 1.02) : randomRange(rng, 0.82, 1.12),
        anchor
      );
    }

    if (treeType.coneBias <= 0 && treeType.id !== 'willow' && stage.id !== 'winter') {
      const sectorCount = stage.id === 'ancient' || stage.id === 'world' ? 14 : 12;
      const levelCount = stage.id === 'mature' || stage.id === 'lush' || stage.id === 'world' ? 3 : 2;
      const balanceBudget = Math.min(maxCanopyLobeBudget - canopyLobes.length, sectorCount * levelCount);
      let balancedLobes = 0;
      const balanceAngleOffset = randomRange(rng, 0, Math.PI * 2);

      for (let level = 0; level < levelCount && balancedLobes < balanceBudget; level += 1) {
        const yT = levelCount === 2 ? (level === 0 ? 0.42 : 0.66) : level === 0 ? 0.34 : level === 1 ? 0.54 : 0.74;
        const profile = Math.sin(yT * Math.PI);
        const radiusProfile = 0.42 + profile * 0.66;
        const supportRadius = crownRadius * (stage.id === 'ancient' ? 0.94 : 0.86) * radiusProfile;

        for (let sector = 0; sector < sectorCount && balancedLobes < balanceBudget; sector += 1) {
          const theta = balanceAngleOffset + (Math.PI * 2 * sector) / sectorCount + randomRange(rng, -0.08, 0.08);
          const position = new Vector3(
            crownCenter.x + Math.cos(theta) * supportRadius * randomRange(rng, 0.86, 1.08),
            crownBaseY + (crownTopY - crownBaseY) * yT + randomRange(rng, -0.035, 0.045) * treeScale,
            crownCenter.z + Math.sin(theta) * supportRadius * randomRange(rng, 0.86, 1.08)
          );
          const normal = position.clone().sub(crownCenter).add(new Vector3(0, treeScale * 0.2, 0)).normalize();
          const supportSize = randomRange(rng, 0.072, 0.126) * treeScale * treeType.lobeScale * (0.72 + leafDensity * 0.18);
          pushCanopyLobe(
            position,
            normal,
            supportSize,
            0.42 + yT * 0.36,
            randomRange(rng, -0.06, 0.08),
            randomRange(rng, 0.86, 1.12),
            nearestTipAnchor(position, Math.max(treeScale * 0.82, supportSize * 6.2))
          );
          balancedLobes += 1;
        }
      }
    }

    const fillCount = Math.min(
      maxLeafBudget - leaves.length,
      Math.round(maxLeafBudget * (
        stage.id === 'winter'
          ? 0.1
          : treeType.id === 'conifer'
            ? 0.42
            : treeType.id === 'willow'
              ? 0.22
              : 0.14
      ))
    );

    for (let i = 0; i < fillCount && leaves.length < maxLeafBudget; i += 1) {
      const theta = (Math.PI * 2 * i) / Math.max(1, fillCount) + randomRange(rng, -0.22, 0.22);
      const shell = treeType.coneBias > 0 ? Math.sqrt(rng()) : Math.pow(rng(), 1.16);
      const yT = treeType.id === 'conifer' ? Math.pow(rng(), 0.9) : Math.pow(rng(), 0.78);
      const verticalProfile = Math.sin(yT * Math.PI);
      const fillProfile = treeType.coneBias > 0
        ? clamp(1.02 - yT * 0.82, 0.16, 1)
        : 0.42 + verticalProfile * 0.72 + (treeType.id === 'willow' && yT < 0.34 ? 0.14 : 0);
      const radius = crownRadius * shell * fillProfile * randomRange(rng, 0.64, treeType.coneBias > 0 ? 1.18 : 1.02);
      const position = new Vector3(
        crownCenter.x + Math.cos(theta) * radius * randomRange(rng, 0.86, treeType.coneBias > 0 ? 1.14 : 1.04),
        crownBaseY + (crownTopY - crownBaseY) * yT + randomRange(rng, -0.04, 0.06) * treeScale,
        crownCenter.z + Math.sin(theta) * radius * randomRange(rng, 0.86, treeType.coneBias > 0 ? 1.14 : 1.04)
      );
      const normal = position.clone().sub(crownCenter).add(new Vector3(0, treeScale * 0.18, 0)).normalize();
      leaves.push({
        position,
        normal,
        size: randomRange(rng, 0.034, 0.09) * treeScale * treeType.leafScale * (0.62 + leafDensity * 0.3),
        scale: new Vector3(
          randomRange(rng, 0.95, 1.55),
          randomRange(rng, 0.7, 1.08),
          randomRange(rng, 0.82, 1.42)
        ),
        progress: clamp(0.44 + yT * 0.44 + randomRange(rng, -0.05, 0.06), 0, 1),
        hueShift: randomRange(rng, -0.04, 0.04),
        shade: randomRange(rng, -0.18, 0.14),
      });
    }
  }

  if (branchTips.length > 0 && stage.id !== 'barren' && stage.id !== 'winter') {
    const extraCrownCount = Math.min(maxLeafBudget - leaves.length, Math.round(branchTips.length * leafDensity * 0.22));
    for (let i = 0; i < extraCrownCount && leaves.length < maxLeafBudget; i += 1) {
      const tip = branchTips[Math.floor(rng() * branchTips.length)];
      pushLeafCluster(
        tip.position.clone().addScaledVector(tip.direction, randomRange(rng, -0.08, 0.16) * treeScale),
        tip.direction,
        tip.progress + randomRange(rng, -0.025, 0.04),
        tip.depth,
        tip.vigor * randomRange(rng, 0.48, 0.78)
      );
    }
  }

  const visibleSegments = segments.filter((segment) => smoothstep(segment.progress - 0.07, segment.progress + 0.02, growthCutoff) > 0);
  const visibleCanopyLobes = canopyLobes.filter((lobe) => smoothstep(lobe.progress - 0.07, lobe.progress + 0.035, growthCutoff) > 0);
  const visibleLeaves = leaves.filter((leaf) => smoothstep(leaf.progress - 0.06, leaf.progress + 0.03, growthCutoff) > 0);

  return {
    stage,
    weather,
    segments: visibleSegments,
    canopyLobes: visibleCanopyLobes,
    leaves: visibleLeaves,
    stats: {
      height: state.height,
      spread: state.spread,
      segmentCount: segments.length,
      leafCount: leaves.length,
    },
    palette: {
      bark: barkBase,
      barkDark,
      leaf: leafColor,
      leafShadow,
      ground,
      fog: fogColor,
      skyTop,
      skyBottom,
    },
  };
}
