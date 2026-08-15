// 高程 → RGB 颜色映射。

// 将原始网格高程（非线性，陆地约为 0–1）转换为物理高度。
// 单位为千米。混合 S 曲线：四次起段生成广阔平地，
// 在 t≈0.75 附近最陡，顶部导数趋零以压缩峰值。
// 海洋（elev < 0）使用线性尺度映射（-0.5 约为 -5 km）。
export function elevToHeightKm(elev) {
    if (elev <= 0) return elev * 10;  // 海洋：-0.5 → -5 km
    const t = Math.min(elev, 1);
    const t2 = t * t;
    return 6 * t2 * t2 * (5 - 4 * t);  // 0→0, 0.25→0.09, 0.5→1.13, 0.75→3.80, 1.0→6
}

// 按柯本气候 ID 索引的生物群系基础色（卫星视图调色板）。
// 0=海洋另行处理，1–30=陆地生物群系。
const BIOME_COLORS = [
    null,                        //  0 海洋——单独处理
    [0.05, 0.30, 0.05],         //  1 Af   热带雨林——深翠绿
    [0.08, 0.33, 0.07],         //  2 Am   热带季风——浓绿
    [0.42, 0.50, 0.18],         //  3 Aw   热带稀树草原——黄绿
    [0.82, 0.72, 0.50],         //  4 BWh  热沙漠——沙色
    [0.60, 0.55, 0.48],         //  5 BWk  冷沙漠——灰褐
    [0.72, 0.62, 0.30],         //  6 BSh  热草原——干金色
    [0.55, 0.52, 0.32],         //  7 BSk  冷草原——柔和橄榄褐
    [0.18, 0.42, 0.12],         //  8 Cfa  湿润亚热带——中绿
    [0.12, 0.38, 0.10],         //  9 Cfb  海洋性——浓绿
    [0.10, 0.28, 0.10],         // 10 Cfc  副极地海洋性——暗柔绿
    [0.45, 0.48, 0.22],         // 11 Csa  夏热地中海型——卡其绿
    [0.40, 0.45, 0.20],         // 12 Csb  夏暖地中海型——灌丛色
    [0.35, 0.40, 0.20],         // 13 Csc  夏冷地中海型——深卡其
    [0.20, 0.44, 0.14],         // 14 Cwa  湿润亚热带季风——中绿
    [0.15, 0.40, 0.12],         // 15 Cwb  亚热带高地——绿色
    [0.12, 0.32, 0.10],         // 16 Cwc  冷亚热带高地——深绿
    [0.12, 0.36, 0.08],         // 17 Dfa  夏热大陆性——森林绿
    [0.10, 0.32, 0.08],         // 18 Dfb  夏暖大陆性——森林绿
    [0.06, 0.22, 0.08],         // 19 Dfc  亚寒带——深云杉绿
    [0.05, 0.18, 0.07],         // 20 Dfd  极寒亚寒带——极暗色
    [0.38, 0.38, 0.18],         // 21 Dsa  夏热大陆性干夏——橄榄褐
    [0.35, 0.35, 0.17],         // 22 Dsb  夏暖大陆性干夏——橄榄褐
    [0.08, 0.22, 0.08],         // 23 Dsc  亚寒带干夏——深绿
    [0.06, 0.18, 0.07],         // 24 Dsd  极寒亚寒带干夏——极暗色
    [0.14, 0.36, 0.10],         // 25 Dwa  夏热大陆性季风——森林绿
    [0.12, 0.32, 0.09],         // 26 Dwb  夏暖大陆性季风
    [0.07, 0.22, 0.08],         // 27 Dwc  亚寒带季风——深云杉色
    [0.05, 0.18, 0.07],         // 28 Dwd  极寒亚寒带季风
    [0.35, 0.32, 0.22],         // 29 ET   苔原——土褐色（岩面稀疏苔藓/地衣）
    [0.78, 0.80, 0.84],         // 30 EF   冰盖——带蓝白色
];

// 用于高海拔混合的岩石/高山颜色。
const ROCK_COLOR = [0.42, 0.38, 0.32];

