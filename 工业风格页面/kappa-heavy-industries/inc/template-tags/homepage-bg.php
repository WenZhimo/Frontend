<?php
/**
 * 首页背景属性工具
 */

function kappa_get_homepage_bg_attrs( $args = array() ) {
    $defaults = array(
        'variant'       => 'card',
        'desktop_image' => '',
        'mobile_image'  => '',
        'position'      => 'center',
        'overlay_start' => 'rgba(0, 0, 0, 0.6)',
        'overlay_end'   => 'rgba(0, 0, 0, 0.85)',
        'extra_classes' => '',
    );

    $args = wp_parse_args( $args, $defaults );

    $mode      = wp_is_mobile() ? 'static' : 'dynamic-ready';
    $image_url = wp_is_mobile() && ! empty( $args['mobile_image'] ) ? $args['mobile_image'] : $args['desktop_image'];

    $classes = array(
        'homepage-bg',
        'homepage-bg--' . sanitize_html_class( $args['variant'] ),
    );

    if ( 'dynamic-ready' === $mode ) {
        $classes[] = 'homepage-bg--dynamic-ready';
    }

    if ( ! empty( $args['extra_classes'] ) ) {
        $classes[] = $args['extra_classes'];
    }

    $style_parts = array(
        '--homepage-bg-position: ' . esc_attr( $args['position'] ),
        '--homepage-bg-overlay-start: ' . esc_attr( $args['overlay_start'] ),
        '--homepage-bg-overlay-end: ' . esc_attr( $args['overlay_end'] ),
    );

    if ( ! empty( $image_url ) ) {
        $style_parts[] = '--homepage-bg-image: url(\'' . esc_url( $image_url ) . '\')';
    } else {
        $style_parts[] = '--homepage-bg-image: none';
    }

    return sprintf(
        'class="%1$s" data-bg-mode="%2$s" data-bg-desktop="%3$s" data-bg-mobile="%4$s" data-bg-position="%5$s" style="%6$s"',
        esc_attr( trim( implode( ' ', array_filter( $classes ) ) ) ),
        esc_attr( $mode ),
        esc_url( $args['desktop_image'] ),
        esc_url( $args['mobile_image'] ),
        esc_attr( $args['position'] ),
        esc_attr( implode( '; ', $style_parts ) )
    );
}
