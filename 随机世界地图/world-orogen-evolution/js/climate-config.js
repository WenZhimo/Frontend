// 气候模拟可调参数。
// 沿用 terrain-config.js 的模式，但导出为可变对象，以便
// 自动调参套件（tuning/climate/）能在同一进程内扫描参数。
// 浏览器应用始终使用下方默认值运行。
//
// 这些值会在计算函数运行时读取（不要在模块作用域解构），
// 因此 setClimateParams() 会在下一次计算时生效。
//
// 命名：WIND_*（wind.js）、TEMP_*（temperature.js）、PRECIP_*（precipitation.js）、
// HEUR_*（heuristic-precip.js）。有意义的单位会写在名称中。

export const CLIMATE_DEFAULTS = Object.freeze({
    // ── 风场：ITCZ 追踪 ──
    WIND_ITCZ_LAND_BOOST_MAX: 0.5817,        // 相对太阳辐射分的最大陆地热力增强
    WIND_ITCZ_ANCHOR_FACTOR: 0.3285,         // 冬半球陆地锚定强度
    WIND_ITCZ_CLAMP_DEG: 20.2698,              // ITCZ 纬度摆动硬限制

    // ── 风场：气压带 ──
    WIND_ITCZ_LOW_DEPTH_HPA: 8.3369,          // 赤道（ITCZ）低压深度
    WIND_ITCZ_LOW_WIDTH_DEG: 8.8036,           // ITCZ 低压高斯 sigma
    WIND_SUBTROP_HIGH_LAT_DEG: 31.268,        // 副热带高压基础纬度
    WIND_SUBTROP_SEASONAL_SHIFT_DEG: 8.0069,   // 副热带高压季节迁移
    WIND_SUBTROP_HIGH_STRENGTH_HPA: 11.891,   // 副热带高压峰值强度
    WIND_SUBTROP_HIGH_WIDTH_DEG: 13.652,      // 副热带高压高斯 sigma
    WIND_SUBTROP_LAND_WEAKENING: 0.3431,     // 大陆陆地上的比例削弱
    WIND_SUBPOLAR_LOW_DEPTH_HPA: 12.1468,      // 副极地低压深度
    WIND_SUBPOLAR_LOW_LAT_DEG: 54.5814,        // 副极地低压纬度
    WIND_SUBPOLAR_LOW_WIDTH_DEG: 5.217,      // 副极地低压高斯 sigma
    WIND_POLAR_HIGH_STRENGTH_HPA: 3.6409,      // 极地高压强度

    // ── 风场：海陆热力差异 ──
    WIND_SUMMER_THERMAL_LOW_HPA: 15.4478,      // 炎热内陆上的夏季热低压（季风驱动）
    WIND_WINTER_THERMAL_HIGH_HPA: 17.6062,     // 寒冷大陆上的冬季热高压（西伯利亚高压）
    WIND_CONT_RANGE_KM: 2476.1541,             // 大陆性达到饱和的离岸距离

    // ── 风场：科里奥利 / 摩擦 ──
    WIND_GEOSTROPHIC_MAX_ANGLE_DEG: 68.4344,   // 相对气压梯度力方向的最大地转偏转
    WIND_FRICTION_BACK_ANGLE_DEG: 19.8948,     // 地表摩擦使风向回转到低压方向的角度

    // ── 温度：基础曲线 ──
    TEMP_PEAK_C: 27.7866,                      // 热赤道平台处的海平面温度
    TEMP_POLEWARD_RANGE_C: 48.0373,            // 从热带平台边缘到极地的总降温
    TEMP_POLEWARD_EXP: 1.593,               // 相对归一化 ITCZ 距离的降温曲线指数
    TEMP_TROPICAL_PLATEAU_DEG: 12.3597,        // 温度保持峰值的 ITCZ 周边角距

    // ── 温度：递减率 ──
    TEMP_MOIST_LAPSE_C_PER_KM: 3.5,       // 充分湿润时的递减率
    TEMP_DRY_LAPSE_EXTRA_C_PER_KM: 3.4114,   // 完全干燥时增加的递减率（干 = 湿 + 额外）

    // ── 温度：洋流热量 ──
    TEMP_OCEAN_WARMTH_DIFFUSE_KM: 443.6723,   // 海洋热量向陆地扩散的物理距离
    TEMP_SST_CURRENT_SHIFT_C: 8.8086,         // 暖/寒流导致的最大海表温度偏移
    TEMP_COASTAL_WARMTH_SHIFT_C: 17.9628,      // 扩散热量导致的最大沿海陆地温度偏移

    // ── 温度：季节振幅 ──
    TEMP_SWING_SCALE: 1.0723,                // SWING_TABLE 振幅的全局乘数
    TEMP_EXTRA_SWING_FACTOR: 0.8005,         // 应用（表格值 − ITCZ 推导值）振幅的比例
    TEMP_SWING_WINTER_SHARE: 0.7055,         // 额外振幅中由冬季承担的比例（0.5 = 对称）
    TEMP_CONT_WINTER_COOL_C: 12.6435,             // 每单位大陆性带来的本地冬季额外降温 °C（0 = 关闭）
    TEMP_WINTER_COOL_WEST_RELIEF: 0.6,        // 海洋性西海岸冬季降温削弱比例（0 = 关闭）
    TEMP_OCEANIC_WARMING_MAX_C: 2,        // 海洋性中高纬陆地的全年最大增温

    // ── 温度：云量调节 ──
    TEMP_CLOUD_MOD_STRENGTH: 0.05,        // 全云量下向 0 拉回的最大强度
    TEMP_CLEARSKY_AMP_STRENGTH: 0.2745,     // 晴空下极端温度的最大放大

    // ── 降水：水汽与平流 ──
    PRECIP_OCEAN_MOISTURE_BASE: 0.4508,      // 海洋单元基础水汽
    PRECIP_ADVECT_FLAT_SURVIVAL: 0.8901,    // 平坦陆地上完整平流后保留的水汽
    PRECIP_ADVECT_REACH_KM: 3961.314,         // 水汽平流物理距离
    PRECIP_ELEV_DEPLETION_PER_KM: 0.9906,   // 每公里地形抬升导致的水汽耗损

    // ── 降水：ITCZ 与辐合 ──
    PRECIP_ITCZ_WIDTH_DEG: 17.6788,            // ITCZ 抬升带半宽
    PRECIP_ITCZ_CORE_BOOST: 1,          // 核心对流乘数
    PRECIP_ITCZ_ADDITIVE: 0.4727,            // 不依赖平流水汽的附加对流雨
    PRECIP_CONV_MULT_BOOST: 0.9443,          // 完全锋面辐合时的乘法增强
    PRECIP_CONV_ADD_FRAC: 0.3532,            // 完全辐合时的附加增强比例

    // ── 降水：洋流沿岸调制 ──
    PRECIP_COLD_CURRENT_SUPPRESS: 0.3606,      // 寒流沿岸降水抑制强度（0 = 关闭）
    PRECIP_WARM_CURRENT_BOOST: 0.0267,         // 暖流沿岸降水增强强度（0 = 关闭）

    // ── 降水：地形雨与雨影 ──
    PRECIP_ORO_UPLIFT_ADD: 1.013,           // 迎风坡最大附加降水
    PRECIP_ORO_SHADOW_MAX_SUPPRESS: 0.9186, // 本地焚风最大抑制
    PRECIP_RS_SHADOW_PROP_KM: 3363.1799,       // 下风向雨影传播距离
    PRECIP_RS_APPLY_STRENGTH_SCALE: 2.4002, // 传播雨影到抑制量的乘数
    PRECIP_RS_APPLY_MAX_SUPPRESS: 0.9782,   // 传播雨影内最大抑制
    PRECIP_RS_APPLY_WINDWARD_ADD: 1.7675,    // 传播场带来的迎风坡附加增强

    // ── 降水：副热带高压 / 地中海型 / 季风 ──
    PRECIP_SUBTROP_CENTER_SUMMER_DEG: 37.738, // 本地夏季抑制带中心
    PRECIP_SUBTROP_CENTER_WINTER_DEG: 24.5392, // 本地冬季抑制带中心
    PRECIP_SUBTROP_WIDTH_SUMMER_DEG: 8,  // 本地夏季抑制半宽
    PRECIP_SUBTROP_WIDTH_WINTER_DEG: 15.8227,  // 本地冬季抑制半宽
    PRECIP_SUBTROP_PEAK_SUMMER: 0.4777,     // 夏季抑制峰值（地中海型干夏）
    PRECIP_SUBTROP_PEAK_WINTER: 0.5,     // 冬季抑制峰值
    PRECIP_MONSOON_RELIEF_MAX: 0.8247,       // 季风海岸上副热带干化的最大削弱
    PRECIP_MONSOON_ADD: 0.0325,                    // 夏季季风水汽注入强度（0 = 关闭）
    PRECIP_SUBTROP_EAST_RELIEF: 0.5,           // 东海岸上副热带干化的削弱比例（0 = 关闭）
    PRECIP_MONSOON_REACH_DEG: 25.19,            // 季风到达夏季 ITCZ 向极侧的角距

    // ── 降水：极地 / 大陆性 / 截断 ──
    PRECIP_POLAR_BASE_ADD: 0.25,          // 极锋基础降水
    PRECIP_POLAR_COASTAL_ADD: 0.203,       // 沿海极锋增强
    PRECIP_CONT_DRYNESS: 0.8,            // 最大大陆性干化（复杂模型）
    PRECIP_COAST_CUTOFF_START_KM: 2060.0355,   // 强制水汽截断开始距离
    PRECIP_COAST_CUTOFF_END_KM: 3161.3364,     // 近乎完全失水的距离

    // ── 降水：混合与内陆上限 ──
    PRECIP_MODEL_BLEND: 0.3433,              // 复杂模型权重（启发式权重为 1 − w）
    PRECIP_CONT_CAP_FADE_START: 0.6231,      // 内陆降水上限开始淡入的大陆性
    PRECIP_CONT_CAP_MAX_REDUCTION: 0.884,  // 大陆性为 1 时的内陆上限削减
    PRECIP_SEASON_CONTRAST: 1.7754,          // 干湿季对比夸张系数（1 = 关闭；不会压缩）

    // ── 启发式纬向降水曲线 ──
    HEUR_ZONAL_TRADE_VALUE: 0.363,         // 进入信风/沙漠带时的降水水平
    HEUR_ZONAL_DESERT_MIN: 0.0715,          // 沙漠带最低降水
    HEUR_ZONAL_DESERT_END_DEG: 22,        // 达到沙漠最低值的 ITCZ 距离
    HEUR_ZONAL_DRY_POLEWARD_DEG: 28,      // 沙漠带向极侧边缘（恢复开始）
    HEUR_ZONAL_WESTERLY_PEAK: 0.516,        // 中纬西风带降水峰值
    HEUR_ZONAL_WESTERLY_PEAK_DEG: 47.515,     // 西风峰值的 ITCZ 距离
    HEUR_ZONAL_POLAR_MIN: 0.1381,            // 90° 极地沙漠降水

    // ── 柯本分类代理参数 ──
    // 分类器会用两季数据近似月度柯本判据；
    // 这些映射启发式可调（18°C 热带阈值等标准阈值
    // 或 B 类干旱公式不可调，保持固定）。
    KOPPEN_PRECIP_SCALE_MM: 838.5683,         // 归一化降水 1.0 → 每半年毫米数（季节/子类型测试）
    KOPPEN_ARIDITY_SCALE: 1.0079,           // 仅用于 B 类干旱测试的年降水乘数（>1 = 沙漠更少）
    KOPPEN_EAST_COAST_WET: 2,            // 东海岸额外干旱降水增强（0 = 关闭；避免湿润副热带落入 B 类）
    KOPPEN_SHOULDER_FRAC: 2.4,            // 肩季温度的“距峰值月数”代理
    KOPPEN_DRIEST_FRAC_BASE: 0.8,        // 最干月 ≈ 基础值 × 半年均值（两季相等时）
    KOPPEN_DRIEST_FRAC_DROP: 0.15,        // 强季节对比下该比例的削减
    KOPPEN_S_SUMMER_MAX_MM: 74.9679,           // 干夏（s）月降水上限
    KOPPEN_S_RATIO: 1.8019,                    // s 要求夏季月降水 < 冬季月降水 / 比例
    KOPPEN_W_RATIO: 3.5062,                    // w 要求冬季月降水 < 夏季月降水 / 比例
    KOPPEN_AF_DRY_MIN_MM: 74.7163,             // Af 要求最干月高于此值

    // ── 启发式修饰项 ──
    HEUR_ITCZ_SHIFT_DAMPEN: 0.2688,          // 使用的 ITCZ 位移比例（季风摆动）
    HEUR_SEASON_SUMMER_MOD: 1.1377,          // 夏季基础降水乘数
    HEUR_SEASON_WINTER_MOD: 0.8506,          // 冬季基础降水乘数
    HEUR_MED_SUPPRESS_BASE: 0.0699,         // 内陆夏季副热带抑制
    HEUR_MED_WESTCOAST_BONUS: 0.1403,       // 西海岸额外抑制（东海岸为负）
    HEUR_CONT_DRYNESS: 0.7586,              // 最大大陆性干化（启发式模型）
    HEUR_ORO_UPLIFT_MAX: 0.8841,             // 迎风坡地形雨最大增强
    HEUR_ORO_SHADOW_MAX: 0.8685,             // 背风坡地形雨最大抑制
});

// 实时值：由 setClimateParams() 修改，由气候模块读取。
export const CLIMATE = { ...CLIMATE_DEFAULTS };

/** 覆盖一部分气候参数（未知键会抛错）。 */
export function setClimateParams(overrides) {
    for (const [k, v] of Object.entries(overrides)) {
        if (!(k in CLIMATE_DEFAULTS)) throw new Error(`未知气候参数：${k}`);
        if (typeof v !== 'number' || !isFinite(v)) throw new Error(`${k} 的值无效：${v}`);
        CLIMATE[k] = v;
    }
}

/** 将所有气候参数恢复为默认值。 */
export function resetClimateParams() {
    Object.assign(CLIMATE, CLIMATE_DEFAULTS);
}
