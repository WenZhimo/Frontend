// Entry point 鈥?wires UI controls, animation loop, and kicks off initial generation.

import * as THREE from 'three';
import { renderer, scene, camera, ctrl, waterMesh, atmosMesh, starsMesh,
         mapCamera, updateMapCameraFrustum, mapCtrl, canvas,
         tickZoom, tickMapZoom } from './scene.js';
import { state } from './state.js';
import { generate, reapplyViaWorker, computeClimateViaWorker, editRecomputeViaWorker, refreshEnvironmentInputs, syncEvolutionTerrainViaWorker } from './generate.js';
import { encodePlanetCode, decodePlanetCode } from './planet-code.js';
import { computePlateColors, buildMesh, updateMeshColors, updateSuperPlateBorders, buildMapMesh, rebuildGrids, exportMap, exportMapBatch, buildWindArrows, buildOceanCurrentArrows, updateKoppenHoverHighlight, updateMapKoppenHoverHighlight, updatePendingHighlight, updateMapPendingHighlight } from './planet-mesh.js';
import { setupEditMode } from './edit-mode.js';
import { detailFromSlider, sliderFromDetail } from './detail-scale.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { elevationToColor } from './color-map.js';
import { advanceEvolutionState, ensureEvolutionState, formatEvolutionLabel } from './evolution/evolution-state.js';
import { snapshotCache } from './evolution/snapshot-cache.js';
import { applyGeologyTerrainInfluenceInPlace, evolveGeologyMemoryInPlace } from './evolution/geology-memory.js';
import { attachCivilizationDebugLayers, ensureCivilizationState, stepCivilizationInPlace } from './evolution/civilization.js';
import {
    buildHistorySummary,
    buildHistoryTimeline,
    createHistoryPoint,
    downloadHistorySummary,
    downloadHistoryTimeline,
    formatHistorySummaryMarkdown,
    formatHistoryTimelineMarkdown,
} from './evolution/history-export.js';

// Slider value displays + stale tracking
const sliderIds = ['sN','sP','sCn','sJ','sNs','sCsv','sLc'];
const PLATE_SLIDERS = ['sP', 'sCn', 'sCsv', 'sLc'];
let lastGenValues = {};

function snapshotSliders() {
    for (const id of sliderIds) lastGenValues[id] = document.getElementById(id).value;
}

function checkStale() {
    const btn = document.getElementById('generate');
    if (btn.classList.contains('generating')) return;
    const detailSliders = ['sN', 'sJ', 'sNs'];
    const plateChanged = PLATE_SLIDERS.some(id => document.getElementById(id).value !== lastGenValues[id]);
    const detailChanged = detailSliders.some(id => document.getElementById(id).value !== lastGenValues[id]);
    btn.classList.remove('stale', 'regen');
    if (plateChanged) {
        btn.classList.add('regen');
        btn.textContent = '重新生成';
    } else if (detailChanged) {
        btn.classList.add('stale');
        btn.textContent = '重建';
    } else {
        btn.textContent = '生成新世界';
    }
}

// Reapply smoothing + erosion without full rebuild (via worker)
function reapplyPostProcessing() {
    const d = state.curData;
    if (!d || !d.prePostElev) return;

    const skipClimate = shouldSkipClimate();
    reapplyViaWorker(() => {
        reapplyBtn.classList.remove('spinning');
        updatePlanetCode(false);
        // 如果气候已失效且当前查看气候图层，则切回地形。
        if (skipClimate && CLIMATE_LAYERS.has(state.debugLayer)) {
            state.debugLayer = '';
            if (debugLayerEl) debugLayerEl.value = '';
            syncTabsToLayer('');
            updateMeshColors();
            updateLegend('');
        }
    }, skipClimate);
}

const reapplyBtn = document.getElementById('reapplyBtn');

function markReapplyPending() {
    reapplyBtn.disabled = false;
    reapplyBtn.classList.add('ready');
}

function clearReapplyPending() {
    reapplyBtn.disabled = true;
    reapplyBtn.classList.remove('ready');
}

reapplyBtn.addEventListener('click', () => {
    if (reapplyBtn.disabled) return;
    clearReapplyPending();
    reapplyBtn.classList.add('spinning');
    reapplyPostProcessing();
});

// 自动气候阈值：高于阈值时默认跳过。
const AUTO_CLIMATE_THRESHOLD = 300000;

// 细节滑块警告更新（触控设备阈值更低）。
const WARN_ORANGE = state.isTouchDevice ? 200000 : 640000;
const WARN_RED    = state.isTouchDevice ? 500000 : 1280000;

function updateDetailWarning(detail) {
    const cg = document.getElementById('sN').closest('.cg');
    const warn = document.getElementById('detailWarn');
    cg.classList.remove('detail-orange', 'detail-red');
    warn.className = 'detail-warn';
    if (detail > WARN_RED) {
        cg.classList.add('detail-red');
        warn.classList.add('red');
        warn.textContent = '\u26A0 细节极高，生成可能较慢且不稳定';
    } else if (detail > WARN_ORANGE) {
        cg.classList.add('detail-orange');
        warn.classList.add('orange');
        warn.textContent = '\u26A0 细节较高，生成可能较慢且不稳定';
    } else {
        warn.textContent = '';
    }
}

// 滑块浮动提示：拖动时在滑块拇指附近显示当前值。
function initSliderTooltip(slider) {
    const cg = slider.closest('.cg');
    if (!cg) return;
    cg.style.position = 'relative';
    const tip = document.createElement('div');
    tip.className = 'slider-tooltip';
    cg.appendChild(tip);

    function positionTip() {
        const pct = (+slider.value - +slider.min) / (+slider.max - +slider.min);
        const thumbOffset = pct * slider.offsetWidth;
        tip.style.left = thumbOffset + 'px';
    }

    slider.addEventListener('pointerdown', () => {
        tip.textContent = document.getElementById(slider.id.replace('s', 'v')).textContent;
        positionTip();
        tip.classList.add('visible');
    });
    slider.addEventListener('input', () => {
        tip.textContent = document.getElementById(slider.id.replace('s', 'v')).textContent;
        positionTip();
    });
    const hide = () => tip.classList.remove('visible');
    slider.addEventListener('pointerup', hide);
    slider.addEventListener('pointercancel', hide);
}

for (const [s,v] of [['sN','vN'],['sP','vP'],['sCn','vCn'],['sJ','vJ'],['sNs','vNs'],['sCsv','vCsv'],['sLc','vLc'],['sTw','vTw'],['sS','vS'],['sGl','vGl'],['sHEr','vHEr'],['sTEr','vTEr'],['sRs','vRs'],['sTmp','vTmp'],['sPrc','vPrc']]) {
    const slider = document.getElementById(s);
    initSliderTooltip(slider);
    slider.addEventListener('input', e => {
        if (s === 'sN') {
            const detail = detailFromSlider(+e.target.value);
            document.getElementById(v).textContent = detail.toLocaleString();
            updateDetailWarning(detail);
        } else if (s === 'sTmp') {
            const val = +e.target.value;
            document.getElementById(v).textContent = (val > 0 ? '+' : val === 0 ? '\u00b1' : '') + val + '\u00b0C';
        } else if (s === 'sPrc') {
            const val = +e.target.value;
            const pct = Math.round(val * 50);
            document.getElementById(v).textContent = (pct > 0 ? '+' : pct === 0 ? '\u00b1' : '') + pct + '%';
        } else if (s === 'sLc') {
            document.getElementById(v).textContent = Math.round(+e.target.value * 100) + '%';
        } else {
            document.getElementById(v).textContent = e.target.value;
        }
        if (s === 'sTw' || s === 'sS' || s === 'sGl' || s === 'sHEr' || s === 'sTEr' || s === 'sRs') {
            markReapplyPending();
        } else if (s === 'sTmp' || s === 'sPrc') {
            // Display-only update during drag; actual recompute on change (release)
        } else {
            checkStale();
        }
    });
    // Climate sliders: recompute only on release (change), not every drag tick
    if (s === 'sTmp' || s === 'sPrc') {
        slider.addEventListener('change', () => {
            if (!state.curData) return;
            updatePlanetCode(false);
            showBuildOverlay();
            computeClimateViaWorker(onProgress, () => {
                hideBuildOverlay();
                updateMeshColors();
                updateLegend(state.debugLayer);
            });
        });
    }
}

// Force range input re-render when <details> sections are opened.
// 浏览器可能不会更新某些滑块的可见滑块位置，
// hidden (inside a closed <details>) when their value was set via JS.
document.querySelectorAll('details.section').forEach(det => {
    det.addEventListener('toggle', () => {
        if (!det.open) return;
        det.querySelectorAll('input[type="range"]').forEach(s => {
            const v = s.value; s.value = ''; s.value = v;
        });
    });
});

/** Returns true if climate should be skipped (detail above threshold). */
function shouldSkipClimate() {
    return detailFromSlider(+document.getElementById('sN').value) > AUTO_CLIMATE_THRESHOLD;
}

// Climate layer keys 鈥?layers that require climate data
const CLIMATE_LAYERS = new Set([
    'pressureSummer', 'pressureWinter',
    'windSpeedSummer', 'windSpeedWinter',
    'oceanCurrentSummer', 'oceanCurrentWinter',
    'precipSummer', 'precipWinter',
    'rainShadowSummer', 'rainShadowWinter',
    'tempSummer', 'tempWinter',
    'koppen', 'biome', 'continentality'
]);

// Map tabs 鈫?tab-layer mapping
const mapTabs = document.getElementById('mapTabs');
const vizLegend = document.getElementById('vizLegend');
const debugLayerEl = document.getElementById('debugLayer');

function switchVisualization(layer) {
    if (CLIMATE_LAYERS.has(layer) && !state.climateComputed) {
        // 需要先计算气候。
        showBuildOverlay();
        computeClimateViaWorker(onProgress, () => {
            hideBuildOverlay();
            applyLayer(layer);
        });
        return;
    }
    applyLayer(layer);
}

