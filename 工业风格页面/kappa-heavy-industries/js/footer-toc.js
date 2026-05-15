(() => {
    const rawHeadings = document.querySelectorAll('#article-container h1:not(.wp-block-post-title), #article-container h2, #article-container h3, #article-container h4');
    const headings = Array.from(rawHeadings).filter(h => !h.closest('#comments'));

    const tocContainer = document.getElementById('toc-container');
    const tocRoot = document.getElementById('toc-list');

    if (!tocContainer || !tocRoot || headings.length === 0) return;

    tocContainer.style.display = 'block';

    headings.forEach((h, idx) => {
        if (!h.id) h.id = `heading-${idx}`;
    });

    let h1Count = 0;
    let h2Count = 0;
    let h3Count = 0;
    let curH1Li = null;
    let curH2Li = null;

    headings.forEach(h => {
        let prefix = '';
        const tagName = h.tagName.toUpperCase();

        if (tagName === 'H1') {
            h1Count++;
            h2Count = 0;
            h3Count = 0;
            prefix = `${h1Count}.`;
        } else if (tagName === 'H2') {
            h2Count++;
            h3Count = 0;
            prefix = `${h1Count}.${h2Count}`;
        } else if (tagName === 'H3') {
            h3Count++;
            prefix = `${h1Count}.${h2Count}.${h3Count}`;
        }

        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = `${prefix} ${h.textContent}`;
        a.href = `#${h.id}`;

        a.addEventListener('click', e => {
            e.preventDefault();
            const topPos = h.getBoundingClientRect().top + window.pageYOffset - 100;
            window.scrollTo({
                top: topPos,
                behavior: 'smooth'
            });
        });

        li.appendChild(a);

        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        toggle.textContent = '>';
        li.insertBefore(toggle, li.firstChild);

        if (tagName === 'H1') {
            curH1Li = li;
            curH2Li = null;
            const subOl = document.createElement('ol');
            li.appendChild(subOl);
            tocRoot.appendChild(li);
        } else if (tagName === 'H2') {
            curH2Li = li;
            const subOl = document.createElement('ol');
            li.appendChild(subOl);
            (curH1Li ? curH1Li.querySelector('ol') : tocRoot).appendChild(li);
        } else {
            (curH2Li ? curH2Li.querySelector('ol') : curH1Li ? curH1Li.querySelector('ol') : tocRoot)
                .appendChild(li);
        }
    });

    tocRoot.querySelectorAll('li').forEach(li => {
        const subOl = li.querySelector('ol');
        const toggle = li.querySelector('.toggle');

        if (subOl && subOl.children.length > 0) {
            toggle.textContent = '−';
            toggle.classList.add('has-child');

            toggle.addEventListener('click', e => {
                e.stopPropagation();
                li.classList.toggle('closed');
                toggle.textContent = li.classList.contains('closed') ? '+' : '−';
                subOl.style.display = li.classList.contains('closed') ? 'none' : 'block';
            });
        } else {
            toggle.style.opacity = '0.3';
        }
    });

    const links = tocRoot.querySelectorAll('a');

    function scrollTocToCenter(link) {
        if (!link) return;
        const tocTop = tocContainer.getBoundingClientRect().top;
        const linkTop = link.getBoundingClientRect().top;
        const target = tocContainer.scrollTop + (linkTop - tocTop) - tocContainer.clientHeight / 2 + link.offsetHeight / 2;
        tocContainer.scrollTo({
            top: target,
            behavior: 'smooth'
        });
    }

    function highlightAndCenter() {
        let activeId = '';
        for (let i = 0; i < headings.length; i++) {
            const rect = headings[i].getBoundingClientRect();
            if (rect.top >= 0 && rect.top <= window.innerHeight * 0.5) {
                activeId = headings[i].id;
                break;
            } else if (rect.top < 0) {
                activeId = headings[i].id;
            }
        }

        let activeLink = null;
        links.forEach(a => {
            const isActive = a.hash === `#${activeId}`;
            a.classList.toggle('active', isActive);
            if (isActive) activeLink = a;
        });

        if (activeLink) scrollTocToCenter(activeLink);
    }

    window.addEventListener('scroll', highlightAndCenter, { passive: true });
    highlightAndCenter();
})();
