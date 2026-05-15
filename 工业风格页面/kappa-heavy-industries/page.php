<?php
/**
 * 独立页面模板 (无边框纯净版)
 */
get_header(); ?>
<?php get_template_part( 'template-parts/content/featured-record-banner' ); ?>
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
                    <?php get_template_part( 'template-parts/common/return-console-link', null, array(
                        'href'  => home_url(),
                        'label' => '> 返回主控制台 <',
                        'style' => 'display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);'
                    ) ); ?>
                </div>

            <?php endwhile; endif; ?>

        </div>
        
    </section>
</div>

<?php get_footer(); ?>