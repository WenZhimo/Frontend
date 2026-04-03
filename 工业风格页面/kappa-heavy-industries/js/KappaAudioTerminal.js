/**
 * ===================================================================
 * [ 河童重工 ] HUD 音频终端与声呐矩阵模块 (KappaAudioTerminal)
 * 版本: V7.1 (语法修复 - [像素声呐] - 能量反馈连发版)
 * ===================================================================
 */
class KappaAudioTerminal {
    constructor(config) {
        this.container = document.getElementById(config.containerId);
        this.audioUrl = config.audioUrl;

        if (!this.container) {
            console.error(
                `[SYS_ERR] 终端挂载失败，找不到指定的挂载点: #${config.containerId}`,
            );
            return;
        }

        this.config = {
            targetFrequencyBins: config.targetFrequencyBins || [2, 3],
            energyThreshold: config.energyThreshold || 245,
        };

        this.isPlaying = false;
        this.isEngineReady = false;
        this.rings = [];
        this.lastPulseTime = 0;

        this.initCanvas();
        this.initUI();
        this.bindEvents();
    }

    initCanvas() {
        // --- Onscreen Canvas ---
        this.canvas = document.getElementById("audio-sonar-canvas");
        if (!this.canvas) {
            this.canvas = document.createElement("canvas");
            this.canvas.id = "audio-sonar-canvas";
            document.body.appendChild(this.canvas);
        }

        Object.assign(this.canvas.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100vw",
            height: "100vh",
            zIndex: "0",
            pointerEvents: "none",
            opacity: "0.3",
            imageRendering: "pixelated", // 使用标准的像素化属性
        });

        // 兼容性补充写法 (安全的方式)
        this.canvas.style.setProperty("image-rendering", "crisp-edges");

        this.canvas.width = 64;
        this.canvas.height = 32;

