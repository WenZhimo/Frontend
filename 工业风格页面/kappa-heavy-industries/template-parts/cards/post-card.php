<?php
$card_bg_style = 'style="position: relative;"';
if ( has_post_thumbnail() ) {
    $thumbnail_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
    $card_bg_style = 'style="background: linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.9)), url(\'' . esc_url( $thumbnail_url ) . '\') center / cover no-repeat; position: relative;"';
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
            <span>[所属域]：<?php the_category( ' / ' ); ?></span><br>
            <span>[更新于]：<?php the_time( 'Y-m-d H:i' ); ?></span>
        </div>
    </div>
</div>
