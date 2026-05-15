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

            <?php get_template_part( 'template-parts/cards/post-card-list' ); ?>

            <div style="margin-top: 60px; text-align: center;">
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
    </section>
</div>

<?php get_footer(); ?>