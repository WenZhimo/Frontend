<?php if ( has_post_thumbnail() ) : ?>
<div data-selectable style="margin-bottom: 40px; border: 1px solid #988b32; padding: 4px; background: rgba(0, 20, 0, 0.5); box-shadow: 0 0 15px rgba(152, 139, 50, 0.15); position: relative;">
    <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: #988b32; padding: 2px 8px; font-family: 'ZCOOLQingKeHuangYou-Regular'; font-size: 0.9rem; z-index: 2; border: 1px solid #988b32;">
        [ 附件影像 RECORD ]
    </div>

    <img src="<?php echo get_the_post_thumbnail_url( get_the_ID(), 'full' ); ?>"
        alt="<?php the_title_attribute(); ?>"
        style="width: 100%; max-height: 900px; object-fit: cover; display: block; opacity: 0.85; filter: contrast(1.1) grayscale(10%);">
</div>
<?php endif; ?>
