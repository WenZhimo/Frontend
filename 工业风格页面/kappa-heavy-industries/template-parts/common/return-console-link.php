<?php
$args = wp_parse_args(
    $args ?? array(),
    array(
        'href'  => home_url(),
        'label' => '> 返回主控制台 <',
        'style' => "display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);",
    )
);
?>
<a data-selectable href="<?php echo esc_url( $args['href'] ); ?>" style="<?php echo esc_attr( $args['style'] ); ?>">
    <?php echo esc_html( $args['label'] ); ?>
</a>
