// 鼠标坐标追踪
const root = document.documentElement;
const mxEl = document.getElementById('mx');
const myEl = document.getElementById('my');

let x = window.innerWidth / 2;
let y = window.innerHeight / 2;
let ticking = false;

function update() {
    /* 1. 驱动背景网格发光 */
    root.style.setProperty('--cursor-x', x + 'px');
    root.style.setProperty('--cursor-y', y + 'px');

    /* 2. 更新页眉坐标显示 */
    if (mxEl) mxEl.textContent = x;
    if (myEl) myEl.textContent = y;

    ticking = false;
}

window.addEventListener('mousemove', e => {
    x = e.clientX;
    y = e.clientY;

    if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
    }
}, { passive: true });
