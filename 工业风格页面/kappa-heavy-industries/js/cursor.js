import { subscribePointer } from './pointer-service.js';

const root = document.documentElement;
const mxEl = document.getElementById("mx");
const myEl = document.getElementById("my");

subscribePointer(({ x, y }) => {
    root.style.setProperty("--cursor-x", `${x}px`);
    root.style.setProperty("--cursor-y", `${y}px`);

    if (mxEl) mxEl.textContent = String(Math.round(x)).padStart(4, "0");
    if (myEl) myEl.textContent = String(Math.round(y)).padStart(4, "0");
});
