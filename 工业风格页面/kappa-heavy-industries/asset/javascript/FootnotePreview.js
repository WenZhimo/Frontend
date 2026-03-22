/**
 * 脚注预览模块 (Traditional Script Version)
 * 用法: new FootnotePreview('作用域ID', '脚注类名', '内容容器ID');
 */
class FootnotePreview {
    /**
     * @param {string} scopeContainerId - 作用容器的ID (在该容器内查找脚注链接)
     * @param {string} footnoteClass - 脚注元素的类名 (例如 'footnote-ref')
     * @param {string} contentContainerId - 内容容器的ID (在该容器内查找具体内容)
     */
    constructor(scopeContainerId, footnoteClass, contentContainerId) {
        this.scopeContainer = document.getElementById(scopeContainerId);
        this.footnoteClass = footnoteClass;
        this.contentContainer = document.getElementById(contentContainerId);

        this.previewBox = null;
        this.contentInner = null;

        // 安全检查
        if (!this.scopeContainer || !this.contentContainer) {
            console.warn(`FootnotePreview: 容器未找到 (${scopeContainerId} 或 ${contentContainerId})`);
            return;
        }

        this._init();
    }

    _init() {
        // 1. 创建 DOM 结构
        this._createPreviewBox();

        // 2. 查找并绑定事件
        // 注意：这里同时查找 class 名匹配的元素，以及它们内部的 <a> 标签
        const footnotes = this.scopeContainer.getElementsByClassName(this.footnoteClass);

        Array.from(footnotes).forEach(fn => {
            // 有些结构是 <sup class="footnote"><a href="#fn1">1</a></sup>
            // 有些是 <a class="footnote" href="#fn1">1</a>
            const link = fn.tagName === 'A' ? fn : fn.querySelector('a');

            if (link) {
                const href = link.getAttribute('href');
                if (href && href.startsWith('#')) {
                    const contentId = href.substring(1); // 去掉 #

                    // 绑定事件
                    // 使用 mouseenter/mouseleave 避免冒泡问题
                    fn.addEventListener('mouseenter', () => this._show(contentId));
                    fn.addEventListener('mouseleave', () => this._hide());
                }
            }
        });
    }

    _createPreviewBox() {
        // 如果已经存在（单例模式），不再创建
        if (document.querySelector('.footnote-preview-box')) return;

        // 1. 主容器
        this.previewBox = document.createElement('div');
        this.previewBox.className = 'footnote-preview-box';

        // 2. 角标装饰层 (工业风四角)
        const corners = document.createElement('div');
        corners.className = 'footnote-corners';
        corners.innerHTML = `
            <span class="tl"></span><span class="tr"></span>
            <span class="bl"></span><span class="br"></span>
        `;

        // 3. 内容包装层
        this.contentInner = document.createElement('div');
        this.contentInner.className = 'footnote-content';

        // 组装并挂载到 body
        this.previewBox.appendChild(corners);
        this.previewBox.appendChild(this.contentInner);
        document.body.appendChild(this.previewBox);
    }

    _show(contentId) {
        if (!this.previewBox) return;

        const contentNode = this.contentContainer.querySelector(`#${contentId}`);
        // 如果找不到对应内容，就不弹窗
        if (!contentNode) return;

        // 1. 填入内容 (直接取 innerHTML)
        this.contentInner.innerHTML = contentNode.innerHTML;

        // 2. 计算目标尺寸
        // 先设为 auto 以获取自然撑开的大小
        this.previewBox.style.width = 'auto';
        this.previewBox.style.height = 'auto';

        // 这里的 340 是 max-width 的稍微大一点的冗余值，或者直接用 scrollWidth
        // 建议在 CSS 里限制 .footnote-content 的 max-width
        const rect = this.contentInner.getBoundingClientRect();
        // 适当增加一点 padding 的 buffer，或者直接用 rect.width
        const targetWidth = Math.ceil(rect.width);
        const targetHeight = Math.ceil(rect.height);

        // 3. 重置状态为 0 (为动画做准备)
        this.previewBox.style.width = '0px';
        this.previewBox.style.height = '0px';

        // 强制回流 (Reflow)
        void this.previewBox.offsetHeight;

        // 4. 执行展开动画
        requestAnimationFrame(() => {
            this.previewBox.classList.add('active');

            // 动态设置具体的像素值，触发 CSS transition
            this.previewBox.style.width = targetWidth + 'px';
            this.previewBox.style.height = targetHeight + 'px';
        });
    }

    _hide() {
        if (!this.previewBox) return;

        this.previewBox.classList.remove('active');

        // 收缩回 0
        this.previewBox.style.width = '0px';
        this.previewBox.style.height = '0px';
    }
}

// 暴露给全局，以便在 HTML 中使用 new FootnotePreview(...)
window.FootnotePreview = FootnotePreview;
