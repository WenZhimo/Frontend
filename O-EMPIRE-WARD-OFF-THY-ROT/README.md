# O EMPIRE! — WARD OFF THY ROT

这是一个根据 `C:\Users\LENOVO\Desktop\TODO\image.png`、`image-1.png`、`image-2.png`、`image-3.png` 制作的浏览器滤镜与 3D 场景演示。参考图保留红色花朵提取滤镜；上传的图片、视频、Canvas / Three.js Canvas 和 **3D DITHERED SCENE** 共用同一条黑白灰像素管线：先按方形像素网格采样，再用屏幕空间 Bayer 抖动重建中间灰阶，黑和白两端保持稳定。

## 使用

直接打开 `index.html` 即可，无需安装依赖、无需启动开发服务器。

- 点击右侧四个 **FIELD STATE** 缩略图切换参考状态。
- 拖动 **BLOOM DENSITY** 改变红色花朵密度和花心亮度。
- **WARD / BLOOM / RAW** 切换三种滤镜通道。
- 在 **INPUT SOURCE** 中拖入图片或视频；画面会变成黑白灰方形像素，视频实时逐帧采样。
- **CANVAS / THREE** 会接入内置 Canvas 演示。Three.js 的 `renderer.domElement` 也会进入相同像素与抖动流程。
- **3D DITHERED SCENE** 默认显示一座跨越黑暗深渊的石拱桥；桥下没有铺地，三处拱洞由连续的桥身侧墙真实挖空。切换 **BRIDGE / SETTLEMENT** 可查看拱桥和带有坡地、村道、石墙、教堂、瞭望塔与木屋的村落。
- 拖动预览画面可环绕旋转相机，滚轮缩放，`Shift`+拖动或右键拖动可平移；**RESET CAMERA** 恢复默认取景。
- 3D 模型用透视相机渲染到低分辨率方形像素网格，再最近邻放大。石材、木墙、雪面、针叶与屋顶使用世界空间灰度纹理细节；每个像素再映射为更丰富的灰阶，方形 Bayer dithering 只重建中间灰阶，深黑和高亮保持稳定。**PIXEL SIZE** 默认 `02`，调整映射像素大小；**IMAGE DITHER** 调整中间灰阶的抖动量。
- 场景由环境光、半球天光、带投影的主方向光和弱补光共同照明；几何体接收并投射阴影，静态阴影贴图在切换桥与村落时更新，再随场景一起像素化。
- **RANDOMIZE SIGNAL** 在 3D 模式下更新 dither 强度。
- **PLAY LOOP** 或按空格键自动循环播放；方向键切换画面，`R` 恢复初始状态。
- **EXPORT FILTERED PNG** 下载当前输出 Canvas。
- `assets/references` 保存了本次使用的四张参考图副本。

页面只依赖浏览器原生 HTML、CSS、Canvas 和随项目保存的 Three.js 模块（`assets/vendor/three.module.js`）。

## 在 Canvas / Three.js 项目中接入

页面加载后会暴露一个全局桥接对象。把 Three.js 的 renderer canvas 交给它即可：

```js
// renderer 是 THREE.WebGLRenderer 实例；输入会走黑白灰方形像素与 Bayer 抖动流程
window.OEmpireFilterPanel.attachCanvas(renderer.domElement, 'THREE / LIVE');

// 需要把输出继续接到自己的合成流程时：
const filteredCanvas = window.OEmpireFilterPanel.getOutputCanvas();

// 直接打开项目内置的 3D 实体模型与画面层 dither：
window.OEmpireFilterPanel.useDitheredScene();
const ditheredScene = window.OEmpireFilterPanel.getDitheredScene();
ditheredScene.setOptions({ dither: 0.72 });
ditheredScene.setOptions({ pixelSize: 2 });
ditheredScene.setScene('bridge'); // or 'map' for the settlement study
ditheredScene.resetCamera();

// 图片、视频或 Canvas 也可以直接送入同一条像素流程：
ditheredScene.setInputSource(imageOrVideoOrCanvas);
```

如果不需要这个界面，也可以直接使用 `filter-core.js`：

```js
const filter = OEmpireFilter.create({ canvas: outputCanvas, options: { bloom: 0.72 } });
filter.setSource(renderer.domElement).render();
```
