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
        
        <div id="article-container" style="width: 100%; max-width: 900px; margin: 0 auto; padding: 180px 20px 100px 20px;">
            <?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
                
                <header style="border-bottom: 1px dashed #555; margin-bottom: 30px; padding-bottom: 20px;">
                    <h1 data-selectable class="wp-block-post-title"
                            style="font-family: 峄山碑篆体; color: #988b32; font-size: clamp(30px, 4vw, 50px); margin: 0 0 15px 0; text-shadow: 0 0 10px rgba(152, 139, 50, 0.5);">
                        <?php the_title(); ?>
                    </h1>
                </header>

                <div data-selectable style="font-size: 1.1rem; line-height: 1.8; color: #ccc; text-align: justify;">
                    <?php the_content(); ?>
                </div>

                <div style="margin-top: 60px; text-align: center; border-top: 1px solid #333; padding-top: 30px;">
                    <a data-selectable href="<?php echo home_url(); ?>" style="display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);">
                        > 返回主控制台 <
                    </a>
                </div>

            <?php endwhile; endif; ?>

        </div>
        
    </section>
</div>

<?php get_footer(); ?>