function applyLayer(layer) {
    state.debugLayer = layer;
    state.hoveredKoppen = -1;
    updateMeshColors();
    // Show/hide wind/ocean arrows
    const isWindLayer = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                        layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
    const isOceanLayer = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
    if (isOceanLayer) {
        const season = layer.includes('Winter') ? 'winter' : 'summer';
        buildWindArrows(null);
        buildOceanCurrentArrows(season);
    } else if (isWindLayer) {
        const season = layer.includes('Winter') ? 'winter' : 'summer';
        buildOceanCurrentArrows(null);
        buildWindArrows(season);
    } else {
        buildWindArrows(null);
        buildOceanCurrentArrows(null);
    }
    updateLegend(layer);
}

function syncTabsToLayer(layer) {
    mapTabs.querySelectorAll('.map-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.layer === layer);
    });
    // 同步移动端视图切换器（仅处理它知道的主视图）。
    const mvs = document.getElementById('mobileViewSwitch');
    if (mvs && [...mvs.options].some(o => o.value === layer)) {
        mvs.value = layer;
    }
}

mapTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.map-tab');
    if (!tab) return;
    const layer = tab.dataset.layer;
    // 更新当前标签。
    mapTabs.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    // Sync debug dropdown + mobile switcher
    if (debugLayerEl) debugLayerEl.value = layer;
    mobileViewSwitch.value = layer;
    switchVisualization(layer);
});

// Mobile view switcher
const mobileViewSwitch = document.getElementById('mobileViewSwitch');
mobileViewSwitch.addEventListener('change', (e) => {
    const layer = e.target.value;
    syncTabsToLayer(layer);
    if (debugLayerEl) debugLayerEl.value = layer;
    switchVisualization(layer);
});

// 柯本气候区悬停说明。
const KOPPEN_DESCRIPTIONS = {
    Af:  '热带雨林：全年炎热潮湿。典型地区：亚马孙盆地、刚果盆地、东南亚。',
    Am:  '热带季风：短暂旱季被强季风降水抵消。典型地区：印度南部、西非、澳大利亚北部。',
    Aw:  '热带稀树草原：干湿季分明。典型地区：撒哈拉以南非洲、巴西塞拉多、澳大利亚北部。',
    BWh: '热带沙漠：极端干燥，夏季酷热。典型地区：撒哈拉、阿拉伯沙漠、索诺拉沙漠。',
    BWk: '寒带沙漠：干旱且冬季寒冷。典型地区：戈壁、巴塔哥尼亚干草原、大盆地。',
    BSh: '热带草原：半干旱草地，夏季炎热。典型地区：萨赫勒、澳大利亚内陆、墨西哥北部。',
    BSk: '寒带草原：半干旱且冬季寒冷。典型地区：中亚草原、蒙大拿、安纳托利亚高原。',
    Cfa: '湿润亚热带：夏季炎热潮湿，冬季温和。典型地区：美国东南部、中国东部、布宜诺斯艾利斯。',
    Cfb: '海洋性气候：全年温和，夏季凉爽，降雨频繁。典型地区：西欧、新西兰、太平洋西北部。',
    Cfc: '副极地海洋性：全年凉爽，夏季短暂。典型地区：冰岛、智利南部、法罗群岛。',
    Csa: '炎夏地中海：夏季炎热干燥，冬季温和多雨。典型地区：南加州、希腊、土耳其海岸。',
    Csb: '暖夏地中海：夏季温暖干燥，冬季温和多雨。典型地区：旧金山、波尔图、开普敦。',
    Csc: '冷夏地中海：夏季凉爽干燥，冬季温和多雨，较罕见。',
    Cwa: '季风湿润亚热带：温暖且冬季偏干。典型地区：香港、印度北部、巴西东南高地。',
    Cwb: '亚热带高原：气候温和，冬季偏干。典型地区：墨西哥城、波哥大、埃塞俄比亚高地。',
    Cwc: '寒冷亚热带高原：气候凉爽，冬季偏干，较罕见。',
    Dfa: '炎夏大陆性：夏季炎热，冬季寒冷多雪。典型地区：芝加哥、基辅、北京。',
    Dfb: '暖夏大陆性：夏季温暖，冬季寒冷。典型地区：莫斯科、斯堪的纳维亚南部、新英格兰。',
    Dfc: '亚寒带：冬季漫长寒冷，夏季短暂凉爽。典型地区：西伯利亚、加拿大北部、阿拉斯加内陆。',
    Dfd: '极寒亚寒带：地球上最严酷的冬季类型。典型地区：雅库茨克、维尔霍扬斯克。',
    Dsa: '夏干炎夏大陆性：夏季炎热干燥，冬季寒冷。',
    Dsb: '夏干暖夏大陆性：夏季温暖干燥，冬季寒冷。',
    Dsc: '夏干亚寒带：夏季凉爽干燥，冬季非常寒冷。',
    Dsd: '夏干极寒亚寒带：极为罕见，严寒且夏季干燥。',
    Dwa: '季风炎夏大陆性：夏季炎热潮湿，冬季寒冷干燥。典型地区：中国北方、朝鲜半岛。',
    Dwb: '季风暖夏大陆性：夏季温暖潮湿，冬季寒冷干燥。典型地区：中国东北部分地区。',
    Dwc: '季风亚寒带：夏季短暂潮湿，冬季漫长严寒。典型地区：东西伯利亚、中国远东北部。',
    Dwd: '季风极寒亚寒带：极端寒冷，冬季最干。',
    ET:  '苔原：多年冻土，最暖月仅高于 0°C。典型地区：北极海岸、高山高原。',
    EF:  '冰原：永久冰盖，全年不高于 0°C。典型地区：南极内陆、格陵兰冰盖。',
};

// 图例渲染。
function updateLegend(layer) {
    if (!vizLegend) return;

    if (layer === '' || !layer) {
        // 地形图例。
        const stops = [
            { e: -0.50, label: '' },
            { e: -0.25, label: '' },
            { e: -0.05, label: '' },
            { e: 0.00, label: '' },
            { e: 0.03, label: '' },
            { e: 0.15, label: '' },
            { e: 0.35, label: '' },
            { e: 0.55, label: '' },
            { e: 0.80, label: '' }
        ];
        const colors = stops.map(s => {
            const [r, g, b] = elevationToColor(s.e);
            return `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
        });
        const pcts = stops.map((_, i) => Math.round(i / (stops.length - 1) * 100));
        const gradStr = colors.map((c, i) => `${c} ${pcts[i]}%`).join(', ');
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,${gradStr})"></div>` +
            `<div class="legend-labels"><span>深海</span><span>海平面</span><span>高峰</span></div>`;
    } else if (layer === 'koppen') {
        // 柯本图例：Wikipedia 链接 + 色块悬停说明。
        let html = '<div class="legend-koppen-header"><a href="https://en.wikipedia.org/wiki/K%C3%B6ppen_climate_classification" target="_blank" rel="noopener">柯本气候分类</a></div>';
        html += '<div class="legend-koppen">';
        for (let i = 1; i < KOPPEN_CLASSES.length; i++) {
            const k = KOPPEN_CLASSES[i];
            const [r, g, b] = k.color;
            const hex = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
            const desc = KOPPEN_DESCRIPTIONS[k.code] || k.name;
            html += `<div class="legend-koppen-item" data-code="${k.code}"><span class="legend-koppen-swatch" style="background:${hex}"></span>${k.code}</div>`;
        }
        html += '<div class="legend-koppen-tooltip" id="koppenTip"></div>';
        html += '</div>';
        vizLegend.innerHTML = html;
        // 绑定动态定位的悬停提示。
        const tipEl = document.getElementById('koppenTip');
        const container = vizLegend.querySelector('.legend-koppen');
        vizLegend.querySelectorAll('.legend-koppen-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const code = item.dataset.code;
                const desc = KOPPEN_DESCRIPTIONS[code] || '';
                tipEl.textContent = desc;
                tipEl.classList.add('visible');
                // 定位在悬停项上方，并限制在容器内。
                const itemRect = item.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const tipWidth = 240;
                let left = itemRect.left - containerRect.left + itemRect.width / 2 - tipWidth / 2;
                left = Math.max(0, Math.min(left, containerRect.width - tipWidth));
                tipEl.style.left = left + 'px';
                tipEl.style.bottom = (containerRect.bottom - itemRect.top + 6) + 'px';
                // 高亮网格上的匹配单元。
                const classId = KOPPEN_CLASSES.findIndex(c => c.code === code);
                if (classId >= 0) {
                    state.hoveredKoppen = classId;
                    updateKoppenHoverHighlight();
                    updateMapKoppenHoverHighlight();
                }
            });
            item.addEventListener('mouseleave', () => {
                tipEl.classList.remove('visible');
                state.hoveredKoppen = -1;
                updateKoppenHoverHighlight();
                updateMapKoppenHoverHighlight();
            });
        });
    } else if (layer === 'biome') {
        // 卫星生物群系图例：关键生物群系颜色渐变。
        const biomeStops = [
            { color: [0.82,0.72,0.50], label: '沙漠' },
            { color: [0.72,0.62,0.30], label: '草原' },
            { color: [0.42,0.50,0.18], label: '稀树草原' },
            { color: [0.12,0.38,0.10], label: '森林' },
            { color: [0.06,0.22,0.08], label: '泰加林' },
            { color: [0.35,0.32,0.22], label: '苔原' },
            { color: [0.78,0.80,0.84], label: '冰原' },
        ];
        const biomeColors = biomeStops.map(s => {
            const [r, g, b] = s.color;
            return `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
        });
        const biomePcts = biomeStops.map((_, i) => Math.round(i / (biomeStops.length - 1) * 100));
        const biomeGrad = biomeColors.map((c, i) => `${c} ${biomePcts[i]}%`).join(', ');
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,${biomeGrad})"></div>` +
            `<div class="legend-labels"><span>${biomeStops[0].label}</span><span>${biomeStops[3].label}</span><span>${biomeStops[6].label}</span></div>`;
    } else if (layer === 'rainShadowSummer' || layer === 'rainShadowWinter') {
        // 雨影发散图例：背风雨影 - 中性 - 迎风增强。
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,rgb(230,51,33) 0%,rgb(140,140,148) 50%,rgb(38,102,243) 100%)"></div>` +
            `<div class="legend-labels"><span>雨影</span><span>中性</span><span>迎风</span></div>`;
    } else if (layer === 'landheightmap') {
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,#000 0%,#fff 100%)"></div>` +
            `<div class="legend-labels"><span>海洋 / 海平面</span><span>高峰</span></div>`;
    } else {
        vizLegend.innerHTML = '';
    }
}

