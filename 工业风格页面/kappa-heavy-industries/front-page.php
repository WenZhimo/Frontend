<?php get_header(); ?>
<div id="homepage-boot-overlay" aria-live="polite" aria-busy="true">
    <div class="homepage-boot-terminal">
        <div class="homepage-boot-scanlines"></div>
        <div class="homepage-boot-beam"></div>
        <div class="homepage-boot-flicker"></div>
        <div class="homepage-boot-vignette"></div>
        <div class="homepage-boot-label">启动磁带 / BOOT TAPE // SIDE A</div>
        <div class="homepage-boot-screen">
            <div class="homepage-boot-header">
                <span>系统启动 / SYS_BOOT // 首页初始化 / HOMEPAGE_INIT</span>
                <span id="homepage-boot-status-text">同步总线中 / SYNCING BUS...</span>
            </div>
            <div id="homepage-boot-log" class="homepage-boot-log"></div>
            <div id="homepage-boot-progress" class="homepage-boot-progress"><span></span></div>
        </div>
    </div>
</div>
<!-- 条形码生成库-->
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>

<div id="pager">
    <?php get_template_part( 'template-parts/front-page/page-hero' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-intro' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-recent-updates' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-music' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-scp' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-directory' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-tech-capability' ); ?>
    <?php get_template_part( 'template-parts/front-page/page-contact-links' ); ?>
</div>

<?php get_footer(); ?>
