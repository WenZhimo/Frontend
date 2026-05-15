const popup = document.getElementById('fn-popup');
let hideTimer = null;

function hidePopup() {
    popup.classList.remove('show');
}

function showPopup(html) {
    popup.innerHTML = html;
    popup.classList.add('show');
    clearTimeout(hideTimer);
}

if (popup) {
    document.querySelectorAll('.fn').forEach(el => {
        const id = el.dataset.fn;
        const html = document.getElementById(id)?.innerHTML ||
            '<span style="color:#cc0000;">[ ERR: 目标数据段丢失或未授权访问 ]</span>';

        el.addEventListener('mouseenter', () => showPopup(html));
        el.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(hidePopup, 800);
        });
    });

    popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popup.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(hidePopup, 400);
    });
}
