<?php
/**
 * 独立页面模板 (无边框纯净版)
 */
get_header(); ?>
<?php if ( has_post_thumbnail() ) : ?>
                    <div data-selectable style="margin-bottom: 40px; border: 1px solid #988b32; padding: 4px; background: rgba(0, 20, 0, 0.5); box-shadow: 0 0 15px rgba(152, 139, 50, 0.15); position: relative;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #988b32; padding: 2px 8px; font-family: 'ZCOOLQingKeHuangYou-Regular'; font-size: 0.9rem; z-index: 2; border: 1px solid #988b32;">
                            [ 附件影像 RECORD ]
                        </div>
                        
                        <img src="<?php echo get_the_post_thumbnail_url(get_the_ID(), 'full'); ?>" 
                             alt="<?php the_title_attribute(); ?>" 
                             style="width: 100%; max-height: 900px; object-fit: cover; display: block; opacity: 0.85; filter: contrast(1.1) grayscale(10%);">
                    </div>
                <?php endif; ?>
<div id="pager">
    <section class="page active">
        
        <div id="article-container" class="inner-page-shell inner-page-shell--narrow inner-page-shell--spaced">
            <?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>

                <header class="inner-page-header">
                    <h1 data-selectable class="wp-block-post-title inner-page-title">
                        <?php the_title(); ?>
                    </h1>
                </header>

                <div data-selectable class="inner-page-content">
                    <?php the_content(); ?>
                </div>

                <div class="inner-page-return">
                    <a data-selectable href="<?php echo home_url(); ?>" class="inner-page-return-link">
                        > 返回主控制台 <
                    </a>
                </div>

            <?php endwhile; endif; ?>

        </div>
        
    </section>
</div>

<?php get_footer(); ?>