// 构建遮罩：统一加载 / 生成遮罩。
const buildOverlay  = document.getElementById('buildOverlay');
const buildBarFill  = document.getElementById('buildBarFill');
const buildBarLabel = document.getElementById('buildBarLabel');
let overlayActive = true; // starts active (visible in HTML on first load)

function onProgress(pct, label) {
    if (!overlayActive) return;
    if (buildBarFill)  buildBarFill.style.transform = 'scaleX(' + (pct / 100) + ')';
    if (buildBarLabel) buildBarLabel.textContent = label;
}

function showBuildOverlay() {
    if (!buildBarFill || !buildOverlay) return;
    // Snap bar to 0 instantly 鈥?disable transition, reset transform, force reflow
    buildBarFill.style.transition = 'none';
    buildBarFill.style.transform = 'scaleX(0)';
    buildBarLabel.textContent = '';
    buildBarFill.offsetWidth; // force reflow
    buildBarFill.style.transition = '';
    overlayActive = true;
    buildOverlay.classList.remove('hidden');
}

function hideBuildOverlay() {
    setTimeout(() => {
        overlayActive = false;
        if (buildOverlay) {
            buildOverlay.classList.add('hidden');
            // 首次生成后，从不透明切换为半透明。
            buildOverlay.classList.remove('initial');
        }
    }, 500);
}

// 生成按钮
const genBtn = document.getElementById('generate');
genBtn.addEventListener('click', () => {
    clearReapplyPending();
    buildWindArrows(null); // dispose previous wind arrows
    buildOceanCurrentArrows(null); // dispose previous ocean arrows
    showBuildOverlay();
    // 移动端收起底部抽屉，让用户看到行星构建过程。
    const ui = document.getElementById('ui');
    if (window.innerWidth <= 768 && ui) ui.classList.add('collapsed');
    // Rebuild: reuse seed + plate edits so only resolution/params change.
    // If plate-affecting sliders (Plates, Continents, Continent Size Variety, Land Coverage) changed,
    // 强制重新生成：粗板块网格完全由 seed + P + Cn + Csv + Lc 决定。
    const plateChanged = PLATE_SLIDERS.some(id => document.getElementById(id).value !== lastGenValues[id]);
    const isRebuild = genBtn.classList.contains('stale') && state.curData && !plateChanged;
    const seed = isRebuild ? state.curData.seed : undefined;
    const toggles = isRebuild ? getToggledIndices() : [];
    generate(seed, toggles, onProgress, shouldSkipClimate());
});
genBtn.addEventListener('generate-done', snapshotSliders);
genBtn.addEventListener('generate-done', hideBuildOverlay);
genBtn.addEventListener('generate-done', () => {
    const infoEl = document.getElementById('info');
    if (!infoEl.dataset.nudged) {
        infoEl.dataset.nudged = '1';
        infoEl.classList.add('nudge');
        infoEl.addEventListener('animationend', () => infoEl.classList.remove('nudge'), { once: true });
    }
}, { once: true });

// Planet code 鈥?display after generation, copy, load, URL hash
const seedInput = document.getElementById('seedCode');
const copyBtn   = document.getElementById('copyBtn');
const loadBtn   = document.getElementById('loadBtn');
let currentCode = ''; // 当前已加载行星的行星码。

function updateLoadBtn() {
    const val = seedInput.value.trim().toLowerCase();
    const ready = val.length > 0 && val !== currentCode;
    loadBtn.classList.toggle('ready', ready);
}

/** Get sorted array of toggled plate indices by diffing current vs original plateIsOcean. */
function getToggledIndices() {
    const d = state.curData;
    if (!d || !d.originalPlateIsOcean) return [];
    const indices = [];
    const seeds = Array.from(d.plateSeeds);
    for (let i = 0; i < seeds.length; i++) {
        const r = seeds[i];
        if (d.originalPlateIsOcean.has(r) !== d.plateIsOcean.has(r)) {
            indices.push(i);
        }
    }
    return indices;
}

/** 编码当前行星状态，并更新种子输入框与 URL hash。 */
function updatePlanetCode(flash) {
    const d = state.curData;
    if (!d) return;
    const code = encodePlanetCode(
        d.seed,
        detailFromSlider(+document.getElementById('sN').value),
        +document.getElementById('sJ').value,
        +document.getElementById('sP').value,
        +document.getElementById('sCn').value,
        +document.getElementById('sNs').value,
        +document.getElementById('sTw').value,
        +document.getElementById('sS').value,
        +document.getElementById('sGl').value,
        +document.getElementById('sHEr').value,
        +document.getElementById('sTEr').value,
        +document.getElementById('sRs').value,
        0.75,
        +document.getElementById('sCsv').value,
        +document.getElementById('sTmp').value,
        +document.getElementById('sPrc').value,
        +document.getElementById('sLc').value,
        getToggledIndices()
    );
    currentCode = code;
    seedInput.value = code;
    updateLoadBtn();
    history.replaceState(null, '', '#' + code);
    if (flash) {
        seedInput.classList.add('flash');
        seedInput.addEventListener('animationend', () => seedInput.classList.remove('flash'), { once: true });
    }
}

genBtn.addEventListener('generate-done', () => updatePlanetCode(false));

const EVOLUTION_DELTA_LAYER = 'snapshotElevationDelta';
const EVOLUTION_PARAM_SLIDERS = [
    'sN', 'sJ', 'sP', 'sCn', 'sNs', 'sCsv', 'sLc',
    'sTw', 'sS', 'sGl', 'sHEr', 'sTEr', 'sRs', 'sTmp', 'sPrc'
];
const evolutionEls = {
    time: document.getElementById('evolutionTime'),
    play: document.getElementById('evolutionPlay'),
    step: document.getElementById('evolutionStep'),
    capture: document.getElementById('evolutionCapture'),
    stepMyr: document.getElementById('evolutionStepMyr'),
    select: document.getElementById('evolutionSnapshotSelect'),
    apply: document.getElementById('evolutionApply'),
    delete: document.getElementById('evolutionDelete'),
    compare: document.getElementById('evolutionCompare'),
    terrain: document.getElementById('evolutionTerrain'),
    status: document.getElementById('evolutionStatus'),
};
let evolutionPlayTimer = null;

function clearTerrainDependentClimateData(curData) {
    if (!curData) return;
    const directFields = [
        'r_wind_east_summer', 'r_wind_north_summer',
        'r_wind_east_winter', 'r_wind_north_winter',
        'itczLons', 'itczLatsSummer', 'itczLatsWinter',
        'r_ocean_current_east_summer', 'r_ocean_current_north_summer',
        'r_ocean_current_east_winter', 'r_ocean_current_north_winter',
        'r_ocean_speed_summer', 'r_ocean_speed_winter',
        'r_ocean_warmth_summer', 'r_ocean_warmth_winter',
        'r_precip_summer', 'r_precip_winter',
        'r_temperature_summer', 'r_temperature_winter',
    ];
    for (const field of directFields) curData[field] = null;

    const debugFields = [
        'pressureSummer', 'pressureWinter',
        'windSpeedSummer', 'windSpeedWinter',
        'oceanCurrentSummer', 'oceanCurrentWinter',
        'precipSummer', 'precipWinter',
        'rainShadowSummer', 'rainShadowWinter',
        'tempSummer', 'tempWinter',
        'tempContinentality',
        'koppen', 'biome', 'continentality',
    ];
    if (curData.debugLayers) {
        for (const field of debugFields) curData.debugLayers[field] = null;
    }
    curData.environmentInputs = null;
}

function readEvolutionParams() {
    const sliders = {};
    for (const id of EVOLUTION_PARAM_SLIDERS) {
        const el = document.getElementById(id);
        if (el) sliders[id] = el.value;
    }
    return {
        planetCode: currentCode,
        sliders,
        debugLayer: state.debugLayer || '',
        climateComputed: !!state.climateComputed,
        terrainInfluence: !!evolutionEls.terrain?.checked,
    };
}

