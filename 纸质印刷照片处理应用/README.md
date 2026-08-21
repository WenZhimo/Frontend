# 纸质印刷照片处理应用

浏览器内运行的照片处理 Web 应用原型，目标是把普通照片处理成具有纸张、油墨、半调网点、轻微错版和颗粒质感的印刷风格图片。

## 当前阶段

当前处于 Phase 2：串行模块实现与集成验收。

已完成的第一版核心能力：

- `src/image-pipeline/*`：Canvas / ImageData 纸质印刷渲染管线，包含纸纹、基础色分层网点、CMYK 保真筛网 / proof、油墨叠印、颗粒、错版和可选墨点形状。
- `src/presets/*`：7 个默认预设、纸张 profile 和油墨色板，包含 CMYK 保真分色的 `现实彩印`，以及保留旧褪色观感的 `褪色彩印`。
- `src/export/*`：PNG 导出接口。
- `src/app/*`：上传、拖拽、预设切换、重置、完整可见参数面板、分色模式、动态色彩通道、自定义预设保存、处理后 / 原图 / 对比预览和导出。
- `src/workers/*`：预览和导出渲染 Worker，把重像素处理从 UI 交互线程移开。
- `docs/集成验收报告.md`：本地浏览器冒烟和视觉验收记录。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm run typecheck
npm run build
npm run smoke
npm run smoke:real
npm run smoke:real:gallery
npm run smoke:real:preset-gallery
```

`npm run smoke:real` 是本机真实照片验证：它读取 `tests/fixtures/local-only/real-photos/` 下的 `.jpg` / `.jpeg` / `.png` / `.webp`，该目录已被 `.gitignore` 排除，不会把大图样本提交进仓库。

`npm run smoke:real:gallery` 会在同一条真实照片验证链路上额外生成原图 / 处理后对照审阅页和 contact sheet，输出到 `tests/fixtures/local-only/real-photo-gallery/`，同样不会提交进仓库。

`npm run smoke:real:preset-gallery` 会生成 5 张真实照片 × 7 个默认预设的矩阵审阅页，输出到 `tests/fixtures/local-only/real-photo-preset-gallery/`，用于比较所有默认预设在真实照片上的印刷质感差异。

真实照片矩阵的初步观察记录在 `docs/真实照片预设矩阵观察.md`，当前 Phase 2 的人工验收决策入口记录在 `docs/真实照片验收决策备忘.md`。

## 第一版目标

- 本地上传图片。
- 选择至少 4 个印刷风格预设。
- 参数变化能产生可见视觉差异。
- 支持纸张颜色调整、墨点形状选择和色彩通道新增 / 移除。
- 支持保存当前所有可见参数为自定义预设，并在本机浏览器中恢复使用。
- 支持原图、处理后和左右对比预览。
- 支持将当前预设的参数和预览模式重置为默认状态。
- 结果包含半调网点、颗粒、纸张纹理和轻微错版。
- 支持 PNG 导出。
