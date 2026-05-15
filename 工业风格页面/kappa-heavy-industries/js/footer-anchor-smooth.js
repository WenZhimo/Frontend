document.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (!a) return;

    const hash = a.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return;

    const target = document.getElementById(hash.slice(1)) ||
        document.getElementById(hash.slice(1).replace('-link', ''));

    if (target) {
        e.preventDefault();
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
});
