import { getLocalPoint, subscribePointer } from './shared/pointer-service.js';

const CARD_SELECTOR = '[data-homepage-intro-tilt]';
const PAGE_SELECTOR = '#page2';

let page = null;
let cards = [];
let unsubscribePointer = null;
let prefersReducedMotion = false;

function isPageActive() {
    return !!page && page.classList.contains('active');
}

function setVars(card, vars) {
    Object.entries(vars).forEach(([key, value]) => {
        card.style.setProperty(key, value);
    });
}

function resetCard(card) {
    setVars(card, {
        '--pointer-x': '50%',
        '--pointer-y': '50%',
        '--rotate-x': '0deg',
        '--rotate-y': '0deg',
        '--card-scale': '1',
        '--translate-y': '0px',
        '--pointer-from-center': '0',
        '--pointer-from-left': '0.5',
        '--pointer-from-top': '0.5',
        '--glare-opacity': '0',
        '--shine-opacity': '0',
    });
}

function resetAllCards() {
    cards.forEach(resetCard);
}

function updateCard(card, point) {
    const { rect, x, y, inside } = point;

    if (!rect || !inside || rect.width <= 0 || rect.height <= 0) {
        resetCard(card);
        return;
    }

    const ratioX = x / rect.width;
    const ratioY = y / rect.height;
    const percentX = Math.max(0, Math.min(100, ratioX * 100));
    const percentY = Math.max(0, Math.min(100, ratioY * 100));
    const centerX = ratioX - 0.5;
    const centerY = ratioY - 0.5;
    const pointerFromCenter = Math.min(1, Math.sqrt(centerX * centerX + centerY * centerY) / 0.7071);

    setVars(card, {
        '--pointer-x': `${percentX.toFixed(2)}%`,
        '--pointer-y': `${percentY.toFixed(2)}%`,
        '--rotate-x': `${(-centerY * 20.5).toFixed(2)}deg`,
        '--rotate-y': `${(centerX * 30.5).toFixed(2)}deg`,
        '--card-scale': '1.056',
        '--translate-y': '-2px',
        '--pointer-from-center': pointerFromCenter.toFixed(4),
        '--pointer-from-left': ratioX.toFixed(4),
        '--pointer-from-top': ratioY.toFixed(4),
        '--glare-opacity': '0.42',
        '--shine-opacity': '0.58',
    });
}

function handlePointer(snapshot) {
    if (!snapshot.insideViewport || !isPageActive() || document.hidden) {
        resetAllCards();
        return;
    }

    cards.forEach((card) => {
        updateCard(card, getLocalPoint(card, snapshot));
    });
}

function handleVisibilityChange() {
    if (document.hidden) {
        resetAllCards();
    }
}

function handlePagerChange() {
    if (!isPageActive()) {
        resetAllCards();
    }
}

function initHomepageIntroTilt() {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    page = document.querySelector(PAGE_SELECTOR);
    cards = Array.from(document.querySelectorAll(CARD_SELECTOR));

    if (!page || !cards.length) return;

    resetAllCards();

    unsubscribePointer = subscribePointer(handlePointer, { emitCurrent: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('kappa:pager-change', handlePagerChange);
    window.addEventListener('pagehide', resetAllCards);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomepageIntroTilt, { once: true });
} else {
    initHomepageIntroTilt();
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        resetAllCards();
    }
});
