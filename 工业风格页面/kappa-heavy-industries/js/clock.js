// 时钟（24小时，固定格式）
const clockEl = document.getElementById('clock');

function tick() {
    if (!clockEl) return;
    const d = new Date();
    // 固定两位数
    const pad = n => String(n).padStart(2, '0');
    clockEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

tick();
setInterval(tick, 1000);
