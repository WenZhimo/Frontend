<?php
/**
 * 单篇文章/档案详情模板
 */
get_header(); ?>
<?php if ( has_post_thumbnail() ) : ?>
                    <div data-selectable style="margin-bottom: 40px; border: 1px solid #988b32; padding: 4px; background: rgba(0, 20, 0, 0.5); box-shadow: 0 0 15px rgba(152, 139, 50, 0.15); position: relative;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #988b32; padding: 2px 8px; font-family: 'ZCOOLQingKeHuangYou-Regular'; font-size: 0.9rem; z-index: 2; border: 1px solid #988b32;">
                            [ 附件影像 RECORD ]
                        </div>
                        
                        <img src="<?php echo get_the_post_thumbnail_url(get_the_ID(), 'full'); ?>" 
                             alt="<?php the_title_attribute(); ?>" 
                             style="width: 100%; max-height: 450px; object-fit: cover; display: block; opacity: 0.85; filter: contrast(1.1) grayscale(10%);">
                    </div>
                <?php endif; ?>
<div id="pager">
    <section class="page active">
        
        <div class="page-frame" style="background: rgba(10, 10, 10, 0.9); display: flex; align-items: flex-start; justify-content: center; padding-top: 120px; overflow-y: auto;">
            
            <div id="article-container" class="page-scroll" style="width: 100%; max-width: 900px; margin: 0 auto 100px auto; background: rgba(0, 20, 0, 0.6); border: 1px solid #988b32; box-shadow: 0 0 20px rgba(152, 139, 50, 0.2); padding: 50px; position: relative;">
                
                <div style="position: absolute; top: 0; left: 0; width: 15px; height: 15px; border-top: 2px solid #988b32; border-left: 2px solid #988b32;"></div>
                <div style="position: absolute; top: 0; right: 0; width: 15px; height: 15px; border-top: 2px solid #988b32; border-right: 2px solid #988b32;"></div>
                <div style="position: absolute; bottom: 0; left: 0; width: 15px; height: 15px; border-bottom: 2px solid #988b32; border-left: 2px solid #988b32;"></div>
                <div style="position: absolute; bottom: 0; right: 0; width: 15px; height: 15px; border-bottom: 2px solid #988b32; border-right: 2px solid #988b32;"></div>

                <?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
                    
                    <header style="border-bottom: 1px dashed #555; margin-bottom: 30px; padding-bottom: 20px;">
                        <h1 data-selectable style="font-family: 峄山碑篆体; color: #988b32; font-size: clamp(30px, 4vw, 50px); margin: 0 0 15px 0; text-shadow: 0 0 10px rgba(152, 139, 50, 0.5);">
                            <?php the_title(); ?>
                        </h1>
                        
                        <div style="font-family: ZCOOLQingKeHuangYou-Regular; color: #888; font-size: 1.2rem; display: flex; gap: 20px; flex-wrap: wrap;">
                            <span data-selectable>[ 归档时间 ]：<?php the_time('Y-m-d H:i'); ?></span>
                            <span data-selectable>[ 课题责任人 ]：<?php the_author(); ?></span>
                            <span data-selectable>[ 档案分类 ]：<?php the_category(', '); ?></span>
                        </div>
                    </header>

                    <div data-selectable style="font-size: 1.1rem; line-height: 1.8; color: #ccc;">
                        <?php the_content(); ?>
                    </div>
                    
                    
                    <div class="archive-navigation-hud">
                        <?php
                        // 获取相邻文章对象（基于发布时间）
                        $prev_post = get_previous_post(); // 上一篇（较旧的档案）
                        $next_post = get_next_post();     // 下一篇（较新的档案）
                        ?>
    
                        <?php if ( ! empty( $prev_post ) ) : ?>
                            <a href="<?php echo esc_url( get_permalink( $prev_post->ID ) ); ?>" class="nav-block nav-prev">
                                <div class="nav-label"><< [ 检索旧档 / PREVIOUS ]</div>
                                <div class="nav-title"><?php echo esc_html( get_the_title( $prev_post->ID ) ); ?></div>
                            </a>
                        <?php else : ?>
                            <div class="nav-block nav-empty">
                                <div class="nav-label"><< [ 检索旧档 / PREVIOUS ]</div>
                                <div class="nav-title" style="color: #666;">[ ERR: 已触及数据库底层 ]</div>
                            </div>
                        <?php endif; ?>
    
                        <?php if ( ! empty( $next_post ) ) : ?>
                            <a href="<?php echo esc_url( get_permalink( $next_post->ID ) ); ?>" class="nav-block nav-next">
                                <div class="nav-label">[ 查阅新档 / NEXT ] >></div>
                                <div class="nav-title"><?php echo esc_html( get_the_title( $next_post->ID ) ); ?></div>
                            </a>
                        <?php else : ?>
                            <div class="nav-block nav-empty" style="text-align: right;">
                                <div class="nav-label">[ 查阅新档 / NEXT ] >></div>
                                <div class="nav-title" style="color: #666;">[ ERR: 当前为最新记录 ]</div>
                            </div>
                        <?php endif; ?>
                    </div>
                    
                    
                    <?php
                    // 如果文章开启了评论，或者已经有评论了，就加载评论模板
                    if ( comments_open() || get_comments_number() ) :
                        comments_template();
                    endif;
                    ?>
                    <div style="margin-top: 60px; text-align: center; border-top: 1px solid #333; padding-top: 30px;">
                        <a data-selectable href="<?php echo home_url(); ?>" style="display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);">
                            > 终止读取并返回主控制台 <
                        </a>
                    </div>

                <?php endwhile; else : ?>
                    <div style="text-align: center; padding: 50px 0;">
                        <h1 data-selectable style="color: #cc0000; font-family: ZCOOLQingKeHuangYou-Regular;">[ 错误：档案数据损坏或不存在 ]</h1>
                    </div>
                <?php endif; ?>

            </div>
        </div>
    </section>
</div>

<?php get_footer(); ?>