<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <?php wp_head(); ?>

</head>
<?php if ( ! wp_is_mobile() ) : ?>
<div id="corner-indicator" aria-hidden="true">
    <span class="tl">⌜</span>
    <span class="tr">⌝</span>
    <span class="bl">⌞</span>
    <span class="br">⌟</span>
    <div class="indicator-data"></div>
</div>
<div id="highlight-rect" aria-hidden="true"></div>
<?php endif; ?>
<?php if ( is_single() && ! wp_is_mobile() ) : ?>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<?php endif; ?>
<body <?php body_class(); ?>>

    <div class="grid-base"></div>

    <div class="grid-glow"></div>


    <header class="site-header" role="banner" aria-label="主导航">
        <div class="header-left" id="goHome" data-selectable tabindex="0" role="button" aria-label="回首页">
            <div class="logo" aria-hidden="true">
                <a href="<?php echo home_url(); ?>">
                    <?php 
                // 1. 获取后台设置的自定义 Logo 的 URL
                $custom_logo_id = get_theme_mod( 'custom_logo' );
                $logo_url = wp_get_attachment_image_url( $custom_logo_id, 'full' );

                // 2. 智能输出逻辑：有动态图用动态图，没有则回退到默认的 SVG
                if ( has_custom_logo() && $logo_url ) {
                    // 输出后台设置的真实头像，并自动抓取站点名称作为 alt 属性
                    echo '<img src="' . esc_url( $logo_url ) . '" alt="' . esc_attr( get_bloginfo( 'name' ) ) . '">';
                } else {
                    // 兜底方案：显示默认的河童重工 SVG 矢量图
                    echo '<img src="' . get_template_directory_uri() . '/asset/logo.svg" alt="Kappa Heavy Industries">';
                }
                ?>
                </a>
            </div>

            <div class="company-meta">
                <div class="company-name" aria-hidden="true" style="font-family: 峄山碑篆体;">文于止墨</div>
                <div class="company-sub" style="font-family: YuFanXinYu;">热爱创造的极地空想家</div>
            </div>
        </div>

        <div class="header-right" aria-hidden="false">
            <div class="terminal-status-bar">

                <div class="auth-status">
                    <?php if ( is_user_logged_in() ) : 
                        // 获取当前操作员（用户）信息
                        $current_user = wp_get_current_user();
                        $username     = esc_html( $current_user->display_name );
                        // 获取 32px 大小的头像 URL
                        $avatar_url   = get_avatar_url( $current_user->ID, array( 'size' => 32 ) );
                    ?>
                    <div class="auth-user-panel">
                        <div class="auth-avatar-frame">
                            <img src="<?php echo esc_url( $avatar_url ); ?>" alt="Operator Avatar"
                                class="auth-avatar is-loading"
                                onload="this.classList.remove('is-loading'); this.classList.add('is-loaded');"
                                onerror="this.style.display='none';">
                        </div>

                        <a href="<?php echo admin_url(); ?>" class="auth-admin" title="进入主控制台">
                            [ ID: <?php echo $username; ?> / AUTHENTICATED ]
                        </a>
                        <a href="<?php echo wp_logout_url( home_url() ); ?>" class="auth-logout" title="断开连接">
                            (登出)
                        </a>
                    </div>
                    <?php else : ?>
                    <a href="<?php echo wp_login_url(); ?>" class="auth-guest" title="请求操作权限">
                        [ 状态：访客 / GUEST ]
                    </a>
                    <?php endif; ?>
                </div>

                <div class="terminal-search">
                    <form role="search" method="get" action="<?php echo home_url( '/' ); ?>">
                        <label for="s" class="prompt-symbol">C:\></label>
                        <input type="text" value="<?php echo get_search_query(); ?>" name="s" id="s"
                            placeholder="输入检索指令并按 Enter..." autocomplete="off">
                    </form>
                </div>

            </div>
            <?php if ( ! wp_is_mobile() ) : ?>
            <div class="info-group hud-style">
                <div class="coord-label">SYS.CURSOR_LOC</div>
                <div class="terminal-box" aria-live="polite" aria-atomic="true">
                    <span class="bracket">[</span> X:<span id="mx">0000</span> Y:<span id="my">0000</span> <span
                        class="bracket">]</span>
                </div>
            </div>
            <?php endif; ?>

            <div class="info-group hud-style">
                <div class="coord-label">SYS.LOCAL_TIME <span class="status-dot" title="SYS.ONLINE"></span></div>
                <div class="terminal-box" aria-live="polite" aria-atomic="true">
                    <span class="bracket">[</span> <span id="clock">00:00:00</span><span class="blink-cursor"></span>
                    <span class="bracket">]</span>
                </div>
            </div>
            <?php if ( ! wp_is_mobile() ) : ?>
            <div class="info-group">
                <div id="crt-config-trigger">[特效配置]</div>
            </div>
            <?php endif; ?>
        </div>

    </header>