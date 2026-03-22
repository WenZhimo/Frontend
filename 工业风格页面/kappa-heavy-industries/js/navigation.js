const goHomeBtn = document.getElementById('goHome');
if (goHomeBtn) {
    goHomeBtn.addEventListener('click', () => {

        // 尝试寻找 pager 全局并回到 0（兼容之前示例）
        if (window.document) {
            const first = document.querySelector('.page');
            if (first) {
                // 清所有 active/fading 并激活首页（非破坏性）
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active', 'fading', 'prev'));
                first.classList.add('active');
            }
        }

    });
    // 可通过键盘回车触发
    goHomeBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') goHomeBtn.click(); });
}
