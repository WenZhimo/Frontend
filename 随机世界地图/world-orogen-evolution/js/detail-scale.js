// 非线性细节滑块映射（幂曲线，p=5）。
// 滑块位置 0–1000 映射到细节 2,000–2,560,000。
// 在常用范围提供更宽控制；旧最大值（640K）约位于 76%。

const MIN = 5000, MAX = 2560000, RANGE = MAX - MIN, STEPS = 1000, P = 5;

export function detailFromSlider(pos) {
    const t = pos / STEPS;
    return Math.round((MIN + RANGE * Math.pow(t, P)) / 1000) * 1000;
}

export function sliderFromDetail(n) {
    return Math.round(STEPS * Math.pow(Math.max(0, n - MIN) / RANGE, 1 / P));
}
