import { clearIndicator } from './indicator.js';

/* 翻页工具函数 */
function getActiveScroller() {
    const page = document.querySelector('.page.active');
    return page ? page.querySelector('.page-scroll') : null;
}

function atTop(el) {
    return el.scrollTop <= 0;
}

function atBottom(el) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

/* 翻页逻辑 */
const pages = [...document.querySelectorAll('.page')];
let index = 0;

function updatePages() {
    pages.forEach((p, i) => {
        p.classList.remove('active', 'prev');
        if (i === index) p.classList.add('active');
        if (i < index) p.classList.add('prev');
    });

    const progressSpan = document.querySelector('#progress span');
    if (progressSpan) {
        progressSpan.style.width = (index / (pages.length - 1)) * 100 + '%';
    }

    /* 页面切换时，强制释放角标 */
    clearIndicator();
}

/**
 * 检查事件目标是否属于“非翻页区域”（例如悬浮窗、弹出的配置面板）
 * 如果是，则返回 true，表示 pager.js 应该忽略该事件
 */
function shouldIgnoreEvent(e) {
    // 检查目标是否在 CRT 配置面板内
    if (e.target.closest('#crt-fx-main-panel')) return true;

    // 如果未来有其他悬浮窗需要滚动，也可以加在这里
    // if (e.target.closest('.other-scrollable-popup')) return true;

    return false;
}

// 鼠标滚轮翻页
window.addEventListener('wheel', e => {
    // [修正] 如果在配置面板上滚动，直接返回，允许浏览器默认行为（滚动面板内容）
    if (shouldIgnoreEvent(e)) return;

    const scroller = getActiveScroller();
    if (!scroller) return;

    const delta = e.deltaY;
    const canScroll = scroller.scrollHeight > scroller.clientHeight;

    if (delta > 0) {
        // 向下滚
        if (!canScroll || atBottom(scroller)) {
            if (index < pages.length - 1) {
                e.preventDefault();
                index++;
                updatePages();
            }
        }
    } else if (delta < 0) {
        // 向上滚
        if (!canScroll || atTop(scroller)) {
            if (index > 0) {
                e.preventDefault();
                index--;
                updatePages();
            }
        }
    }
}, { passive: false });

// 触摸翻页
let touchStartY = 0;

window.addEventListener('touchstart', e => {
    // [修正] 如果触摸的是配置面板，忽略
    if (shouldIgnoreEvent(e)) return;

    if (e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', e => {
    // [修正] 如果触摸的是配置面板，忽略
    if (shouldIgnoreEvent(e)) return;

    if (e.changedTouches.length !== 1) return;

    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY;
    const threshold = 60;

    if (Math.abs(deltaY) < threshold) return;

    const scroller = getActiveScroller();
    if (!scroller) return;

    const canScroll = scroller.scrollHeight > scroller.clientHeight;

    if (deltaY < 0) {
        // 向上滑 → 下一页
        if (!canScroll || atBottom(scroller)) {
            if (index < pages.length - 1) {
                index++;
                updatePages();
            }
        }
    } else {
        // 向下滑 → 上一页
        if (!canScroll || atTop(scroller)) {
            if (index > 0) {
                index--;
                updatePages();
            }
        }
    }
}, { passive: true });
