<footer>
    <div class="footer-text">
        <span data-selectable>© 2026 文于止墨</span>
        <span data-selectable>热爱创造的极地空想家</span>
    </div>
    <div id="progress"><span></span></div>
</footer>

<div id="fn-popup"></div>

<?php if ( ! wp_is_mobile() && is_singular() ) : ?>
<div class="table-of-contents mobile-hide" id="toc-container" style="display: none;">
    <div class="toc-header">[ 档案检索目录 / INDEX ]</div>
    <ol id="toc-list"></ol>
</div>

<?php endif; ?>


<!-- 折叠框 -->


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
<?php endif; ?>
<?php wp_footer(); ?>
</body>

</html>