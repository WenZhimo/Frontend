// ============================================================
// 因果链可行性原型：验证"地貌从物理涌现"而非"随机摆放"
// 场景：一条南北向山脉(如安第斯/内华达) + 三圈环流盛行风
// 预期：迎风坡多雨(森林)、背风坡雨影(沙漠)、副热带高压带干燥、赤道湿润
// 若这些沙漠/雨林出现在物理要求的位置，则"过程化=合理"成立
// ============================================================
"use strict";
const W = 80, H = 40;            // x: 西→东, y: 北(极)→南(极)
const elev = new Float32Array(W * H);
const temp  = new Float32Array(W * H);
const precip= new Float32Array(W * H);
const biome = new Int8Array(W * H);

const lat = y => (y / (H - 1)) * 180 - 90;   // -90..90

// --- 1. 地形：山脉 + 海洋 ---
function makeTerrain() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const id = y * W + x;
    let e = -1;                                  // 默认海洋
    if (x >= 6 && x <= 78) {                     // 主大陆
      e = 0.05;
      // 山脉脊在 x≈32，宽约4格，高随纬度略变(更真实)
      const ridge = 32;
      const d = Math.abs(x - ridge);
      if (d < 5) e = 1 - d / 5;                  // 0..1 (归一化高程)
      // 北部一条小山脉 x≈55
      const d2 = Math.abs(x - 55);
      if (d2 < 3 && y < 20) e = Math.max(e, 0.7 - d2 / 3);
    }
    elev[id] = e;
  }
}

// --- 2. 温度：纬度日照 - 高程递减 ---
function makeTemp() {
  for (let y = 0; y < H; y++) {
    const baseT = 30 - Math.abs(lat(y)) * 0.55;  // 赤道30℃, 极地-20℃
    for (let x = 0; x < W; x++) {
      const id = y * W + x;
      const h = Math.max(0, elev[id]);
      temp[id] = baseT - h * 25;                  // 高山降温
    }
  }
}

// --- 3. 降水：三圈环流风向 + 地形抬升(雨影) ---
function makePrecip() {
  for (let y = 0; y < H; y++) {
    const la = lat(y);
    // 盛行风方向: 热带信风(东→西, dx=-1), 温带西风(西→东, dx=+1), 极地东风(东→西)
    const dx = (Math.abs(la) < 30) ? -1 : (Math.abs(la) < 60) ? +1 : -1;
    // 副热带高压下沉带(~±30°) 本身干燥系数
    const hadleyDry = Math.exp(-Math.pow((Math.abs(la) - 30) / 12, 2)); // 在30°最大
    const dryness = 0.3 + 0.7 * hadleyDry;        // 0.3..1.0, 越大越干
    let moist = 0;
    const order = [];
    for (let x = 0; x < W; x++) order.push(x);
    if (dx > 0) order.reverse();                  // 风从哪边来就先算哪边
    for (const x of order) {
      const id = y * W + x;
      const e = elev[id];
      if (e < 0) { moist += 10; continue; }       // 海洋补水
      // 地形抬升：高程越大降水越多(迎风坡)，且大量消耗水汽
      const orographic = e * 18;
      let p = moist * 0.25 * dryness + orographic;
      moist -= orographic;                         // 水汽被山"榨干"
      moist = Math.max(0, moist);
      precip[id] = p;
    }
  }
}

// --- 4. 生物群落(Whittaker式)：温+降水 → 群落 ---
// 0海洋 1冰原 2苔原 3泰加 4温带林 5草原 6沙漠 7灌木 8雨林 9热带季风林
function classify() {
  for (let i = 0; i < W * H; i++) {
    if (elev[i] < 0) { biome[i] = 0; continue; }
    const t = temp[i], p = precip[i];
    if (t < -10) { biome[i] = 1; continue; }      // 冰原
    if (t < 0)   { biome[i] = p > 30 ? 3 : 2; continue; } // 泰加/苔原
    if (t < 12)  { biome[i] = p > 50 ? 4 : 5; continue; } // 温带林/草原
    // 暖/热
    if (p < 15)      biome[i] = 6;                 // 沙漠
    else if (p < 40) biome[i] = 7;                 // 灌木/稀树草原
    else if (t > 22 && p > 80) biome[i] = 8;       // 雨林
    else if (t > 22) biome[i] = 9;                 // 热带季风/季雨林
    else             biome[i] = 4;                 // 温带林
  }
}

const BSYM = ["~", "#", "T", "F", "F", ".", "D", "s", "R", "r"];
const BNAME = {0:"海洋",1:"冰原",2:"苔原",3:"泰加林",4:"温带林",5:"草原",6:"沙漠",7:"灌木/稀树草原",8:"雨林",9:"热带季风林"};
const ESYM = e => e < 0 ? "~" : e < 0.2 ? "." : e < 0.5 ? "-" : e < 0.8 ? "^" : "M";

