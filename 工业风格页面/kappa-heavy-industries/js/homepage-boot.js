const overlay = document.getElementById('homepage-boot-overlay');
const logRoot = document.getElementById('homepage-boot-log');
const progress = document.getElementById('homepage-boot-progress');
const progressFill = progress?.querySelector('span') ?? null;
const statusText = document.getElementById('homepage-boot-status-text');

if (overlay && logRoot && progressFill && statusText) {
    const steps = [
        { id: 'dom', message: '[BOOT] 核心总线已接通 // CORE BUS LINKED // document skeleton online' },
        { id: 'shell', message: '[CHK ] 首屏视口已校验 // PRIMARY VIEWPORT VERIFIED // active shell mounted' },
        { id: 'hero', message: '[ASST] 首屏视觉资源已校验 // HERO VISUAL BLOCK VERIFIED // foreground assets responsive' },
        { id: 'pager', message: '[NAV ] 分页引擎已武装 // PAGER ENGINE ARMED // page state synchronized' },
        { id: 'progress', message: '[CTRL] 页脚导航控制器上线 // FOOTER NAV CONTROLLER ONLINE // progress bus synced' },
        { id: 'frame', message: '[RDY ] 首帧交互已提交 // FIRST INTERACTIVE FRAME COMMITTED // viewport safe to release' },
    ];

    const completed = new Set();
    let finished = false;
    let isPrinting = false;
    const logQueue = [];

    function typeLine(message, done) {
        const line = document.createElement('div');
        line.className = 'homepage-boot-log-line';
        logRoot.appendChild(line);

        let index = 0;
        const tick = () => {
            line.textContent = message.slice(0, index);
            logRoot.scrollTop = logRoot.scrollHeight;

            if (index >= message.length) {
                done?.();
                return;
            }

            index += 1;
            window.setTimeout(tick, 12);
        };

        tick();
    }

    function flushLogQueue() {
        if (isPrinting || logQueue.length === 0) return;
        isPrinting = true;

        const { message, done } = logQueue.shift();
        typeLine(message, () => {
            isPrinting = false;
            done?.();
            flushLogQueue();
        });
    }

    function appendLog(message, done) {
        logQueue.push({ message, done });
        flushLogQueue();
    }

    function updateProgress() {
        const ratio = completed.size / steps.length;
        progressFill.style.width = `${ratio * 100}%`;
    }

    function finishBootSequence() {
        statusText.textContent = '准备完成，释放界面 / READY // RELEASING';
        appendLog('[SYS ] 系统已预加载完成，正在进入系统…… // PRELOAD COMPLETE // ENTERING SYSTEM...', () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.setTimeout(() => {
                        overlay.classList.add('is-hidden');
                        overlay.setAttribute('aria-busy', 'false');
                    }, 200);
                });
            });
        });
    }

    function tryFinishBoot() {
        if (finished) return;
        if (completed.size < steps.length) return;

        finished = true;
        finishBootSequence();
    }

    function markStepDone(id) {
        if (finished || completed.has(id)) return;

        const step = steps.find((item) => item.id === id);
        if (!step) return;

        completed.add(id);
        appendLog(step.message, () => {
            updateProgress();
            if (id === 'frame') {
                statusText.textContent = '首帧锁定 / READY // FRAME LOCK';
            }
            tryFinishBoot();
        });
    }

    markStepDone('dom');

    if (document.querySelector('#pager .page.active') && document.getElementById('Homepage-Slogan')) {
        markStepDone('shell');
    }

    window.addEventListener('kappa:home-ready-hero', () => markStepDone('hero'));
    window.addEventListener('kappa:home-ready-pager', () => markStepDone('pager'));
    window.addEventListener('kappa:home-ready-progress', () => markStepDone('progress'));

    requestAnimationFrame(() => {
        markStepDone('frame');
    });

    window.addEventListener('load', () => {
        if (!completed.has('hero')) {
            markStepDone('hero');
        }
        if (!completed.has('pager')) {
            markStepDone('pager');
        }
        if (!completed.has('progress')) {
            markStepDone('progress');
        }
    });

    window.setTimeout(() => {
        if (finished) return;
        finished = true;
        statusText.textContent = '兜底释放 / READY // FALLBACK RELEASE';
        appendLog('[WARN] 启动兜底阈值已触发 // BOOT FALLBACK THRESHOLD REACHED // releasing viewport with degraded assurance', () => {
            window.setTimeout(() => {
                overlay.classList.add('is-hidden');
                overlay.setAttribute('aria-busy', 'false');
            }, 200);
        });
    }, 4500);
}
