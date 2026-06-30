// ============================================================
// 可行性基准测试 — 在 Node/V8 (与浏览器同一引擎) 中测量核心算法开销
// 测试网格: 256x128(32k), 512x256(131k), 1024x512(524k)
// ============================================================
"use strict";

// ---- 种子化 PRNG (mulberry32) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 2D 值噪声 + 分形 (可种子化, 无依赖) ----
function makeValueNoise(seed) {
  const rnd = mulberry32(seed);
  const PERM = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rnd() * 2 - 1;
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function noise2(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = grad[PERM[(xi + PERM[yi]) & 511]];
    const ab = grad[PERM[(xi + PERM[yi + 1]) & 511]];
    const ba = grad[PERM[(xi + 1 + PERM[yi]) & 511]];
    const bb = grad[PERM[(xi + 1 + PERM[yi + 1]) & 511]];
    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
  }
  return function fbm(x, y, octaves, lac, gain) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * noise2(x * freq, y * freq); norm += amp; amp *= gain; freq *= lac; }
    return sum / norm;
  };
}

// ---- 网格容器 ----
function makeGrid(W, H) {
  const N = W * H;
  return {
    W, H, N,
    elev: new Float32Array(N),   // 高程
    plate: new Int32Array(N),    // 板块 id
    vx: new Float32Array(N), vy: new Float32Array(N), // 板块速度
    temp: new Float32Array(N),
    precip: new Float32Array(N),
    flow: new Float32Array(N),   // 流向 (D8)
    acc: new Float32Array(N),    // 汇流累积
  };
}
function idx(g, x, y) { x = ((x % g.W) + g.W) % g.W; return y * g.W + x; } // x 方向环绕 (球面近似)

// ---- 1. 地形噪声生成 (一次性) ----
function genTerrain(g, seed) {
  const fbm = makeValueNoise(seed);
  const W = g.W, H = g.H;
  const t0 = performance.now();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 用经纬度采样, 在 x 方向环绕避免接缝 (简化: 直接采样, 真实方案用 3D 噪声)
      const nx = (x / W) * 8, ny = (y / H) * 4;
      g.elev[y * W + x] = fbm(nx, ny, 6, 2.0, 0.5);
    }
  }
  return performance.now() - t0;
}

// ---- 2. 板块分配 (K 个种子点 flood fill) ----
function assignPlates(g, seed, K) {
  const W = g.W, H = g.H, N = g.N;
  const rnd = mulberry32(seed + 7);
  const t0 = performance.now();
  // 种子点
  const sx = new Int32Array(K), sy = new Int32Array(K);
  for (let i = 0; i < K; i++) { sx[i] = Math.floor(rnd() * W); sy[i] = Math.floor(rnd() * H); }
  // 多源 BFS
  const plate = g.plate;
  plate.fill(-1);
  const qx = new Int32Array(N), qy = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < K; i++) { const id = sy[i] * W + sx[i]; plate[id] = i; qx[tail] = sx[i]; qy[tail] = sy[i]; tail++; }
  while (head < tail) {
    const x = qx[head], y = qy[head]; head++;
    const base = y * W + x;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = ((x + dx) % W + W) % W, ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        const nid = ny * W + nx;
        if (plate[nid] === -1) { plate[nid] = plate[base]; qx[tail] = nx; qy[tail] = ny; tail++; }
      }
    }
  }
  // 随机板块速度
  for (let i = 0; i < K; i++) { g.vx[sy[i] * W + sx[i]] = (rnd() - 0.5) * 2; g.vy[sy[i] * W + sx[i]] = (rnd() - 0.5) * 2; }
  // 把种子点速度扩散到全板块
  const pvx = new Float32Array(K), pvy = new Float32Array(K);
  for (let i = 0; i < K; i++) { pvx[i] = (rnd() - 0.5) * 2; pvy[i] = (rnd() - 0.5) * 2; }
  for (let i = 0; i < N; i++) { const p = plate[i]; g.vx[i] = pvx[p]; g.vy[i] = pvy[p]; }
  return performance.now() - t0;
}

// ---- 3. 板块构造单步 (碰撞造山/张裂) ----
function tectonicStep(g, intensity) {
  const W = g.W, H = g.H, N = g.N;
  const t0 = performance.now();
  const elev = g.elev, plate = g.plate, vx = g.vx, vy = g.vy;
  const delta = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const id = y * W + x;
      const p = plate[id];
      let stress = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = ((x + dx) % W + W) % W, ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          const nid = ny * W + nx;
          if (plate[nid] !== p) {
            // 相对速度: 会聚为正
            const rvx = vx[id] - vx[nid], rvy = vy[id] - vy[nid];
            // 边界方向 (dx,dy)
            const dot = rvx * dx + rvy * dy;
            stress += dot;
          }
        }
      }
      delta[id] = stress * intensity * 0.05;
    }
  }
  for (let i = 0; i < N; i++) elev[i] += delta[i];
  return performance.now() - t0;
}

