<?php
/**
 * HTML/CSS3 分类模板
 */
get_header(); ?>

<div id="pager">
    <section class="page active">
        <div class="inner-page-shell inner-page-shell--wide inner-page-shell--spaced category-html-shell">
            <div class="category-html-bg-layer" aria-hidden="true">
                <div class="category-html-bg-host" data-html-bg="snake-grid"></div>
            </div>

            <div class="category-html-content">
                <div class="category-html-strategy-hud" data-selectable>
                    <span class="category-html-strategy-label">[ ACTIVE STRATEGY ]</span>
                    <span class="category-html-strategy-value" data-html-strategy-name>loading...</span>
                </div>
                <header class="inner-page-header inner-page-header--wide category-html-header">
                    <div class="category-html-status" data-selectable>
                        <span class="category-html-status-dot" aria-hidden="true"></span>
                        <span>[ FRONTEND RENDER BUS : ONLINE ]</span>
                    </div>

                    <h1 data-selectable class="inner-page-title">
                        [ 前端域 ]：<?php the_archive_title(); ?>
                    </h1>

                    <?php
                    if ( get_the_archive_description() ) {
                        echo '<div class="category-html-desc" data-selectable>' . get_the_archive_description() . '</div>';
                    }
                    ?>

                    <div class="category-html-lead" data-selectable>
                        <p>聚焦 HTML、CSS3 与前端实现细节，把页面结构、样式系统与交互技巧整理成一个可检索的前端实验档案库。</p>
                    </div>

                    <div class="category-html-note" data-selectable>
                        <p>背景中的自动蛇用于模拟持续运行的前端渲染管线：它会自主巡航、追逐目标并根据视窗大小调整网格密度，但始终让内容可读性优先。</p>
                    </div>
                </header>

                <div class="category-html-archive-grid">
                    <?php get_template_part( 'template-parts/cards/post-card-list', null, array(
                        'empty_title'   => '[ 渲染缓存为空 ]',
                        'empty_message' => 'HTML/CSS3 分类中暂未录入任何档案。',
                    ) ); ?>
                </div>

                <div style="margin-top: 60px; text-align: center; position: relative; z-index: 1;">
                    <div style="margin-bottom: 30px; font-family: ZCOOLQingKeHuangYou-Regular;">
                        <?php
                        the_posts_pagination( array(
                            'prev_text' => '< 上一页',
                            'next_text' => '下一页 >',
                        ) );
                        ?>
                    </div>

                    <?php get_template_part( 'template-parts/common/return-console-link', null, array(
                        'href'  => home_url(),
                        'label' => '> 返回主控制台 <',
                        'style' => 'display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);'
                    ) ); ?>
                </div>
            </div>
        </div>
    </section>
</div>

<?php get_footer(); ?>
