# O EMPIRE! — WARD OFF THY ROT

这是一个根据 `C:\Users\LENOVO\Desktop\TODO\image.png`、`image-1.png`、`image-2.png`、`image-3.png` 制作的浏览器滤镜与 3D 场景演示。输入图像/视频仍可走灰阶花朵提取滤镜；**3D DITHERED SCENE** 直接用 Three.js 渲染连续的低多边形 Mesh，再把已经栅格化的画面交给全屏 ordered dithering，在中间灰阶之间重建更多层次。

## 使用

直接打开 `index.html` 即可，无需安装依赖、无需启动开发服务器。

- 点击右侧四个 **FIELD STATE** 缩略图切换参考状态。
- 拖动 **BLOOM DENSITY** 改变红色花朵密度和花心亮度。
- **WARD / BLOOM / RAW** 切换三种滤镜通道。
- 在 **INPUT SOURCE** 中拖入图片或视频；视频会实时逐帧处理。
- **CANVAS / THREE** 会接入内置 Canvas 演示。Three.js 的 `renderer.domElement` 也是同一种 Canvas 输入。
- **3D DITHERED SCENE** 默认显示一座黑白灰石桥：桥身两侧是带三个真实拱洞的连续挤出 Mesh，桥面、桥台与护栏也是实体模型。切换 **BRIDGE / SETTLEMENT** 可检查桥或原有村落模型。
- **IMAGE DITHER** 控制最终画面层的方形 ordered dithering。深黑和高亮区域保持稳定，只有中间灰阶参与灰度重建；**RANDOMIZE SIGNAL** 只更新 dither 强度。
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
ditheredScene.setScene('bridge'); // or 'map' for the settlement study
```

如果不需要这个界面，也可以直接使用 `filter-core.js`：

```js
const filter = OEmpireFilter.create({ canvas: outputCanvas, options: { bloom: 0.72 } });
filter.setSource(renderer.domElement).render();
```
