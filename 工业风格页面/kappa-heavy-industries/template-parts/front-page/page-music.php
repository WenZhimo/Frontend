<!-- 音乐分享 -->
<section class="page page--music-showcase">
    <div <?php echo kappa_get_homepage_bg_attrs( array(
        'variant'       => 'hero',
        'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg',
        'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg',
        'position'      => 'center 25%',
        'overlay_start' => 'rgba(10, 15, 10, 0.7)',
        'overlay_end'   => 'rgba(10, 15, 10, 0.85)',
        'extra_classes' => 'page-frame page-frame--music-showcase',
    ) ); ?>>
        <div class="homepage-bg-layer homepage-bg-layer--music-showcase" aria-hidden="true">
            <div class="music-showcase-bg-host" data-homepage-bg-animation="music-showcase"
                data-waveform-src="<?php echo esc_url( get_template_directory_uri() . '/asset/data/unchosen-waveform.json' ); ?>"></div>
        </div>
        <div class="page-scroll"
            style="height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 10vw; position: relative; z-index: 1;">

            <h1 data-selectable
                style="color: #c7e6e8; text-shadow: 0 0 10px rgba(0, 255, 255, 0.4); font-size: clamp(28px, 4vw, 45px); margin-bottom: 20px;">
                知音难觅 - [ MUSIC ]
            </h1>

            <div data-selectable
                style="color: #ccc; font-size: 1.1rem; line-height: 1.8; font-family: monospace, sans-serif;">
                <p>
                    > 检索并收录游荡在时间废墟中的旋律。这里是我的音频中转站。
                </p>
                <p>
                    > 跨越物理介质的声波留存、高保真精神共鸣，以及建立抗解离的记忆锚点。
                </p>
            </div>

            <div style="margin-top: 40px;">
                <a data-selectable href="https://www.wenzhimo.xyz/category/%e5%88%86%e4%ba%ab/music/"
                    class="hud-terminal-btn" title="接入音频流">
                    <span class="cmd-prompt">C:\></span> 连接音频数据库 <span class="btn-eng">[ PLAY_AUDIO ]</span>
                </a>
            </div>

            <div class="corner-quote">
                <p data-selectable
                    style="font-family: 'DFJinWenW3-GB', serif; font-weight: bold; text-align: end; color: #988b32; text-shadow: 0 0 8px rgba(152, 139, 50, 0.5); margin: 0;">
                    让频率震荡，让杂音沉寂。
                </p>
            </div>

        </div>
    </div>
</section>