function pbar(v, max, len) {
  const n = Math.max(0, Math.min(len, Math.round(v / max * len)));
  return "█".repeat(n) + "░".repeat(len - n);
}

makeTerrain(); makeTemp(); makePrecip(); classify();

console.log("=== 因果链原型: 一条山脉(x≈32) + 三圈环流 ===");
console.log("图例: ~海洋 .低地 -丘陵 ^山 M高山 | 纬度: 上=北 下=南\n");
// 高程
console.log("【高程】");
for (let y = 0; y < H; y++) {
  let s = ""; for (let x = 0; x < W; x++) s += ESYM(elev[y*W+x]);
  console.log(s);
}
// 降水
console.log("\n【降水】(█越密越湿润)");
for (let y = 0; y < H; y++) {
  let s = ""; for (let x = 0; x < W; x++) { const p = precip[y*W+x]; s += p>60?"█":p>30?"▓":p>12?"▒":p>3?"░":" "; }
  console.log(s);
}
// 群落
console.log("\n【生物群落】 ~海洋 #冰 T苔 F林 .草原 D沙漠 s灌木 R雨林 r季风林");
for (let y = 0; y < H; y++) {
  let s = ""; for (let x = 0; x < W; x++) s += BSYM[biome[y*W+x]];
  console.log(s);
}

// --- 5. 定量验证：检查"沙漠"是否出现在物理要求的位置 ---
console.log("\n=== 定量检验: 沙漠(D)位置是否符合物理? ===\n");
// (A) 雨影：山脉(x=32)的背风侧(温带西风→东侧)应比迎风侧(西侧)干燥
let westWet=0, westN=0, eastDry=0, eastN=0;
for (let y = 0; y < H; y++) {
  const la = lat(y);
  if (Math.abs(la) < 30 || Math.abs(la) > 60) continue; // 只看温带西风带
  for (let x = 24; x < 32; x++) { westWet += precip[y*W+x]; westN++; }   // 迎风(西)坡
  for (let x = 33; x < 41; x++) { eastDry += precip[y*W+x]; eastN++; }   // 背风(东)坡
}
console.log(`(A) 雨影效应 [温带西风带, 山脉x=32]:`);
console.log(`    迎风坡(西侧24-31) 平均降水: ${(westWet/westN).toFixed(1)}  背风坡(东侧33-40): ${(eastDry/eastN).toFixed(1)}`);
console.log(`    → 背风侧${eastDry/eastN < westWet/westN ? "显著更干" : "未形成雨影!"} (雨影比 = ${(eastDry/eastN/(westWet/westN)).toFixed(2)})`);

// (B) 副热带高压带(~±30°) 应比赤道干燥
let eqWet=0, eqN=0, subDry=0, subN=0;
for (let y = 0; y < H; y++) {
  const la = lat(y);
  if (Math.abs(la) < 8) { for (let x=6;x<78;x++){ eqWet+=precip[y*W+x]; eqN++; } }
  if (Math.abs(la) > 24 && Math.abs(la) < 36) { for (let x=6;x<78;x++){ subDry+=precip[y*W+x]; subN++; } }
}
console.log(`\n(B) 纬度带 [哈德利下沉]:`);
console.log(`    赤道带(±8°) 平均降水: ${(eqWet/eqN).toFixed(1)}  副热带(24-36°): ${(subDry/subN).toFixed(1)}`);
console.log(`    → 副热带${subDry/subN < eqWet/eqN ? "如预期更干(沙漠带)" : "未干燥化!"}`);

// (C) 沙漠群落统计：落在哪些纬度/是否在雨影侧
const deserLat = [];
let desertInRainShadow = 0, desertTotal = 0;
for (let y = 0; y < H; y++) for (let x = 6; x < 78; x++) {
  if (biome[y*W+x] === 6) { desertTotal++; deserLat.push(Math.abs(lat(y)));
    if (x > 33 && x < 41 && Math.abs(lat(y))>30 && Math.abs(lat(y))<60) desertInRainShadow++; }
}
const latBuckets = [0,0,0,0]; // 0-15,15-30,30-45,45-60+
for (const a of deserLat) { latBuckets[a<15?0:a<30?1:a<45?2:3]++; }
console.log(`\n(C) 沙漠格分布 [共${desertTotal}格]:`);
console.log(`    按纬度: 赤道0-15°=${latBuckets[0]}  副热带15-30°=${latBuckets[1]}  温带30-45°=${latBuckets[2]}  高纬45°+=${latBuckets[3]}`);
console.log(`    其中 ${desertInRainShadow} 格落在山脉背风雨影区(温带东侧)`);
console.log(`    → ${latBuckets[1]+desertInRainShadow >= desertTotal*0.5 ? "PASS: 沙漠集中在副热带高压带与雨影区(物理合理)" : "FAIL: 沙漠分布随机"}`);
