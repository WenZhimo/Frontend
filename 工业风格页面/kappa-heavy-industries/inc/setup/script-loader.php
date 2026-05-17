<?php
/**
 * 河童重工脚本标签处理
 */

function kappa_add_type_attribute( $tag, $handle, $src ) {
    $module_scripts = array(
        'kappa-indicator-js',
        'kappa-pager-js',
        'kappa-cursor-js',
        'kappa-tech-capability-bg',
        'kappa-music-showcase-bg',
        'kappa-category-music-bg',
        'kappa-pointer-service',
        'kappa-waveform-data',
        'kappa-progress-controller',
        'kappa-homepage-boot'
    );

    if ( in_array( $handle, $module_scripts, true ) ) {
        $tag = '<script type="module" src="' . esc_url( $src ) . '"></script>' . "\n";
    }

    return $tag;
}
add_filter( 'script_loader_tag', 'kappa_add_type_attribute', 10, 3 );