function restoreSnapshotParams(snapshot) {
    const sliders = snapshot?.params?.sliders;
    if (!sliders) return;
    for (const [id, value] of Object.entries(sliders)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    snapshotSliders();
}

function setEvolutionStatus(message, kind = '') {
    if (!evolutionEls.status) return;
    evolutionEls.status.textContent = message;
    evolutionEls.status.classList.toggle('ok', kind === 'ok');
    evolutionEls.status.classList.toggle('warn', kind === 'warn');
}

function renderSnapshotList() {
    const items = snapshotCache.list();
    if (evolutionEls.select) {
        evolutionEls.select.innerHTML = '';
        if (items.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '暂无快照';
            evolutionEls.select.appendChild(option);
        } else {
            for (const item of items) {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = `${item.label} - ${snapshotSourceLabel(item.source)}${item.climate ? ' + 气候' : ''}`;
                evolutionEls.select.appendChild(option);
            }
            evolutionEls.select.value = snapshotCache.currentId || items[items.length - 1].id;
        }
    }

    const evolutionState = state.curData?.evolutionState || snapshotCache.get(snapshotCache.currentId)?.evolutionState;
    if (evolutionEls.time) evolutionEls.time.textContent = formatEvolutionLabel(evolutionState);
    const hasWorld = !!state.curData;
    const hasSnapshots = items.length > 0;
    if (evolutionEls.capture) evolutionEls.capture.disabled = !hasWorld;
    if (evolutionEls.step) evolutionEls.step.disabled = !hasWorld;
    if (evolutionEls.play) evolutionEls.play.disabled = !hasWorld;
    if (evolutionEls.apply) evolutionEls.apply.disabled = !hasSnapshots;
    if (evolutionEls.delete) evolutionEls.delete.disabled = !hasSnapshots;
}

function snapshotSourceLabel(source) {
    return {
        manual: '手动',
        generate: '生成',
        'evolution-step': '演化步进',
    }[source] || source || '未知';
}

function resetTransientSnapshotState() {
    state.hoveredPlate = -1;
    state.hoveredRegion = -1;
    state.hoveredKoppen = -1;
    state._hoverBackup = null;
    state._koppenHoverBackup = null;
    state._mapKoppenHoverBackup = null;
    state._mapHoverBackup = null;
    state._pendingBackup = null;
    state._mapPendingBackup = null;
    state.pendingToggles.clear();
    const rebuildBtn = document.getElementById('rebuildFab');
    if (rebuildBtn) rebuildBtn.style.display = 'none';
}

function clearSnapshotDeltaLayer() {
    if (state.curData?.debugLayers) delete state.curData.debugLayers[EVOLUTION_DELTA_LAYER];
    state.evolution.compare.baseId = null;
    if (state.debugLayer === EVOLUTION_DELTA_LAYER) state.debugLayer = '';
}

function applySnapshotCompareOverlay(snapshotId) {
    if (!state.curData) return null;
    if (state.curData.debugLayers) delete state.curData.debugLayers[EVOLUTION_DELTA_LAYER];
    if (!state.evolution.compare.enabled) {
        clearSnapshotDeltaLayer();
        return null;
    }

    const base = snapshotCache.previousOf(snapshotId);
    if (!base) {
        clearSnapshotDeltaLayer();
        return '对比需要一张更早的快照。';
    }

    const currentElevation = state.curData.r_elevation;
    const baseElevation = base.payload?.curData?.r_elevation;
    if (!currentElevation || !baseElevation || currentElevation.length !== baseElevation.length) {
        clearSnapshotDeltaLayer();
        return '对比快照必须使用相同的网格分辨率。';
    }

    const delta = new Float32Array(currentElevation.length);
    for (let i = 0; i < currentElevation.length; i++) {
        delta[i] = currentElevation[i] - baseElevation[i];
    }
    if (!state.curData.debugLayers) state.curData.debugLayers = {};
    state.curData.debugLayers[EVOLUTION_DELTA_LAYER] = delta;
    state.evolution.compare.baseId = base.id;
    state.debugLayer = EVOLUTION_DELTA_LAYER;
    return null;
}

function rebuildVectorLayersForCurrentLayer() {
    const layer = state.debugLayer || '';
    const isWindLayer = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                        layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
    const isOceanLayer = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
    if (isWindLayer) {
        buildOceanCurrentArrows(null);
        buildWindArrows(layer.includes('Winter') ? 'winter' : 'summer');
    } else if (isOceanLayer) {
        buildWindArrows(null);
        buildOceanCurrentArrows(layer.includes('Winter') ? 'winter' : 'summer');
    } else {
        buildWindArrows(null);
        buildOceanCurrentArrows(null);
    }
}

function syncLayerControlsAfterSnapshot() {
    if (debugLayerEl) {
        const hasOption = [...debugLayerEl.options].some(option => option.value === state.debugLayer);
        debugLayerEl.value = hasOption ? state.debugLayer : '';
    }
    syncTabsToLayer(state.debugLayer || '');
}

function rebuildWorldAfterSnapshotApply(snapshotId) {
    const d = state.curData;
    if (!d) return null;
    resetTransientSnapshotState();
    clearReapplyPending();
    if (d.plateSeeds && d.plateIsOcean) computePlateColors(d.plateSeeds, d.plateIsOcean);

    if (!state.climateComputed && CLIMATE_LAYERS.has(state.debugLayer)) {
        state.debugLayer = '';
    }
    if (!state.evolution.compare.enabled && state.debugLayer === EVOLUTION_DELTA_LAYER) {
        state.debugLayer = '';
    }
    const compareWarning = applySnapshotCompareOverlay(snapshotId);

    syncLayerControlsAfterSnapshot();
    buildWindArrows(null);
    buildOceanCurrentArrows(null);
    buildMesh();
    rebuildVectorLayersForCurrentLayer();
    updateLegend(state.debugLayer || '');
    updatePlanetCode(false);
    renderSnapshotList();
    renderCivilizationPanel();
    invalidateHistorySummary('快照已恢复。请重新生成历史摘要。', { resetArchive: true });
    return compareWarning;
}

function applySnapshotById(id) {
    const snapshot = snapshotCache.get(id);
    if (!snapshot) return;
    restoreSnapshotParams(snapshot);
    try {
        snapshotCache.apply(id);
        syncEvolutionTerrainViaWorker(state.curData);
        const warning = rebuildWorldAfterSnapshotApply(id);
        setEvolutionStatus(warning || `已恢复 ${snapshot.label}。`, warning ? 'warn' : 'ok');
    } catch (err) {
        console.error('[Evolution] 快照恢复失败：', err);
        setEvolutionStatus(err.message || '快照恢复失败。', 'warn');
    }
}

function captureSnapshotFromCurrent(source = 'manual', label = '') {
    if (!state.curData) {
        setEvolutionStatus('请先生成世界，再捕获快照。', 'warn');
        return null;
    }
    ensureEvolutionState(state.curData, { climateComputed: state.climateComputed, source });
    const snapshot = snapshotCache.capture({
        label: label || formatEvolutionLabel(state.curData.evolutionState),
        source,
        params: readEvolutionParams(),
        evolutionState: state.curData.evolutionState,
    });
    renderSnapshotList();
    setEvolutionStatus(`已捕获 ${snapshot.label}。`, 'ok');
    return snapshot;
}

function captureGeneratedSnapshot() {
    try {
        state.evolution.compare.enabled = false;
        if (evolutionEls.compare) evolutionEls.compare.checked = false;
        captureSnapshotFromCurrent('generate', '0 Myr');
    } catch (err) {
        console.error('[Evolution] 自动快照失败：', err);
        setEvolutionStatus(err.message || '自动快照失败。', 'warn');
    }
}

function stepEvolutionOnce() {
    if (!state.curData) {
        setEvolutionPlaying(false);
        setEvolutionStatus('请先生成世界，再推进时间轴。', 'warn');
        return;
    }
    const dtMyr = Math.max(0.1, +(evolutionEls.stepMyr?.value || 1));
    const baseState = ensureEvolutionState(state.curData, {
        climateComputed: state.climateComputed,
        source: 'evolution-step',
    });
    const nextState = advanceEvolutionState(baseState, { dtMyr });
    state.curData.evolutionState = nextState;
    evolveGeologyMemoryInPlace(state.curData, { dtMyr });
    let terrainStep = null;
    if (evolutionEls.terrain?.checked) {
        terrainStep = applyGeologyTerrainInfluenceInPlace(state.curData, { dtMyr });
        if (terrainStep?.changedCells > 0) {
            state.climateComputed = false;
            nextState.dependencies.climateComputed = false;
            state.curData.evolutionState.dependencies.climateComputed = false;
            clearTerrainDependentClimateData(state.curData);
            refreshEnvironmentInputs(state.curData);
            syncEvolutionTerrainViaWorker(state.curData);
        }
    }
    try {
        const snapshot = snapshotCache.capture({
            label: formatEvolutionLabel(nextState),
            source: 'evolution-step',
            params: readEvolutionParams(),
            evolutionState: nextState,
        });
        applySnapshotById(snapshot.id);
        if (terrainStep?.changedCells > 0) {
            setEvolutionStatus(
                `已推进至 ${formatEvolutionLabel(nextState)}；地形最大增量 ${terrainStep.maxAbsDelta.toFixed(4)}。`,
                'ok'
            );
        }
    } catch (err) {
        console.error('[Evolution] 时间轴步进失败：', err);
        setEvolutionPlaying(false);
        setEvolutionStatus(err.message || '时间轴步进失败。', 'warn');
    }
}

function setEvolutionPlaying(wantPlaying) {
    if (wantPlaying && !state.curData) {
        setEvolutionStatus('请先生成世界，再播放时间轴。', 'warn');
        return;
    }
    if (evolutionPlayTimer) {
        clearInterval(evolutionPlayTimer);
        evolutionPlayTimer = null;
    }
    state.evolution.playback.isPlaying = !!wantPlaying;
    if (evolutionEls.play) evolutionEls.play.textContent = wantPlaying ? '暂停' : '播放';
    if (wantPlaying) {
        evolutionPlayTimer = setInterval(stepEvolutionOnce, state.evolution.playback.intervalMs);
        setEvolutionStatus('时间轴正在播放。', 'ok');
    }
}

function initEvolutionTimeline() {
    evolutionEls.capture?.addEventListener('click', () => {
        try { captureSnapshotFromCurrent('manual'); }
        catch (err) { setEvolutionStatus(err.message || '快照捕获失败。', 'warn'); }
    });
    evolutionEls.apply?.addEventListener('click', () => {
        if (evolutionEls.select?.value) applySnapshotById(evolutionEls.select.value);
    });
    evolutionEls.delete?.addEventListener('click', () => {
        const id = evolutionEls.select?.value;
        if (!id) return;
        const wasCurrent = id === snapshotCache.currentId;
        snapshotCache.delete(id);
        if (wasCurrent && snapshotCache.currentId) applySnapshotById(snapshotCache.currentId);
        else renderSnapshotList();
        setEvolutionStatus('快照已删除。', 'ok');
    });
    evolutionEls.step?.addEventListener('click', stepEvolutionOnce);
    evolutionEls.play?.addEventListener('click', () => setEvolutionPlaying(!state.evolution.playback.isPlaying));
    evolutionEls.compare?.addEventListener('change', (e) => {
        state.evolution.compare.enabled = e.target.checked;
        if (snapshotCache.currentId) applySnapshotById(snapshotCache.currentId);
        else renderSnapshotList();
    });
    evolutionEls.select?.addEventListener('change', () => {
        if (evolutionEls.select.value) applySnapshotById(evolutionEls.select.value);
    });
    renderSnapshotList();
}

initEvolutionTimeline();

const civilizationEls = {
    year: document.getElementById('civilizationYear'),
    seed: document.getElementById('civilizationSeed'),
    step: document.getElementById('civilizationStep'),
    stepYears: document.getElementById('civilizationStepYears'),
    metrics: document.getElementById('civilizationMetrics'),
    status: document.getElementById('civilizationStatus'),
};

function setCivilizationStatus(message, kind = '') {
    if (!civilizationEls.status) return;
    civilizationEls.status.textContent = message;
    civilizationEls.status.classList.toggle('ok', kind === 'ok');
    civilizationEls.status.classList.toggle('warn', kind === 'warn');
}

function renderCivilizationPanel() {
    const civ = state.curData?.civilizationState || null;
    const hasWorld = !!state.curData;
    if (civilizationEls.seed) civilizationEls.seed.disabled = !hasWorld;
    if (civilizationEls.step) civilizationEls.step.disabled = !hasWorld;
    if (civilizationEls.year) civilizationEls.year.textContent = civ ? civ.timeYear.toLocaleString() : '0';
    if (!civilizationEls.metrics) return;
    if (!hasWorld) {
        civilizationEls.metrics.textContent = '请先生成世界，再播种文明。';
        return;
    }
    if (!civ) {
        civilizationEls.metrics.textContent = '暂无文明状态。';
        return;
    }
    const m = civ.metrics || {};
    civilizationEls.metrics.textContent = [
        `群体 ${m.livingGroups ?? civ.populationGroups?.length ?? 0}`,
        `人口 ${(m.population || 0).toLocaleString()}`,
        `聚落 ${m.settlements || 0}`,
        `文化 ${m.cultures || 0}`,
        `语言 ${m.languages || 0}`,
        `政体 ${m.polities || 0}`,
    ].join(' · ');
}

function showCivilizationLayer(layer = 'civilizationActivity') {
    state.debugLayer = layer;
    if (debugLayerEl) debugLayerEl.value = layer;
    syncTabsToLayer(layer);
    buildWindArrows(null);
    buildOceanCurrentArrows(null);
    buildMesh();
    updateLegend(layer);
}

function seedCivilization() {
    if (!state.curData) {
        setCivilizationStatus('请先生成世界，再播种文明。', 'warn');
        return;
    }
    refreshEnvironmentInputs(state.curData);
    const civ = ensureCivilizationState(state.curData);
    renderCivilizationPanel();
    showCivilizationLayer('populationDensity');
    const point = recordHistoryPoint('civilization-seed');
    invalidateHistorySummary(`已记录 ${point?.label || '文明播种'}。准备好后可生成摘要或时间线。`);
    setCivilizationStatus(`已播种 ${civ.populationGroups.length} 个族群。`, 'ok');
}

function stepCivilizationOnce() {
    if (!state.curData) {
        setCivilizationStatus('请先生成世界，再推进文明。', 'warn');
        return;
    }
    refreshEnvironmentInputs(state.curData);
    const dtYear = Math.max(10, +(civilizationEls.stepYears?.value || 100));
    const civ = stepCivilizationInPlace(state.curData, { dtYear });
    renderCivilizationPanel();
    showCivilizationLayer('civilizationActivity');
    const point = recordHistoryPoint('civilization-step');
    invalidateHistorySummary(`已记录 ${point?.label || '文明步进'}。请重新生成摘要或时间线。`);
    setCivilizationStatus(`文明已推进至第 ${civ.timeYear.toLocaleString()} 年。`, 'ok');
}

function initCivilizationPanel() {
    civilizationEls.seed?.addEventListener('click', seedCivilization);
    civilizationEls.step?.addEventListener('click', stepCivilizationOnce);
    renderCivilizationPanel();
}

initCivilizationPanel();

const historyEls = {
    build: document.getElementById('historyBuild'),
    timeline: document.getElementById('historyBuildTimeline'),
    view: document.getElementById('historyViewPoint'),
    point: document.getElementById('historyPointSelect'),
    json: document.getElementById('historyExportJson'),
    markdown: document.getElementById('historyExportMarkdown'),
    preview: document.getElementById('historyPreview'),
    status: document.getElementById('historyStatus'),
};
let historyArchive = [];
let lastHistoryArtifact = null;

function setHistoryStatus(message, kind = '') {
    if (!historyEls.status) return;
    historyEls.status.textContent = message;
    historyEls.status.classList.toggle('ok', kind === 'ok');
    historyEls.status.classList.toggle('warn', kind === 'warn');
}

function renderHistoryPanel() {
    const hasWorld = !!state.curData;
    if (!hasWorld) {
        lastHistoryArtifact = null;
        historyArchive = [];
        if (historyEls.preview) historyEls.preview.value = '';
    }
    if (historyEls.build) historyEls.build.disabled = !hasWorld;
    if (historyEls.timeline) historyEls.timeline.disabled = !hasWorld;
    if (historyEls.view) historyEls.view.disabled = !hasWorld || !historyArchive.length;
    if (historyEls.json) historyEls.json.disabled = !hasWorld;
    if (historyEls.markdown) historyEls.markdown.disabled = !hasWorld;
    if (historyEls.point) {
        const previous = historyEls.point.value;
        historyEls.point.innerHTML = '';
        if (!historyArchive.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '暂无历史点';
            historyEls.point.appendChild(option);
            historyEls.point.disabled = true;
        } else {
            for (const entry of historyArchive) {
                const option = document.createElement('option');
                option.value = entry.key;
                option.textContent = `${entry.point.label} · 人口 ${(entry.point.metrics.population || 0).toLocaleString()}`;
                historyEls.point.appendChild(option);
            }
            historyEls.point.disabled = false;
            historyEls.point.value = historyArchive.some(entry => entry.key === previous)
                ? previous
                : historyArchive[historyArchive.length - 1].key;
        }
    }
}

function invalidateHistorySummary(message = '请生成新的历史摘要。', { resetArchive = false } = {}) {
    lastHistoryArtifact = null;
    if (resetArchive) historyArchive = [];
    if (historyEls.preview) historyEls.preview.value = '';
    setHistoryStatus(message, state.curData ? 'warn' : '');
    renderHistoryPanel();
}

function recordHistoryPoint(source = 'manual') {
    if (!state.curData?.civilizationState) return null;
    try {
        refreshEnvironmentInputs(state.curData);
        const summary = buildHistorySummary(state.curData);
        const point = createHistoryPoint(summary, {
            source,
            snapshotId: state.curData.evolutionState?.snapshot?.id || state.evolution.currentId || null,
            label: `第 ${summary.civilization.year.toLocaleString()} 年`,
        });
        const key = `${point.snapshotId || 'runtime'}:${point.year}:${summary.civilization.stepIndex}`;
        const civilizationState = JSON.parse(JSON.stringify(state.curData.civilizationState));
        historyArchive = historyArchive.filter(item => item.key !== key);
        historyArchive.push({ key, point, civilizationState });
        historyArchive.sort((a, b) => (
            a.point.year - b.point.year ||
            String(a.point.capturedAt).localeCompare(String(b.point.capturedAt))
        ));
        return point;
    } catch (err) {
        console.warn('[HistoryExport] 记录失败：', err);
        return null;
    }
}

function buildHistorySummaryForUi() {
    if (!state.curData) {
        setHistoryStatus('请先生成世界，再生成历史摘要。', 'warn');
        return null;
    }
    refreshEnvironmentInputs(state.curData);
    if (!state.curData.civilizationState) {
        ensureCivilizationState(state.curData);
        renderCivilizationPanel();
    }
    try {
        const summary = buildHistorySummary(state.curData);
        lastHistoryArtifact = { type: 'summary', data: summary };
        recordHistoryPoint('summary-build');
        if (historyEls.preview) historyEls.preview.value = formatHistorySummaryMarkdown(summary);
        setHistoryStatus(`已生成第 ${summary.civilization.year.toLocaleString()} 年的历史摘要。`, 'ok');
        renderHistoryPanel();
        return summary;
    } catch (err) {
        setHistoryStatus(err?.message || '历史摘要生成失败。', 'warn');
        return null;
    }
}

function buildHistoryTimelineForUi() {
    if (!state.curData) {
        setHistoryStatus('请先生成世界，再生成历史时间线。', 'warn');
        return null;
    }
    if (!historyArchive.length && !state.curData.civilizationState) {
        ensureCivilizationState(state.curData);
        renderCivilizationPanel();
    }
    recordHistoryPoint('timeline-build');
    try {
        const timeline = buildHistoryTimeline(historyArchive.map(entry => entry.point));
        lastHistoryArtifact = { type: 'timeline', data: timeline };
        if (historyEls.preview) historyEls.preview.value = formatHistoryTimelineMarkdown(timeline);
        setHistoryStatus(`已生成包含 ${timeline.world.pointCount} 个历史点的时间线。`, 'ok');
        renderHistoryPanel();
        return timeline;
    } catch (err) {
        setHistoryStatus(err?.message || '历史时间线生成失败。', 'warn');
        return null;
    }
}

function viewHistoryPoint() {
    if (!state.curData) {
        setHistoryStatus('请先生成世界，再查看历史点。', 'warn');
        return;
    }
    const key = historyEls.point?.value;
    const entry = historyArchive.find(item => item.key === key);
    if (!entry) {
        setHistoryStatus('请先选择已记录的历史点。', 'warn');
        return;
    }
    state.curData.civilizationState = JSON.parse(JSON.stringify(entry.civilizationState));
    attachCivilizationDebugLayers(state.curData);
    renderCivilizationPanel();
    showCivilizationLayer('civilizationActivity');
    lastHistoryArtifact = { type: 'summary', data: entry.point.summary };
    if (historyEls.preview) historyEls.preview.value = formatHistorySummaryMarkdown(entry.point.summary);
    setHistoryStatus(`正在文明图层中查看 ${entry.point.label}。`, 'ok');
    renderHistoryPanel();
}

function exportHistoryArtifact(format) {
    const artifact = lastHistoryArtifact || { type: 'summary', data: buildHistorySummaryForUi() };
    if (!artifact.data) return;
    const filename = artifact.type === 'timeline'
        ? downloadHistoryTimeline(artifact.data, format)
        : downloadHistorySummary(artifact.data, format);
    setHistoryStatus(`已下载 ${filename}。`, 'ok');
}

function initHistoryPanel() {
    historyEls.build?.addEventListener('click', buildHistorySummaryForUi);
    historyEls.timeline?.addEventListener('click', buildHistoryTimelineForUi);
    historyEls.view?.addEventListener('click', viewHistoryPoint);
    historyEls.json?.addEventListener('click', () => exportHistoryArtifact('json'));
    historyEls.markdown?.addEventListener('click', () => exportHistoryArtifact('markdown'));
    renderHistoryPanel();
}

initHistoryPanel();
genBtn.addEventListener('generate-done', captureGeneratedSnapshot);
genBtn.addEventListener('generate-done', () => {
    // 如果尚未计算气候且当前视图是气候图层，则切回地形。
    if (!state.climateComputed && CLIMATE_LAYERS.has(state.debugLayer)) {
        state.debugLayer = '';
        if (debugLayerEl) debugLayerEl.value = '';
        syncTabsToLayer('');
        updateMeshColors();
    }
    syncTabsToLayer(state.debugLayer);
    if (debugLayerEl) debugLayerEl.value = state.debugLayer;
    updateLegend(state.debugLayer);

    // Rebuild wind/ocean arrows if a relevant debug layer is active
    const v = state.debugLayer;
    const isWindLayer = v === 'pressureSummer' || v === 'pressureWinter' ||
                        v === 'windSpeedSummer' || v === 'windSpeedWinter';
    const isOceanLayer = v === 'oceanCurrentSummer' || v === 'oceanCurrentWinter';
    if (isWindLayer) {
        buildWindArrows(v.includes('Winter') ? 'winter' : 'summer');
    } else if (isOceanLayer) {
        buildOceanCurrentArrows(v.includes('Winter') ? 'winter' : 'summer');
    }
});
genBtn.addEventListener('generate-done', renderCivilizationPanel);
genBtn.addEventListener('generate-done', () => invalidateHistorySummary('世界已生成。请播种或推进文明，再生成历史摘要。', { resetArchive: true }));

document.addEventListener('plates-edited', () => {
    updatePlanetCode(true);
    // 如果气候已失效且当前正在查看气候图层，则切回地形。
    if (!state.climateComputed && CLIMATE_LAYERS.has(state.debugLayer)) {
        state.debugLayer = '';
        if (debugLayerEl) debugLayerEl.value = '';
        syncTabsToLayer('');
        updateMeshColors();
        updateLegend('');
    }
});

copyBtn.addEventListener('click', () => {
    if (!seedInput.value) return;
    navigator.clipboard.writeText(seedInput.value).then(() => {
        copyBtn.textContent = '\u2713';
        setTimeout(() => { copyBtn.textContent = '\u2398'; }, 1200);
    });
});

seedInput.addEventListener('input', () => {
    updateLoadBtn();
    seedError.classList.remove('visible');
});

const seedError = document.getElementById('seedError');

function paramsToSliderMap(params) {
    return {
        sN: sliderFromDetail(params.N), sJ: params.jitter, sP: params.P,
        sCn: params.numContinents, sNs: params.roughness,
        sCsv: params.continentSizeVariety, sLc: params.landCoverage,
        sTw: params.terrainWarp, sS: params.smoothing, sGl: params.glacialErosion,
        sHEr: params.hydraulicErosion, sTEr: params.thermalErosion,
        sRs: params.ridgeSharpening, sTmp: params.temperatureOffset,
        sPrc: params.precipitationOffset,
    };
}

function applyCode(code) {
    const params = decodePlanetCode(code);
    if (!params) {
        seedInput.style.borderColor = '#c44';
        seedError.classList.add('visible');
        setTimeout(() => { seedInput.style.borderColor = ''; }, 1500);
        return;
    }
    seedError.classList.remove('visible');
    // Set slider values + fire input events to update displays
    const map = paramsToSliderMap(params);
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input'));
    }
    clearReapplyPending();
    state.pendingToggles.clear();
    document.getElementById('rebuildFab').style.display = 'none';
    showBuildOverlay();
    generate(params.seed, params.toggledIndices, onProgress, shouldSkipClimate());
}

