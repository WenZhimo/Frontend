const progress = document.getElementById('progress');
const progressFill = progress?.querySelector('span') ?? null;
let isDraggingProgress = false;
let suppressProgressClick = false;

function isFrontPageMode() {
    return document.querySelectorAll('#pager .page').length > 1;
}

function getDocumentScrollState() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return { scrollTop, scrollMax };
}

function setProgressMode(mode) {
    if (!progress) return;
    progress.dataset.mode = mode;
}

function setProgressRatio(ratio) {
    if (!progressFill) return;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    progressFill.style.width = `${clamped * 100}%`;
}

function getActivePageIndex() {
    return [...document.querySelectorAll('#pager .page')].findIndex((page) => page.classList.contains('active'));
}

function updateFrontPageProgress(event) {
    const total = Number(event?.detail?.total ?? document.querySelectorAll('#pager .page').length);
    let index = Number(event?.detail?.index);

    if (!Number.isFinite(index)) {
        index = getActivePageIndex();
    }

    setProgressMode('pager');

    if (total <= 1) {
        setProgressRatio(0);
        return;
    }

    const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
    setProgressRatio(safeIndex / (total - 1));
}

function updateDocumentProgress() {
    const { scrollTop, scrollMax } = getDocumentScrollState();
    setProgressMode('scroll');

    if (scrollMax <= 0) {
        setProgressRatio(0);
        return;
    }

    setProgressRatio(scrollTop / scrollMax);
}

function syncProgress() {
    if (isFrontPageMode()) {
        updateFrontPageProgress();
    } else {
        updateDocumentProgress();
    }
}

function getSeekRatio(event) {
    if (!progress) return 0;
    const rect = progress.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
}

function seekProgress(ratio, behavior = 'smooth') {
    if (isFrontPageMode()) {
        const pages = document.querySelectorAll('#pager .page');
        if (pages.length <= 1) return;

        const targetIndex = Math.round(ratio * (pages.length - 1));
        window.dispatchEvent(new CustomEvent('kappa:pager-seek', {
            detail: { index: targetIndex },
        }));
        return;
    }

    const { scrollMax } = getDocumentScrollState();
    if (scrollMax <= 0) return;

    window.scrollTo({
        top: ratio * scrollMax,
        behavior,
    });
}

function handleProgressSeek(event) {
    if (!progress) return;
    if (suppressProgressClick) {
        suppressProgressClick = false;
        return;
    }
    seekProgress(getSeekRatio(event), 'smooth');
}

function handleProgressPointerDown(event) {
    if (!progress || event.button !== 0) return;
    event.preventDefault();
    isDraggingProgress = true;
    suppressProgressClick = true;
    progress.dataset.dragging = 'true';
    document.body.style.userSelect = 'none';
    progress.setPointerCapture?.(event.pointerId);
    seekProgress(getSeekRatio(event), 'auto');
}

function handleProgressPointerMove(event) {
    if (!isDraggingProgress) return;
    seekProgress(getSeekRatio(event), 'auto');
}

function handleWindowPointerMove(event) {
    if (!isDraggingProgress) return;
    seekProgress(getSeekRatio(event), 'auto');
}

function stopProgressDrag(event) {
    if (!isDraggingProgress) return;
    isDraggingProgress = false;
    document.body.style.userSelect = '';
    if (progress) {
        delete progress.dataset.dragging;
        if (event?.pointerId !== undefined) {
            progress.releasePointerCapture?.(event.pointerId);
        }
    }
}

if (progress) {
    progress.addEventListener('click', handleProgressSeek);
    progress.addEventListener('pointerdown', handleProgressPointerDown);
    progress.addEventListener('pointerup', stopProgressDrag);
    progress.addEventListener('pointercancel', stopProgressDrag);
}

window.addEventListener('pointermove', handleWindowPointerMove);
window.addEventListener('pointerup', stopProgressDrag);
window.addEventListener('pointercancel', stopProgressDrag);

window.addEventListener('kappa:pager-change', (event) => {
    if (!isFrontPageMode()) return;
    updateFrontPageProgress(event);
});

window.addEventListener('scroll', () => {
    if (isFrontPageMode()) return;
    updateDocumentProgress();
}, { passive: true });

window.addEventListener('resize', syncProgress);
window.addEventListener('load', syncProgress);
window.addEventListener('pageshow', syncProgress);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncProgress, { once: true });
} else {
    syncProgress();
}
