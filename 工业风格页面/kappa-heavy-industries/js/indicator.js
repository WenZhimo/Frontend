/* js/indicator.js */

// ---------- DOM 元素 ----------
const indicator = document.getElementById('corner-indicator');
const highlightRect = document.getElementById('highlight-rect');

// ----------全局配置 ----------
const CONFIG = {
    // 矩形内缩间距 (像素)
    gap: 1,

    // 1. 角标 (Corner Indicator) 的识别规则
    // 说明：这是一个 CSS 选择器字符串。
    // 如果您想支持特定的类名（比如 .interactive），只需用逗号分隔追加在后面。
    // 示例: '[data-selectable], .my-btn, .nav-link'表示识别data属性“data-selectable”，同时识别.my-btn类和.nav-link类
    indicatorSelector: '[data-selectable], .selectable',

    // 2. 高亮矩形 (Highlight Rect) 的识别规则
    // 示例: '[data-selectable-highlight], .card, .btn'
    highlightSelector: '[data-selectable-highlight], .selectable-highlight'
};

// ---------- 状态管理 ----------
let indicatorTarget = null;
let lastIndicatorTarget = null;

let highlightTarget = null;
let lastHighlightTarget = null;
let highlightTimer = null;

// 消失防抖计时器
let hideDebounceTimer = null;

// ==========================================
// 1. 角标逻辑 (Corner Indicator)
// ==========================================
function updateIndicator(el) {
    if (!el || el.offsetParent === null) {
        if (indicator) indicator.style.opacity = '0';
        return;
    }
    const r = el.getBoundingClientRect();
    if (indicator) {
        indicator.style.width = r.width + 'px';
        indicator.style.height = r.height + 'px';
        indicator.style.transform = `translate(${r.left}px, ${r.top}px)`;
        indicator.style.opacity = '1';
    }
}

// ==========================================
// 2. 高亮矩形逻辑 (Highlight Rect)
// ==========================================
function updateHighlight(el) {
    if (!el || el.offsetParent === null) {
        if (highlightRect) highlightRect.style.opacity = '0';
        return;
    }

    const rect = el.getBoundingClientRect();
    // [修改] 使用 CONFIG.gap
    const innerW = Math.max(0, rect.width - CONFIG.gap * 2);
    const innerH = Math.max(0, rect.height - CONFIG.gap * 2);
    const innerX = rect.left + CONFIG.gap;
    const innerY = rect.top + CONFIG.gap;

    // --- 情况A: 同一个元素 ---
    if (el === highlightTarget) {
        if (highlightRect) {
            highlightRect.style.transform = `translate(${innerX}px, ${innerY}px)`;
            if (!highlightTimer) {
                highlightRect.style.width = `${innerW}px`;
                highlightRect.style.height = `${innerH}px`;
            }
        }
        return;
    }

    // --- 情况B: 切换到了新元素 ---
    lastHighlightTarget = highlightTarget;
    highlightTarget = el;

    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
    }

    if (!highlightRect) return;

    const wasHighlighting = lastHighlightTarget !== null;

    if (wasHighlighting) {
        // [模式1] 连续移动
        highlightRect.style.transition = `
            transform 0.45s cubic-bezier(.25, 1, .5, 1),
            width 0.35s cubic-bezier(.25, 1, .5, 1),
            height 0.35s cubic-bezier(.25, 1, .5, 1),
            opacity 0.2s ease`;

        highlightRect.style.opacity = '1';
        highlightRect.style.transform = `translate(${innerX}px, ${innerY}px)`;
        highlightRect.style.width = `${innerW}px`;
        highlightRect.style.height = `${innerH}px`;
    } else {
        // [模式2] 新进入
        highlightRect.style.transition = 'none';
        highlightRect.style.transform = `translate(${innerX}px, ${innerY}px)`;
        highlightRect.style.width = '0px';
        highlightRect.style.height = '0px';
        highlightRect.style.opacity = '1';

        void highlightRect.offsetHeight;

        highlightTimer = setTimeout(() => {
            highlightRect.style.transition = 'width 0.2s ease-out, height 0.2s ease-out';
            highlightRect.style.width = `${innerW}px`;
            highlightRect.style.height = `${innerH}px`;
            highlightTimer = null;
        }, 30);
    }
}

/**
 * 鼠标移走时：向左上角收缩并消失
 */
function shrinkHideHighlight() {
    if (!highlightRect || !highlightTarget) return;

    highlightRect.style.transition = `
        transform 0.45s cubic-bezier(.25, 1, .5, 1),
        width 0.35s cubic-bezier(.25, 1, .5, 1),
        height 0.35s cubic-bezier(.25, 1, .5, 1),
        opacity 0.2s ease 0.1s`;

    highlightRect.style.width = '0px';
    highlightRect.style.height = '0px';
    highlightRect.style.opacity = '0';

    highlightTarget = null;

    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
    }
}

/**
 * 强制隐藏
 */
function hideHighlight() {
    if (highlightRect) highlightRect.style.opacity = '0';
    if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
    if (hideDebounceTimer) { clearTimeout(hideDebounceTimer); hideDebounceTimer = null; }
    highlightTarget = null;
    lastHighlightTarget = null;
}

// ==========================================
// 3. 事件监听与驱动
// ==========================================

function refreshAll() {
    if (indicatorTarget) updateIndicator(indicatorTarget);
    if (highlightTarget) updateHighlight(highlightTarget);
}

export function clearIndicator() {
    indicatorTarget = null;
    lastIndicatorTarget = null;
    if (indicator) indicator.style.opacity = '0';
    hideHighlight();
}

// 监听 Pointer Over
document.addEventListener('pointerover', e => {
    const target = e.target;

    // --- 逻辑A: 角标 ---
    // [修改] 使用 CONFIG.indicatorSelector
    const elIndicator = target.closest(CONFIG.indicatorSelector);
    if (elIndicator && elIndicator !== indicatorTarget) {
        lastIndicatorTarget = indicatorTarget;
        indicatorTarget = elIndicator;
        updateIndicator(indicatorTarget);
    }

    // --- 逻辑B: 高亮矩形 ---
    // [修改] 使用 CONFIG.highlightSelector
    const elHighlight = target.closest(CONFIG.highlightSelector);

    if (elHighlight) {
        // 进入有效元素：清除“准备消失”的计时器
        if (hideDebounceTimer) {
            clearTimeout(hideDebounceTimer);
            hideDebounceTimer = null;
        }

        if (elHighlight !== highlightTarget) {
            updateHighlight(elHighlight);
        }
    } else {
        // 移入空白区域：开启“准备消失”倒计时
        if (highlightTarget && !hideDebounceTimer) {
            hideDebounceTimer = setTimeout(() => {
                shrinkHideHighlight();
                hideDebounceTimer = null;
            }, 100);
        }
    }
}, true);

document.addEventListener('pointerleave', () => {
    if (highlightTarget) {
        shrinkHideHighlight();
    }
});

function bindScrollTracking() {
    const scrollables = document.querySelectorAll('.page-scroll, .page');
    scrollables.forEach(sc => {
        sc.addEventListener('scroll', () => { refreshAll(); }, { passive: true });
    });
}
bindScrollTracking();

window.addEventListener('resize', () => { refreshAll(); });
setInterval(() => { refreshAll(); }, 300);
