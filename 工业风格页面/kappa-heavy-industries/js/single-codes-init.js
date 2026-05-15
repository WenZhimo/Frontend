document.addEventListener('DOMContentLoaded', function() {
    const barcodeSvg = document.getElementById('barcode-svg');
    const unixTimestamp = window.kappaSingleUnixTimestamp;

    if (barcodeSvg && unixTimestamp && typeof JsBarcode !== 'undefined') {
        JsBarcode('#barcode-svg', unixTimestamp, {
            format: 'CODE39',
            width: 4,
            height: 60,
            displayValue: false,
            lineColor: '#988b32',
            background: 'transparent'
        });
    }

    const qrContainer = document.getElementById('article-qrcode');
    if (qrContainer && typeof QRCode !== 'undefined') {
        const articleUrl = qrContainer.getAttribute('data-url');
        new QRCode(qrContainer, {
            text: articleUrl,
            width: 72,
            height: 72,
            colorDark: '#0a0f0a',
            colorLight: '#988b32',
            correctLevel: QRCode.CorrectLevel.M
        });
    }
});
