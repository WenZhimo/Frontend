// 基于 “worldbuilding pasta” 分带方法的柯本气候分类。
// 使用两季（夏/冬）数据作为
// warmest/coldest month values.
//
// Approach:
//   步骤 1：温度带（热带 → 温带 → 大陆性 → 苔原 → 冰盖）
//   步骤 2：干旱区（B）：两季皆干 → 沙漠核心 + 草原边缘
//   步骤 3：各温度带内的降水子型（A / C / D 细节）
//
// 重要：模拟中的 “summer” 和 “winter” 标签以北半球为中心，
// （北半球夏季 = 6–8 月，北半球冬季 = 12–2 月）。每个单元都会判断
// 本地暖季/冷季，并据此分配
// correct precipitation pattern (s/w/f).  Without this, Mediterranean (Cs)
// and monsoon (Cw/Dw) climates are hemisphere-flipped.

import { CLIMATE } from './climate-config.js';
import { smoothstep } from './wind.js';

/**
 * Köppen class definitions: ID → { code, name, color [r,g,b] 0-1 }.
 */
export const KOPPEN_CLASSES = [
    { code: 'Ocean',  name: '海洋',                              color: [0.29, 0.44, 0.65] },  // #4a6fa5
    { code: 'Af',     name: '热带雨林',                color: [0.00, 0.00, 1.00] },  // #0000FF
    { code: 'Am',     name: '热带季风',                   color: [0.00, 0.47, 1.00] },  // #0077FF
    { code: 'Aw',     name: '热带稀树草原',                   color: [0.27, 0.67, 0.98] },  // #46AAFA
    { code: 'BWh',    name: '热带沙漠',                         color: [1.00, 0.00, 0.00] },  // #FF0000
    { code: 'BWk',    name: '寒带沙漠',                        color: [1.00, 0.59, 0.59] },  // #FF9696
    { code: 'BSh',    name: '热带草原',                         color: [0.96, 0.65, 0.00] },  // #F5A500
    { code: 'BSk',    name: '寒带草原',                        color: [1.00, 0.86, 0.39] },  // #FFDB63
    { code: 'Cfa',    name: '湿润亚热带',                  color: [0.78, 1.00, 0.31] },  // #C8FF50
    { code: 'Cfb',    name: '海洋性气候',                            color: [0.39, 1.00, 0.31] },  // #64FF50
    { code: 'Cfc',    name: '副极地海洋性',                   color: [0.20, 0.78, 0.00] },  // #32C800
    { code: 'Csa',    name: '炎夏地中海',           color: [1.00, 1.00, 0.00] },  // #FFFF00
    { code: 'Csb',    name: '暖夏地中海',          color: [0.78, 0.78, 0.00] },  // #C8C800
    { code: 'Csc',    name: '冷夏地中海',          color: [0.59, 0.59, 0.00] },  // #969600
    { code: 'Cwa',    name: '季风湿润亚热带',         color: [0.59, 1.00, 0.59] },  // #96FF96
    { code: 'Cwb',    name: '亚热带高原',               color: [0.39, 0.78, 0.39] },  // #63C764
    { code: 'Cwc',    name: '寒冷亚热带高原',          color: [0.20, 0.59, 0.20] },  // #329633
    { code: 'Dfa',    name: '炎夏大陆性',             color: [0.00, 1.00, 1.00] },  // #00FFFF
    { code: 'Dfb',    name: '暖夏大陆性',            color: [0.22, 0.78, 1.00] },  // #37C8FF
    { code: 'Dfc',    name: '亚寒带',                          color: [0.00, 0.49, 0.49] },  // #007D7D
    { code: 'Dfd',    name: '极寒亚寒带',           color: [0.00, 0.27, 0.37] },  // #00465F
    { code: 'Dsa',    name: '夏干炎夏大陆性', color: [0.90, 0.50, 1.00] },  // #E680FF
    { code: 'Dsb',    name: '夏干暖夏大陆性', color: [0.70, 0.35, 0.85] },  // #B359D9
    { code: 'Dsc',    name: '夏干亚寒带',              color: [0.50, 0.20, 0.65] },  // #8033A6
    { code: 'Dsd',    name: '夏干极寒亚寒带', color: [0.35, 0.10, 0.45] },  // #591A73
    { code: 'Dwa',    name: '季风炎夏大陆性',    color: [0.67, 0.69, 1.00] },  // #ABB1FF
    { code: 'Dwb',    name: '季风暖夏大陆性',   color: [0.43, 0.47, 0.78] },  // #6E77C8
    { code: 'Dwc',    name: '季风亚寒带',                color: [0.29, 0.31, 0.78] },  // #4A50C8
    { code: 'Dwd',    name: '季风极寒亚寒带', color: [0.20, 0.00, 0.53] },  // #320087
    { code: 'ET',     name: '苔原',                             color: [0.70, 0.70, 0.70] },  // #B2B2B2
    { code: 'EF',     name: '冰原',                            color: [0.41, 0.41, 0.41] },  // #686868
];

