<footer>
    <div class="footer-text">
        <span data-selectable>© 2026 文于止墨</span>
        <span data-selectable>热爱创造的极地空想家</span>
    </div>
    <div id="progress"><span></span></div>
</footer>

<style>
/* —— 正文中的脚注触发器样式 —— */
.fn {
    cursor: crosshair;
    /* 工业风准星指针 */
    color: #988b32;
    /* 工业金 */
    font-size: 0.9em;
    font-weight: normal;
    font-family: 'ZCOOLQingKeHuangYou-Regular', monospace;
    border-bottom: 1px dashed #988b32;
    padding: 0 2px;
    transition: all 0.3s ease;
}

.fn:hover {
    color: #fff;
    background: rgba(152, 139, 50, 0.2);
    text-shadow: 0 0 5px rgba(152, 139, 50, 0.8);
}

/* —— 固定在左上角的 HUD 档案弹窗 —— */
#fn-popup {
    position: fixed;
    top: 40px;
    left: 20px;
    width: 420px;
    max-width: calc(100vw - 40px);
    padding: 25px 15px 15px 15px;
    /* 顶部留出空间给标签 */
    background: rgba(10, 15, 10, 0.95);
    /* 深邃的终端底色 */
    border: 1px solid #988b32;
    /* 锐利的单线边框 */
    box-shadow:
        0 0 15px rgba(152, 139, 50, 0.15),
        inset 0 0 10px rgba(152, 139, 50, 0.1);
    /* 内发光营造屏幕感 */
    font-size: 0.95rem;
    color: #ccc;
    line-height: 1.7;
    text-align: justify;
    z-index: 9999;

    /* 动画初始状态 */
    opacity: 0;
    transform: translateX(-15px);
    /* 从左侧滑入，更有机械感 */
    transition: opacity 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    pointer-events: none;
}

/* 弹窗左上角的工业装饰标签 */
#fn-popup::before {
    content: '[ 附加数据 RECORD ]';
    position: absolute;
    top: 0;
    left: 0;
    background: #988b32;
    color: #000;
    font-size: 12px;
    font-weight: bold;
    padding: 2px 8px;
    font-family: 'ZCOOLQingKeHuangYou-Regular', monospace;
    letter-spacing: 1px;
}

#fn-popup.show {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
}

/* 弹窗内部如果有链接，也保持主题色 */
#fn-popup a {
    color: #988b32;
    text-decoration: none;
}

#fn-popup a:hover {
    text-decoration: underline;
}
</style>

<div id="fn-popup"></div>

<script>
/* ==========================================
        核心逻辑：HUD 脚注弹窗调度系统
        ========================================== */
const popup = document.getElementById('fn-popup');
let hideTimer = null;

/* 统一隐藏函数 */
function hidePopup() {
    popup.classList.remove('show');
}

/* 统一显示函数 */
function showPopup(html) {
    popup.innerHTML = html;
    popup.classList.add('show');
    clearTimeout(hideTimer); // 防止刚显示就被隐藏
}

/* 给所有脚注标记绑定事件 */
document.querySelectorAll('.fn').forEach(el => {
    const id = el.dataset.fn;
    // 找不到内容时的防错提示也改成了工业风
    const html = document.getElementById(id)?.innerHTML ||
        '<span style="color:#cc0000;">[ ERR: 目标数据段丢失或未授权访问 ]</span>';

    el.addEventListener('mouseenter', () => showPopup(html));

    el.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(hidePopup, 800); // 稍微缩短为 0.8 秒，动作更利落
    });
});

/* 弹窗防误触保护 */
popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
popup.addEventListener('mouseleave', () => hideTimer = setTimeout(hidePopup, 400));
</script>

<script>
/* ==========================================
        核心逻辑：全局平滑锚点引擎
        ========================================== */
