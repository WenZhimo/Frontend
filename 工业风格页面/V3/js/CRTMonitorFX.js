/**
 * CRTMonitorFX v6.1 
 * 修复了扫描线缺失单位导致渲染异常的问题
 */
class CRTMonitorFX {
    constructor(triggerId = 'crt-config-trigger') {
        this.triggerId = triggerId;
        this.prefix = 'crt-fx';
        this.panelVisible = false;

        this.config = {
            // --- 全局开关 ---
            power: { label: '主电源 (Master Power)', type: 'bool', value: false, cssClass: 'power-on' },

            // --- 1. 扫描线 (Scanlines) ---
            // [重点修正] 必须加上 unit: 'px'，否则 background-size 无效
            showLines: { label: '启用扫描线', type: 'bool', value: true, cssClass: 'show-lines' },
            lineDensity: { label: '线条间距 (px)', type: 'range', min: 2, max: 8, step: 1, value: 3, cssVar: '--crt-line-size', unit: 'px' },
            lineOpacity: { label: '线条深度', type: 'range', min: 0.1, max: 1.0, step: 0.05, value: 0.25, cssVar: '--crt-line-opacity' },

            // --- 2. 动态光带 (Beam) ---
            showBeam: { label: '启用扫描光带', type: 'bool', value: true, cssClass: 'show-beam' },
            beamSpeed: { label: '扫描速度 (s)', type: 'range', min: 2, max: 20, step: 1, value: 10, cssVar: '--crt-beam-speed', unit: 's' },
            beamOpacity: { label: '光带强度', type: 'range', min: 0, max: 0.3, step: 0.01, value: 0.03, cssVar: '--crt-beam-opacity' },

            // --- 3. RGB 色差 ---
            showRGB: { label: '启用 RGB 色差', type: 'bool', value: true, cssClass: 'show-rgb' },
            rgbOffset: { label: '色差偏移 (px)', type: 'range', min: 0, max: 10, step: 0.5, value: 1, cssVar: '--crt-rgb-offset', unit: 'px' },
            color1: { label: '通道1 (Red)', type: 'color', value: '#ff0000', cssVar: '--crt-rgb-c1' },
            color2: { label: '通道2 (Cyan)', type: 'color', value: '#00ffff', cssVar: '--crt-rgb-c2' },

            // --- 4. 闪烁 ---
            showFlicker: { label: '启用微闪', type: 'bool', value: false, cssClass: 'show-flicker' },
            flickerSpeed: { label: '闪烁频率 (s)', type: 'range', min: 0.01, max: 0.5, step: 0.01, value: 0.6, cssVar: '--crt-flicker-speed', unit: 's' },
            flickerStr: { label: '闪烁强度', type: 'range', min: 0, max: 0.3, step: 0.01, value: 0.01, cssVar: '--crt-flicker-str' },

            // --- 5. 暗角 ---
            showVignette: { label: '启用暗角', type: 'bool', value: true, cssClass: 'show-vignette' },
            vignetteStr: { label: '暗角深度', type: 'range', min: 0, max: 1, step: 0.05, value: 0.5, cssVar: '--crt-vignette-str' },

            // --- 6. 故障 ---
            allowGlitch: { label: '允许故障动画', type: 'bool', value: true },
            glitchInterval: { label: '故障间隔 (ms)', type: 'range', min: 2000, max: 30000, step: 1000, value: 10000 }
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
        this.injectStyles();       // 1. 注入 CSS
        this.createOverlay();      // 2. 创建覆盖层
        this.loadSettings();       // 3. 加载本地存储的配置 (重要！必须先加载配置)
        this.createControlPanel(); // 4. 创建面板

        // 强制应用所有初始设置 (CSS 类 + CSS 变量)
        this.refreshAll();

        // 强制触发一次重绘 (可选，防止闪烁)
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
                this.togglePanel();
            });
        }
    }

    togglePanel() {
        this.panelVisible = !this.panelVisible;
        const panel = document.getElementById(`${this.prefix}-main-panel`);
        if (panel) panel.style.display = this.panelVisible ? 'block' : 'none';
    }

    injectStyles() {
        const style = document.createElement('style');
        const p = this.prefix;

        style.innerHTML = `
            :root {
                --crt-line-size: 4px;
                --crt-line-opacity: 0.2;
                --crt-beam-speed: 8s;
                --crt-beam-opacity: 0.05;
                --crt-rgb-offset: 2px;
                --crt-rgb-c1: #ff0000;
                --crt-rgb-c2: #00ffff;
                --crt-flicker-speed: 0.15s;
                --crt-flicker-str: 0.04;
                --crt-vignette-str: 0.6;
            }

            #${p}-overlay {
                position: fixed; inset: 0; pointer-events: none; z-index: 999999;
                display: none;
            }
            body.power-on #${p}-overlay { display: block; }

            /* --- 1. 扫描线 (Scanlines) --- */
            .${p}-scanlines {
                position: absolute; inset: 0;
                /* 修正：使用标准的 repeating 模式，更加兼容 */
                background: linear-gradient(
                    to bottom,
                    rgba(255,255,255,0),
                    rgba(255,255,255,0) 50%,
                    rgba(0,0,0, var(--crt-line-opacity)) 50%,
                    rgba(0,0,0, var(--crt-line-opacity))
                );
                /* 关键：确保这里的 size 有 px 单位 */
                background-size: 100% var(--crt-line-size);
                background-repeat: repeat;
            }
            body.show-lines .${p}-scanlines { display: block; }

            /* --- 2. 光带 --- */
            .${p}-beam {
                position: absolute; inset: 0;
                background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255, var(--crt-beam-opacity)) 50%, transparent 100%);
                background-size: 100% 30%;
                background-repeat: no-repeat;
                animation: ${p}-beam-anim var(--crt-beam-speed) linear infinite;
                mix-blend-mode: overlay;
            }
            body.show-beam .${p}-beam { display: block; }

            /* --- 3. 色差 --- */
            
            body.power-on.show-rgb * {
                /* 使用 0.8 透明度，更亮 */
                /* 注意：这里我们假设 --crt-rgb-c1 和 c2 是完整的颜色值（如 #ff0000） */
                /* 为了保证可见性，您可以直接在这里写死颜色测试一下，或者信任配置 */
                
                text-shadow: 
                    var(--crt-rgb-offset) 0 var(--crt-rgb-c1), 
                    calc(var(--crt-rgb-offset) * -1) 0 var(--crt-rgb-c2) !important;
            }

            /* 针对大标题增强偏移量  */
            body.power-on.show-rgb h1 {
                text-shadow: 
                    calc(var(--crt-rgb-offset) * 1.5) 0 var(--crt-rgb-c1), 
                    calc(var(--crt-rgb-offset) * -1.5) 0 var(--crt-rgb-c2) !important;
            }

            /* --- 4. 闪烁 --- */
            .${p}-flicker {
                position: absolute; inset: 0;
                background: rgba(255, 176, 0, var(--crt-flicker-str));
                opacity: 0;
                mix-blend-mode: overlay;
                animation: ${p}-flicker-anim var(--crt-flicker-speed) infinite;
            }
            body.show-flicker .${p}-flicker { display: block; }

            /* --- 5. 暗角 --- */
            .${p}-vignette {
                position: absolute; inset: 0;
                background: radial-gradient(circle, transparent 50%, rgba(0,0,0, var(--crt-vignette-str)) 100%);
                display: none; /* 默认隐藏 */
                pointer-events: none;
                z-index: 5; /* 确保层级正确 */
            }

            /* 只有当电源开启且开关打开时，才显示 */
            body.power-on.show-vignette .${p}-vignette {
                display: block !important;
            }

            /* --- 6. 故障 --- */
            body.${p}-glitch-active { animation: ${p}-glitch-anim 0.2s infinite; }
            body.${p}-glitch-active::after {
                content: ""; position: fixed; inset: 0; z-index: 1000000;
                background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.2) 3px, rgba(0,255,255,0.2) 4px);
                pointer-events: none;
            }

            @keyframes ${p}-beam-anim { 0% { background-position: 0 -100vh; } 100% { background-position: 0 200vh; } }
            @keyframes ${p}-flicker-anim { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
            @keyframes ${p}-glitch-anim {
                0% { transform: translate(0); } 20% { transform: translate(-2px, 2px); }
                40% { transform: translate(-2px, -2px); } 60% { transform: translate(2px, 2px); }
                80% { transform: translate(2px, -2px); } 100% { transform: translate(0); }
            }

            /* 面板样式 (保持不变) */
            #${p}-main-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                width: 400px; max-height: 80vh; overflow-y: auto;
                background: rgba(10, 12, 16, 0.95);
                border: 1px solid #ffb700;
                box-shadow: 0 0 20px rgba(0,0,0,0.8);
                z-index: 2147483647;
                color: #ffb700; font-family: "Consolas", monospace; font-size: 13px;
                display: none;
            }
            .${p}-header { padding: 10px; border-bottom: 1px solid rgba(255,183,0,0.3); display: flex; justify-content: space-between; background: rgba(255,183,0,0.1); }
            .${p}-close { cursor: pointer; }
            .${p}-body { padding: 15px; display: flex; flex-direction: column; gap: 10px; }
            .${p}-row { display: flex; flex-direction: column; gap: 5px; padding-bottom: 5px; border-bottom: 1px solid #333; }
            .${p}-controls { display: flex; gap: 10px; align-items: center; }
            input[type=range] { flex: 1; accent-color: #ffb700; cursor: pointer; }
            input[type=number] { width: 50px; background: #000; color: #ffb700; border: 1px solid #333; }
        `;
        document.head.appendChild(style);
    }

    createOverlay() {
        const div = document.createElement('div');
        div.id = `${this.prefix}-overlay`;
        div.innerHTML = `
            <div class="${this.prefix}-scanlines"></div>
            <div class="${this.prefix}-beam"></div>
            <div class="${this.prefix}-flicker"></div>
            <div class="${this.prefix}-vignette"></div>
        `;
        document.body.appendChild(div);
    }

    createControlPanel() {
        const panel = document.createElement('div');
        panel.id = `${this.prefix}-main-panel`;
        panel.innerHTML = `
            <div class="${this.prefix}-header"><span>// CRT_CONFIG</span><span class="${this.prefix}-close">[X]</span></div>
            <div class="${this.prefix}-body" id="${this.prefix}-body-content"></div>
        `;
        panel.querySelector(`.${this.prefix}-close`).onclick = () => this.togglePanel();
        const body = panel.querySelector(`#${this.prefix}-body-content`);

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
        document.body.appendChild(panel);
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

            // 1. 处理 CSS 类开关 (bool 类型)
            if (conf.type === 'bool' && conf.cssClass) {
                if (val) body.classList.add(conf.cssClass);
                else body.classList.remove(conf.cssClass);
            }

            // 2. 处理 CSS 变量 (数值/颜色 类型)
            // [关键] 即使是 bool 类型，如果有关联的数值变量，也要设置
            // 比如 showRGB 是开关，但 rgbOffset 是数值，无论开关如何，数值变量都应就位
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
