class FootnoteGenerator {
    /**
     * @param {string} targetClass - [参数1] 识别为脚注的 p 元素类名
     * @param {string|null} scopeId - [参数2] 限制查找范围的父容器ID (默认为 null，即全文)
     * @param {string} containerId - [参数3] 放置脚注内容的容器 ID
     * @param {string} numberType - [参数4] 序号类型
     * @param {string} refClassName - [参数5] 正文上标类名
     * @param {string} contentClassName - [参数6] 底部脚注类名
     * 
     */
    constructor(targetClass, scopeId = null, containerId, numberType = '1', refClassName = 'footnote-ref', contentClassName = 'footnote-item') {
        this.targetClass = targetClass;
        this.container = document.getElementById(containerId);
        this.numberType = numberType;
        this.refClassName = refClassName;
        this.contentClassName = contentClassName;
        this.scopeId = scopeId;

        if (!this.container) {
            console.error(`Footnote container with ID '${containerId}' not found.`);
            return;
        }

        this.init();
    }

    init() {
        // 1. 确定查找范围 (Root)
        let rootElement = document;
        if (this.scopeId) {
            const scopeEl = document.getElementById(this.scopeId);
            if (scopeEl) {
                rootElement = scopeEl;
            } else {
                console.warn(`Scope ID '${this.scopeId}' not found. Fallback to document.`);
            }
        }

        // 2. 在指定范围内查找
        const footnotes = rootElement.querySelectorAll(`p.${this.targetClass}`);

        // 3. 生成唯一的前缀，防止页面上多个实例产生 ID 冲突
        // 优先使用 scopeId，如果没有则使用 containerId
        const idPrefix = (this.scopeId || this.container.id) + '-';

        footnotes.forEach((p, index) => {
            const seq = index + 1;
            const label = this.formatNumber(seq, this.numberType);

            // 生成带前缀的唯一 ID
            const refId = `fn-ref-${idPrefix}${seq}`;
            const contentId = `fn-note-${idPrefix}${seq}`;

            // --- 创建正文上标 ---
            const sub = document.createElement('sup');
            sub.className = this.refClassName;

            const refLink = document.createElement('a');
            refLink.href = `#${contentId}`;
            refLink.id = refId;
            refLink.textContent = `[${label}]`;
            refLink.title = "查看脚注";
            refLink.style.textDecoration = 'none';

            sub.appendChild(refLink);
            p.parentNode.replaceChild(sub, p);

            // --- 创建脚注内容 ---
            const noteP = document.createElement('p');
            noteP.id = contentId;
            noteP.className = this.contentClassName;

            const prefixSpan = document.createElement('span');
            prefixSpan.style.fontWeight = 'bold';
            prefixSpan.textContent = `${label}. `;
            noteP.appendChild(prefixSpan);

            const contentSpan = document.createElement('span');
            contentSpan.innerHTML = p.innerHTML;
            noteP.appendChild(contentSpan);

            // 返回链接
            const backLink = document.createElement('a');
            backLink.href = `#${refId}`;
            backLink.innerHTML = ' &#8617;';
            backLink.className = 'footnote-back';
            backLink.title = "返回正文";
            backLink.style.textDecoration = 'none';
            backLink.style.marginLeft = '5px';

            noteP.appendChild(backLink);

            this.container.appendChild(noteP);
        });
    }

    // --- 数字格式化与辅助函数保持不变 ---
    formatNumber(num, type) {
        switch (type) {
            case '1': return num;
            case 'A': return this.toBase26(num).toUpperCase();
            case 'a': return this.toBase26(num).toLowerCase();
            case 'I': return this.toRoman(num);
            case 'i': return this.toRoman(num).toLowerCase();
            case '一': return this.toChineseNum(num, false);
            case '壹': return this.toChineseNum(num, true);
            default: return num;
        }
    }

    toChineseNum(num, isBig) {
        if (num === 0) return isBig ? '零' : '〇';
        const conf = isBig ? {
            digits: ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'],
            units: ['', '拾', '佰', '仟', '万', '亿']
        } : {
            digits: ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
            units: ['', '十', '百', '千', '万', '亿']
        };
        let str = '';
        let unitIndex = 0;
        let zeroOccurred = false;
        while (num > 0) {
            const digit = num % 10;
            if (digit === 0) {
                if (!zeroOccurred && unitIndex > 0) zeroOccurred = true;
            } else {
                if (zeroOccurred) { str = conf.digits[0] + str; zeroOccurred = false; }
                str = conf.digits[digit] + conf.units[unitIndex] + str;
            }
            num = Math.floor(num / 10);
            unitIndex++;
        }
        if (!isBig && str.startsWith('一十')) str = str.substring(1);
        return str;
    }

    toBase26(num) {
        let str = '';
        while (num > 0) {
            num--;
            str = String.fromCharCode(65 + (num % 26)) + str;
            num = Math.floor(num / 26);
        }
        return str;
    }

    toRoman(num) {
        const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
        let roman = '';
        for (let i in lookup) {
            while (num >= lookup[i]) {
                roman += i;
                num -= lookup[i];
            }
        }
        return roman;
    }
}
