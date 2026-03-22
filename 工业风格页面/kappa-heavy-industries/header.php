<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
 
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    

    <style>

    </style>
    <?php wp_head(); ?>
    <?php if ( is_admin_bar_showing() ) : ?>
    <style>
        /* 强制覆盖所有的固定定位规则，防止被顶部黑条遮挡 */
        html { margin-top: 0 !important; }
        body { margin-top: 0 !important; padding-top: 32px !important; }
        .site-header { top: 32px !important; }
        
        @media screen and (max-width: 782px) {
            body { padding-top: 46px !important; }
            .site-header { top: 46px !important; }
        }
    </style>
<?php endif; ?>

<style>
    /* ==========================================
       全局链接样式
       ========================================== */
    a:link, 
    a:visited {
      color: #a4612d;       /* 设置链接颜色 */
      font-weight: bold;    /* 加粗显示 */
      text-decoration: none; 
    }

    /* ==========================================
       修复动态 Logo 尺寸失控问题
       ========================================== */
    .logo img {
        max-height: 45px;      /* 👈 核心限制：高度锁死在 45 像素 */
        width: auto;           /* 宽度自动计算，保持图片原本的比例不变 */
        display: block;        /* 去除图片底部自带的几个像素的幽灵空白 */
        object-fit: contain;   /* 确保无论是长条形还是方形 Logo 都能完美塞进这个高度里 */
        transition: filter 0.3s ease; /* 给悬停加个平滑过渡 */
    }
    
    /* 工业风的悬停交互：鼠标放上去时会稍微发光或变亮 */
    .logo a:hover img {
        filter: drop-shadow(0 0 8px rgba(152, 139, 50, 0.6)) brightness(1.2);
    }
</style>
</head>
<!--hover角标效果层-->
<div id="corner-indicator" aria-hidden="true">
    <span class="tl">⌜</span>
    <span class="tr">⌝</span>
    <span class="bl">⌞</span>
    <span class="br">⌟</span>
</div>
<!-- hover高亮实心矩形 -->
<div id="highlight-rect" aria-hidden="true"></div>

<body <?php body_class(); ?>>
    
    <!-- 背景网格（底层） -->
    <div class="grid-base"></div>

    <!-- 鼠标发光网格（顶层 HUD） -->
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
                    <?php if ( is_user_logged_in() ) : ?>
                        <a href="<?php echo admin_url(); ?>" class="auth-admin" title="进入主控制台">
                            [ 状态：已授权 / AUTHENTICATED ] 
                        </a>
                        <a href="<?php echo wp_logout_url( home_url() ); ?>" class="auth-logout" title="断开连接">
                            (登出)
                        </a>
                    <?php else : ?>
                        <a href="<?php echo wp_login_url(); ?>" class="auth-guest" title="请求操作权限">
                            [ 状态：访客 / GUEST ]
                        </a>
                    <?php endif; ?>
                </div>

                <div class="terminal-search">
                    <form role="search" method="get" action="<?php echo home_url( '/' ); ?>">
                        <label for="s" class="prompt-symbol">C:\></label>
                        <input type="text" value="<?php echo get_search_query(); ?>" name="s" id="s" placeholder="输入检索指令并按 Enter..." autocomplete="off">
                    </form>
                </div>
                
            </div>
            <div class="info-group">
                <div class="coord-label">Cursor</div>
                <div class="coord-box" aria-live="polite" aria-atomic="true">
                    <div class="coord-row">X: <span id="mx">0</span></div>
                    <div class="coord-row">Y: <span id="my">0</span></div>
                </div>
            </div>

            <div class="info-group">
                <div class="coord-label">Local Time</div>
                <div class="clock-box" id="clock" aria-live="polite" aria-atomic="true">00:00:00</div>
            </div>
            <div class="info-group">
                <div id="crt-config-trigger">[特效配置]</div>
                <script>
                    // 传入您刚才创建的 DIV 的 ID
                    new CRTMonitorFX('crt-config-trigger');
                </script>
            </div>
        </div>

    </header>