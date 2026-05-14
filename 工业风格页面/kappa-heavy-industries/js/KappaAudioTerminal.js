/**
 * ===================================================================
 * [ 河童重工 ] HUD 音频终端与声呐矩阵模块 (KappaAudioTerminal)
 * 版本: V11.1 (V7.1 视觉核心 + V10 穿透引擎 + 绝对字符安全版)
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
        this.isLoaded = false; // 新增：资源是否加载完毕状态锁
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

        // 严格保留 V7.1 的样式配置
        Object.assign(this.canvas.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100vw",
            height: "100vh",
            zIndex: "0",
            pointerEvents: "none",
            opacity: "0.3",
            imageRendering: "pixelated", 
        });

        this.canvas.style.setProperty("image-rendering", "crisp-edges");

        // 严格保留 V7.1 的画布分辨率
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
        // 注意：这里移除了 this.audioCore.src = this.audioUrl，交由 fetch 处理

        // 注入带有 CONNECTING 状态的 V10 UI
        this.container.innerHTML = `
            <div class="hud-audio-terminal">
                <div class="hud-player-core">
                    <button class="hud-btn hud-play-toggle" style="opacity: 0.5; pointer-events: none;">
                        <span class="cmd-prompt">C:\\></span> <span class="hud-btn-text">CONNECTING...</span>
                    </button>
                    <div class="hud-progress-track">
                        <div class="hud-progress-fill"></div>
                    </div>
                    <div class="hud-time-display">LOADING DATA...</div>
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

        // 启动内存级资源抓取
        this.fetchAudioData();
    }

    // [ 核心融合 ] V10 的 Blob 抓取与优雅降级技术
    async fetchAudioData() {
        try {
            const response = await fetch(this.audioUrl);
            if (!response.ok) throw new Error("HTTP 状态错误");
            const blob = await response.blob();
            const localUrl = URL.createObjectURL(blob);
            this.audioCore.src = localUrl;

            this.isLoaded = true;
            this.ui.playBtn.style.opacity = "1";
            this.ui.playBtn.style.pointerEvents = "auto";
            this.ui.btnText.textContent = "PLAY_AUDIO";
            this.ui.timeDisplay.textContent = "00:00 / 00:00";
            console.log("[SYS_MSG] 资源已转为内存 Blob，声呐阵列解锁。");
        } catch (e) {
            console.warn("[SYS_WARN] 跨域拦截！降级为普通播放模式 (无波纹)。");
            this.audioCore.src = this.audioUrl;

            this.isLoaded = true;
            this.ui.playBtn.style.opacity = "1";
            this.ui.playBtn.style.pointerEvents = "auto";
            this.ui.btnText.textContent = "PLAY(NO_SONAR)";
            this.ui.playBtn.style.color = "#ffaa00";
            this.ui.timeDisplay.textContent = "CORS_BLOCKED";
        }
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
            this.analyser.fftSize = 128;

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

                if (bassEnergy > this.config.energyThreshold) {
                    this.createRing(bassEnergy);
                }
            }
        }

        for (let i = this.rings.length - 1; i >= 0; i--) {
            let r = this.rings[i];

            r.radius += r.fixedSpeed;

            r.opacity = 1 - r.radius / r.maxRadius;

            if (r.opacity <= 0) {
                this.rings.splice(i, 1);
            } else {
                this.offScreenCtx.beginPath();
                this.offScreenCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);

                // 严格保留 V7.1 的金色涂装
                this.offScreenCtx.strokeStyle = `rgba(233, 200, 90, ${r.initialOpacity * r.opacity})`;
                this.offScreenCtx.lineWidth = 1;
                this.offScreenCtx.stroke();
            }
        }
        onscreenCtx.drawImage(this.offScreenCanvas, 0, 0);
    }

    createRing(energy) {
        let norm =
            (energy - this.config.energyThreshold) /
            (255 - this.config.energyThreshold);
        norm = Math.max(0, Math.min(norm, 1.0));

        this.rings.push({
            x: this.offScreenCanvas.width / 2,
            y: this.offScreenCanvas.height / 2,
            radius: 1,
            // 严格保留 V7.1 的完美对角线计算公式，解决椭圆裁切 Bug
            maxRadius:
                Math.max(
                    this.offScreenCanvas.width,
                    this.offScreenCanvas.height,
                ) * 0.9,

            initialEnergy: energy,
            initialOpacity: norm * 0.7, 
            fixedSpeed: 0.4, // 严格保留 V7.1 的完美扩散速度
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
            // 新增：拦截点击，直到音频 Blob 下载完毕
            if (!this.isLoaded) return; 

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
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
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