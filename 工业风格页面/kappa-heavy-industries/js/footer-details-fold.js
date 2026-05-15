document.addEventListener('DOMContentLoaded', () => {
    const detailsElements = document.querySelectorAll('#article-container details');

    detailsElements.forEach(details => {
        const summary = details.querySelector('summary');
        const contentNodes = Array.from(details.childNodes).filter(node => node !== summary);

        const wrapper = document.createElement('div');
        wrapper.className = 'sys-details-wrapper';

        const btnTop = document.createElement('div');
        btnTop.className = 'sys-close-btn';
        btnTop.innerHTML = 'FOLD_DATA // 终止读取并折叠';

        const btnBottom = document.createElement('div');
        btnBottom.className = 'sys-close-btn';
        btnBottom.innerHTML = 'FOLD_DATA // 终止读取并折叠';

        wrapper.appendChild(btnTop);
        contentNodes.forEach(node => wrapper.appendChild(node));
        wrapper.appendChild(btnBottom);
        details.appendChild(wrapper);

        let animation = null;
        let isClosing = false;
        let isExpanding = false;

        const closeDetails = (e) => {
            if (e) e.preventDefault();
            if (isClosing || !details.open) return;
            isClosing = true;

            const startHeight = `${details.offsetHeight}px`;
            const endHeight = `${summary.offsetHeight}px`;

            details.style.overflow = 'hidden';

            if (animation) animation.cancel();
            animation = details.animate({ height: [startHeight, endHeight] }, { duration: 350, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

            animation.onfinish = () => {
                details.open = false;
                details.style.height = '';
                details.style.overflow = '';
                isClosing = false;
            };
        };

        const openDetails = (e) => {
            if (e) e.preventDefault();
            if (isExpanding || details.open) return;
            isExpanding = true;

            details.style.height = `${details.offsetHeight}px`;
            details.open = true;
            details.style.overflow = 'hidden';

            window.requestAnimationFrame(() => {
                const startHeight = `${details.offsetHeight}px`;
                const endHeight = `${summary.offsetHeight + wrapper.offsetHeight}px`;

                if (animation) animation.cancel();
                animation = details.animate({ height: [startHeight, endHeight] }, { duration: 350, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

                animation.onfinish = () => {
                    details.style.height = '';
                    details.style.overflow = '';
                    isExpanding = false;
                };
            });
        };

        summary.addEventListener('click', (e) => {
            if (isClosing || !details.open) {
                openDetails(e);
            } else if (isExpanding || details.open) {
                closeDetails(e);
            }
        });

        btnTop.addEventListener('click', closeDetails);
        btnBottom.addEventListener('click', (e) => {
            closeDetails(e);
            setTimeout(() => {
                summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        });
    });
});