// Lookup table: KOPPEN_CLASSES code → ID (built once at import time)
const CODE_TO_ID = {};
KOPPEN_CLASSES.forEach((c, i) => { CODE_TO_ID[c.code] = i; });

/**
 * Classify each region into a Köppen climate type using the worldbuilding-
 * pasta band-based methodology.
 *
 * @param {object}       mesh         - SphereMesh
 * @param {Float32Array}  r_elevation  - per-region elevation (<=0 = ocean)
 * @param {object}        tempResult   - { r_temperature_summer, r_temperature_winter } (0-1 → -45..+45 C)
 * @param {object}        precipResult - { r_precip_summer, r_precip_winter } (0-1 p95-normalized)
 * @returns {Uint8Array}  r_koppen     - per-region class ID (index into KOPPEN_CLASSES)
 */
export function classifyKoppen(mesh, r_elevation, tempResult, precipResult) {
    const n = mesh.numRegions;
    const r_koppen = new Uint8Array(n);

    const tSummer = tempResult.r_temperature_summer;
    const tWinter = tempResult.r_temperature_winter;
    const pSummer = precipResult.r_precip_summer;
    const pWinter = precipResult.r_precip_winter;
    const r_westness = precipResult.r_westness || null;  // +1 west, −1 east coast

    for (let r = 0; r < n; r++) {
        // ── Ocean ──
        if (r_elevation[r] <= 0) {
            r_koppen[r] = 0;
            continue;
        }

        // ── Convert normalised values to physical units ──
        // Ts/Tw are NH summer/winter proxies — NOT necessarily local warm/cold
        const Ts = -45 + Math.max(0, Math.min(1, tSummer[r])) * 90;
        const Tw = -45 + Math.max(0, Math.min(1, tWinter[r])) * 90;
        const Thot  = Math.max(Ts, Tw);   // warmest month proxy (°C)
        const Tcold = Math.min(Ts, Tw);    // coldest month proxy (°C)
        const Tann  = (Ts + Tw) / 2;

        // “过渡月”温度：近似估计峰值夏季前 2 个月的温度。
        // 由于只有两季数据，我们从峰值向冷季方向插值一段距离。
        // 1.5/6 的比例（旧值为 2/6）可避免极端
        // 大陆性冬季把过渡月温度拉得过低；现实中
        // 过渡月通常更接近夏季峰值，而不是年
        // 平均值，尤其当温度摆幅在时长上很不对称时。
        const Tshoulder = Thot - (Thot - Tcold) * (CLIMATE.KOPPEN_SHOULDER_FRAC / 6);

        // ── Hemisphere-aware local seasons ──
        // Determine which simulation season is this cell's LOCAL warm season.
        // NH cells: sim summer = local summer.  SH cells: sim winter = local summer.
        const localSummerIsSim = Ts >= Tw;

        // Precipitation: each season value ∈ [0,1] represents ~6 months.
        // 缩放为该半年的近似毫米降水量。
        const Ps = Math.max(0, pSummer[r]) * CLIMATE.KOPPEN_PRECIP_SCALE_MM;   // NH summer half-year mm
        const Pw = Math.max(0, pWinter[r]) * CLIMATE.KOPPEN_PRECIP_SCALE_MM;    // NH winter half-year mm
        const Pann = Ps + Pw;                          // annual mm

        // Local summer/winter precipitation (hemisphere-corrected)
        const PsummerLocal = localSummerIsSim ? Ps : Pw;
        const PwinterLocal = localSummerIsSim ? Pw : Ps;
        const PsMonthLocal = PsummerLocal / 6;   // avg monthly precip in local summer
        const PwMonthLocal = PwinterLocal / 6;    // avg monthly precip in local winter

        // 从 6 个月平均值估计最干单月。
        // 6 个月干季平均 40 mm 时，内部月份可能从
        // 10 mm 到 70 mm 不等。季节对比（湿半年 vs 干半年）越强，
        // 每个半年的内部分布越尖锐，因此最干
        // 月会明显低于半年平均值。
        // Factor: at equal seasons (ratio=1) → driest ≈ 0.7× average
        //         at strong monsoon (ratio=5+) → driest ≈ 0.35× average
        const seasonRatio = Math.max(PsMonthLocal, PwMonthLocal) / (Math.min(PsMonthLocal, PwMonthLocal) || 1);
        const driestFraction = CLIMATE.KOPPEN_DRIEST_FRAC_BASE
            - CLIMATE.KOPPEN_DRIEST_FRAC_DROP * smoothstep(1, 4, seasonRatio);
        const Pdry = Math.min(PsMonthLocal, PwMonthLocal) * driestFraction;

        // ================================================================
        //  STEP 1 – TEMPERATURE BANDS
        // ================================================================
        // Band codes: 'A' tropical, 'C' temperate, 'D' continental,
        //             'ET' tundra, 'EF' ice cap
        // 温带子带：hotSummer（>=22°C）与 coolSummer。
        // 大陆性子带：humidCont（Tshoulder>=10）与 subarctic。

        let band;
        let tempSubBand = '';    // C 类使用 hotSummer/coolSummer；D 类使用 humidCont/subarctic

        if (Thot < 0) {
            // Ice cap: warmest month < 0°C
            band = 'EF';
        } else if (Thot < 10) {
            // Tundra: warmest month 0-10°C
            band = 'ET';
        } else if (Tcold >= 18) {
            // Tropical: coldest month >= 18°C
            band = 'A';
        } else if (Tcold >= 0) {
            // Temperate: coldest month 0-18°C AND warmest >= 10°C
            band = 'C';
            tempSubBand = Thot >= 22 ? 'hotSummer' : 'coolSummer';
        } else {
            // Continental: coldest month < 0°C AND warmest >= 10°C
            band = 'D';
            tempSubBand = Tshoulder >= 10 ? 'humidCont' : 'subarctic';
        }

        // ── Short-circuit polar types ──
        if (band === 'EF') { r_koppen[r] = CODE_TO_ID['EF']; continue; }
        if (band === 'ET') { r_koppen[r] = CODE_TO_ID['ET']; continue; }

        // ================================================================
        //  STEP 2 – ARID ZONES (B)
        // ================================================================
        // 博文方法：两季皆干的区域默认成为沙漠，
        // 草原作为边缘过渡带。
        //
        // 使用标准柯本干旱阈值（其中编码了
        // idea of evapotranspiration exceeding precipitation) to decide B,
        // then split desert vs steppe.
        //
        // h/k is determined by mean annual temperature (standard Köppen):
        //   Tann >= 18°C → hot (h)
        //   Tann <  18°C → cold (k)
        //
        // summerFrac uses LOCAL warm-season precipitation (hemisphere-corrected)
        // 因为阈值编码了蒸散，其峰值出现在
        // 暖季，与半球无关。

        let Pthresh;
        const summerFrac = Pann > 0 ? PsummerLocal / Pann : 0.5;
        if (summerFrac >= 0.7) {
            Pthresh = 20 * Tann + 280;
        } else if (summerFrac <= 0.3) {
            Pthresh = 20 * Tann;
        } else {
            Pthresh = 20 * Tann + 140;
        }
        Pthresh = Math.max(0, Pthresh);

        // 干旱判据使用解耦的降水尺度：单一 KOPPEN_PRECIP_SCALE_MM
        // 同时服务干旱阈值、夏/冬月度比例，以及
        // Af/Am cutoffs at once, which over-constrains it. KOPPEN_ARIDITY_SCALE
        // （默认 1）允许独立校准沙漠范围，而不影响
        // seasonal-subtype thresholds. >1 → wetter aridity test → fewer deserts.
        //
        // East-coast aridity discount: humid-subtropical east coasts (S. China,
        // 佛罗里达、美国东南部）真实有降雨，但略低于阈值，因此
        // they misclassify as steppe/desert. Boosting their EFFECTIVE aridity
        // precip by KOPPEN_EAST_COAST_WET rescues them WITHOUT wetting true west-
        // coast/interior deserts (Sahara), which read eastness ≈ 0. Default 0.
        const eastness = r_westness ? Math.max(0, -r_westness[r]) : 0;
        const PannArid = Pann * CLIMATE.KOPPEN_ARIDITY_SCALE * (1 + eastness * CLIMATE.KOPPEN_EAST_COAST_WET);
        if (PannArid < Pthresh) {
            const isHot = Tann >= 18;  // standard Köppen: h if mean annual temp >= 18°C
            if (PannArid < Pthresh * 0.5) {
                // Desert
                r_koppen[r] = isHot ? CODE_TO_ID['BWh'] : CODE_TO_ID['BWk'];
            } else {
                // Steppe (transition fringe)
                r_koppen[r] = isHot ? CODE_TO_ID['BSh'] : CODE_TO_ID['BSk'];
            }
            continue;
        }

        // ================================================================
        //  STEP 3 – PRECIPITATION SUBTYPES WITHIN EACH BAND
        // ================================================================

        // ── Determine s / w / f precipitation pattern ──
        // 所有比较都使用本地夏/冬季，因此南北半球格局都正确。
        // in both hemispheres.
        // Our "monthly" values are 6-month averages, not individual months —
        // 这会平滑最干/月最湿月对比，因此阈值
        // relaxed vs. standard Köppen (which uses actual monthly extremes).
        // s  = dry local summer:  summer month < 50mm AND < 1/2 winter month
        // w  = dry local winter:  winter month < 1/4 summer month
        //      （由标准 1/10 放宽，因为 6 个月平均会压缩对比）
        // f  = no dry season
        let precipPattern;
        const localSummerDrier = PsummerLocal < PwinterLocal;
        if (localSummerDrier && PsMonthLocal < CLIMATE.KOPPEN_S_SUMMER_MAX_MM
            && PsMonthLocal < PwMonthLocal / CLIMATE.KOPPEN_S_RATIO) {
            precipPattern = 's';
        } else if (!localSummerDrier && PwMonthLocal < PsMonthLocal / CLIMATE.KOPPEN_W_RATIO) {
            precipPattern = 'w';
        } else {
            precipPattern = 'f';
        }

        // ── Determine temperature sub-letter (a / b / c / d) ──
        // a: warmest month >= 22°C
        // b: warmest < 22°C but 4+ months >= 10°C  (proxy: Tshoulder >= 10°C)
        // c: fewer than 4 months >= 10°C, coldest >= −38°C
        // d：最冷月 < -38°C（极端大陆性，仅 D 类）。
        let tempLetter;
        if (Thot >= 22) {
            tempLetter = 'a';
        } else if (Tshoulder >= 10) {
            tempLetter = 'b';
        } else if (Tcold >= -38) {
            tempLetter = 'c';
        } else {
            tempLetter = 'd';
        }

        // ── Band A: Tropical ──
        if (band === 'A') {
            // Blog approach:
            //   very wet both seasons       → Af (tropical rainforest)
            //   wet both seasons             → Am (tropical monsoon)
            //   wet one season, dry other    → Aw (tropical savanna)
            //
            // 按阈值转写如下：
            //   Af: driest month >= 60 mm
            //   Am: Pann >= 25*(100 - Pdry)  (i.e. enough total rain to sustain forest
            //       despite a short dry spell)
            //   Aw: everything else
            if (Pdry >= CLIMATE.KOPPEN_AF_DRY_MIN_MM) {
                r_koppen[r] = CODE_TO_ID['Af'];
            } else if (Pann >= 25 * (100 - Pdry)) {
                r_koppen[r] = CODE_TO_ID['Am'];
            } else {
                r_koppen[r] = CODE_TO_ID['Aw'];
            }
            continue;
        }

        // ── Band C: Temperate ──
        if (band === 'C') {
            // Blog approach:
            //   dry local summer → Mediterranean (Cs)
            //   remaining hot-summer → humid subtropical (Cfa / Cwa)
            //   remaining cool-summer → oceanic (Cfb / Cwb / Cfc / Cwc)
            const code = 'C' + precipPattern + tempLetter;
            const id = CODE_TO_ID[code];
            if (id !== undefined) {
                r_koppen[r] = id;
            } else {
                r_koppen[r] = CODE_TO_ID['Cfb'];
            }
            continue;
        }

        // ── Band D: Continental ──
        if (band === 'D') {
            // Blog approach:
            //   humid continental (Tshoulder >= 10°C) = Dfa/Dfb/Dsa/Dsb/Dwa/Dwb
            //   subarctic (Tshoulder < 10°C) = Dfc/Dfd/Dsc/Dsd/Dwc/Dwd
            //
            // Ds zones appear near Mediterranean regions; Dw zones appear
            // 靠近强季风效应区域（ITCZ 偏移较远）。
            const code = 'D' + precipPattern + tempLetter;
            const id = CODE_TO_ID[code];
            if (id !== undefined) {
                r_koppen[r] = id;
            } else {
                const fallback = 'Df' + tempLetter;
                r_koppen[r] = CODE_TO_ID[fallback] || CODE_TO_ID['Dfc'];
            }
            continue;
        }
    }

    return r_koppen;
}