loadBtn.addEventListener('click', () => {
    applyCode(seedInput.value);
});

seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCode(seedInput.value);
});

// View-mode checkboxes
document.getElementById('chkPlates').addEventListener('change', () => { updateMeshColors(); updateSuperPlateBorders(); });
document.getElementById('chkWire').addEventListener('change', buildMesh);

// Grid toggle
const gridSpacingGroup = document.getElementById('gridSpacingGroup');
document.getElementById('chkGrid').addEventListener('change', (e) => {
    state.gridEnabled = e.target.checked;
    gridSpacingGroup.style.display = state.gridEnabled ? '' : 'none';
    if (state.mapMode) {
        if (state.mapGridMesh) state.mapGridMesh.visible = state.gridEnabled;
        if (state.globeGridMesh) state.globeGridMesh.visible = false;
    } else {
        if (state.globeGridMesh) state.globeGridMesh.visible = state.gridEnabled;
        if (state.mapGridMesh) state.mapGridMesh.visible = false;
    }
});

// Grid spacing dropdown
document.getElementById('gridSpacing').addEventListener('change', (e) => {
    state.gridSpacing = parseFloat(e.target.value);
    rebuildGrids();
});

// Map center longitude slider 鈥?translate on drag (instant), rebuild on release
const mapCenterLonGroup = document.getElementById('mapCenterLonGroup');
const sMapCenterLon = document.getElementById('sMapCenterLon');
const vMapCenterLon = document.getElementById('vMapCenterLon');