document.addEventListener('click', function(e) {
    const a = e.target.closest('a');
    if (!a) return;

    /* 1. 只拦截当前页内的锚点跳转
    2. 兼容 href="#xxx" 或 href="#xxx-link" */
    const hash = a.getAttribute('href');
    if (!hash || !hash.startsWith('#')) return;

    const target = document.getElementById(hash.slice(1)) ||
        document.getElementById(hash.slice(1).replace('-link', ''));

    if (target) {
        e.preventDefault(); // 阻止浏览器原生生硬的跳转

        // 使用平滑滚动，并将目标定位在屏幕中间，阅读体验更好
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
});
</script>

<?php if ( ! wp_is_mobile() && is_singular() ) : ?>
<div class="table-of-contents mobile-hide" id="toc-container" style="display: none;">
    <div class="toc-header">[ 档案检索目录 / INDEX ]</div>
    <ol id="toc-list"></ol>
</div>

<script>
(() => {
    // 1. 原始抓取：获取容器内的所有目标标题
  const rawHeadings = document.querySelectorAll('#article-container h1:not(.wp-block-post-title), #article-container h2, #article-container h3, #article-container h4');
  
  // 👇 核心修复：开启信号过滤器，剔除所有属于评论区（#comments）的标题
  const headings = Array.from(rawHeadings).filter(h => !h.closest('#comments'));

  const tocContainer = document.getElementById('toc-container');
  const tocRoot  = document.getElementById('toc-list');

  // 如果文章正文里没有小标题，则直接隐藏目录面板并退出
  if (headings.length === 0) return;
    tocContainer.style.display = 'block';

    headings.forEach((h, idx) => {
        if (!h.id) h.id = `heading-${idx}`;
    });

    // 2. 计数器改为 H1, H2, H3
    let h1Count = 0,
        h2Count = 0,
        h3Count = 0;
    let curH1Li = null,
        curH2Li = null;

    headings.forEach(h => {
        let prefix = '';
        const tagName = h.tagName.toUpperCase();

        // 更新计数器与前缀
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

        // 创建目录项
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

        // 层级嵌套逻辑更新
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

    // 4. 激活折叠按钮功能
    tocRoot.querySelectorAll('li').forEach(li => {
        const subOl = li.querySelector('ol');
        const toggle = li.querySelector('.toggle');

        if (subOl && subOl.children.length > 0) {
            toggle.textContent = '−'; // 有子节点，初始显示为可折叠
            toggle.classList.add('has-child');

            toggle.addEventListener('click', e => {
                e.stopPropagation();
                li.classList.toggle('closed');
                toggle.textContent = li.classList.contains('closed') ? '+' : '−';
                subOl.style.display = li.classList.contains('closed') ? 'none' : 'block';
            });
        } else {
            toggle.style.opacity = '0.3'; // 无子节点，箭头变暗
        }
    });

    // 5. 滚动高亮与自动居中跟随
    const links = tocRoot.querySelectorAll('a');

    function scrollTocToCenter(link) {
        if (!link) return;
        const tocTop = tocContainer.getBoundingClientRect().top;
        const linkTop = link.getBoundingClientRect().top;
        const target = tocContainer.scrollTop + (linkTop - tocTop) - tocContainer.clientHeight / 2 + link
            .offsetHeight / 2;
        tocContainer.scrollTo({
            top: target,
            behavior: 'smooth'
        });
    }

    function highlightAndCenter() {
        let activeId = '';
        // 寻找当前在视口内的标题
        for (let i = 0; i < headings.length; i++) {
            const rect = headings[i].getBoundingClientRect();
            // 考虑到了固定页眉的高度，判断条件放宽到视口上部 150px
            if (rect.top >= 0 && rect.top <= window.innerHeight * 0.5) {
                activeId = headings[i].id;
                break;
            } else if (rect.top < 0) {
                activeId = headings[i].id; // 已经滚过的也算作当前
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

    window.addEventListener('scroll', highlightAndCenter, {
        passive: true
    });
    highlightAndCenter();
})();
</script>
<?php endif; ?>


<!-- 折叠框 -->
<script>
document.addEventListener('DOMContentLoaded', () => {
    const detailsElements = document.querySelectorAll('#article-container details');

    detailsElements.forEach(details => {
        const summary = details.querySelector('summary');
        // 获取除了 summary 以外的所有正文内容
        const contentNodes = Array.from(details.childNodes).filter(node => node !== summary);

        // 创建内部包装壳 (为了精准测量高度)
        const wrapper = document.createElement('div');
        wrapper.className = 'sys-details-wrapper';

        // 制造顶部和底部的关闭按钮
        const btnTop = document.createElement('div');
        btnTop.className = 'sys-close-btn';
        btnTop.innerHTML = 'FOLD_DATA // 终止读取并折叠';

        const btnBottom = document.createElement('div');
        btnBottom.className = 'sys-close-btn';
        btnBottom.innerHTML = 'FOLD_DATA // 终止读取并折叠';

        // 将按钮和内容装填进包装壳
        wrapper.appendChild(btnTop);
        contentNodes.forEach(node => wrapper.appendChild(node));
        wrapper.appendChild(btnBottom);
        details.appendChild(wrapper);

        // 动画状态锁
        let animation = null;
        let isClosing = false;
        let isExpanding = false;

        // 核心关门协议
        const closeDetails = (e) => {
            if (e) e.preventDefault();
            if (isClosing || !details.open) return;
            isClosing = true;
            
            const startHeight = `${details.offsetHeight}px`;
            const endHeight = `${summary.offsetHeight}px`;
            
            // 防止内容溢出
            details.style.overflow = 'hidden';

            if (animation) animation.cancel();
            // 使用原生 Web Animations API 实现绝对平滑的折叠
            animation = details.animate({ height: [startHeight, endHeight] }, { duration: 350, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
            
            animation.onfinish = () => {
                details.open = false; // 动画播完后再断开 DOM
                details.style.height = '';
                details.style.overflow = '';
                isClosing = false;
            };
        };

        // 核心开门协议
        const openDetails = (e) => {
            if (e) e.preventDefault();
            if (isExpanding || details.open) return;
            isExpanding = true;
            
            details.style.height = `${details.offsetHeight}px`;
            details.open = true; // 先接入 DOM 以获取真实高度
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

        // 拦截原生点击事件，交由引擎接管
        summary.addEventListener('click', (e) => {
            if (isClosing || !details.open) { openDetails(e); } 
            else if (isExpanding || details.open) { closeDetails(e); }
        });

        // 绑定按钮点击事件
        btnTop.addEventListener('click', closeDetails);
        btnBottom.addEventListener('click', (e) => {
            closeDetails(e);
            // 人性化细节：如果从底部点击关闭，自动将屏幕平滑滚动回标题栏，防止阅读迷失
            setTimeout(() => {
                summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        });
    });
});
</script>

<style>
/* 面板主体：悬浮于右侧 */
.table-of-contents {
    position: fixed;
    top: 150px;
    right: 2vw;
    /* 紧贴屏幕右侧 */
    width: 260px;
    /* 固定宽度 */
    z-index: 998;

    background: rgba(10, 15, 10, 0.85);
    /* 终端墨绿底色 */
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid #988b32;
    /* 工业金边框 */
    box-shadow: inset 0 0 10px rgba(152, 139, 50, 0.1), 0 5px 15px rgba(0, 0, 0, 0.5);
    padding: 0 0 15px 0;

    max-height: calc(100vh - 200px);
    overflow-y: auto;
    font-family: monospace, sans-serif;
}

/* 当屏幕小于 1350px 时自动隐藏目录，防止遮挡居中 900px 的正文 */
@media screen and (max-width: 1350px) {
    .table-of-contents.mobile-hide {
        display: none !important;
    }
}

/* 目录面板头部横幅 */
.toc-header {
    background: #988b32;
    color: #000;
    padding: 6px 15px;
    font-family: 'ZCOOLQingKeHuangYou-Regular', monospace;
    font-size: 1.1rem;
    letter-spacing: 1px;
    margin-bottom: 15px;
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 2;
}

/* 列表容器 */
.table-of-contents ol {
    padding-left: 25px;
    margin: 0;
    padding-right: 15px;
}

.table-of-contents li {
    list-style: none;
    position: relative;
    margin-bottom: 6px;
}

/* 链接默认样式 */
.table-of-contents a {
    color: #888;
    text-decoration: none;
    display: block;
    font-size: 0.9rem;
    line-height: 1.4;
    transition: all 0.2s;
}

/* 鼠标悬停 */
.table-of-contents a:hover {
    color: #ccc;
    text-shadow: 0 0 5px rgba(204, 204, 204, 0.5);
}

/* 当前阅读位置高亮 */
.table-of-contents a.active {
    color: #00ffff;
    /* 终端青色，与工业金形成对比 */
    font-weight: bold;
    text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
}

.table-of-contents a.active::before {
    content: '>';
    position: absolute;
    left: -12px;
    color: #00ffff;
    animation: blink 1s infinite;
}

/* 展开/折叠按钮 */
.toggle {
    cursor: pointer;
    position: absolute;
    left: -18px;
    top: 0px;
    width: 15px;
    text-align: center;
    user-select: none;
    color: #988b32;
    font-family: monospace;
    font-weight: bold;
    transition: color 0.2s;
}

.toggle.has-child:hover {
    color: #fff;
}

/* 工业风滚动条 (Webkit) */
.table-of-contents::-webkit-scrollbar {
    width: 4px;
}

.table-of-contents::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
}

.table-of-contents::-webkit-scrollbar-thumb {
    background: #988b32;
}

/* 终端光标闪烁动画 */
@keyframes blink {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0;
    }
}
</style>


<?php 
// 智能路由：仅在“单篇文章”页面渲染此模块
if ( is_single() ) : 
?>
<div class="recent-updates-sidebar mobile-hide">
    <div class="sidebar-header">[ 最新情报 / LATEST ]</div>
    <ul class="sidebar-list">
        <?php
        // 1. 设置查询参数
        $recent_sidebar_args = array(
            'post_type'      => 'post',
            'posts_per_page' => 4,          // 获取 4 篇文章
            'orderby'        => 'date',     // 按照你之前要求的“发布时间”排序
            'order'          => 'DESC',
            'post__not_in'   => array( get_the_ID() ), // 【核心细节】从列表中排除当前正在阅读的文章！
            'ignore_sticky_posts' => 1
        );
        $recent_sidebar_query = new WP_Query( $recent_sidebar_args );

        // 2. 循环输出列表
        if ( $recent_sidebar_query->have_posts() ) :
            while ( $recent_sidebar_query->have_posts() ) : $recent_sidebar_query->the_post();
                ?>
        <li>
            <a href="<?php the_permalink(); ?>">
                <span class="sidebar-post-title"><?php echo wp_trim_words( get_the_title(), 20, '...' ); ?></span>
                <span class="sidebar-post-date">> <?php the_time('Y-m-d'); ?></span>
            </a>
        </li>
        <?php
            endwhile;
            wp_reset_postdata(); // 归还数据主权
        else :
            echo '<li style="color: #cc0000; font-size: 0.9rem;">[ ERR: 未检索到其他档案 ]</li>';
        endif;
        ?>
    </ul>
</div>

<style>
/* 面板主体：悬浮于左侧 */
.recent-updates-sidebar {
    position: fixed;
    top: 150px;
    left: 2vw;
    /* 紧贴屏幕左侧 */
    width: 240px;
    /* 宽度和右边目录差不多 */
    z-index: 998;

    background: rgba(10, 15, 10, 0.85);
    /* 终端墨绿底色 */
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid #988b32;
    /* 工业金边框 */
    box-shadow: inset 0 0 10px rgba(152, 139, 50, 0.1), 0 5px 15px rgba(0, 0, 0, 0.5);
    padding: 0 0 15px 0;
    font-family: monospace, sans-serif;
}

/* 当屏幕小于 1350px 时自动隐藏，防止夹击遮挡正文 */
@media screen and (max-width: 1350px) {
    .recent-updates-sidebar.mobile-hide {
        display: none !important;
    }
}

/* 面板头部横幅 */
.sidebar-header {
    background: #988b32;
    color: #000;
    padding: 6px 15px;
    font-family: 'ZCOOLQingKeHuangYou-Regular', monospace;
    font-size: 1.1rem;
    letter-spacing: 1px;
    margin-bottom: 15px;
    font-weight: bold;
}

/* 列表容器 */
.sidebar-list {
    list-style: none;
    padding: 0 15px;
    margin: 0;
}

.sidebar-list li {
    margin-bottom: 12px;
    border-bottom: 1px dashed rgba(152, 139, 50, 0.3);
    padding-bottom: 10px;
}

.sidebar-list li:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

/* 链接与排版 */
.sidebar-list a {
    text-decoration: none;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
}

.sidebar-post-title {
    color: #ccc;
    font-size: 0.95rem;
    line-height: 1.4;
    margin-bottom: 6px;
    transition: color 0.3s;
}

.sidebar-post-date {
    color: #666;
    font-size: 0.8rem;
    font-family: 'ZCOOLQingKeHuangYou-Regular', monospace;
    transition: color 0.3s;
}

/* 鼠标悬停交互：标题变青色，日期变金色 */
.sidebar-list a:hover .sidebar-post-title {
    color: #00ffff;
    text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
}

.sidebar-list a:hover .sidebar-post-date {
    color: #988b32;
}
</style>
<?php endif; ?>
<?php wp_footer(); ?>
</body>

</html>