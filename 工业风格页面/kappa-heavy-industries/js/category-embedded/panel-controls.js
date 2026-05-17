document.addEventListener('DOMContentLoaded', () => {
    const shell = document.querySelector('.category-embedded-shell');
    if (!shell) return;

    const indicatorStates = [
        { className: 'is-online', label: 'SYNC' },
        { className: 'is-idle', label: 'IDLE' },
        { className: 'is-warn', label: 'BUSY' },
    ];

    const initializeKnobs = () => {
        shell.querySelectorAll('[data-knob]').forEach((knob) => {
            const angles = (knob.dataset.angles || '').split(',').map((value) => value.trim()).filter(Boolean);
            const values = (knob.dataset.values || '').split(',').map((value) => value.trim()).filter(Boolean);
            const valueNode = knob.closest('.category-embedded-knob-block')?.querySelector('[data-knob-value]');

            if (!knob.dataset.knobIndex) {
                knob.dataset.knobIndex = '0';
            }

            const index = Number(knob.dataset.knobIndex || 0);
            const angle = angles[index] || '0';
            knob.style.setProperty('--knob-angle', `${angle}deg`);
            if (valueNode) {
                valueNode.textContent = values[index] || valueNode.textContent;
            }
        });
    };

    initializeKnobs();

    shell.addEventListener('click', (event) => {
        const knob = event.target.closest('[data-knob]');
        if (knob && shell.contains(knob)) {
            const angles = (knob.dataset.angles || '').split(',').map((value) => value.trim()).filter(Boolean);
            const values = (knob.dataset.values || '').split(',').map((value) => value.trim()).filter(Boolean);
            const valueNode = knob.closest('.category-embedded-knob-block')?.querySelector('[data-knob-value]');
            const currentIndex = Number(knob.dataset.knobIndex || 0);
            const nextIndex = (currentIndex + 1) % Math.max(angles.length, 1);
            knob.dataset.knobIndex = String(nextIndex);
            knob.style.setProperty('--knob-angle', `${angles[nextIndex] || '0'}deg`);
            if (valueNode) {
                valueNode.textContent = values[nextIndex] || valueNode.textContent;
            }
            return;
        }

        const panelButton = event.target.closest('[data-panel-button]');
        if (panelButton && shell.contains(panelButton)) {
            const isActive = panelButton.getAttribute('aria-pressed') === 'true';
            panelButton.setAttribute('aria-pressed', isActive ? 'false' : 'true');
            panelButton.classList.toggle('is-active', !isActive);
            return;
        }

        const indicator = event.target.closest('[data-indicator]');
        if (indicator && shell.contains(indicator)) {
            const labelNode = indicator.querySelector('.category-embedded-indicator-state');
            let currentIndex = indicatorStates.findIndex((state) => indicator.classList.contains(state.className));
            if (currentIndex < 0) currentIndex = 0;
            indicator.classList.remove('is-online', 'is-idle', 'is-warn');
            currentIndex = (currentIndex + 1) % indicatorStates.length;
            const nextState = indicatorStates[currentIndex];
            indicator.classList.add(nextState.className);
            if (labelNode) {
                labelNode.textContent = nextState.label;
            }
        }
    });

    const bars = shell.querySelectorAll('.category-embedded-status-bar');
    if (bars.length > 0) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const randomizeBars = () => {
            bars.forEach((bar, index) => {
                const base = 22 + ((index * 11) % 38);
                const variance = Math.random() * 34;
                bar.style.setProperty('--bar-level', `${Math.min(90, base + variance)}%`);
            });
        };

        randomizeBars();

        if (!prefersReducedMotion) {
            window.setInterval(randomizeBars, 1800);
        }
    }
});
