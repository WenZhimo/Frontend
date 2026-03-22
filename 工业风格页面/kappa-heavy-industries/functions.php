<?php
/**
 * 河童重工主题核心功能与资源加载
 */
// ==========================================
// 开启主题基础支持功能
// ==========================================

function kappa_theme_setup() {
    // 核心授权：让 WordPress 自动管理网页标题 <title>
    add_theme_support( 'title-tag' );
    
    // 告诉 WP 这个主题支持“特色图像(封面)”
    add_theme_support( 'post-thumbnails' ); 
    // 告诉 WP 这个主题支持“自定义站点 Logo”
    add_theme_support( 'custom-logo', array(
        'flex-height' => true,
        'flex-width'  => true,
    ) );
    // 开启编辑器样式接管权限
    add_theme_support( 'editor-styles' ); 
    // 指定编辑器专属的 CSS 涂装文件
    add_editor_style( 'editor-style.css' );
}
// 将这个设置函数挂载到主题初始化钩子上
add_action( 'after_setup_theme', 'kappa_theme_setup' );

function kappa_heavy_industries_scripts() {
    $theme_dir = get_template_directory_uri();

    // ==========================================
    // 1. 注册并加载 CSS 样式表
    // ==========================================
    wp_enqueue_style( 'kappa-base', $theme_dir . '/css/base.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-background', $theme_dir . '/css/background.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-header', $theme_dir . '/css/header.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-pager', $theme_dir . '/css/pager.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-indicator', $theme_dir . '/css/indicator.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-footer', $theme_dir . '/css/footer.css', array(), '1.0' );
    wp_enqueue_style( 'kappa-footnote', $theme_dir . '/css/footnote.css', array(), '1.0' );

    // ==========================================
    // 2. 注册并加载字体库 (统一作为样式表加载)
    // ==========================================
    wp_enqueue_style( 'font-yishan', $theme_dir . '/asset/fonts/峄山碑篆体/峄山碑篆体/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-bailu', $theme_dir . '/asset/fonts/白路彤彤手写体/白路彤彤手写体/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-zcool', $theme_dir . '/asset/fonts/ZCOOLQingKeHuangYou-Regular/ZCOOLQingKeHuangYou-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-megrim', $theme_dir . '/asset/fonts/Megrim-Regular/Megrim-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-smooch', $theme_dir . '/asset/fonts/Smooch-Regular/Smooch-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-splash', $theme_dir . '/asset/fonts/Splash-Regular/Splash-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-tradewinds', $theme_dir . '/asset/fonts/TradeWinds-Regular/TradeWinds-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-YuFanXinYu-Regular', $theme_dir . '/asset/fonts/余繁新语/余繁新语-Regular/result.css', array(), '1.0' );
    wp_enqueue_style( 'font-3-of-9-Barcode', $theme_dir . '/asset/fonts/3-of-9-Barcode/3Of9Barcode/result.css', array(), '1.0' );
    

    // ==========================================
    // 3. 注册并加载 JavaScript 脚本
    // wp_enqueue_script 参数: 句柄名, 路径, 依赖数组, 版本号, 是否在底部(footer)加载
    // ==========================================
    
    // 头部/核心特效脚本 (在 <head> 或 <body> 顶部运行)
    wp_enqueue_script( 'crt-monitor-fx', $theme_dir . '/js/CRTMonitorFX.js', array(), '1.0', false );
    wp_enqueue_script( 'glitch-text', $theme_dir . '/asset/javascript/glitch-text.js', array(), '1.0', false );
    wp_enqueue_script( 'footnote-gen', $theme_dir . '/asset/javascript/FootnoteGenerator.js', array(), '1.0', false );
    wp_enqueue_script( 'footnote-preview', $theme_dir . '/asset/javascript/FootnotePreview.js', array(), '1.0', false );

    // 底部交互脚本模块 (在 <footer> 运行)
    wp_enqueue_script( 'kappa-indicator-js', $theme_dir . '/js/indicator.js', array(), '1.0', true );
    //wp_enqueue_script( 'kappa-pager-js', $theme_dir . '/js/pager.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-clock-js', $theme_dir . '/js/clock.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-nav-js', $theme_dir . '/js/navigation.js', array(), '1.0', true );
    wp_enqueue_script( 'kappa-cursor-js', $theme_dir . '/js/cursor.js', array(), '1.0', true );
    
   // ==========================================
    // 智能路由：只有【首页】才加载卡片翻页特效，其余全部正常滚动
    // ==========================================
    if ( is_front_page() ) {
        wp_enqueue_script( 'kappa-pager-js', $theme_dir . '/js/pager.js', array(), '1.0', true );
    } else {
        // 如果【是】单篇文章、页面，不仅不加载翻页脚本，还要动态注入解锁高度的 CSS
        $single_override_css = "
            html, body { overflow-y: auto !important; height: auto !important; }
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
        // wp_add_inline_style 会将这段 CSS 紧跟在 kappa-pager 样式之后输出，完美覆盖锁定效果
        wp_add_inline_style( 'kappa-pager', $single_override_css );
    }
}
// 将上述函数挂载到 WordPress 的资源加载钩子上
add_action( 'wp_enqueue_scripts', 'kappa_heavy_industries_scripts' );


// ==========================================
// 4. 为底部的 JS 模块添加 type="module" 属性
// 默认情况下，WP 输出的 script 标签没有 type="module"，这会导致你的 ES6 模块代码报错。
// 我们通过过滤器拦截并加上这个属性。
// ==========================================
function kappa_add_type_attribute( $tag, $handle, $src ) {
    // 定义哪些脚本需要 type="module"
    $module_scripts = array( 
        'kappa-indicator-js', 
        'kappa-pager-js', 
        'kappa-clock-js', 
        'kappa-nav-js', 
        'kappa-cursor-js' 
    );
    
    if ( in_array( $handle, $module_scripts ) ) {
        // 替换原本的标签，强行注入 type="module"
        $tag = '<script type="module" src="' . esc_url( $src ) . '"></script>' . "\n";
    }
    return $tag;
}
add_filter( 'script_loader_tag', 'kappa_add_type_attribute', 10, 3 );