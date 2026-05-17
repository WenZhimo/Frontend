<?php
/**
 * 音乐分类模板
 */
get_header(); ?>

<div id="pager">
    <section class="page active">
        <div class="inner-page-shell inner-page-shell--wide inner-page-shell--spaced category-music-shell">
            <div class="music-category-bg-layer" aria-hidden="true">
                <div class="music-category-bg-host" data-music-bg="wave-spectrum"
                    data-waveform-src="<?php echo esc_url( get_template_directory_uri() . '/asset/data/unchosen-waveform.json' ); ?>"></div>
            </div>

            <div class="category-music-content">
                <header class="inner-page-header inner-page-header--wide category-music-header">
                    <div class="music-header-status" data-selectable>
                        <span class="music-header-status-dot" aria-hidden="true"></span>
                        <span>[ AUDIO ARCHIVE BUS : ONLINE ]</span>
                    </div>

                    <div class="music-header-layout">
                        <div class="music-header-copy">
                            <p class="music-header-kicker" data-selectable>WAVEFORM / SPECTRUM / MEMORY ANCHOR</p>
                            <h1 data-selectable class="inner-page-title">
                                [ 音乐域 ]：<?php the_archive_title(); ?>
                            </h1>
                            <?php
                            if ( get_the_archive_description() ) {
                                echo '<div class="music-header-desc" data-selectable>' . get_the_archive_description() . '</div>';
                            }
                            ?>
                            <div class="music-header-lead" data-selectable>
                                <p>游荡在时间废墟中的旋律。</p>
                            </div>
                            <div class="music-header-note" data-selectable>
                                <p>让频率震荡，让杂音沉寂。</p>
                            </div>
                            <div class="music-header-actions">
                                <a href="音乐备忘录/" class="music-header-btn" title="跳转到音乐档案列表">
                                    <span class="cmd">C:\></span>
                                    <span>跳转至音频档案</span>
                                    <span class="tag">[ SIGNAL_SCAN ]</span>
                                </a>
                            </div>
                        </div>

                        <aside class="music-header-quote" data-selectable>
                            <div class="music-header-quote-label">[ LISTENING NOTE ]</div>
                            <p>噪声之中，总有一段旋律能把人带回原点。</p>
                        </aside>
                    </div>

                    <div class="music-header-meter" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                    </div>
                </header>

                <div id="music-archive-grid" class="music-archive-grid">
                    <?php get_template_part( 'template-parts/cards/post-card-list', null, array(
                        'empty_title'   => '[ 音频信号为空 ]',
                        'empty_message' => '音乐分类中暂未录入任何档案。',
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
