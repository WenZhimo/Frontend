function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function isFontFile(url) {
    return /\.(woff2?|ttf|otf)(\?.*)?$/i.test(url);
}

async function loadWebFont(fontConfig) {
    if (!fontConfig || !fontConfig.url || !fontConfig.name) {
        return null;
    }

    const { name, url } = fontConfig;

    if (isFontFile(url)) {
        const font = new FontFace(name, `url(${url})`);
        await font.load();
        document.fonts.add(font);
    } else {
        const cssText = await fetch(url).then((response) => response.text());
        const style = document.createElement('style');
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    await document.fonts.ready;
    return name;
}

function getVisibleText(value) {
    const probe = document.createElement('div');
    probe.innerHTML = String(value ?? '');
    return probe.textContent || '';
}

function createSizerLine(text) {
    const line = document.createElement('div');
    line.className = 'glitch-text-sizer';
    line.setAttribute('aria-hidden', 'true');
    line.textContent = getVisibleText(text);

    Object.assign(line.style, {
        gridArea: '1 / 1',
        width: '100%',
        margin: '0',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.2',
        textAlign: 'center',
        visibility: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none'
    });

    return line;
}

function initGlitchContainer(container, phrases) {
    if (container.__glitch_inited__) {
        return container.__glitch_live__;
    }

    container.__glitch_inited__ = true;

    Object.assign(container.style, {
        display: 'grid',
        position: 'relative',
        width: '100%',
        margin: '15px 0',
        overflow: 'hidden',
        lineHeight: '1.2',
        textAlign: 'center'
    });

    const visibleLines = phrases.filter(Boolean);
    const sizerLines = visibleLines.length > 0 ? visibleLines : [' '];
    const sizerFragment = document.createDocumentFragment();

    sizerLines.forEach((text) => {
        sizerFragment.appendChild(createSizerLine(text));
    });

    const liveLayer = document.createElement('div');
    Object.assign(liveLayer.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
    });

    const liveText = document.createElement('div');
    liveText.className = 'glitch-text-live';
    Object.assign(liveText.style, {
        width: '100%',
        margin: '0',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.2',
        textAlign: 'center'
    });

    liveLayer.appendChild(liveText);

    container.textContent = '';
    container.appendChild(sizerFragment);
    container.appendChild(liveLayer);

    container.__glitch_live__ = liveText;
    return liveText;
}

class TextScramble {
    constructor(el, chars) {
        this.el = el;
        this.chars = chars || '░▒▓▖▗▘▙▚▛▜▝▞▟';
        this.frame = 0;
        this.queue = [];
        this.frameRequest = null;
        this.resolve = null;
        this.finalHtml = '';
        this.update = this.update.bind(this);
    }

    setText(nextHtml, config = {}) {
        const oldText = this.el.textContent;
        const finalHtml = String(nextHtml ?? '');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = finalHtml;
        const finalText = tempDiv.textContent || '';
        const length = Math.max(oldText.length, finalText.length);
        const promise = new Promise((resolve) => {
            this.resolve = resolve;
        });

        this.finalHtml = finalHtml;
        this.queue = [];

        const startTime = config.start_time || 40;
        const endTime = config.end_time || 40;

        for (let i = 0; i < length; i += 1) {
            const from = oldText[i] || '';
            const to = finalText[i] || '';
            const start = Math.floor(Math.random() * startTime);
            const end = start + Math.floor(Math.random() * endTime);
            this.queue.push({ from, to, start, end, char: '' });
        }

        cancelAnimationFrame(this.frameRequest);
        this.frame = 0;
        this.update();
        return promise;
    }

    update() {
        let output = '';
        let complete = 0;

        for (let i = 0; i < this.queue.length; i += 1) {
            const item = this.queue[i];

            if (this.frame >= item.end) {
                complete += 1;
                output += escapeHtml(item.to);
                continue;
            }

            if (this.frame >= item.start) {
                if (!item.char || Math.random() < 0.28) {
                    item.char = this.randomChar();
                }
                output += `<span class="dud">${escapeHtml(item.char)}</span>`;
                continue;
            }

            output += escapeHtml(item.from);
        }

        this.el.innerHTML = output;

        if (complete === this.queue.length) {
            this.el.innerHTML = this.finalHtml;
            this.resolve?.();
            return;
        }

        this.frameRequest = requestAnimationFrame(this.update);
        this.frame += 1;
    }

    randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
}

function createGlitch(selector, options = {}) {
    const container = document.querySelector(selector);
    if (!container) return;

    const phrases = Array.isArray(options.phrases) && options.phrases.length > 0
        ? options.phrases.map((phrase) => String(phrase ?? ''))
        : ['Text'];

    if (options.color) container.style.color = options.color;
    if (options.fontSize) container.style.fontSize = options.fontSize;
    if (options.fontFamily) container.style.fontFamily = options.fontFamily;

    const startGlitch = () => {
        const liveText = initGlitchContainer(container, phrases);
        const scramble = new TextScramble(liveText, options.obfu_chars);
        const displayTime = options.disp_time || 2000;
        let index = 0;

        const next = () => {
            scramble.setText(phrases[index], {
                start_time: options.start_time,
                end_time: options.end_time
            }).then(() => {
                index = (index + 1) % phrases.length;
                window.setTimeout(next, displayTime);
            });
        };

        next();
    };

    if (options.webFont) {
        container.style.visibility = 'hidden';
        loadWebFont(options.webFont)
            .then((loadedFontName) => {
                if (loadedFontName) {
                    const fallbackFonts = options.fontFamily ? `, ${options.fontFamily}` : ', sans-serif';
                    container.style.fontFamily = `'${loadedFontName}'${fallbackFonts}`;
                }
            })
            .catch((error) => {
                console.warn('glitch-text font load failed', error);
            })
            .finally(() => {
                container.style.visibility = '';
                startGlitch();
            });
        return;
    }

    startGlitch();
}
