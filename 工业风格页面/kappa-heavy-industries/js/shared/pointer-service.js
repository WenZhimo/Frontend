const pointerState = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    insideViewport: false,
    pointerType: null,
    isPrimary: true,
    target: null,
    timeStamp: performance.now(),
};

const subscribers = new Set();
let frameScheduled = false;

function getSnapshot() {
    return { ...pointerState };
}

function notifySubscribers() {
    frameScheduled = false;
    const snapshot = getSnapshot();
    subscribers.forEach((callback) => callback(snapshot));
}

function scheduleNotify() {
    if (frameScheduled) return;
    frameScheduled = true;
    requestAnimationFrame(notifySubscribers);
}

function updatePointerState(event) {
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
    pointerState.insideViewport = true;
    pointerState.pointerType = event.pointerType || 'mouse';
    pointerState.isPrimary = event.isPrimary ?? true;
    pointerState.target = event.target ?? null;
    pointerState.timeStamp = event.timeStamp ?? performance.now();
    scheduleNotify();
}

window.addEventListener('pointermove', updatePointerState, { passive: true });
window.addEventListener('pointerdown', updatePointerState, { passive: true });
window.addEventListener('pointerleave', (event) => {
    pointerState.insideViewport = false;
    pointerState.pointerType = event.pointerType || pointerState.pointerType;
    pointerState.isPrimary = event.isPrimary ?? pointerState.isPrimary;
    pointerState.target = null;
    pointerState.timeStamp = event.timeStamp ?? performance.now();
    scheduleNotify();
}, { passive: true });

export function getPointerState() {
    return getSnapshot();
}

export function subscribePointer(callback, { emitCurrent = true } = {}) {
    if (typeof callback !== 'function') {
        return () => {};
    }

    subscribers.add(callback);

    if (emitCurrent) {
        callback(getSnapshot());
    }

    return () => {
        subscribers.delete(callback);
    };
}

export function getLocalPoint(element, state = getPointerState()) {
    if (!element) {
        return {
            x: 0,
            y: 0,
            rect: null,
            inside: false,
        };
    }

    const rect = element.getBoundingClientRect();
    const x = state.x - rect.left;
    const y = state.y - rect.top;
    const inside = state.insideViewport && rect.width > 0 && rect.height > 0 && x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

    return {
        x,
        y,
        rect,
        inside,
    };
}
