// 板块交互：悬停信息，以及 Ctrl+点击切换海陆。
// 使用解析式射线-球面相交，避免 Three.js 网格射线检测；
// 通过 O(N) 点积查找替代 O(N) 三角形相交测试。

import * as THREE from 'three';
import { canvas, camera, mapCamera } from './scene.js';
import { state } from './state.js';
import { updateHoverHighlight, updateMapHoverHighlight, updatePendingHighlight, updateMapPendingHighlight } from './planet-mesh.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { elevToHeightKm } from './color-map.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const _inverseMatrix = new THREE.Matrix4();
const _localRay = new THREE.Ray();

/** 查找最接近单位球方向的区域（点积最大）。 */
function findNearestRegion(nx, ny, nz) {
    const { mesh, r_xyz, r_plate } = state.curData;
    const N = mesh.numRegions;
    let bestDot = -2, bestR = -1;
    for (let r = 0; r < N; r++) {
        const dot = nx * r_xyz[3 * r] + ny * r_xyz[3 * r + 1] + nz * r_xyz[3 * r + 2];
        if (dot > bestDot) { bestDot = dot; bestR = r; }
    }
    if (bestR < 0) return null;
    return { region: bestR, plate: r_plate[bestR] };
}

/** 球体视图：解析式射线-球面相交 → 最近区域。
 *  高细节下约比 Three.js 网格射线检测快 50–100 倍。 */
function getHitInfoGlobe(event) {
    if (!state.planetMesh) return null;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 将射线变换到行星局部空间（兼容自动旋转）。
    _inverseMatrix.copy(state.planetMesh.matrixWorld).invert();
    _localRay.copy(raycaster.ray).applyMatrix4(_inverseMatrix);

    const ox = _localRay.origin.x, oy = _localRay.origin.y, oz = _localRay.origin.z;
    const dx = _localRay.direction.x, dy = _localRay.direction.y, dz = _localRay.direction.z;

    // 射线-球面：|O + tD|² = R²（方向已归一化，所以 a=1）。
    const R = 1.08; // 略高于最大高程位移。
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - R * R;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;

    const t = (-b - Math.sqrt(disc)) * 0.5;
    if (t < 0) return null;

    // 命中点 → 归一化为单位方向。
    const hx = ox + t * dx, hy = oy + t * dy, hz = oz + t * dz;
    const len = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    return findNearestRegion(hx / len, hy / len, hz / len);
}

/** 地图视图：鼠标反投影 → 地图平面 → 等距圆柱反算 → 最近区域。 */
function getHitInfoMap(event) {
    if (!state.mapMesh) return null;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 与 z=0 平面求交，得到地图上的世界坐标。
    raycaster.setFromCamera(mouse, mapCamera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (Math.abs(d.z) < 1e-10) return null;
    const t = -o.z / d.z;
    const wx = o.x + t * d.x;
    const wy = o.y + t * d.y;

    // 等距圆柱反算：地图坐标 → 经/纬度 → 单位球 xyz。
    const PI = Math.PI;
    const sx = 2 / PI;
    let lon = wx / sx + (state.mapCenterLon || 0);
    const lat = wy / sx;
    if (lat < -PI / 2 || lat > PI / 2) return null;
    // 把经度包回 [-PI, PI]。
    if (lon > PI) lon -= 2 * PI;
    else if (lon < -PI) lon += 2 * PI;

    const cosLat = Math.cos(lat);
    return findNearestRegion(
        cosLat * Math.sin(lon),
        Math.sin(lat),
        cosLat * Math.cos(lon)
    );
}

function getHitInfo(event) {
    if (!state.curData) return null;
    return state.mapMode ? getHitInfoMap(event) : getHitInfoGlobe(event);
}

/** 为某个区域构建多行悬停 HTML。 */
function buildHoverHTML(region, plate) {
    const d = state.curData;
    const isOcean = d.plateIsOcean.has(plate);
    const isPending = state.pendingToggles.has(plate);
    const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">●</span>`;
    const action = state.isTouchDevice ? '点按' : 'Ctrl+点击';
    const lines = [];

    // 第 1 行：板块类型与编辑提示。
    if (isPending) {
        const target = isOcean ? '陆地' : '海洋';
        lines.push(`${dot} <b>${isOcean ? '海洋' : '陆地'} → ${target}</b> <span style="color:#fa0">（待处理）</span> · ${action}以撤销`);
    } else {
        lines.push(`${dot} <b>${isOcean ? '海洋' : '陆地'}</b>板块 · ${action}${isOcean ? '抬升为陆地' : '淹没为海洋'}`);
    }

    // 高程。
    const elev = d.r_elevation[region];
    const elevKm = elevToHeightKm(elev).toFixed(1);
    lines.push(`<span class="hi-label">高程</span> ${elevKm} km`);

    // 从 r_xyz 计算经纬度。
    const x = d.r_xyz[3 * region];
    const y = d.r_xyz[3 * region + 1];
    const z = d.r_xyz[3 * region + 2];
    const lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI);
    const lon = Math.atan2(x, z) * (180 / Math.PI);
    const latStr = Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S');
    const lonStr = Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
    lines.push(`<span class="hi-label">坐标</span> ${latStr}, ${lonStr}`);

    // 气候数据（仅在已计算时显示）。
    if (state.climateComputed && d.r_temperature_summer) {
        const tS = -45 + Math.max(0, Math.min(1, d.r_temperature_summer[region])) * 90;
        const tW = -45 + Math.max(0, Math.min(1, d.r_temperature_winter[region])) * 90;
        if (elev <= 0) {
            // 海洋：显示海表温度。
            lines.push(`<span class="hi-label">海温</span> ${tS.toFixed(0)}°C / ${tW.toFixed(0)}°C`);
        } else {
            lines.push(`<span class="hi-label">温度</span> ${tS.toFixed(0)}°C / ${tW.toFixed(0)}°C`);

            // 降水（仅陆地）。
            if (d.r_precip_summer) {
                const pS = (Math.max(0, Math.min(1, d.r_precip_summer[region])) * 1000).toFixed(0);
                const pW = (Math.max(0, Math.min(1, d.r_precip_winter[region])) * 1000).toFixed(0);
                lines.push(`<span class="hi-label">降水</span> ${pS} / ${pW} mm`);
            }

            // 柯本气候（仅陆地）。
            if (d.debugLayers && d.debugLayers.koppen) {
                const kIdx = d.debugLayers.koppen[region];
                const kc = KOPPEN_CLASSES[kIdx];
                if (kc && kc.code !== 'Ocean') {
                    const [r, g, b] = kc.color;
                    const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
                    lines.push(`<span class="hi-label">气候</span> <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${hex};vertical-align:middle;margin-right:4px"></span>${kc.code} — ${kc.name}`);
                }
            }
        }
    }

    return lines.join('<br>');
}

