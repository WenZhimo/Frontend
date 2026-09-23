# O EMPIRE! — WARD OFF THY ROT

这是一个根据 `C:\Users\LENOVO\Desktop\TODO\image.png`、`image-1.png`、`image-2.png`、`image-3.png` 制作的浏览器滤镜与 3D 场景演示。输入图像/视频仍可走灰阶花朵提取滤镜；**3D DITHERED SCENE** 直接用 Three.js 渲染连续的低多边形 Mesh，再把已经栅格化的画面交给全屏 ordered dithering，在中间灰阶之间重建更多层次。

## 使用

直接打开 `index.html` 即可，无需安装依赖、无需启动开发服务器。

- 点击右侧四个 **FIELD STATE** 缩略图切换参考状态。
- 拖动 **BLOOM DENSITY** 改变红色花朵密度和花心亮度。
- **WARD / BLOOM / RAW** 切换三种滤镜通道。
- 在 **INPUT SOURCE** 中拖入图片或视频；视频会实时逐帧处理。
- **CANVAS / THREE** 会接入内置 Canvas 演示。Three.js 的 `renderer.domElement` 也是同一种 Canvas 输入。
- **3D DITHERED SCENE** 默认显示一座跨越黑暗深渊的黑白灰石拱桥；桥下没有铺地，三处拱洞由连续的桥身侧墙真实挖空。切换 **BRIDGE / SETTLEMENT** 可检查桥或原有村落模型。
- 拖动预览画面可环绕旋转相机，滚轮缩放，`Shift`+拖动或右键拖动可平移；**RESET CAMERA** 恢复默认取景。
- 3D 模型先渲染到低分辨率方形像素网格，再最近邻放大。每个像素按模型亮度映射为有限灰阶，方形 Bayer dithering 只重建中间灰阶，深黑和高亮保持稳定。**PIXEL SIZE** 调整映射像素大小；**IMAGE DITHER** 调整中间灰阶的抖动量。
- **RANDOMIZE SIGNAL** 在 3D 模式下更新 dither 强度。
- **PLAY LOOP** 或按空格键自动循环播放；方向键切换画面，`R` 恢复初始状态。
- **EXPORT FILTERED PNG** 下载当前输出 Canvas。
- `assets/references` 保存了本次使用的四张参考图副本。

页面只依赖浏览器原生 HTML、CSS、Canvas 和随项目保存的 Three.js 模块（`assets/vendor/three.module.js`）。

## 在 Canvas / Three.js 项目中接入

页面加载后会暴露一个全局桥接对象。把 Three.js 的 renderer canvas 交给它即可：

```js
// renderer 是 THREE.WebGLRenderer 实例
window.OEmpireFilterPanel.attachCanvas(renderer.domElement, 'THREE / LIVE');

// 需要把输出继续接到自己的合成流程时：
const filteredCanvas = window.OEmpireFilterPanel.getOutputCanvas();

// 直接打开项目内置的 3D 实体模型与画面层 dither：
window.OEmpireFilterPanel.useDitheredScene();
const ditheredScene = window.OEmpireFilterPanel.getDitheredScene();
ditheredScene.setOptions({ dither: 0.72 });
ditheredScene.setOptions({ pixelSize: 6 });
ditheredScene.setScene('bridge'); // or 'map' for the settlement study
ditheredScene.resetCamera();
```

如果不需要这个界面，也可以直接使用 `filter-core.js`：

```js
const filter = OEmpireFilter.create({ canvas: outputCanvas, options: { bloom: 0.72 } });
filter.setSource(renderer.domElement).render();
```
