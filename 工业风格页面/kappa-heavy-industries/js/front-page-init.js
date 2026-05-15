document.addEventListener('DOMContentLoaded', () => {
    if (typeof createGlitch === 'function') {
        createGlitch('#Homepage-Slogan', {
            phrases: ['让人在年轻时莫迟缓追求智慧，年老时莫厌倦探索真理。', '因为灵魂的健康，无论何时开始都不为早，亦不为晚。', ''],
            obfu_chars: '░▒▓▖▗▘▙▚▛▜▝▞▟',
            heightMode: 'wrapper',
            color: '#988b32',
            fontFamily: 'Smooch,DFJinWenW3-GB',
            fontSize: 'clamp(24px, 10vw, 100px)',
            disp_time: 3000,
            start_time: 80,
            end_time: 80
        });
    }

    window.dispatchEvent(new CustomEvent('kappa:home-ready-hero'));

    if (typeof FootnoteGenerator === 'function') {
        new FootnoteGenerator(
            'note',
            'page2',
            'page2-footnotes',
            '壹',
            'footnotes-sub-style',
            'footnotes-item-style'
        );
    }

    if (typeof FootnotePreview === 'function') {
        new FootnotePreview('page2', 'footnotes-sub-style', 'page2-footnotes');
    }

    if (typeof JsBarcode !== 'undefined') {
        document.querySelectorAll('[id^="barcode-img-"]').forEach((img) => {
            const unixTimestamp = img.dataset.unixTimestamp;
            if (!unixTimestamp) return;

            JsBarcode(`#${img.id}`, unixTimestamp, {
                format: 'CODE39',
                width: 2.5,
                height: 50,
                displayValue: false,
                lineColor: '#988b32',
                background: 'transparent',
                margin: 0
            });
        });
    }
});
