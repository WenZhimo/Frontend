# Phosphor Renderer

`phosphor` 是磷光矩阵视觉验证项目的可复用渲染库。它包含两类入口：

- `PhosphorRenderer`：面向网页 DOM 的覆盖层渲染器，会保留原 DOM 的可访问性。
- `PhosphorMediaRenderer`：面向本地图片、GIF、SVG、视频、canvas、ImageBitmap 的直接 WebGL 纹理渲染器。

项目视觉目标来自：

- `磷光矩阵视觉规范.md`
- `磷光矩阵技术实施规格.md`

## DOM 覆盖层入口

```js
import { PhosphorRenderer } from "./phosphor/renderer/phosphor-renderer.js";

const renderer = new PhosphorRenderer({
  target: document.querySelector("[data-shader-target='page']"),
  mount: document.querySelector("[data-shader-mount]"),
  backend: "auto",
});

renderer.start();
renderer.stop();
renderer.updateConfig({ matrixPitch: 6 });
renderer.setQuality("medium");
renderer.destroy();
```

## 本地媒体入口

当输入源是 `HTMLImageElement`、`HTMLVideoElement`、`HTMLCanvasElement` 或 `ImageBitmap` 时，优先使用 `PhosphorMediaRenderer`。它不重建 DOM，不做 `html2canvas` 截屏，而是把资源直接上传为 WebGL 纹理，再执行矩阵、发光、bloom、暗场、噪声和镜头扩散 pass。

```js
import { PhosphorMediaRenderer } from "./phosphor/media-renderer.js";

const renderer = new PhosphorMediaRenderer({
  source: document.querySelector("video"),
  mount: document.querySelector("canvas"),
  quality: "high",
  fit: "contain",
});

renderer.start();
renderer.setSource(document.querySelector("img"), { sourceUpdateMode: "static" });
renderer.updateConfig({ matrixPitch: 5, bloomStrength: 1.2 });
renderer.destroy();
```

如果页面需要直接双击打开，不经过本地服务器，可以使用全局脚本版本：

```html
<script src="phosphor/media-renderer.global.js"></script>
<script>
  const renderer = new window.Phosphor.PhosphorMediaRenderer({
    source: document.querySelector("canvas"),
    mount: document.querySelector("#output"),
    quality: "high",
    fit: "contain",
  });

  renderer.start();
</script>
```

`sourceUpdateMode` 可选：

- `auto`：视频和 canvas 按帧更新，图片静态更新。
- `realtime`：每帧上传源纹理。
- `static`：只在换源或手动渲染时更新。

`fit` 可选：

- `contain`：保持比例完整显示画面，并尽量最大化利用输出画布。
- `cover`：保持比例铺满输出画布，会裁切超出部分。
- `fit-width`：保持比例按宽度填满，必要时裁切上下。
- `fit-height`：保持比例按高度填满，必要时裁切左右。
- `stretch`：拉伸到输出画布，会改变比例。

## 本地演示页

`media-demo.html` 可以直接双击打开：

```text
D:\盒子\HTML\磷光矩阵\media-demo.html
```

完全独立的交付版是 `磷光矩阵媒体处理单文件版.html`。它内联页面、样式、渲染库和控制脚本，不依赖 `phosphor/` 或 `test/` 目录。

也可以从项目上级目录启动静态服务：

```powershell
python -m http.server 8766 --bind 127.0.0.1 --directory "D:\盒子\HTML"
```

然后打开：

```text
http://127.0.0.1:8766/磷光矩阵/media-demo.html
```

演示页支持：

- 拖拽或选择本地图片、GIF、SVG、视频文件。
- 双击 `file://` 打开时，整页拦截拖拽文件，避免浏览器直接打开资源标签页。
- GIF 优先使用 `ImageDecoder` 解码动画帧，并按绝对时间轴绘制到隐藏 canvas，切换标签后仍能继续播放。
- SVG 通过 `<img>` 预览，并持续栅格化到 canvas 后交给 WebGL，支持动画 SVG 与透明度。
- 切换内置动态 canvas、示例图像和示例视频。
- 调整质量、矩阵间距、bloom、扩散、暗部噪声和画面适配模式。
- 查看 backend、输入尺寸、输出画布尺寸和估算 FPS。

## 生成产物

`phosphor/media-renderer.js` 和 shader 源是库的唯一源文件。下面两个文件是生成产物，不要手工修改：

- `phosphor/media-renderer.global.js`
- `磷光矩阵媒体处理单文件版.html`

修改库源、shader、`media-demo.html` 或 `test/phosphor-media-demo.js` 后，必须重新生成：

```powershell
node tools/build-media-demo.mjs
```

## 检查命令

```powershell
node --check test/phosphor-media-demo.js
node --input-type=module -e "await import('./phosphor/media-renderer.js'); console.log('modules ok')"
node tools/build-media-demo.mjs
node test/media-demo-smoke.mjs
```

单文件版生成后，应确认不再引用外部 demo 脚本：

```powershell
Select-String -LiteralPath '磷光矩阵媒体处理单文件版.html' -Pattern 'src="phosphor|src="test/' -Quiet
```

期望输出为空或 `False`。

## 模块映射

| 模块 | 职责 |
| --- | --- |
| `media-renderer.js` | 直接媒体资源渲染入口 |
| `renderer/phosphor-renderer.js` | DOM 覆盖层渲染入口 |
| `renderer/webgl/webgl-pipeline.js` | WebGL2 纹理、矩阵、发光、bloom、合成 pass |
| `renderer/webgl/shader-sources.js` | WebGL shader 源码 |
| `renderer/webgl/gl-utils.js` | WebGL 资源与纹理工具 |
| `renderer/source-sampler.js` | DOM 模式的 CPU 源采样 |
| `renderer/phosphor-pipeline.js` | Canvas2D fallback 管线 |

## 限制

- 普通网页不能直接读取浏览器合成后的视口 framebuffer，所以 DOM 覆盖层仍需要源重建。
- 媒体模式更适合视频、图片、GIF、SVG、canvas、本地素材处理，因为输入可以直接进入 GPU 纹理。
- `contain`、`cover`、`fit-width`、`fit-height` 都保持原始比例；只有 `stretch` 会改变比例。
