import { clearIndicator } from './indicator.js';

/* 翻页工具函数 */
function getActiveScroller() {
    const page = document.querySelector('.page.active');
    return page ? page.querySelector('.page-scroll') : null;
}

function atTop(el) {
    return el.scrollTop <= 0;
}

/* [修复 3]：增加 Math.ceil 向上取整和更大的容错率，防止高分屏小数像素导致触底判定失败卡死 */
function atBottom(el) {
    return Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 2;
}

/* 翻页逻辑状态：由常量改为变量，等待系统点火后注入 */
let pages = [];
let index = 0;

/* 核心页面更新引擎 */
function updatePages() {
    pages.forEach((p, i) => {
        p.classList.remove('active', 'prev');
        if (i === index) p.classList.add('active');
        if (i < index) p.classList.add('prev');
    });

    window.dispatchEvent(new CustomEvent('kappa:pager-change', {
        detail: {
            index,
            total: pages.length,
        },
    }));

    /* 页面切换时，强制释放角标 */
    clearIndicator();

    /* [修复 2]：强制唤醒图片懒加载机制
       在页面切换完成的瞬间，手动派发一个内部容器的滚动和重绘事件，告诉浏览器：“画面变了，快把图片加载出来！” */
    const scroller = getActiveScroller();
    if (scroller) {
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            scroller.dispatchEvent(new Event('scroll'));
        }, 50);
    }
}

/* [修复 1]：系统初始化引擎，彻底解决 DOM 加载时差问题 */
function initPagerSystem() {
    // 此时再抓取页面元素，确保骨架绝对 100% 构建完毕
    pages = [...document.querySelectorAll('.page')];
    
    // 防御性退出：万一获取不到，直接终止，避免报错卡死
    if (pages.length === 0) return; 

    // 智能校准：寻找 HTML 中是否已经有默认带 active 类的页面，如果没有就强制从 0 开始
    const activeIndex = pages.findIndex(p => p.classList.contains('active'));
    index = activeIndex > -1 ? activeIndex : 0;

    updatePages();
}

/* ==========================================
   生命周期拦截器：防御缓存与加载异常
   ========================================== */
// 监听 DOM 树构建完成，只有建完了才允许启动翻页引擎
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPagerSystem);
} else {
    initPagerSystem();
}

// 修复 Safari / 手机端特有的页面缓存(BFCache)导致的锁死问题
window.addEventListener('pageshow', (e) => {
    if (e.persisted) initPagerSystem();
});

window.addEventListener('kappa:pager-seek', (event) => {
    if (!pages.length) return;

    const rawIndex = Number(event.detail?.index);
    if (!Number.isFinite(rawIndex)) return;

    const nextIndex = Math.min(Math.max(Math.round(rawIndex), 0), pages.length - 1);
    if (nextIndex === index) return;

    index = nextIndex;
    updatePages();
});

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