sMapCenterLon.addEventListener('input', () => {
    const lon = +sMapCenterLon.value;
    const suffix = lon > 0 ? 'E' : lon < 0 ? 'W' : '';
    vMapCenterLon.textContent = Math.abs(lon) + '\u00B0' + suffix;
    state.mapCenterLon = lon * Math.PI / 180;
    if (state.mapMode && state.mapMesh) {
        // Instant GPU translation 鈥?wrap clones (children at 卤4) fill edges
        const builtLon = state.mapMesh._builtCenterLon || 0;
        const dx = (builtLon - state.mapCenterLon) * (2 / Math.PI);
        state.mapMesh.position.x = dx;
        if (state.mapGridMesh) state.mapGridMesh.position.x = dx;
    }
});

sMapCenterLon.addEventListener('change', () => {
    if (state.mapMode) {
        buildMapMesh();
        // Rebuild arrows if a wind/ocean layer is active
        const layer = state.debugLayer;
        const isWind = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                       layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
        const isOcean = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
        if (isWind) buildWindArrows(layer.includes('Winter') ? 'winter' : 'summer');
        if (isOcean) buildOceanCurrentArrows(layer.includes('Winter') ? 'winter' : 'summer');
    }
});

// View mode dropdown (Globe / Map)
document.getElementById('viewMode').addEventListener('change', (e) => {
    state.mapMode = e.target.value === 'map';
    if (state.mapMode) {
        if (state.planetMesh) state.planetMesh.visible = false;
        waterMesh.visible = false;
        atmosMesh.visible = false;
        starsMesh.visible = false;
        if (state.wireMesh) state.wireMesh.visible = false;
        if (state.arrowGroup) state.arrowGroup.visible = false;
        if (!state.mapMesh) {
            showBuildOverlay();
            onProgress(0, '正在构建地图网格…');
            // 先让遮罩完成绘制，再构建网格。
            setTimeout(() => {
                buildMapMesh();
                if (state.mapMesh) state.mapMesh.visible = true;
                hideBuildOverlay();
            }, 50);
        }
        if (state.mapMesh) state.mapMesh.visible = true;
        if (state.mapGridMesh) state.mapGridMesh.visible = state.gridEnabled;
        if (state.globeGridMesh) state.globeGridMesh.visible = false;
        // 地图模式下切换风场箭头子组。
        if (state.windArrowGroup) {
            state.windArrowGroup.traverse(c => {
                if (c.name === 'windGlobe') c.visible = false;
                if (c.name === 'windMap') c.visible = true;
            });
        }
        if (state.oceanCurrentArrowGroup) {
            state.oceanCurrentArrowGroup.traverse(c => {
                if (c.name === 'oceanGlobe') c.visible = false;
                if (c.name === 'oceanMap') c.visible = true;
            });
        }
        scene.background = new THREE.Color(0x1a1a2e);
        ctrl.enabled = false;
        mapCtrl.enabled = true;
        mapCamera.position.set(0, 0, 5);
        mapCamera.lookAt(0, 0, 0);
        updateMapCameraFrustum();
        mapCtrl.target.set(0, 0, 0);
        mapCtrl.update();
        mapCenterLonGroup.style.display = '';
    } else {
        if (state.planetMesh) state.planetMesh.visible = true;
        atmosMesh.visible = true;
        starsMesh.visible = true;
        if (state.wireMesh) state.wireMesh.visible = true;
        if (state.arrowGroup) state.arrowGroup.visible = true;
        if (state.mapMesh) state.mapMesh.visible = false;
        if (state.mapGridMesh) state.mapGridMesh.visible = false;
        if (state.globeGridMesh) state.globeGridMesh.visible = state.gridEnabled;
        // 球体模式下切换风场箭头子组。
        if (state.windArrowGroup) {
            state.windArrowGroup.traverse(c => {
                if (c.name === 'windGlobe') c.visible = true;
                if (c.name === 'windMap') c.visible = false;
            });
        }
        if (state.oceanCurrentArrowGroup) {
            state.oceanCurrentArrowGroup.traverse(c => {
                if (c.name === 'oceanGlobe') c.visible = true;
                if (c.name === 'oceanMap') c.visible = false;
            });
        }
        const showPlates = document.getElementById('chkPlates').checked;
        waterMesh.visible = !showPlates && !state.debugLayer;
        scene.background = new THREE.Color(0x030308);
        mapCtrl.enabled = false;
        ctrl.enabled = true;
        mapCenterLonGroup.style.display = 'none';
    }
});