// ---- 4. 气候单步 (温度=纬度+高程+海陆; 降水=风+地形+海洋邻近) ----
function climateStep(g, sunDist) {
  const W = g.W, H = g.H, N = g.N;
  const t0 = performance.now();
  const elev = g.elev, temp = g.temp, precip = g.precip;
  const sunFactor = 1 / (sunDist * sunDist); // 简化日照
  for (let y = 0; y < H; y++) {
    const lat = (y / (H - 1)) * Math.PI - Math.PI / 2; // -pi/2..pi/2
    const baseT = Math.cos(lat) * 40 * sunFactor - 30; // 极地冷, 赤道热
    for (let x = 0; x < W; x++) {
      const id = y * W + x;
      const h = elev[id];
      const lapse = Math.max(0, h) * 0.0065 * 1000 * 0.01; // 简化递减率
      temp[id] = baseT - lapse - (h < 0 ? -h * 0 : 0);
    }
  }
  // 降水: 信风简化 — 西风带/信风方向 + 地形抬升 + 海洋邻近
  const windDir = new Float32Array(H); // 每纬度的纬向风
  for (let y = 0; y < H; y++) {
    const lat = (y / (H - 1)) * Math.PI - Math.PI / 2;
    windDir[y] = Math.sign(Math.sin(lat)) * Math.cos(lat); // 简化三圈环流
  }
  for (let y = 0; y < H; y++) {
    const dir = windDir[y];
    let moisture = 0;
    const order = dir >= 0 ? [...Array(W).keys()] : [...Array(W).keys()].reverse();
    for (let xi = 0; xi < W; xi++) {
      const x = order[xi];
      const id = y * W + x;
      const h = elev[id];
      if (h < 0) { moisture += 5; } // 海洋补水
      else { moisture -= Math.max(0, h) * 2; } // 地形拦截
      moisture = Math.max(0, moisture);
      precip[id] = moisture;
    }
  }
  return performance.now() - t0;
}

// ---- 5. 水文: D8 流向 + 汇流累积 ----
function hydrologyStep(g) {
  const W = g.W, H = g.H, N = g.N;
  const t0 = performance.now();
  const elev = g.elev, flow = g.flow, acc = g.acc;
  acc.fill(1);
  // 流向: 找最低邻居
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const id = y * W + x;
      let best = id, bestH = elev[id];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = ((x + dx) % W + W) % W, ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          const nid = ny * W + nx;
          if (elev[nid] < bestH) { bestH = elev[nid]; best = nid; }
        }
      }
      flow[id] = best;
    }
  }
  // 汇流累积: 按高程从高到低处理 (简化拓扑序)
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  order.sort((a, b) => elev[b] - elev[a]); // 高->低
  for (let i = 0; i < N; i++) {
    const id = order[i];
    const to = flow[id];
    if (to !== id) acc[to] += acc[id];
  }
  return performance.now() - t0;
}

// ---- 运行基准 ----
function bench(label, W, H) {
  const g = makeGrid(W, H);
  const K = Math.max(8, Math.floor(Math.sqrt(N2(W, H)) / 4));
  const seed = 12345;
  const tTerrain = genTerrain(g, seed);
  const tPlates = assignPlates(g, seed, K);
  const tTect = tectonicStep(g, 1.0);
  const tClim = climateStep(g, 1.0);
  const tHydro = hydrologyStep(g);
  // 模拟 1000 年 (假设 1 步 = 100 年 => 10 步) 各算子累计
  const steps = 10;
  const totalSim = (tTect + tClim + tHydro) * steps;
  console.log(`${label.padEnd(14)} N=${(W * H).toString().padStart(7)} 板块=${K}`);
  console.log(`  地形生成: ${tTerrain.toFixed(1)}ms  板块分配: ${tPlates.toFixed(1)}ms`);
  console.log(`  构造/步: ${tTect.toFixed(2)}ms  气候/步: ${tClim.toFixed(2)}ms  水文/步: ${tHydro.toFixed(2)}ms`);
  console.log(`  10步演化(≈1ka): ${totalSim.toFixed(0)}ms   单步总计: ${(tTect + tClim + tHydro).toFixed(1)}ms`);
  return { tTerrain, tPlates, tTect, tClim, tHydro, totalSim };
}
function N2(w, h) { return w * h; }

console.log("=== 可行性基准 (V8, 单线程) ===\n");
bench("小 256x128", 256, 128);
bench("中 512x256", 512, 256);
bench("大 1024x512", 1024, 512);
console.log("\n注: 60fps 帧预算≈16ms, 30fps≈33ms. 浏览器 Canvas 绘制 131k 像素约 <2ms (putImageData).");
