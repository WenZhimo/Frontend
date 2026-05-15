document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('crt-config-trigger');

    if (trigger && typeof CRTMonitorFX === 'function') {
        new CRTMonitorFX('crt-config-trigger');
    }
});
