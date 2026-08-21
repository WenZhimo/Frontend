# Workers

预览和导出渲染现在通过 `render-worker.ts` 接入 `OffscreenCanvas` 与 Web Worker，把重像素处理从 UI 交互线程移开。

`render-client.ts` 负责主线程调用、取消旧任务、克隆可转移的 `ImageBitmap`，并在不支持 Worker / OffscreenCanvas 的环境下降级到主线程渲染。