/** 设置悬停与 Ctrl+点击事件监听。 */
export function setupEditMode() {
    let downInfo = null;
    let orbiting = false;
    let lastHoverTime = 0;
    const HOVER_INTERVAL = 50; // 毫秒；限制悬停查询频率。

    canvas.addEventListener('pointerdown', (e) => {
        if (!state.curData) return;
        const isEditTap = (e.button === 0 && e.ctrlKey) ||
                          (e.button === 0 && state.isTouchDevice && state.editMode);
        if (isEditTap) {
            // Ctrl+点击或移动端编辑点按：编辑板块。
            const hit = getHitInfo(e);
            if (!hit) return;
            downInfo = { x: e.clientX, y: e.clientY, plate: hit.plate };
        } else if (e.button === 0 || e.button === 2) {
            // 普通点击/右键：旋转或平移，跳过悬停射线检测。
            orbiting = true;
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        orbiting = false;
        if (!downInfo || !state.curData || e.button !== 0) { downInfo = null; return; }

        const dx = e.clientX - downInfo.x;
        const dy = e.clientY - downInfo.y;

        if (dx * dx + dy * dy < 36) {
            const pid = downInfo.plate;
            // 切换待处理状态：不存在则加入，存在则移除（撤销）。
            if (state.pendingToggles.has(pid)) {
                state.pendingToggles.delete(pid);
            } else {
                state.pendingToggles.add(pid);
            }
            // 先移除悬停高亮，让待处理着色应用到底色。
            // 悬停备份来自待处理前的颜色；若不先剥离，
            // updateHoverHighlight 的悬停恢复会擦掉待处理着色。
            const savedHover = state.hoveredPlate;
            state.hoveredPlate = -1;
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
            state.hoveredPlate = savedHover;
            // 将待处理着色应用到清理后的底色。
            updatePendingHighlight();
            updateMapPendingHighlight();
            // 在待处理着色之上重新应用悬停效果。
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
            // 更新悬停文本以反映待处理状态。
            const hoverEl = document.getElementById('hoverInfo');
            if (state.hoveredRegion >= 0 && state.curData) {
                hoverEl.innerHTML = buildHoverHTML(state.hoveredRegion, state.hoveredPlate);
            }
            // 通知 main.js 显示或隐藏重建按钮。
            document.dispatchEvent(new CustomEvent('pending-edits-changed'));
        }
        downInfo = null;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!state.curData) {
            if (state.hoveredPlate >= 0 || state.hoveredRegion >= 0) {
                state.hoveredPlate = -1;
                state.hoveredRegion = -1;
                document.getElementById('hoverInfo').style.display = 'none';
            }
            return;
        }

        // 旋转/平移时跳过；拖动期间不做悬停查询。
        if (orbiting) return;

        // 节流悬停更新。
        const now = performance.now();
        if (now - lastHoverTime < HOVER_INTERVAL) return;
        lastHoverTime = now;

        const hit = getHitInfo(e);
        const newRegion = hit ? hit.region : -1;
        // 仅在编辑模式下高亮板块（按住 Ctrl 或移动端编辑开关开启）。
        const inEditMode = e.ctrlKey || (state.isTouchDevice && state.editMode);
        const newPlate = (hit && inEditMode) ? hit.plate : -1;

        // 只在板块变化时更新板块高亮。
        if (newPlate !== state.hoveredPlate) {
            state.hoveredPlate = newPlate;
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
        }

        // 只在区域变化时更新信息文本。
        if (newRegion !== state.hoveredRegion) {
            state.hoveredRegion = newRegion;
            state.hoveredPlate = (hit && inEditMode) ? hit.plate : -1;
            const hoverEl = document.getElementById('hoverInfo');
            if (newRegion >= 0) {
                hoverEl.innerHTML = buildHoverHTML(newRegion, hit.plate);
                hoverEl.style.display = 'block';
            } else {
                hoverEl.style.display = 'none';
            }
        }
    });
}
