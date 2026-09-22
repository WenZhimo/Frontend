# O EMPIRE! — WARD OFF THY ROT

这是一个根据 `C:\Users\LENOVO\Desktop\TODO\image.png`、`image-1.png`、`image-2.png`、`image-3.png` 制作的浏览器滤镜。它把参考图里的灰阶 CRT、网点抖动、暗角、扫描线和红色花朵绽放做成了可操作的小型视觉研究台。红色只从输入帧里提取并增强，不会凭空叠加红色噪声。

## 使用

直接打开 `index.html` 即可，无需安装依赖、无需启动开发服务器。

- 点击右侧四个 **FIELD STATE** 缩略图切换参考状态。
- 拖动 **BLOOM DENSITY** 改变红色花朵密度、花心亮度和画面抖动。
- **WARD / BLOOM / RAW** 切换三种滤镜通道。
- 在 **INPUT SOURCE** 中拖入图片或视频；视频会实时逐帧处理。
- **CANVAS / THREE** 会接入内置 Canvas 演示。Three.js 的 `renderer.domElement` 也是同一种 Canvas 输入。
- **PLAY LOOP** 或按空格键自动循环播放；方向键切换画面，`R` 恢复初始状态。
- **EXPORT FILTERED PNG** 下载当前输出 Canvas。
- `assets/references` 保存了本次使用的四张参考图副本。

页面只依赖浏览器原生 HTML、CSS 和 Canvas。

## 在 Canvas / Three.js 项目中接入

页面加载后会暴露一个全局桥接对象。把 Three.js 的 renderer canvas 交给它即可：

```js
// renderer 是 THREE.WebGLRenderer 实例
window.OEmpireFilterPanel.attachCanvas(renderer.domElement, 'THREE / LIVE');

// 需要把输出继续接到自己的合成流程时：
const filteredCanvas = window.OEmpireFilterPanel.getOutputCanvas();
```

如果不需要这个界面，也可以直接使用 `filter-core.js`：

```js
const filter = OEmpireFilter.create({ canvas: outputCanvas, options: { bloom: 0.72 } });
filter.setSource(renderer.domElement).render();
```