// 检查图层下拉框。
if (debugLayerEl) {
    debugLayerEl.addEventListener('change', (e) => {
        const layer = e.target.value;
        syncTabsToLayer(layer);
        switchVisualization(layer);
    });
}

// 导出弹窗。
(function initExport() {
    const overlay   = document.getElementById('exportOverlay');
    const closeBtn  = document.getElementById('exportClose');
    const cancelBtn = document.getElementById('exportCancel');
    const goBtn     = document.getElementById('exportGo');
    const widthEl   = document.getElementById('exportWidth');
    const dimsEl    = document.getElementById('exportDims');
    const typeEl    = document.getElementById('exportType');
    const openBtn   = document.getElementById('exportBtn');

    function updateDims() {
        const w = +widthEl.value;
        dimsEl.textContent = w + ' \u00D7 ' + (w / 2);
    }

    function openModal() {
        overlay.classList.remove('hidden');
        updateDims();
        // 气候尚未计算时，禁用依赖气候的导出类型。
        for (const opt of typeEl.options) {
            if (opt.value === 'biome' || opt.value === 'koppen') {
                opt.disabled = !state.climateComputed;
                if (opt.disabled && typeEl.value === opt.value) typeEl.value = 'color';
            }
        }
    }
    function closeModal() { overlay.classList.add('hidden'); }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });
    widthEl.addEventListener('change', updateDims);

    goBtn.addEventListener('click', async () => {
        const type = typeEl.value;
        const w = +widthEl.value;
        closeModal();
        showBuildOverlay();
        onProgress(0, '正在准备导出…');
        await exportMap(type, w, onProgress);
        hideBuildOverlay();
    });

    // 全部导出：下载卫星图、气候图、高度图和陆地掩膜。
    const exportAllBtn = document.getElementById('exportAllGo');
    const EXPORT_ALL_TYPES = [
        { type: 'biome',          label: '卫星图' },
        { type: 'koppen',         label: '气候图' },
        { type: 'landheightmap',  label: '高度图' },
        { type: 'landmask',       label: '陆地掩膜' },
    ];

    exportAllBtn.addEventListener('click', async () => {
        const w = +widthEl.value;
        closeModal();
        showBuildOverlay();

        // 如有需要先计算气候（卫星图和气候图依赖气候数据）。
        if (!state.climateComputed) {
            onProgress(0, '正在计算气候…');
            await new Promise(resolve => computeClimateViaWorker(onProgress, resolve));
        }

        await exportMapBatch(EXPORT_ALL_TYPES, w, onProgress);
        hideBuildOverlay();
    });
})();

// 编辑模式设置（指针事件和子模式按钮）。
setupEditMode();

// 重建悬浮按钮：批量应用待处理板块切换。
(function initRebuildFab() {
    const rebuildBtn = document.getElementById('rebuildFab');
    const rebuildLabel = rebuildBtn.querySelector('span');

    function clearPending() {
        state.pendingToggles.clear();
        rebuildBtn.style.display = 'none';
        state._pendingBackup = null;
        state._mapPendingBackup = null;
        updatePendingHighlight();
        updateMapPendingHighlight();
    }

    // 待处理集合变化时显示 / 隐藏重建按钮。
    document.addEventListener('pending-edits-changed', () => {
        const count = state.pendingToggles.size;
        if (count > 0) {
            rebuildLabel.textContent = `重建（${count}）`;
            rebuildBtn.style.display = '';
        } else {
            rebuildBtn.style.display = 'none';
        }
    });

    // 点击后应用所有待处理切换，并只重算一次。
    rebuildBtn.addEventListener('click', () => {
        if (state.pendingToggles.size === 0) return;
        const { plateIsOcean, plateDensity, plateDensityLand, plateDensityOcean } = state.curData;

        // 应用所有待处理切换。
        for (const pid of state.pendingToggles) {
            if (plateIsOcean.has(pid)) {
                plateIsOcean.delete(pid);
                plateDensity[pid] = plateDensityLand[pid];
            } else {
                plateIsOcean.add(pid);
                plateDensity[pid] = plateDensityOcean[pid];
            }
        }

        clearPending();

        // 显示构建状态。
        const btn = document.getElementById('generate');
        btn.disabled = true;
        btn.textContent = '正在构建…';
        btn.classList.add('generating');

        const hoverEl = document.getElementById('hoverInfo');
        hoverEl.innerHTML = '\u23F3 正在重建…';
        hoverEl.style.display = 'block';

        const skipClimate = shouldSkipClimate();
        editRecomputeViaWorker(() => {
            btn.disabled = false;
            btn.textContent = '生成新世界';
            btn.classList.remove('generating');
            hoverEl.style.display = 'none';
            document.dispatchEvent(new CustomEvent('plates-edited'));
        }, skipClimate);
    });

    // Escape 清除所有待处理编辑。
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.pendingToggles.size > 0) {
            clearPending();
        }
    });

    // 新生成时清除待处理编辑。
    genBtn.addEventListener('generate-done', clearPending);
})();

// 侧栏切换（桌面端）+ 底部面板（移动端）。
const sidebarToggle = document.getElementById('sidebarToggle');
const uiPanel = document.getElementById('ui');
const isMobileLayout = () => window.innerWidth <= 768;

if (isMobileLayout()) {
    uiPanel.classList.add('collapsed');
}

// 桌面端侧栏切换。
sidebarToggle.addEventListener('click', () => {
    const collapsed = uiPanel.classList.toggle('collapsed');
    sidebarToggle.innerHTML = collapsed ? '\u00BB' : '\u00AB';
    sidebarToggle.title = collapsed ? '显示面板' : '折叠面板';
});

// 底部面板拖动行为（Pointer Events + setPointerCapture）。
(function initBottomSheet() {
    const handle = document.getElementById('sheetHandle');
    if (!handle) return;

    let startY = 0, startTransform = 0, dragging = false;
    let lastY = 0, lastTime = 0, velocity = 0;
    let didDrag = false;
    let rafId = 0, pendingY = null;

    function getTranslateY() {
        const st = getComputedStyle(uiPanel);
        const m = new DOMMatrix(st.transform);
        return m.m42;
    }

    function getCollapsedY() {
        return uiPanel.offsetHeight - 60;
    }

    function applyTransform() {
        if (pendingY !== null) {
            uiPanel.style.transform = `translateY(${pendingY}px)`;
            pendingY = null;
        }
        rafId = 0;
    }

    function scheduleTransform(y) {
        pendingY = y;
        if (!rafId) rafId = requestAnimationFrame(applyTransform);
    }

    function cleanup() {
        dragging = false;
        uiPanel.style.transition = '';
        uiPanel.classList.remove('dragging');
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        pendingY = null;
    }

    handle.addEventListener('pointerdown', (e) => {
        if (!isMobileLayout()) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        dragging = true;
        didDrag = false;
        startY = e.clientY;
        lastY = e.clientY;
        lastTime = performance.now();
        velocity = 0;
        startTransform = uiPanel.classList.contains('collapsed') ? getTranslateY() : 0;
        uiPanel.style.transition = 'none';
        uiPanel.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const y = e.clientY;
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) velocity = (y - lastY) / dt; // px/ms，正值表示向下。
        lastY = y;
        lastTime = now;
        const dy = y - startY;
        if (Math.abs(dy) > 5) didDrag = true;
        const collapsedY = getCollapsedY();
        const newY = Math.max(0, Math.min(collapsedY, startTransform + dy));
        scheduleTransform(newY);
    });

    handle.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        handle.releasePointerCapture(e.pointerId);
        cleanup();
        const curY = getTranslateY();
        const collapsedY = getCollapsedY();
        const progress = collapsedY > 0 ? 1 - curY / collapsedY : 0;
        const shouldCollapse = velocity > 0.3 || (velocity > -0.3 && progress < 0.3);
        if (shouldCollapse) {
            uiPanel.classList.add('collapsed');
        } else {
            uiPanel.classList.remove('collapsed');
        }
        uiPanel.style.transform = '';
    });

    handle.addEventListener('pointercancel', (e) => {
        if (!dragging) return;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        cleanup();
        uiPanel.style.transform = '';
    });

    // 点击把手切换折叠状态（刚拖动过则忽略点击）。
    handle.addEventListener('click', () => {
        if (!isMobileLayout()) return;
        if (didDrag) { didDrag = false; return; }
        uiPanel.classList.toggle('collapsed');
    });
})();

// 编辑模式切换绑定。
(function initEditToggle() {
    const editBtn = document.getElementById('editToggle');
    if (!editBtn) return;
    editBtn.addEventListener('click', () => {
        state.editMode = !state.editMode;
        editBtn.classList.toggle('active', state.editMode);
    });
})();

// 移动端刷新悬浮按钮：双击确认后重新生成。
(function initRefreshFab() {
    const btn = document.getElementById('refreshFab');
    if (!btn) return;
    let armed = false;
    let timer = 0;

    function disarm() {
        armed = false;
        btn.classList.remove('armed');
        clearTimeout(timer);
    }

    btn.addEventListener('click', () => {
        if (!armed) {
            armed = true;
            btn.classList.add('armed');
            timer = setTimeout(disarm, 3000);
        } else {
            disarm();
            // 折叠面板，让用户看到行星构建过程。
            if (isMobileLayout()) uiPanel.classList.add('collapsed');
            clearReapplyPending();
            showBuildOverlay();
            generate(undefined, [], onProgress, shouldSkipClimate());
        }
    });
})();