// 按柯本大类设置的海拔阈值（km）：
//   [高山线，雪线]
// 高山线：植被过渡为岩质高山地表。
// 雪线：永久积雪开始。
function altitudeThresholds(classId) {
    if (classId <= 0)  return [0, 0];           // 海洋
    if (classId <= 3)  return [3.5, 5.5];       // 热带（A）
    if (classId <= 7)  return [3.0, 5.0];       // 干旱（B）
    if (classId <= 16) return [2.0, 3.5];       // 温带（C）
    if (classId <= 18 || classId === 21 || classId === 22 ||
        classId === 25 || classId === 26) return [1.5, 3.0];  // 湿润大陆性（D*a、D*b）
    if (classId <= 28) return [0.8, 2.0];       // 亚寒带（D*c、D*d）
    if (classId === 29) return [0.4, 1.5];      // 苔原（ET）——高处多岩石，仅峰顶积雪
    return [0, 0.5];                             // 冰盖（EF）
}

// 卫星视图生物群系颜色：基于柯本类别生成写实陆地颜色，
// 并结合高程；海洋交给标准海洋调色板处理。
export function biomeColor(koppenId, elevation) {
    // 海洋
    if (koppenId === 0 || elevation <= 0) return elevationToColor(elevation);

    const base = BIOME_COLORS[koppenId] || [0.30, 0.50, 0.20];
    const hKm = elevToHeightKm(elevation);
    const [alpineLine, snowLine] = altitudeThresholds(koppenId);

    let r = base[0], g = base[1], b = base[2];

    // 低海拔轻微压暗以体现深度（0–200 m）。
    if (hKm < 0.2) {
        const dark = 0.93 + 0.07 * (hKm / 0.2);
        r *= dark; g *= dark; b *= dark;
    }

    // 中海拔：轻微压暗以表现地形起伏（200 m 到高山线）。
    if (alpineLine > 0 && hKm > 0.2 && hKm < alpineLine) {
        const t = (hKm - 0.2) / (alpineLine - 0.2);
        const darken = 1.0 - t * 0.15; // 在高山线最多压暗 15%。
        r *= darken; g *= darken; b *= darken;
    }

    // 高山带：树线/植被线以上向岩石棕灰色混合。
    if (alpineLine > 0 && hKm > alpineLine) {
        const rockZone = snowLine > alpineLine ? snowLine - alpineLine : 2.0;
        const rockT = Math.min(1, (hKm - alpineLine) / rockZone);
        const s = rockT * rockT; // 使用 ease-in 形成渐进过渡。
        r = r + (ROCK_COLOR[0] - r) * s;
        g = g + (ROCK_COLOR[1] - g) * s;
        b = b + (ROCK_COLOR[2] - b) * s;
    }

    // 雪线以上：向白色混合。
    if (snowLine > 0 && hKm > snowLine) {
        const snowT = Math.min(1, (hKm - snowLine) / 2.5);
        const s = snowT * snowT; // 使用 ease-in 形成渐进积雪。
        r = r + (0.92 - r) * s;
        g = g + (0.93 - g) * s;
        b = b + (0.96 - b) * s;
    }

    return [r, g, b];
}

export function elevationToColor(e) {
    if (e < -0.50) return [0.04, 0.06, 0.30];
    if (e < -0.10) { const t=(e+0.50)/0.40; return [0.04+t*0.07,0.06+t*0.14,0.30+t*0.18]; }
    if (e <  0.00) { const t=(e+0.10)/0.10; return [0.11+t*0.19,0.20+t*0.22,0.48+t*0.12]; }
    if (e <  0.002){ const t=e/0.002;         return [0.72+t*0.08,0.68-t*0.02,0.46-t*0.10]; }
    if (e <  0.25) { const t=(e-0.002)/0.248; return [0.20-t*0.06,0.54-t*0.12,0.12+t*0.08]; }
    if (e <  0.50) { const t=(e-0.25)/0.25;  return [0.14+t*0.30,0.42-t*0.14,0.20-t*0.06]; }
    if (e <  0.75) { const t=(e-0.50)/0.25;  return [0.44+t*0.16,0.28+t*0.12,0.14+t*0.18]; }
    { const t=Math.min(1,(e-0.75)/0.20);      return [0.60+t*0.35,0.40+t*0.50,0.32+t*0.60]; }
}
