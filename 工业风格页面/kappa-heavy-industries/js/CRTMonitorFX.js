/**
 * CRTMonitorFX v7.2
 */
class CRTMonitorFX {
    constructor(triggerId = 'crt-config-trigger') {
        this.triggerId = triggerId;
        this.prefix = 'crt-fx';
        this.panelVisible = false;
        this.panelAnimating = false; // 动画锁

        this.config = {
            // --- 全局开关 ---
            power: { label: '主电源 (Master Power)', type: 'bool', value: false, cssClass: 'power-on' },

            // --- 1. 扫描线 (Scanlines) ---
            // 必须加上 unit: 'px'，否则 background-size 无效
            showLines: { label: '启用扫描线', type: 'bool', value: true, cssClass: 'show-lines' },
            lineDensity: { label: '线条间距 (px)', type: 'range', min: 2, max: 8, step: 1, value: 3, cssVar: '--crt-line-size', unit: 'px' },
            lineOpacity: { label: '线条深度', type: 'range', min: 0.05, max: 1.0, step: 0.05, value: 0.25, cssVar: '--crt-line-opacity' },

            // --- 2. 动态光带 (Beam) ---
            showBeam: { label: '启用扫描光带', type: 'bool', value: true, cssClass: 'show-beam' },
            beamSpeed: { label: '扫描速度 (s)', type: 'range', min: 2, max: 20, step: 1, value: 10, cssVar: '--crt-beam-speed', unit: 's' },
            beamOpacity: { label: '光带强度', type: 'range', min: 0.01, max: 0.3, step: 0.01, value: 0.03, cssVar: '--crt-beam-opacity' },

            // --- 3. RGB 色差 ---
            showRGB: { label: '启用 RGB 色差', type: 'bool', value: true, cssClass: 'show-rgb' },
            rgbOffset: { label: '色差偏移 (px)', type: 'range', min: 0.1, max: 10, step: 0.1, value: 1, cssVar: '--crt-rgb-offset', unit: 'px' },
            color1: { label: '通道1 (Red)', type: 'color', value: '#ff0000', cssVar: '--crt-rgb-c1' },
            color2: { label: '通道2 (Cyan)', type: 'color', value: '#00ffff', cssVar: '--crt-rgb-c2' },

            // --- 4. 闪烁 ---
            showFlicker: { label: '启用微闪', type: 'bool', value: false, cssClass: 'show-flicker' },
            flickerSpeed: { label: '闪烁频率 (s)', type: 'range', min: 0.01, max: 0.5, step: 0.01, value: 0.6, cssVar: '--crt-flicker-speed', unit: 's' },
            flickerStr: { label: '闪烁强度', type: 'range', min: 0.01, max: 0.3, step: 0.01, value: 0.02, cssVar: '--crt-flicker-str' },

            // --- 5. 暗角 ---
            showVignette: { label: '启用暗角', type: 'bool', value: true, cssClass: 'show-vignette' },
            vignetteStr: { label: '暗角深度', type: 'range', min: 0.05, max: 1, step: 0.05, value: 0.5, cssVar: '--crt-vignette-str' },

            // --- 6. 故障 ---
            allowGlitch: { label: '⚠️允许故障动画（⚠️注：光敏性癫痫警告！⚠️）', type: 'bool', value: false },
            glitchInterval: { label: '故障间隔 (ms)', type: 'range', min: 500, max: 30000, step: 500, value: 10000 }
        };

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.boot());
        } else {
            this.boot();
        }
    }

    boot() {
        this.injectStyles();
        this.createOverlay();
        this.loadSettings();
        this.createControlPanel();
        this.refreshAll();
        document.body.classList.add('crt-init');
        setTimeout(() => document.body.classList.remove('crt-init'), 50);
        this.setupTrigger();
        this.startGlitchLoop();
    }

    setupTrigger() {
        const trigger = document.getElementById(this.triggerId);
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.panelAnimating) {
                    this.togglePanel();
                }
            });
        }
    }

    // ==========================================
    // 核心动画逻辑：淡入 -> 蓄力 -> 展开
    // ==========================================
    togglePanel() {
        const panel = document.getElementById(`${this.prefix}-main-panel`);
        const content = panel.querySelector(`.${this.prefix}-panel-content`);
        if (!panel || !content) return;

        this.panelAnimating = true;

        if (!this.panelVisible) {
            // --- 开启流程 ---
            this.panelVisible = true;

            // 1. 初始化: 设定为小方块，但完全透明
            panel.style.display = 'block';
            panel.style.width = '20px';
            panel.style.height = '20px';
            panel.style.opacity = '0';
            panel.classList.remove('expanded');

            // 2. 强制回流 (Force Reflow)，确保上面的初始状态生效
            void panel.offsetHeight;

            // 3. 执行淡入 (300ms)
            panel.style.opacity = '1';

            // 4. 等待淡入完成 (300ms) + 蓄力停顿 (200ms) -> 总共 500ms 后开始展开
            setTimeout(() => {
                // 测量目标尺寸
                const clone = content.cloneNode(true);
                clone.style.cssText = 'position:fixed; visibility:hidden; width:420px; height:auto;';
                document.body.appendChild(clone);
                const rect = clone.getBoundingClientRect();
                document.body.removeChild(clone);

                const targetWidth = 420;
                const maxH = window.innerHeight * 0.8;
                const targetHeight = Math.min(rect.height + 45, maxH);

                // 执行展开动画
                panel.classList.add('expanded');
                panel.style.width = targetWidth + 'px';
                panel.style.height = targetHeight + 'px';

                // 展开动画结束后解锁
                setTimeout(() => {
                    this.panelAnimating = false;
                }, 400); // 对应 CSS transition 时间

            }, 300);

        } else {
            // --- 关闭流程 ---
            this.panelVisible = false;

            // 1. 收缩回小方块
            panel.classList.remove('expanded');
            panel.style.width = '20px';
            panel.style.height = '20px';

            // 2. 等待收缩动画完成 (400ms) 后，执行淡出
            setTimeout(() => {
                panel.style.opacity = '0'; // 淡出

                // 3. 等待淡出动画完成 (300ms) 后隐藏
                setTimeout(() => {
                    panel.style.display = 'none';
                    this.panelAnimating = false;
                }, 300);
            }, 400);
        }
    }

    injectStyles() {
        const style = document.createElement('style');
        const p = this.prefix;

        style.innerHTML = `
            :root {
                --crt-line-size: 4px; --crt-line-opacity: 0.2;
                --crt-beam-speed: 8s; --crt-beam-opacity: 0.05;
                --crt-rgb-offset: 2px; --crt-rgb-c1: #ff0000; --crt-rgb-c2: #00ffff;
                --crt-flicker-speed: 0.15s; --crt-flicker-str: 0.04;
                --crt-vignette-str: 0.6;
            }

            #${p}-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 999999; display: none; }
            body.power-on #${p}-overlay { display: block; }
            .${p}-scanlines { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0, var(--crt-line-opacity)) 50%, rgba(0,0,0, var(--crt-line-opacity))); background-size: 100% var(--crt-line-size); background-repeat: repeat; }
            body.show-lines .${p}-scanlines { display: block; }
            .${p}-beam { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255, var(--crt-beam-opacity)) 50%, transparent 100%); background-size: 100% 30%; background-repeat: no-repeat; animation: ${p}-beam-anim var(--crt-beam-speed) linear infinite; mix-blend-mode: overlay; }
            body.show-beam .${p}-beam { display: block; }
            body.power-on.show-rgb * { text-shadow: var(--crt-rgb-offset) 0 var(--crt-rgb-c1), calc(var(--crt-rgb-offset) * -1) 0 var(--crt-rgb-c2) !important; }
            body.power-on.show-rgb h1 { text-shadow: calc(var(--crt-rgb-offset) * 1.5) 0 var(--crt-rgb-c1), calc(var(--crt-rgb-offset) * -1.5) 0 var(--crt-rgb-c2) !important; }
            .${p}-flicker { position: absolute; inset: 0; background: rgba(255, 176, 0, var(--crt-flicker-str)); opacity: 0; mix-blend-mode: overlay; animation: ${p}-flicker-anim var(--crt-flicker-speed) infinite; }
            body.show-flicker .${p}-flicker { display: block; }
            .${p}-vignette { position: absolute; inset: 0; background: radial-gradient(circle, transparent 50%, rgba(0,0,0, var(--crt-vignette-str)) 100%); display: none; pointer-events: none; z-index: 5; }
            body.power-on.show-vignette .${p}-vignette { display: block !important; }
            body.${p}-glitch-active { animation: ${p}-glitch-anim 0.2s infinite cubic-bezier(0.25, 0.46, 0.45, 0.94) !important; will-change: transform, text-shadow, filter; overflow-x: hidden; }
            body.${p}-glitch-active::after { content: ""; position: fixed; inset: 0; z-index: 1000000; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.2) 3px, rgba(0,255,255,0.2) 4px); pointer-events: none; mix-blend-mode: hard-light; animation: ${p}-flicker-anim 0.05s infinite; }
            @keyframes ${p}-beam-anim { 0% { background-position: 0 -100vh; } 100% { background-position: 0 200vh; } }
            @keyframes ${p}-flicker-anim { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
            @keyframes ${p}-glitch-anim {
                0% { text-shadow: var(--crt-rgb-offset) 0 var(--crt-rgb-c1), calc(var(--crt-rgb-offset) * -1) 0 var(--crt-rgb-c2); transform: translate(0) skewX(0); filter: none; }
                20% { text-shadow: -5px 0 var(--crt-rgb-c1), 5px 0 var(--crt-rgb-c2); transform: translate(-5px, 0) skewX(5deg); }
                40% { text-shadow: 20px -5px var(--crt-rgb-c1), -20px 5px var(--crt-rgb-c2); transform: scale(1.02, 0.98) translate(10px, 0) skewX(-10deg); filter: hue-rotate(90deg); }
                50% { text-shadow: 0 0 transparent; transform: scale(1, 1) translate(0) skewX(0); filter: invert(1); }
                60% { text-shadow: -30px 0 var(--crt-rgb-c1), 30px 0 var(--crt-rgb-c2); transform: scale(1.05, 0.95) translate(-20px, 0) skewX(15deg); filter: hue-rotate(-90deg) contrast(2); }
                80% { text-shadow: 5px 0 var(--crt-rgb-c1), -5px 0 var(--crt-rgb-c2); transform: translate(5px, -2px) skewX(-5deg); filter: none; }
                100% { text-shadow: var(--crt-rgb-offset) 0 var(--crt-rgb-c1), calc(var(--crt-rgb-offset) * -1) 0 var(--crt-rgb-c2); transform: translate(0) skewX(0); filter: none; }
            }

            /* --- 工业风控制台面板 --- */
            #${p}-main-panel {
                position: fixed; 
                top: 50%; left: 50%; 
                transform: translate(-50%, -50%);
                
                width: 20px; height: 20px;
                background: rgba(10, 12, 16, 0.98);
                border: 1px solid transparent; 
                
                z-index: 2147483647;
                color: #ffb700; font-family: "Consolas", monospace; font-size: 13px;
                display: none;
                overflow: hidden; 
                opacity: 0; /* 默认透明 */
                
                /* 复合动画：尺寸 + 边框 + 透明度 */
                transition: 
                    width 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    height 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 0.2s,
                    opacity 0.3s ease;
            }
            
            #${p}-main-panel.expanded {
                border-color: rgba(255, 183, 0, 0.5);
                box-shadow: 0 0 30px rgba(0,0,0,0.8);
            }

            /* 内容容器 */
            .${p}-panel-content {
                width: 420px;
                height: 100%;
                opacity: 0; 
                transition: opacity 0.2s ease 0.2s;
                overflow-y: auto;
                scrollbar-width: thin; scrollbar-color: #444 transparent;
            }
            #${p}-main-panel.expanded .${p}-panel-content { opacity: 1; }

            /* 角标 */
            .${p}-corners { position: absolute; inset: 0; pointer-events: none; z-index: 999; }
            .${p}-corners span {
                position: absolute; width: 6px; height: 6px;
                border-color: #ffb700; border-style: solid; border-width: 0;
                transition: all 0.4s;
            }
            .${p}-corners .tl { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; }
            .${p}-corners .tr { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; }
            .${p}-corners .bl { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; }
            .${p}-corners .br { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; }

            /* 控件样式 */
            .${p}-header { padding: 10px 15px; border-bottom: 1px solid rgba(255,183,0,0.3); display: flex; justify-content: space-between; background: rgba(255,183,0,0.1); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(5px); }
            .${p}-close { cursor: pointer; padding: 0 5px; } .${p}-close:hover { background: #ffb700; color: #000; }
            .${p}-body { padding: 15px; display: flex; flex-direction: column; gap: 10px; }
            .${p}-row { display: flex; flex-direction: column; gap: 5px; padding-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.1); }
            .${p}-controls { display: flex; gap: 10px; align-items: center; }
            input[type=range] { flex: 1; accent-color: #ffb700; cursor: pointer; height: 4px; background: #333; }
            input[type=number] { width: 50px; background: #000; color: #ffb700; border: 1px solid #333; padding: 2px; }
            input[type=checkbox] { width: 16px; height: 16px; accent-color: #ffb700; cursor: pointer; }
            input[type=color] { border: none; width: 30px; height: 20px; background: none; cursor: pointer; }
        `;
        document.head.appendChild(style);
    }

    createOverlay() {
        const div = document.createElement('div');
        div.id = `${this.prefix}-overlay`;
        div.innerHTML = `<div class="${this.prefix}-scanlines"></div><div class="${this.prefix}-beam"></div><div class="${this.prefix}-flicker"></div><div class="${this.prefix}-vignette"></div>`;
        document.body.appendChild(div);
    }

    createControlPanel() {
        const panel = document.createElement('div');
        panel.id = `${this.prefix}-main-panel`;

        const corners = document.createElement('div');
        corners.className = `${this.prefix}-corners`;
        corners.innerHTML = `<span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span>`;
        panel.appendChild(corners);

        const contentBox = document.createElement('div');
        contentBox.className = `${this.prefix}-panel-content`;
        contentBox.innerHTML = `
            <div class="${this.prefix}-header"><span>// CRT_CONFIG</span><span class="${this.prefix}-close">[X]</span></div>
            <div class="${this.prefix}-body" id="${this.prefix}-body-content"></div>
        `;

        panel.appendChild(contentBox);
        document.body.appendChild(panel);

        contentBox.querySelector(`.${this.prefix}-close`).onclick = () => this.togglePanel();

        const body = contentBox.querySelector(`#${this.prefix}-body-content`);
        for (const [key, conf] of Object.entries(this.config)) {
            const row = document.createElement('div');
            row.className = `${this.prefix}-row`;
            row.innerHTML = `<div>${conf.label}</div>`;
            const controls = document.createElement('div');
            controls.className = `${this.prefix}-controls`;

            if (conf.type === 'bool') {
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = conf.value;
                cb.onchange = (e) => this.updateSetting(key, e.target.checked);
                controls.appendChild(cb);
            } else if (conf.type === 'range') {
                const range = document.createElement('input');
                range.type = 'range';
                range.min = conf.min; range.max = conf.max; range.step = conf.step; range.value = conf.value;
                const num = document.createElement('input');
                num.type = 'number';
                num.min = conf.min; num.max = conf.max; num.step = conf.step; num.value = conf.value;
                range.oninput = (e) => { num.value = e.target.value; this.updateSetting(key, parseFloat(e.target.value)); };
                num.onchange = (e) => { range.value = e.target.value; this.updateSetting(key, parseFloat(e.target.value)); };
                controls.appendChild(range);
                controls.appendChild(num);
            } else if (conf.type === 'color') {
                const color = document.createElement('input');
                color.type = 'color';
                color.value = conf.value;
                color.oninput = (e) => this.updateSetting(key, e.target.value);
                controls.appendChild(color);
            }
            row.appendChild(controls);
            body.appendChild(row);
        }
    }

    updateSetting(key, value) {
        this.config[key].value = value;
        this.refreshAll();
        this.saveSettings();
    }

    refreshAll() {
        const body = document.body;
        const root = document.documentElement;
        for (const [key, conf] of Object.entries(this.config)) {
            const val = conf.value;
            if (conf.type === 'bool' && conf.cssClass) {
                if (val) body.classList.add(conf.cssClass);
                else body.classList.remove(conf.cssClass);
            }
            if (conf.cssVar) {
                const suffix = conf.unit || '';
                root.style.setProperty(conf.cssVar, val + suffix);
            }
        }
    }

    saveSettings() {
        const saved = {};
        for (const key in this.config) saved[key] = this.config[key].value;
        localStorage.setItem('crt_fx_v6_settings', JSON.stringify(saved));
    }

    loadSettings() {
        const json = localStorage.getItem('crt_fx_v6_settings');
        if (!json) return;
        try {
            const saved = JSON.parse(json);
            for (const key in saved) if (this.config[key]) this.config[key].value = saved[key];
        } catch (e) { }
    }

    startGlitchLoop() {
        const loop = () => {
            setTimeout(() => {
                if (this.config.allowGlitch.value && this.config.power.value) this.triggerGlitch();
                loop();
            }, this.config.glitchInterval.value * (0.5 + Math.random()));
        };
        loop();
    }

    triggerGlitch() {
        document.body.classList.add(`${this.prefix}-glitch-active`);
        setTimeout(() => document.body.classList.remove(`${this.prefix}-glitch-active`), 200 + Math.random() * 300);
    }
}
