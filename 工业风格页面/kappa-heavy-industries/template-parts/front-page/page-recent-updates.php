<!-- 最近更新 -->
<section class="page">
    <div class="page-frame">
        <div class="page-scroll">
            <div style="display: grid;grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));gap: 16px;">
                <div>
                    <h1 data-selectable>最近更新</h1>
                </div>
            </div>

            <div class="cards">
                <?php
                    $recent_args = array(
                        'post_type'           => 'post',
                        'posts_per_page'      => 9,
                        'orderby'             => 'date',
                        'order'               => 'DESC',
                        'ignore_sticky_posts' => 1
                    );
                    $recent_query = new WP_Query( $recent_args );

                    if ( $recent_query->have_posts() ) :
                        while ( $recent_query->have_posts() ) : $recent_query->the_post();

                            $card_bg_attrs = 'class="card"';
                            if ( has_post_thumbnail() ) {
                                $thumbnail_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
                                $card_bg_attrs = kappa_get_homepage_bg_attrs( array(
                                    'variant'       => 'card',
                                    'desktop_image' => $thumbnail_url,
                                    'mobile_image'  => $thumbnail_url,
                                    'position'      => 'center',
                                    'overlay_start' => 'rgba(0, 0, 0, 0.65)',
                                    'overlay_end'   => 'rgba(0, 0, 0, 0.9)',
                                    'extra_classes' => 'card',
                                ) );
                            }
                ?>
                <div data-selectable data-selectable-highlight <?php echo $card_bg_attrs; ?>>
                    <?php if ( has_post_thumbnail() ) : ?>
                    <div class="homepage-bg-layer" aria-hidden="true"></div>
                    <?php endif; ?>

                    <a href="<?php the_permalink(); ?>"
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></a>

                    <div style="display: flex; flex-direction: column; height: 100%; pointer-events: none;">

                        <h3 style="color: #988b32; margin-top: 0; position: relative; z-index: 2;">
                            <?php the_title(); ?></h3>

                        <p style="font-size: 0.95rem; color: #ccc; flex-grow: 1; position: relative; z-index: 2;">
                            <?php echo wp_trim_words( get_the_excerpt(), 40, '...' ); ?>
                        </p>

                        <div class="card-meta-links"
                            style="font-size: 0.85rem; color: #888; border-top: 1px dashed #444; padding-top: 12px; margin-top: 15px; line-height: 1.6; position: relative; z-index: 3; pointer-events: auto;">

                            <span>[责任人]：<?php the_author(); ?></span><br>
                            <span>[所属域]：<?php the_category(' / '); ?></span><br>

                            <span>[发布于]：<?php the_modified_time('Y-m-d H:i:s'); ?>
                                <span style="color: #444; font-size: 0.8em; margin-left: 5px;">[ UNIX:
                                    <?php the_modified_time('U'); ?> ]
                                </span>
                            </span>
                            <br>
                            <div id="barcode-container-<?php the_ID(); ?>" style="text-align: right; width: 100%; margin-top: 15px;">

                                <img id="barcode-img-<?php the_ID(); ?>" data-unix-timestamp="<?php the_time('U'); ?>" style="max-width: 100%; height: auto; display: inline-block; opacity: 0.85;" />

                            </div>
                        </div>
                    </div>
                </div>
                <?php
                        endwhile;
                        wp_reset_postdata();
                    else :
                ?>
                <div class="card" data-selectable data-selectable-highlight>
                    <h3>暂无更新记录</h3>
                    <p>数据库中尚未检索到任何档案。</p>
                </div>
                <?php endif; ?>
            </div>

            <div class="homepage-recent-updates-footer" style="margin-top: 50px; text-align: center; padding-bottom: calc(var(--footer-h) + 32px);">
                <a data-selectable data-selectable-highlight
                    href="https://www.wenzhimo.xyz/%E6%9C%80%E8%BF%91%E6%9B%B4%E6%96%B0/"
                    style="display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);">
                    > 检索最近更新的全部档案 < </a>
            </div>

        </div>
    </div>
</section>
