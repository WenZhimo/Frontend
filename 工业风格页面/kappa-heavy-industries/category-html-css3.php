<?php
/**
 * 档案列表页模板 (用于展示特定分类、标签下的所有文章)
 */
get_header(); ?>

<div id="pager">
    <section class="page active">
        
        <div class="inner-page-shell inner-page-shell--wide inner-page-shell--spaced">

            <header class="inner-page-header inner-page-header--wide">
                <h1 data-selectable class="inner-page-title">
                    [ 检索域 ]：<?php the_archive_title(); ?>
                </h1>
                <?php 
                // 如果在后台给分类写了描述，这里会显示出来
                if ( get_the_archive_description() ) {
                    echo '<div style="color: #888; font-size: 1.1rem; text-align: justify;">' . get_the_archive_description() . '</div>';
                }
                ?>
                <p>基本上都是AI写的。尤其是Gimini，很厉害。</p>
                <p>本人不负责技术答疑，请问AI大人。</p>
                <a href="https://github.com/S-R-Afraid/Frontend">Github-前端仓库</a>
            </header>

            <style>
                .card-meta-links a { color: #988b32; text-decoration: none; transition: all 0.3s ease; }
                .card-meta-links a:hover { color: #fff; text-shadow: 0 0 8px rgba(152, 139, 50, 0.8); }
            </style>

            <div class="cards">
                <?php if ( have_posts() ) : while ( have_posts() ) : the_post(); 
                    
                    // 处理封面背景
                    $card_bg_style = 'style="position: relative;"';
                    if ( has_post_thumbnail() ) {
                        $thumbnail_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
                        $card_bg_style = 'style="background: linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.9)), url(\'' . esc_url($thumbnail_url) . '\') center / cover no-repeat; position: relative;"';
                    }
                ?>
                    <div class="card" data-selectable data-selectable-highlight <?php echo $card_bg_style; ?>>
                        <a href="<?php the_permalink(); ?>" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></a>
                        
                        <div style="display: flex; flex-direction: column; height: 100%; pointer-events: none;">
                            <h3 style="color: #988b32; margin-top: 0; position: relative; z-index: 2;"><?php the_title(); ?></h3>
                            <p style="font-size: 0.95rem; color: #ccc; flex-grow: 1; position: relative; z-index: 2;">
                                <?php echo wp_trim_words( get_the_excerpt(), 40, '...' ); ?>
                            </p>
                            
                            <div class="card-meta-links" style="font-size: 0.85rem; color: #888; border-top: 1px dashed #444; padding-top: 12px; margin-top: 15px; line-height: 1.6; position: relative; z-index: 3; pointer-events: auto;">
                                <span>[责任人]：<?php the_author(); ?></span><br>
                                <span>[所属域]：<?php the_category(' / '); ?></span><br>
                                <span>[更新于]：<?php the_time('Y-m-d H:i'); ?></span>
                            </div>
                        </div>
                    </div>
                    
                <?php endwhile; else : ?>
                    <div class="card" data-selectable data-selectable-highlight style="grid-column: 1 / -1; text-align: center;">
                        <h3 style="color: #cc0000;">[ 检索结果为空 ]</h3>
                        <p>该分类域下尚未录入任何档案。</p>
                    </div>
                <?php endif; ?>
            </div>

            <div style="margin-top: 60px; text-align: center;">
                <div style="margin-bottom: 30px; font-family: ZCOOLQingKeHuangYou-Regular;">
                    <?php 
                    the_posts_pagination( array(
                        'prev_text' => '< 上一页',
                        'next_text' => '下一页 >',
                    ) ); 
                    ?>
                </div>
                
                <a data-selectable href="<?php echo home_url(); ?>" style="display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);">
                    > 返回主控制台 <
                </a>
            </div>

        </div>
    </section>
</div>

<?php get_footer(); ?>