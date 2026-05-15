<?php
$args = wp_parse_args(
    $args ?? array(),
    array(
        'empty_title'   => '[ 检索结果为空 ]',
        'empty_message' => '该分类域下尚未录入任何档案。',
    )
);
?>
<style>
.card-meta-links a { color: #988b32; text-decoration: none; transition: all 0.3s ease; }
.card-meta-links a:hover { color: #fff; text-shadow: 0 0 8px rgba(152, 139, 50, 0.8); }
</style>

<div class="cards">
    <?php if ( have_posts() ) : ?>
        <?php while ( have_posts() ) : the_post(); ?>
            <?php get_template_part( 'template-parts/cards/post-card' ); ?>
        <?php endwhile; ?>
    <?php else : ?>
        <div class="card" data-selectable data-selectable-highlight style="grid-column: 1 / -1; text-align: center;">
            <h3 style="color: #cc0000;"><?php echo esc_html( $args['empty_title'] ); ?></h3>
            <p><?php echo esc_html( $args['empty_message'] ); ?></p>
        </div>
    <?php endif; ?>
</div>
