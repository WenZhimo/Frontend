# [ 河童重工机密档案系统 / KAPPA_HEAVY_INDUSTRIES_THEME ]

**版本:** v1.0.0 (终端初始构建版)
**代号:** "极地空想家"
**类型:** WordPress 独立定制主题

> [SYS_MSG]: 欢迎接入河童重工主控终端。本系统专为高保真信息归档、跨频段精神共鸣及异常实体观测而设计。请严格遵守以下操作协议。

---

## 💠 核心系统特性 (System Features)

- **全域 HUD 终端视效**：深空墨绿底色，终端青（Cyan）与工业金（Gold）交互高亮，摒弃现代圆润 UI，采用纯正的硬核直角与扫描线质感。
- **全封闭沉浸式工作台**：WordPress 后台区块编辑器（Gutenberg）已深度接管，实现与前台 1:1 的“暗黑代码模式”所见即所得。
- **异常防御机制**：内置防碎图异步头像加载、防抖动物理隔离文本层、以及穿透最高层级的系统管理员权限提升。
- **交互式数据流转**：带有充能反馈的 `[ PLAY_AUDIO ]`、`[ ARCHIVE ]` 终端按钮，以及带有触底反馈的相邻档案检索模块。

---

## 🛠️ 排版与操作协议 (Usage Protocols)

本主题包含多种定制化的前端组件，请操作员在发布档案时参考以下用法：

### 1. 高优先级摘要 (System Summary)

在文章正文开头，如果需要提炼重点或书写引言，请直接使用系统的 **“引用 (Blockquote)”** 区块。

- **效果**：系统会自动将其渲染为带有工业金左边框、斜体大字号的数据块，并在右上角自动打上 `[ SYS_SUMMARY ]` 标签。
- **交互**：鼠标悬停时，区块将充能泛起青色幽光，标签自动切换为 `[ DATA_ACTIVE ]`。

### 2. 终端指令按钮 (Terminal Button)

在任何需要跳转的地方（如首页切屏、文章内链），请给 `<a>` 标签添加 `hud-terminal-btn` 类名，以调用标准的极客按钮涂装。

```html
<a href="/your-link" class="hud-terminal-btn" title="悬停提示">
    <span class="cmd-prompt">C:\></span> 执行指令名称
    <span class="btn-eng">[ COMMAND ]</span>
</a>
```

### 3. 背景焦点校准 (Focal Point Calibration)

在首页大图切屏中，如果图片过高导致关键内容（如人物面部）被裁剪，请手动调整内联样式中的 `background` 定位参数。

```css
/* 修改 center 后的百分比来控制垂直焦点 (0% 为最顶端，100% 为最底端) */
background: ... url("...") center 25% / cover no-repeat;
```

### 4. 故障文字引擎 (Glitch Text Engine)

首页主控面板使用了专门研发的 `glitch-text.js` 引擎。

- **调用要求**：为了防止自定义字体加载引起的“排版抖动”，故障文字的容器 **必须** 放置在物理隔离区（`slogan-quarantine-zone`）内，并开启绝对定位解耦。
- **启动指令**：

```javascript
// 示例调用参数
createGlitch("#Homepage-Slogan", {
    phrases: ["待显示的短语 1", "待显示的短语 2"],
    obfu_chars: "░▒▓▖▗▘▙▚▛▜▝▞▟", // 乱码字符集
    heightMode: "wrapper", // 必须开启 wrapper 保护模式
    color: "#988b32", // 工业金
    fontFamily: "Smooch,华康金文体W3",
    fontSize: "clamp(24px, 10vw, 100px)", // 动态缩放字体
    disp_time: 3000, // 停留时间 (ms)
});
```

---

## ⚠️ 系统维护与排障 (Troubleshooting)

### 薛定谔的缓存 (Caching Layers)

由于本系统涉及大量底层 CSS 覆写：

1.  **前端未生效**：通常是服务器（Nginx/主机商）的访客快照缓存导致。请登录主机面板点击“清除静态缓存 (Purge Cache)”，或在网址后加 `/?v=001` 进行穿透测试。
2.  **后台编辑器未生效**：Gutenberg 编辑器的 CSS 缓存极为顽固，修改 `editor-style.css` 后，必须在编辑器页面按下 `Ctrl + F5` 强制刷新。

### 移动端响应式 (Mobile Responsive)

- **页眉导航**：移动端下，绝对定位的悬浮格言（如“让频率震荡...”）会自动降级回正常文档流，排布于按钮下方，请放心使用，无需担心遮挡。
- **档案翻页**：文章底部的“查阅旧档/新档”模块在屏幕宽度 `< 768px` 时会自动折叠为上下双轨排列。

---

**[ END OF FILE ]** _May your frequencies oscillate, and the noise fall silent._
