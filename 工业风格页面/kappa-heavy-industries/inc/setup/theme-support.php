<?php
/**
 * 河童重工主题支持功能
 */

function kappa_theme_setup() {
    add_theme_support( 'title-tag' );
    add_theme_support( 'post-thumbnails' );
    add_theme_support( 'custom-logo', array(
        'flex-height' => true,
        'flex-width'  => true,
    ) );
    add_theme_support( 'editor-styles' );
    add_editor_style( 'editor-style.css' );
}
add_action( 'after_setup_theme', 'kappa_theme_setup' );
