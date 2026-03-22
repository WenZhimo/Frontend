// ===============================
// 自动容器样式初始化
// ===============================
function initContainerStyle(el) {
    if (el.__glitch_inited__) return;
    el.__glitch_inited__ = true;

    const style = el.style;

    style.whiteSpace = 'pre-wrap';
    style.transition = 'height 0.3s ease';
    style.overflow = 'hidden';
    style.margin = '15px 0';
    // style.minHeight = '1.5em'; // 这一行可以在 wrapper 模式下移除，或者保留作为兜底
    style.lineHeight = '1.2';
    style.textAlign = 'center';

    // 确保是块级元素
    if (getComputedStyle(el).display === 'inline') {
        style.display = 'block';
    }
}

//用于判断是不是字体直链
function isFontFile(url) {
    return /\.(woff2?|ttf|otf)(\?.*)?$/i.test(url);
}

//字体加载函数
async function loadFontForElement(el, fontConfig) {
    if (!fontConfig || !fontConfig.url || !fontConfig.name) return;

    const { name, url } = fontConfig;
    el.style.visibility = 'hidden';

    if (isFontFile(url)) {
        const font = new FontFace(name, `url(${url})`);
        await font.load();
        document.fonts.add(font);
    } else {
        const cssText = await fetch(url).then(r => r.text());
        const style = document.createElement('style');
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    await document.fonts.ready;
    el.style.fontFamily = `'${name}', ${el.style.fontFamily || 'sans-serif'}`;
    el.style.visibility = '';
}

// ===============================
// 核心类：TextScramble
// ===============================
class TextScramble {
    constructor(el, chars) {
        this.el = el;
        this.chars = chars || "░▒▓▖▗▘▙▚▛▜▝▞▟";
        this.update = this.update.bind(this);
    }

    setText(newHtml, config = {}) {
        const oldText = this.el.innerText;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const targetVisibleText = tempDiv.innerText;
        const length = Math.max(oldText.length, targetVisibleText.length);
        const promise = new Promise(resolve => this.resolve = resolve);

        this.queue = [];
        this.finalHtml = newHtml;

        const start_time = config.start_time || 40;
        const end_time = config.end_time || 40;

        for (let i = 0; i < length; i++) {
            const from = oldText[i] || '';
            const to = targetVisibleText[i] || '';
            const start = Math.floor(Math.random() * start_time);
            const end = start + Math.floor(Math.random() * end_time);
            this.queue.push({ from, to, start, end });
        }

        cancelAnimationFrame(this.frameRequest);
        this.frame = 0;
        this.update();
        return promise;
    }

    update() {
        let output = '';
        let complete = 0;
        for (let i = 0; i < this.queue.length; i++) {
            let { from, to, start, end, char } = this.queue[i];
            if (this.frame >= end) {
                complete++;
                output += to;
            } else if (this.frame >= start) {
                if (!char || Math.random() < 0.28) {
                    char = this.randomChar();
                    this.queue[i].char = char;
                }
                output += `<span class="dud">${char}</span>`;
            } else {
                output += from;
            }
        }
        this.el.innerHTML = output;
        if (complete === this.queue.length) {
            this.el.innerHTML = this.finalHtml;
            this.resolve();
        } else {
            this.frameRequest = requestAnimationFrame(this.update);
            this.frame++;
        }
    }

    randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
}

// ===============================
// 工厂函数：createGlitch
// ===============================
function createGlitch(selector, options = {}) {
    const el = document.querySelector(selector);
    if (!el) return;

    initContainerStyle(el);

    if (options.color) el.style.color = options.color;
    if (options.fontSize) el.style.fontSize = options.fontSize;
    if (options.fontWeight) el.style.fontWeight = options.fontWeight;

    if (options.webFont) {
        loadFontForElement(el, options.webFont)
            .finally(() => startGlitch(el, options));
    } else {
        if (options.fontFamily) {
            el.style.fontFamily = options.fontFamily;
        }
        startGlitch(el, options);
    }
}

function startGlitch(el, options) {
    const phrases = options.phrases || ["Text"];

    // 获取高度控制模式，默认为 'element'
    // 'element': 直接设置 el 的 minHeight
    // 'wrapper': 创建父级 div 设置 minHeight
    const heightMode = options.heightMode || 'element';

    // 高度预计算
    if (phrases.length > 0) {
        const ghost = el.cloneNode(true);
        // 清除 ghost 的 id 避免冲突
        ghost.id = '';
        ghost.style.visibility = 'hidden';
        ghost.style.position = 'absolute';
        ghost.style.top = '-9999px';
        ghost.style.left = '-9999px';
        ghost.style.width = getComputedStyle(el).width;
        ghost.style.height = 'auto';
        ghost.style.minHeight = '0';

        // 确保 ghost 也是 block 布局，以便准确测量高度
        ghost.style.display = 'block';

        el.parentNode.appendChild(ghost);

        let maxHeight = 0;
        phrases.forEach(p => {
            ghost.innerHTML = p;
            maxHeight = Math.max(maxHeight, ghost.offsetHeight);
        });

        el.parentNode.removeChild(ghost);

        // --- 核心修改部分 ---
        if (heightMode === 'wrapper') {
            // 方案 B：创建 Wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'glitch-text-wrapper'; // 给个类名方便用户自定义 CSS

            // 设置 wrapper 样式
            wrapper.style.minHeight = `${maxHeight}px`;
            wrapper.style.display = 'flex';           // 使用 Flex 方便居中
            wrapper.style.flexDirection = 'column';
            wrapper.style.justifyContent = 'center';  // 默认垂直居中
            wrapper.style.transition = 'height 0.3s ease'; // 如果后续高度变化，加个过渡

            // 插入 wrapper 并移动 el
            el.parentNode.insertBefore(wrapper, el);
            wrapper.appendChild(el);

            // 在 wrapper 模式下，通常建议移除 el 自身的 margin，交给 wrapper 控制
            // 但为了兼容性，这里暂时保留，用户可通过 CSS 覆盖
        } else {
            // 方案 A：原逻辑
            el.style.minHeight = `${maxHeight}px`;
        }
        // -------------------
    }

    const fx = new TextScramble(el, options.obfu_chars);
    let counter = 0;
    const disp_time = options.disp_time || 2000;
    const loop = options.loop !== false;

    const next = () => {
        fx.setText(phrases[counter], {
            start_time: options.start_time,
            end_time: options.end_time
        }).then(() => {
            setTimeout(next, disp_time);
        });

        if (!loop && counter < phrases.length - 1) {
            counter++;
        } else if (loop) {
            counter = (counter + 1) % phrases.length;
        }
    };

    setTimeout(next, options.delay || 0);
}