        // --- Offscreen Canvas ---
        this.offScreenCanvas = document.createElement("canvas");
        this.offScreenCanvas.width = this.canvas.width;
        this.offScreenCanvas.height = this.canvas.height;
        this.offScreenCtx = this.offScreenCanvas.getContext("2d", {
            alpha: true,
        });
    }

    initUI() {
        this.audioCore = new Audio();
        this.audioCore.preload = "metadata";
        this.audioCore.src = this.audioUrl;

        this.container.innerHTML = `
            <div class="hud-audio-terminal">
                <div class="hud-player-core">
                    <button class="hud-btn hud-play-toggle">
                        <span class="cmd-prompt">C:\\></span> <span class="hud-btn-text">PLAY_AUDIO</span>
                    </button>
                    <div class="hud-progress-track">
                        <div class="hud-progress-fill"></div>
                    </div>
                    <div class="hud-time-display">00:00 / 00:00</div>
                </div>
            </div>
        `;

        this.ui = {
            playBtn: this.container.querySelector(".hud-play-toggle"),
            btnText: this.container.querySelector(".hud-btn-text"),
            track: this.container.querySelector(".hud-progress-track"),
            fill: this.container.querySelector(".hud-progress-fill"),
            timeDisplay: this.container.querySelector(".hud-time-display"),
        };
    }

    initEngine() {
        if (this.isEngineReady) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();

        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
        }

        try {
            this.source = this.audioCtx.createMediaElementSource(
                this.audioCore,
            );
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 512;

            this.source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);

            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.isEngineReady = true;

            console.log("[SYS_MSG] 像素声呐阵列已连接至主控端。");
            this.renderLoop();
        } catch (err) {
            console.error("[SYS_ERR] 音频底层通道接入失败: ", err);
        }
    }

    // [ 模块 4 ] 渲染循环
    renderLoop() {
        requestAnimationFrame(() => this.renderLoop());

        const onscreenCtx = this.canvas.getContext("2d", { alpha: true });
        onscreenCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.offScreenCtx.clearRect(
            0,
            0,
            this.offScreenCanvas.width,
            this.offScreenCanvas.height,
        );

        if (this.isPlaying && this.isEngineReady && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);

            if (this.dataArray.length >= 4) {
                let bassEnergy = 0;
                let bins = this.config.targetFrequencyBins;
                for (let i = 0; i < bins.length; i++) {
                    let index = bins[i];
                    bassEnergy += this.dataArray[index] || 0;
                }
                bassEnergy /= bins.length;

                // 只要超过阈值就触发，没有冷却时间，实现致密波纹
                if (bassEnergy > this.config.energyThreshold) {
                    this.createRing(bassEnergy);
                }
            }
        }

        for (let i = this.rings.length - 1; i >= 0; i--) {
            let r = this.rings[i];

            // 👇 核心修正：所有波纹使用绝对一致的步进速度，彻底杜绝“超车”
            r.radius += r.fixedSpeed;

            r.opacity = 1 - r.radius / r.maxRadius;

            if (r.opacity <= 0) {
                this.rings.splice(i, 1);
            } else {
                this.offScreenCtx.beginPath();
                this.offScreenCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);

                // 亮度由实时能量映射
                this.offScreenCtx.strokeStyle = `rgba(233, 200, 90, ${r.initialOpacity * r.opacity})`;

                // 👇 线宽：能量越高，像素边框越厚 (在 64x36 画面下，2 已经是巨厚了)
                this.offScreenCtx.lineWidth = 1;
                this.offScreenCtx.stroke();
            }
        }
        onscreenCtx.drawImage(this.offScreenCanvas, 0, 0);
    }

    createRing(energy) {
        // 归一化亮度：能量越高，波纹越亮
        let norm =
            (energy - this.config.energyThreshold) /
            (255 - this.config.energyThreshold);
        norm = Math.max(0, Math.min(norm, 1.0));

        this.rings.push({
            x: this.offScreenCanvas.width / 2,
            y: this.offScreenCanvas.height / 2,
            radius: 1,
            maxRadius:
                Math.max(
                    this.offScreenCanvas.width,
                    this.offScreenCanvas.height,
                ) * 0.9,

            initialEnergy: energy,
            initialOpacity: norm * 0.7, // 基础亮度 0.2 + 能量增益

            // 👇 物理常量：设定一个固定速度（例如每帧扩散 0.6 像素）
            // 如果觉得波纹扩散太慢，就调大这个数字；觉得太快就调小。
            // 只要它是固定的，波纹就永远不会互相穿插。
            fixedSpeed: 0.4,
        });
    }

    bindEvents() {
        const formatTime = (sec) => {
            if (isNaN(sec)) return "00:00";
            const m = Math.floor(sec / 60)
                .toString()
                .padStart(2, "0");
            const s = Math.floor(sec % 60)
                .toString()
                .padStart(2, "0");
            return `${m}:${s}`;
        };

        this.ui.playBtn.addEventListener("click", () => {
            if (this.audioCore.paused) {
                this.audioCore.play();
            } else {
                this.audioCore.pause();
            }
        });

        this.audioCore.addEventListener("play", () => {
            this.isPlaying = true;
            this.ui.btnText.textContent = "SYS_PAUSE";
            this.ui.playBtn.style.color = "#988b32";
            this.ui.playBtn.style.borderColor = "#988b32";
            this.initEngine();
        });

        this.audioCore.addEventListener("pause", () => {
            this.isPlaying = false;
            this.ui.btnText.textContent = "PLAY_AUDIO";
            this.ui.playBtn.style.color = "#00ffff";
            this.ui.playBtn.style.borderColor = "#00ffff";
        });

        this.audioCore.addEventListener("ended", () => {
            this.isPlaying = false;
            this.ui.btnText.textContent = "PLAY_AUDIO";
            this.ui.playBtn.style.color = "#00ffff";
            this.ui.playBtn.style.borderColor = "#00ffff";
            this.rings = [];
        });

        this.audioCore.addEventListener("timeupdate", () => {
            const current = this.audioCore.currentTime;
            const total = this.audioCore.duration;
            if (total) {
                this.ui.fill.style.width = `${(current / total) * 100}%`;
                this.ui.timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;
            }
        });

        this.audioCore.addEventListener("loadedmetadata", () => {
            this.ui.timeDisplay.textContent = `00:00 / ${formatTime(this.audioCore.duration)}`;
        });

        const seek = (e) => {
            const rect = this.ui.track.getBoundingClientRect();
            const clientX = e.touches ? e.touches.clientX : e.clientX;
            let clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
            this.audioCore.currentTime =
                (clickX / rect.width) * this.audioCore.duration;
        };

        this.ui.track.addEventListener("click", seek);
        let isDragging = false;
        this.ui.track.addEventListener("mousedown", () => (isDragging = true));
        this.ui.track.addEventListener(
            "touchstart",
            () => (isDragging = true),
            { passive: true },
        );
        document.addEventListener("mouseup", () => (isDragging = false));
        document.addEventListener("touchend", () => (isDragging = false));
        document.addEventListener("mousemove", (e) => {
            if (isDragging) seek(e);
        });
        document.addEventListener("touchmove", (e) => {
            if (isDragging) seek(e);
        });
    }
}
