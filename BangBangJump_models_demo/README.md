# BangBangJump 模型预览

本文件夹包含从已获授权的 `BangBangJump-v1.0.2-win.zip` 中恢复并导出的模型资源。

## 来源标注

这些资源来自视频网站 BiliBili 的 UP 主 [四四四四四老师](https://space.bilibili.com/325899087)。本目录中的提取、转换和静态演示页均基于已获授权的 `BangBangJump-v1.0.2-win.zip` 制作。

## 目录内容

- `models/*.glb`：已导出的浏览器可预览 GLB 模型文件，共 12 个角色。
- `assets/icons/`：演示页使用的应用图标和角色头像。
- `vendor/model-viewer.min.js`：本地保存的 `<model-viewer>` 组件，演示页不依赖外部 CDN。
- `index.html`：静态网页演示页，可切换角色、旋转预览并下载 GLB。
- `启动预览.bat`：双击后一键启动本地服务并打开演示页。
- `start_preview.bat`：英文文件名的一键启动脚本。
- `pck_manifest.tsv`：解析得到的 PCK 文件清单。

以下目录是本地提取和验证过程产生的工作文件，通常不提交到仓库：

- `source/`：从 ZIP 中解压出的原始 `.pck` 和 `.exe`。
- `recovered/`：GDRETools 恢复出的 Godot 项目内容，包含反编译脚本和转换后的 PNG 资源。
- `extracted/`：从 PCK 直接解析导出的原始资源。
- `tools/`：本地使用的 GDRETools 程序。
- `chrome-headless-profile/`、`page-check*.png`、`*.log`：浏览器验证缓存、截图和日志。

## 已导出模型

- `Anon.glb`
- `Mutsumi.glb`
- `MutsumiLight.glb`
- `MutsumiStage.glb`
- `Nyamu.glb`
- `Rana.glb`
- `Sakiko1.glb`
- `Soyo.glb`
- `Taki.glb`
- `Tomori.glb`
- `Uika.glb`
- `Umiri.glb`

## 使用方式

双击 `启动预览.bat`，脚本会自动启动本地静态服务并打开演示页：

`http://127.0.0.1:8123/index.html`

预览结束后，关闭脚本启动的服务窗口即可。

## 技术说明

原始角色仓库文件位于 `assets/char_vault/high/*.bin`，格式为 Godot `GDEC` 加密资源。提取过程中通过 GDRETools 恢复 Godot 项目，并依据恢复出的 `character_vault.gd` 加载逻辑调用 Godot 运行时解密、解压并导出 GLB。