// 移动端提示文案。
if (state.isTouchDevice) {
    const infoEl = document.getElementById('info');
    if (infoEl) infoEl.textContent = '拖拽旋转 · 双指缩放 · 使用编辑按钮重塑';
}

// 触控设备禁用大于 8192 的导出宽度。
if (state.isTouchDevice) {
    const exportWidth = document.getElementById('exportWidth');
    if (exportWidth) {
        for (const opt of exportWidth.options) {
            if (+opt.value > 8192) {
                opt.disabled = true;
                opt.textContent = opt.value + '（移动端过大）';
            }
        }
    }
}

// 方向变化处理。
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        updateMapCameraFrustum();
        renderer.setSize(innerWidth, innerHeight);
    }, 100);
});

// 动画循环。
function animate() {
    requestAnimationFrame(animate);
    if (state.mapMode) { tickMapZoom(); mapCtrl.update(); } else { tickZoom(); ctrl.update(); }
    if (!state.mapMode && state.planetMesh && document.getElementById('chkRotate').checked) {
        state.planetMesh.rotation.y += 0.0008;
        waterMesh.rotation.y = state.planetMesh.rotation.y;
        if (state.wireMesh) state.wireMesh.rotation.y = state.planetMesh.rotation.y;
        if (state.arrowGroup) state.arrowGroup.rotation.y = state.planetMesh.rotation.y;
        if (state.windArrowGroup) state.windArrowGroup.rotation.y = state.planetMesh.rotation.y;
        if (state.oceanCurrentArrowGroup) state.oceanCurrentArrowGroup.rotation.y = state.planetMesh.rotation.y;
        if (state.globeGridMesh) state.globeGridMesh.rotation.y = state.planetMesh.rotation.y;
    }
    renderer.render(scene, state.mapMode ? mapCamera : camera);
}

// 尺寸变化处理。
window.addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    updateMapCameraFrustum();
    renderer.setSize(innerWidth, innerHeight);
});

// 教程弹窗。
(function initTutorial() {
    const overlay  = document.getElementById('tutorialOverlay');
    const card     = document.getElementById('tutorialCard');
    const closeBtn = document.getElementById('tutorialClose');
    const backBtn  = document.getElementById('tutorialBack');
    const nextBtn  = document.getElementById('tutorialNext');
    const helpBtn  = document.getElementById('helpBtn');
    const steps    = card.querySelectorAll('.tutorial-step');
    const dots     = card.querySelectorAll('.dot');
    const TOTAL    = steps.length;
    const LS_KEY   = 'atlas-engine-tutorial-seen';
    let current    = 0;

    function showStep(i) {
        current = i;
        steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        backBtn.disabled = i === 0;
        nextBtn.textContent = i === TOTAL - 1 ? '开始使用' : '下一步';
    }

    function openModal() {
        current = 0;
        showStep(0);
        overlay.classList.remove('hidden');
    }

    function closeModal() {
        overlay.classList.add('hidden');
        localStorage.setItem(LS_KEY, '1');
    }

    nextBtn.addEventListener('click', () => {
        if (current < TOTAL - 1) showStep(current + 1);
        else closeModal();
    });

    backBtn.addEventListener('click', () => {
        if (current > 0) showStep(current - 1);
    });

    closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });

    helpBtn.addEventListener('click', openModal);

    // 为触控设备更新教程第 2 步。
    if (state.isTouchDevice) {
        const step2 = card.querySelector('.tutorial-step[data-step="2"]');
        if (step2) {
            const p = step2.querySelector('p');
            if (p) p.innerHTML = '<strong>拖拽</strong> 可旋转球体。<strong>双指</strong> 可缩放。点击<strong>编辑按钮</strong>（铅笔图标）后，再<strong>点按</strong>板块即可标记为待重塑；可选择多个板块，再点击<strong>重建</strong>一次性应用。再次点按可撤销待处理选择。';
        }
    }

    // 首次访问自动显示：等待构建遮罩淡出。
    overlay.classList.add('hidden');
    if (!localStorage.getItem(LS_KEY)) {
        genBtn.addEventListener('generate-done', () => {
            if (buildOverlay) {
                buildOverlay.addEventListener('transitionend', () => openModal(), { once: true });
            } else {
                openModal();
            }
        }, { once: true });
    }
})();

// 更新内容弹窗：每个版本对回访用户显示一次。
(function initWhatsNew() {
    const VERSION    = '2';
    const LS_KEY     = 'wo-whatsnew-seen';
    const LS_TUTORIAL = 'atlas-engine-tutorial-seen';
    const overlay    = document.getElementById('whatsNewOverlay');
    const card       = document.getElementById('whatsNewCard');
    if (!overlay || !card) return;

    const closeBtn = document.getElementById('whatsNewClose');
    const backBtn  = document.getElementById('whatsNewBack');
    const nextBtn  = document.getElementById('whatsNewNext');
    const steps    = card.querySelectorAll('.whatsnew-step');
    const dots     = card.querySelectorAll('.dot');
    const TOTAL    = steps.length;
    let current    = 0;

    function showStep(i) {
        current = i;
        steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        backBtn.disabled = i === 0;
        nextBtn.textContent = i === TOTAL - 1 ? '知道了' : '下一步';
    }

    function closeModal() {
        overlay.classList.add('hidden');
        localStorage.setItem(LS_KEY, VERSION);
    }

    nextBtn.addEventListener('click', () => {
        if (current < TOTAL - 1) showStep(current + 1);
        else closeModal();
    });
    backBtn.addEventListener('click', () => {
        if (current > 0) showStep(current - 1);
    });
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });

    // 仅对已看过教程但尚未看过本版本更新的回访用户显示。
    overlay.classList.add('hidden');
    const seenVersion = localStorage.getItem(LS_KEY);
    const isReturningUser = localStorage.getItem(LS_TUTORIAL);
    if (isReturningUser && seenVersion !== VERSION) {
        genBtn.addEventListener('generate-done', () => {
            showStep(0);
            setTimeout(() => overlay.classList.remove('hidden'), 600);
        }, { once: true });
    }
})();

// 深度用户问卷：跨 2 天且累计 3 个不同时段后触发。
(function initSurveyTracker() {
    const LS = 'wo-usage';
    const LS_DISMISSED = 'wo-survey-dismissed';

    if (localStorage.getItem(LS_DISMISSED)) return;

    // 简单哈希，避免存储原始时间戳。
    function hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    let data;
    try { data = JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { data = {}; }
    const hours = data.h || 0;
    const days  = data.d || 0;
    const lastH = data.lh || '';
    const lastD = data.ld || '';

    const now = new Date();
    const hourKey = hash(now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + 'T' + now.getHours());
    const dayKey  = hash(now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate());

    const newHours = hourKey !== lastH ? hours + 1 : hours;
    const newDays  = dayKey  !== lastD ? days  + 1 : days;

    localStorage.setItem(LS, JSON.stringify({ h: newHours, d: newDays, lh: hourKey, ld: dayKey }));

    if (newHours >= 3 && newDays >= 2) {
        const overlay    = document.getElementById('surveyOverlay');
        const closeBtn   = document.getElementById('surveyClose');
        const dismissBtn = document.getElementById('surveyDismiss');
        const linkBtn    = document.getElementById('surveyLink');
        if (!overlay) return;

        function dismiss() {
            overlay.classList.add('hidden');
            localStorage.setItem(LS_DISMISSED, '1');
        }

        // 首次生成完成后显示。
        genBtn.addEventListener('generate-done', () => {
            setTimeout(() => overlay.classList.remove('hidden'), 1000);
        }, { once: true });

        closeBtn.addEventListener('click', dismiss);
        dismissBtn.addEventListener('click', dismiss);
        linkBtn.addEventListener('click', dismiss);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) dismiss();
        });
    }
})();

// 截图辅助：可在浏览器控制台调用 window.takePreview()。
// 隐藏 UI，以当前相机角度渲染 1200×630，并下载 preview.png。
window.takePreview = function(width = 1200, height = 630) {
    // Save current state
    const savedW = renderer.domElement.width;
    const savedH = renderer.domElement.height;
    const savedAspect = camera.aspect;
    const savedPixelRatio = renderer.getPixelRatio();

    // Hide all UI elements
    const hiddenEls = [];
    for (const sel of ['#ui', '#topInfo', '#info', '#hoverInfo', '#helpBtn',
                        '#editToggle', '#refreshFab', '#rebuildFab', '#mobileViewSwitch',
                        '#buildOverlay', '#tutorialOverlay', '#exportOverlay', '#surveyOverlay', '#whatsNewOverlay']) {
        const el = document.querySelector(sel);
        if (el && el.style.display !== 'none') {
            hiddenEls.push({ el, prev: el.style.display });
            el.style.display = 'none';
        }
    }

    // 保持当前相机角度，只为输出尺寸调整宽高比。
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // 按目标尺寸精确渲染。
    renderer.setPixelRatio(1);
    renderer.setSize(width, height);
    renderer.render(scene, camera);

    // Download
    const link = document.createElement('a');
    link.download = 'preview.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();

    // Restore everything
    renderer.setPixelRatio(savedPixelRatio);
    renderer.setSize(savedW / savedPixelRatio, savedH / savedPixelRatio);
    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();
    for (const { el, prev } of hiddenEls) el.style.display = prev;
    renderer.render(scene, state.mapMode ? mapCamera : camera);
    console.log('preview.png 已下载！');
};

// 启动：先检查 URL hash 中的行星码，否则随机生成。
const hashCode = location.hash.replace(/^#/, '').trim();
const hashParams = hashCode ? decodePlanetCode(hashCode) : null;
if (hashParams) {
    const map = paramsToSliderMap(hashParams);
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input'));
    }
    generate(hashParams.seed, hashParams.toggledIndices, onProgress, shouldSkipClimate());
} else {
    generate(undefined, [], onProgress, shouldSkipClimate());
}
animate();
