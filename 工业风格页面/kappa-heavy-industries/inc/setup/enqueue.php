<?php
/**
 * 河童重工主题资源加载
 */

function kappa_heavy_industries_scripts() {
    $theme_dir = get_template_directory_uri();

    wp_enqueue_style( 'kappa-base', $theme_dir . '/css/base.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-background', $theme_dir . '/css/background.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-header', $theme_dir . '/css/header.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-header-inline', $theme_dir . '/css/header-inline.css', array( 'kappa-header' ), '1.0' );
    wp_enqueue_style( 'kappa-pager', $theme_dir . '/css/pager.css', array(), '1.0' );
    if ( ! wp_is_mobile() ) {
        wp_enqueue_style( 'kappa-indicator', $theme_dir . '/css/indicator.css', array(), '1.0' );
    }
    wp_enqueue_style( 'kappa-footer', $theme_dir . '/css/footer.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-footnote', $theme_dir . '/css/footnote.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-footer-footnote-popup', $theme_dir . '/css/footer-footnote-popup.css', array( 'kappa-footer', 'kappa-footnote' ), '1.0' );
    if ( ! wp_is_mobile() && is_singular() ) {
        wp_enqueue_style( 'kappa-footer-toc', $theme_dir . '/css/footer-toc.css', array( 'kappa-footer' ), '1.0' );
    }
    if ( is_single() ) {
        wp_enqueue_style( 'kappa-footer-single-sidebar', $theme_dir . '/css/footer-single-sidebar.css', array( 'kappa-footer' ), '1.0' );
    }
    if ( is_front_page() ) {
        wp_enqueue_style( 'kappa-front-page-inline', $theme_dir . '/css/front-page-inline.css', array( 'kappa-pager' ), '1.0' );
    }
    if ( is_category( 'music' ) ) {
        wp_enqueue_style( 'kappa-category-music-inline', $theme_dir . '/css/category-music-inline.css', array( 'kappa-base', 'kappa-pager' ), '1.0' );
    }

    wp_enqueue_style( 'font-yishan', $theme_dir . '/asset/fonts/峄山碑篆体/峄山碑篆体/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-bailutongtong', $theme_dir . '/asset/fonts/白路彤彤手写体/白路彤彤手写体/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-zcool', $theme_dir . '/asset/fonts/ZCOOLQingKeHuangYou-Regular/ZCOOLQingKeHuangYou-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-huakangjinwen', $theme_dir . '/asset/fonts/华康金文体W3/华康金文体W3/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-megrim', $theme_dir . '/asset/fonts/Megrim-Regular/Megrim-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-smooch', $theme_dir . '/asset/fonts/Smooch-Regular/Smooch-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-splash', $theme_dir . '/asset/fonts/Splash-Regular/Splash-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-tradewinds', $theme_dir . '/asset/fonts/TradeWinds-Regular/TradeWinds-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-YuFanXinYu-Regular', $theme_dir . '/asset/fonts/余繁新语/余繁新语-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-3-of-9-Barcode', $theme_dir . '/asset/fonts/3-of-9-Barcode/3Of9Barcode/result.css', array(), '1.0' );

    if ( ! wp_is_mobile() ) {
        wp_enqueue_script( 'crt-monitor-fx', $theme_dir . '/js/CRTMonitorFX.js', array(), '1.0', false );
        wp_enqueue_script( 'kappa-header-init', $theme_dir . '/js/header-init.js', array( 'crt-monitor-fx' ), '1.0', true );
    }
    wp_enqueue_script( 'glitch-text', $theme_dir . '/asset/javascript/glitch-text.js', array(), '1.0', false );
    wp_enqueue_script( 'footnote-gen', $theme_dir . '/asset/javascript/FootnoteGenerator.js', array(), '1.0', false );
    wp_enqueue_script( 'footnote-preview', $theme_dir . '/asset/javascript/FootnotePreview.js', array(), '1.0', false );
    if ( is_front_page() ) {
        wp_enqueue_script( 'kappa-front-page-init', $theme_dir . '/js/front-page-init.js', array( 'glitch-text', 'footnote-gen', 'footnote-preview' ), '1.0', true );
    }
    if ( is_single() && ! wp_is_mobile() ) {
        wp_enqueue_script( 'kappa-single-codes-init', $theme_dir . '/js/single-codes-init.js', array(), '1.0', true );
    }

    if ( ! wp_is_mobile() ) {
        wp_enqueue_script( 'kappa-indicator-js', $theme_dir . '/js/indicator.js', array(), '1.0', true );
    }
    wp_enqueue_script( 'kappa-clock-js', $theme_dir . '/js/clock.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-nav-js', $theme_dir . '/js/navigation.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-footer-footnote-popup', $theme_dir . '/js/footer-footnote-popup.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-footer-anchor-smooth', $theme_dir . '/js/footer-anchor-smooth.js', array(), '1.0', true );
    if ( is_singular() ) {
        wp_enqueue_script( 'kappa-footer-details-fold', $theme_dir . '/js/footer-details-fold.js', array(), '1.0', true );
    }
    if ( ! wp_is_mobile() && is_singular() ) {
        wp_enqueue_script( 'kappa-footer-toc', $theme_dir . '/js/footer-toc.js', array(), '1.0', true );
    }
    wp_enqueue_script( 'kappa-pointer-service', $theme_dir . '/js/pointer-service.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-waveform-data', $theme_dir . '/js/waveform-data.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-progress-controller', $theme_dir . '/js/progress-controller.js', array( 'kappa-pointer-service' ), '1.0', true );
    if ( ! wp_is_mobile() ) {
        wp_enqueue_script( 'kappa-cursor-js', $theme_dir . '/js/cursor.js', array( 'kappa-pointer-service' ), '1.0', true );
    }

    if ( is_front_page() ) {
        wp_enqueue_script( 'kappa-pager-js', $theme_dir . '/js/pager.js', array(), '1.0', true );
        wp_enqueue_script( 'kappa-homepage-boot', $theme_dir . '/js/homepage-boot.js', array(), '1.0', true );

        if ( ! wp_is_mobile() ) {
            wp_enqueue_script( 'kappa-tech-capability-bg', $theme_dir . '/js/homepage-tech-capability-bg.js', array( 'kappa-pager-js', 'kappa-pointer-service' ), '1.0', true );
            wp_enqueue_script( 'kappa-music-showcase-bg', $theme_dir . '/js/homepage-music-showcase-bg.js', array( 'kappa-pager-js', 'kappa-waveform-data' ), '1.0', true );
        }
    }

    if ( ! wp_is_mobile() && is_category( 'music' ) ) {
        wp_enqueue_script( 'kappa-category-music-bg', $theme_dir . '/js/category-music-bg.js', array( 'kappa-pointer-service', 'kappa-waveform-data' ), '1.0', true );
    }

    if ( ! is_front_page() ) {
        $single_override_css = "
            html, body { overflow-y: auto !important; height: auto !important; }
            html { scrollbar-width: none; }
            body { -ms-overflow-style: none; }
            html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; display: none; }
            #pager, .page, .page-frame, .page-scroll {
                position: relative !important;
                height: auto !important;
                min-height: 100vh;
                overflow: visible !important;
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
                transform: none !important;
                z-index: 1;
            }
            .page-frame { background-attachment: fixed !important; }
        ";
        wp_add_inline_style( 'kappa-pager', $single_override_css );
    }
}
add_action( 'wp_enqueue_scripts', 'kappa_heavy_industries_scripts' );
