<?php get_header(); ?>
<style>
/* --- 出处文本样式 --- */
.slogan-source {
    font-family: 'ZCOOL QingKe HuangYou', monospace, sans-serif;
    color: #666;
    /* 降低亮度 */
    font-size: clamp(14px, 2vw, 20px);
    letter-spacing: 2px;
    text-align: center;
    /* 确保自身居中 */
    margin-top: 2vh;
    /* 调整间距 */
    margin-bottom: 6vh;
    /* 与下方按钮拉开距离 */
    text-shadow: 0 0 5px rgba(0, 0, 0, 0.8);
    display: block !important;
    /* 强制显示 */
    opacity: 1 !important;
    /* 强制显示 */
}

/* --- HUD 终端风格跳转按钮样式 --- */
.slogan-archive-entry {
    text-align: center;
    /* 确保容器居中 */
}

.hud-terminal-btn {
    display: inline-block;
    padding: 10px 25px;
    background: rgba(10, 15, 10, 0.4);
    border: 1px solid #444;
    color: #aaa;
    text-decoration: none;
    font-family: monospace, sans-serif;
    font-size: 0.95rem;
    transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    position: relative;
    opacity: 1 !important;
    /* 强制显示 */
}

/* 悬停交互：充能发光效果 */
.hud-terminal-btn:hover {
    border-color: #00ffff;
    /* 终端青色 */
    color: #fff;
    background: rgba(0, 30, 30, 0.8);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.2), inset 0 0 10px rgba(0, 255, 255, 0.1);
}

/* 按钮内部的命令提示符 */
.hud-terminal-btn .cmd-prompt {
    color: #988b32;
    /* 工业金 */
    font-weight: bold;
    margin-right: 8px;
    transition: color 0.3s;
}

/* 按钮内部的英文后缀 */
.hud-terminal-btn .btn-eng {
    color: #555;
    font-size: 0.8em;
    margin-left: 8px;
    transition: color 0.3s;
}

.hud-terminal-btn:hover .cmd-prompt,
.hud-terminal-btn:hover .btn-eng {
    color: #00ffff;
}
</style>
<!-- 条形码生成库-->
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>

<div id="pager">
    <section class="page active">
        <div class="page-frame">
            <div class="page-scroll">

                <div style="height: 35vh;align-items: center;">
                    <div style="height: 10vh;"></div>
                    <h1 data-selectable
                        style="margin: 0 auto;width: 40vw;text-align: justify;text-align-last: justify;font-family: 峄山碑篆体;font-size:clamp(40px, 10vw, 100px);">
                        文于止墨
                    </h1>
                </div>

               
                <div data-selectable id="Homepage-Slogan" style="text-align: center;">
                </div>
                

                <div class="slogan-source">
                   ——伊壁鸠鲁- 致美诺西斯的信 
                </div>

                <div class="slogan-archive-entry">
                    <a href="https://www.wenzhimo.xyz/%e5%8e%86%e5%8f%b2%e5%b0%81%e9%9d%a2%e6%a0%87%e9%a2%98/"
                        class="hud-terminal-btn" title="访问观测日志">
                        <span class="cmd-prompt">C:\></span> 检索完整观测日志 <span class="btn-eng">[ ARCHIVE ]</span>
                    </a>
                </div>

                <script type="text/javascript">
                if (typeof createGlitch === 'function') {
                    createGlitch('#Homepage-Slogan', {
                        phrases: ["让人在年轻时莫迟缓追求智慧，年老时莫厌倦探索真理。", "因为灵魂的健康，无论何时开始都不为早，亦不为晚。","", ],
                        obfu_chars: "░▒▓▖▗▘▙▚▛▜▝▞▟",
                        heightMode: "wrapper",
                        color: "#988b32",
                        fontFamily: "Smooch,DFJinWenW3-GB",
                        fontSize: "clamp(24px, 10vw, 100px)",
                        //fontWeight: "bold",
                        disp_time: 3000,
                        start_time: 80,
                        end_time: 80
                    });
                }
                </script>
            </div>
        </div>
    </section>


    <!-- 首页 / 核心定位 -->
    <section class="page" id="page2">
        <div class="page-frame">
            <div class="page-scroll">
                <h1 data-selectable style="font-family: 峄山碑篆体;">文于止墨</h1>
                <div data-selectable>
                    <p>
                        <b> “文以标识，止于至善且适时留白，最终付诸笔墨。”</b>

                    </p>
                    <p>
                        以<b>“文”</b>识身，作为创造者的标识，它是代码的文本，也是人格的底色；<br>
                        以<b>“止”</b>修身，既是“止于至善”的工程准则——不求无瑕，但求不偏，亦是忙碌调度中的“停止思考”——在珍贵的发呆时刻，让处理器进入空闲任务，找回流失的灵感；<br>
                        以<b>“墨”</b>行身，无论是笔尖的勾勒还是键盘的敲击，万物最终凝练于笔墨，成为可被感知的存档。
                    </p>
                    <p>
                        有关嵌入式的内容，建议在 <a
                            href="https://www.yuque.com/wenzhimo/qianrushi">语雀-嵌入式</a>查看。
                    </p>

                </div>

                <div class="cards">
                    <div data-selectable data-selectable-highlight <?php echo kappa_get_homepage_bg_attrs( array(
                        'variant'       => 'card',
                        'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/2566B02C88E0D556AAD62E5F9B131F17.jpg',
                        'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/2566B02C88E0D556AAD62E5F9B131F17.jpg',
                        'position'      => 'center',
                        'overlay_start' => 'rgba(0,0,0,0.6)',
                        'overlay_end'   => 'rgba(0,0,0,0.85)',
                        'extra_classes' => 'card',
                    ) ); ?>>
                        <div class="homepage-bg-layer" aria-hidden="true"></div>
                        <a href="https://www.wenzhimo.xyz/%E6%9C%80%E8%BF%91%E6%9B%B4%E6%96%B0/"
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></a>

                        <div
                            style="min-height: 300px; pointer-events: none; display: flex; flex-direction: column; height: 100%; flex-grow: 1;">
                            <h3>最近更新<p class="note">按照发布顺序排序</p>
                            </h3>
                            <p style="flex-grow: 1;">旅途总是有新的发现。</p>
                        </div>
                    </div>

                    <div data-selectable data-selectable-highlight <?php echo kappa_get_homepage_bg_attrs( array(
                        'variant'       => 'card',
                        'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg',
                        'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg',
                        'position'      => 'center',
                        'overlay_start' => 'rgba(0,0,0,0.6)',
                        'overlay_end'   => 'rgba(0,0,0,0.85)',
                        'extra_classes' => 'card',
                    ) ); ?>>
                        <div class="homepage-bg-layer" aria-hidden="true"></div>
                        <a href="https://www.wenzhimo.xyz/%e9%9f%b3%e4%b9%90%e5%a4%87%e5%bf%98%e5%bd%95/"
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></a>

                        <div
                            style="min-height: 350px; pointer-events: none; display: flex; flex-direction: column; height: 100%; flex-grow: 1;">
                            <h3>音乐分享</h3>
                            <p style="flex-grow: 1;">心灵的碰撞。</p>
                        </div>
                    </div>

                    <div data-selectable data-selectable-highlight <?php echo kappa_get_homepage_bg_attrs( array(
                        'variant'       => 'card',
                        'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/08/SCP-LOGO-2-scaled.jpg',
                        'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/08/SCP-LOGO-2-scaled.jpg',
                        'position'      => 'center',
                        'overlay_start' => 'rgba(0,0,0,0.6)',
                        'overlay_end'   => 'rgba(0,0,0,0.85)',
                        'extra_classes' => 'card',
                    ) ); ?>>
                        <div class="homepage-bg-layer" aria-hidden="true"></div>
                        <a href="https://www.wenzhimo.xyz/scp-foundation-cn-branch/"
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></a>

                        <div
                            style="min-height: 350px; pointer-events: none; display: flex; flex-direction: column; height: 100%; flex-grow: 1;">
                            <h3>SCP基金会</h3>
                            <p style="flex-grow: 1;">最大的去中心化创作平台。</p>
                        </div>
                    </div>
                </div>

                <div id="page2-footnotes"></div>
                <script>
                new FootnoteGenerator(
                    'note', // 目标类名
                    'page2', // 作用域 ID
                    'page2-footnotes', // 容器ID
                    '壹', // 数字类型
                    'footnotes-sub-style',
                    'footnotes-item-style'
                );
                new FootnotePreview('page2', 'footnotes-sub-style', 'page2-footnotes');
                </script>
            </div>
        </div>
    </section>
    <!-- 最近更新 -->
    <section class="page">
        <div class="page-frame">
            <div class="page-scroll">
                <div style="display: grid;grid-template-columns: 3fr 1fr;gap: 16px;">
                    <div>
                        <h1 data-selectable>最近更新</h1>
                    </div>
                </div>

                <style>
                .card-meta-links a {
                    color: #988b32;
                    /* 工业金 */
                    text-decoration: none;
                    transition: all 0.3s ease;
                }

                .card-meta-links a:hover {
                    color: #fff;
                    text-shadow: 0 0 8px rgba(152, 139, 50, 0.8);
                }
                </style>

                <div class="cards">
                    <?php
                        // 1. 设置查询条件：获取发布的 9 篇文章
                        $recent_args = array(
                            'post_type'           => 'post',
                            'posts_per_page'      => 9,
                            'orderby'             => 'date',   // 将 'modified' 改为 'date'，即按发布时间排序
                            'order'               => 'DESC',   // DESC 表示降序，即最新的排在最前面
                            'ignore_sticky_posts' => 1           
                        );
                        $recent_query = new WP_Query( $recent_args );

                        // 2. 开始循环
                        if ( $recent_query->have_posts() ) :
                            while ( $recent_query->have_posts() ) : $recent_query->the_post();

                                // 3. 处理文章封面背景
                                $card_bg_attrs = 'class="card"';
                                if ( has_post_thumbnail() ) {
                                    $thumbnail_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
                                    $card_bg_attrs = kappa_get_homepage_bg_attrs( array(
                                        'variant'       => 'card',
                                        'desktop_image' => $thumbnail_url,
                                        'mobile_image'  => $thumbnail_url,
                                        'position'      => 'center',
                                        'overlay_start' => 'rgba(0, 0, 0, 0.65)',
                                        'overlay_end'   => 'rgba(0, 0, 0, 0.9)',
                                        'extra_classes' => 'card',
                                    ) );
                                }
                        ?>
                    <div data-selectable data-selectable-highlight <?php echo $card_bg_attrs; ?>>
                        <?php if ( has_post_thumbnail() ) : ?>
                        <div class="homepage-bg-layer" aria-hidden="true"></div>
                        <?php endif; ?>

                        <a href="<?php the_permalink(); ?>"
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></a>

                        <div style="display: flex; flex-direction: column; height: 100%; pointer-events: none;">

                            <h3 style="color: #988b32; margin-top: 0; position: relative; z-index: 2;">
                                <?php the_title(); ?></h3>

                            <p style="font-size: 0.95rem; color: #ccc; flex-grow: 1; position: relative; z-index: 2;">
                                <?php echo wp_trim_words( get_the_excerpt(), 40, '...' ); ?>
                            </p>

                            <div class="card-meta-links"
                                style="font-size: 0.85rem; color: #888; border-top: 1px dashed #444; padding-top: 12px; margin-top: 15px; line-height: 1.6; position: relative; z-index: 3; pointer-events: auto;">

                                <span>[责任人]：<?php the_author(); ?></span><br>
                                <span>[所属域]：<?php the_category(' / '); ?></span><br>

                                <span>[发布于]：<?php the_modified_time('Y-m-d H:i:s'); ?>
                                    <span style="color: #444; font-size: 0.8em; margin-left: 5px;">[ UNIX:
                                        <?php the_modified_time('U'); ?> ]
                                    </span>
                                </span>
                                <br>
                                <div id="barcode-container-<?php the_ID(); ?>" style="text-align: right; width: 100%; margin-top: 15px;">
    
                                    <img id="barcode-img-<?php the_ID(); ?>" style="max-width: 100%; height: auto; display: inline-block; opacity: 0.85;" />
                                    
                                </div>
                                
                                <script>
                                    (function() {
                                        var unixTimestamp = "<?php the_time('U'); ?>";
                                        // 目标指向 img 标签
                                        var imgSelector = "#barcode-img-<?php the_ID(); ?>";
                                        
                                        // JsBarcode 检测到是 img 标签，会自动输出 base64 图像
                                        JsBarcode(imgSelector, unixTimestamp, {
                                            format: "CODE39",           
                                            width: 2.5,
                                            height: 50,                
                                            displayValue: false,       
                                            lineColor: "#988b32",       
                                            background: "transparent",
                                            margin: 0
                                        });
                                    })();
                                </script>
                            </div>
                        </div>
                    </div>
                    <?php 
                            endwhile;
                            wp_reset_postdata(); 
                        else : 
                        ?>
                    <div class="card" data-selectable data-selectable-highlight>
                        <h3>暂无更新记录</h3>
                        <p>数据库中尚未检索到任何档案。</p>
                    </div>
                    <?php endif; ?>
                </div>

                <div style="margin-top: 50px; text-align: center;">
                    <a data-selectable data-selectable-highlight
                        href="https://www.wenzhimo.xyz/%E6%9C%80%E8%BF%91%E6%9B%B4%E6%96%B0/"
                        style="display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);">
                        > 检索最近更新的全部档案 < </a>
                </div>

            </div>
        </div>
    </section>

    <!-- 音乐分享 -->
    <section class="page">
        <div <?php echo kappa_get_homepage_bg_attrs( array(
            'variant'       => 'hero',
            'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg',
            'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg',
            'position'      => 'center 25%',
            'overlay_start' => 'rgba(10, 15, 10, 0.7)',
            'overlay_end'   => 'rgba(10, 15, 10, 0.85)',
            'extra_classes' => 'page-frame',
        ) ); ?>>
            <div class="homepage-bg-layer" aria-hidden="true"></div>
            <div class="page-scroll"
                style="height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 10vw;">

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
                    <a data-selectable href="https://www.wenzhimo.xyz/%e9%9f%b3%e4%b9%90%e5%a4%87%e5%bf%98%e5%bd%95/"
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

    <!-- SCP基金会 -->
    <section class="page">
        <div <?php echo kappa_get_homepage_bg_attrs( array(
            'variant'       => 'hero',
            'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/08/SCP-LOGO-2-scaled.jpg',
            'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2024/08/SCP-LOGO-2-scaled.jpg',
            'position'      => 'center',
            'overlay_start' => 'rgba(10, 15, 10, 0.75)',
            'overlay_end'   => 'rgba(10, 15, 10, 0.9)',
            'extra_classes' => 'page-frame',
        ) ); ?>>
            <div class="homepage-bg-layer" aria-hidden="true"></div>
            <div class="page-scroll"
                style="height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 10vw;">

                <h1 data-selectable
                    style="color: #d5dffa; text-shadow: 0 0 10px rgba(0, 255, 255, 0.4); font-family: 'Megrim';font-size: clamp(28px, 4vw, 45px); margin-bottom: 20px;">
                    Secure. Contain. Protect.
                </h1>

                <div data-selectable
                    style="color: #ccc; font-size: 1.1rem; line-height: 1.8; font-family: monospace, sans-serif;">
                    <p>
                        > <span style="color:#a52309">[WARNING]:</span> 正在访问机密数据档案。仅限4级人员访问，未授权的访问将导致即时终端锁定与自动现实锚点部署。
                    </p>
                    <p>
                        > <span style="color:#a52309;"><b>你已经被警告过了。</b></span>
                    </p>
                    <p>
                        > 归档目标：隔离、观测并分析逆熵现象与现实扭曲实体。确立核心现实基准，确保系统稳定性。
                    </p>
                    <p>
                        > 当前状态：[ 数据库：<span style="color:#83be52;">在线</span> ] | [ 收容室状态：<span
                            style="color:#83be52;">正常</span> ]
                    </p>
                </div>

                <div style="margin-top: 40px;">
                    <a data-selectabl href="https://www.wenzhimo.xyz/scp-foundation-cn-branch/" class="hud-terminal-btn"
                        title="访问收容档案库">
                        <span class="cmd-prompt">C:\></span> 进入收容档案库 <span class="btn-eng">[ ACCESS_DATABASE ]</span>
                    </a>
                </div>

                <div class="corner-quote">
                    <p data-selectable
                        style="font-family: 'YuFanXinYu', serif; font-weight: bold; text-align: end; color: #988b32; text-shadow: 0 0 8px rgba(152, 139, 50, 0.5); margin: 0;">
                        我们将死于黑暗，以便你们生于光明。
                    </p>
                </div>

            </div>
        </div>
    </section>

    <!-- 页面一览 -->
    <section class="page">
        <div <?php echo kappa_get_homepage_bg_attrs( array(
            'variant'       => 'hero',
            'desktop_image' => 'https://www.wenzhimo.xyz/wp-content/uploads/2025/09/SCP-CN-027-scaled.jpg',
            'mobile_image'  => 'https://www.wenzhimo.xyz/wp-content/uploads/2025/09/SCP-CN-027-scaled.jpg',
            'position'      => 'center 40%',
            'overlay_start' => 'rgba(10, 15, 10, 0.65)',
            'overlay_end'   => 'rgba(10, 15, 10, 0.85)',
            'extra_classes' => 'page-frame',
        ) ); ?>>
            <div class="homepage-bg-layer" aria-hidden="true"></div>
            <div class="page-scroll"
                style="height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 10vw;">

                <h1 data-selectable
                    style="color: #00ffff; text-shadow: 0 0 10px rgba(0, 255, 255, 0.4); font-size: clamp(28px, 4vw, 45px); margin-bottom: 20px;">
                    <span style="font-family: 'bailutongtongshouxieti';">旁支末节</span> - [ INDEX ]
                </h1>

                <div data-selectable
                    style="color: #ccc; font-size: 1.1rem; line-height: 1.8; font-family: monospace, sans-serif;">
                    <p>
                        > [SYS_MSG]: 正在展开站点全局拓扑图。所有已公开档案、子系统与功能模块已汇总于此。
                    </p>
                    <p>
                        > 提示：请在此查阅系统的完整系统架构，获取通往各个扇区的直达访问权限。
                    </p>
                </div>

                <div style="margin-top: 40px;">
                    <a data-selectabl href="https://www.wenzhimo.xyz/%e9%a1%b5%e9%9d%a2%e4%b8%80%e8%a7%88/"
                        class="hud-terminal-btn" title="查看页面一览">
                        <span class="cmd-prompt">C:\></span> 展开全局索引 <span class="btn-eng">[ DIRECTORY ]</span>
                    </a>
                </div>

                <div class="corner-quote">
                    <p data-selectable
                        style="font-family: 'bailutongtongshouxieti', serif; font-weight: bold; text-align: end; color: #988b32; text-shadow: 0 0 8px rgba(152, 139, 50, 0.5); margin: 0;">
                        旅途总有终点，不妨停下来回顾半生。
                    </p>
                </div>

            </div>
        </div>
    </section>

    <!-- 技术能力 -->
    <section class="page page--tech-capability">
        <div <?php echo kappa_get_homepage_bg_attrs( array(
            'variant'       => 'hero',
            'desktop_image' => '',
            'mobile_image'  => '',
            'position'      => 'center',
            'overlay_start' => 'rgba(24, 18, 10, 0.84)',
            'overlay_end'   => 'rgba(34, 22, 12, 0.94)',
            'extra_classes' => 'page-frame page-frame--tech-capability',
        ) ); ?>>
            <div class="homepage-bg-layer homepage-bg-layer--tech-capability" aria-hidden="true">
                <div class="homepage-bg-animation-host" data-homepage-bg-animation="tech-capability"></div>
            </div>
            <div class="page-scroll">
                <h1 data-selectable>技术与能力</h1>
                <div data-selectable>
                    <p>
                        止墨制业 提供从设计到实现的完整系统级解决方案。
                    </p>
                </div>


                <div class="cards">
                    <div class="card" data-selectable data-selectable-highlight>
                        <h3>基础驱动提供</h3>
                        <p>RS522、TFT LCD 、IIC、SPI等硬件驱动、通信协议。</p>
                    </div>
                    <div class="card" data-selectable data-selectable-highlight>
                        <h3>高层抽象与封装</h3>
                        <p>将应用层与硬件层完全解耦，增强您代码的可移植性。</p>
                    </div>
                    <div class="card" data-selectable data-selectable-highlight>
                        <h3>系统设计</h3>
                        <p>目前正在研究基于STM32F429的游戏机系统，相信不日便会有所成果。</p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- 联系与结语 -->
    <section class="page">
        <div class="page-frame">
            <div class="page-scroll">
                <h1 data-selectable>联系我们</h1>
                <div data-selectable>
                    <p>
                        我们与正在构建工具型平台、工业系统和专业软件的团队合作。
                        <br>
                        如需项目合作、方案讨论或技术交流，请通过正式渠道联系：wenyuzhimo@hotmail.com
                    </p>
                </div>

                <h2 data-selectable>友情合作</h2>
                <div class="cards">
                    <a href="https://www.ylnxcute.top/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px; align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/Izuno-2023.7.8 (130381086).png"
                                height="80px" alt="白洞">
                            白洞
                        </div>
                    </a>
                    
                    
                    <a href="https://www.wenzhimo.xyz/kappa-heavy-industries-precision-manufacturing/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/logo.svg" height="80px"
                                alt="河童重工">
                            <p>河童重工</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/yuuka-agriculture/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px; align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/幽香农业.png" height="80px"
                                alt="幽香农业">
                            <p>幽香农业</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/yakumo-transit/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/八云交通.png" height="80px"
                                alt="八云交通">
                            <p>八云交通</p>
                        </div>
                    </a>
                    
                    
                    <a href="https://www.wenzhimo.xyz/kourin-retail-group/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/香霖零售.png" height="80px"
                                alt="香霖零售">
                            <p>香霖零售</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/night-sparrow-catering-group/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/夜雀食堂.png" height="80px"
                                alt="夜雀食堂">
                            <p>夜雀食堂</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/hakurei-autocracy-security-commission/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/博丽专制.png" height="80px"
                                alt="博丽专制">
                            <p>博丽专制</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/hakutaku-dairy-education-group/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/白泽乳业.png" height="80px"
                                alt="白泽乳业">
                            <p>白泽乳业</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/sanzu-river-legal-karma-auditing-firm/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/三途川律师事务所.png" height="80px"
                                alt="三途川律师事务所">
                            <p>三途川律师事务所</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/nagae-meteorological-environmental-monitoring-bureau/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/永江气象站.png" height="80px"
                                alt="永江气象站">
                            <p>永江气象站</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/fujiwara-thermal-coal-group/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/藤原煤炭厂.png" height="80px"
                                alt="藤原煤炭厂">
                            <p>藤原煤炭厂</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/yagokoro-pharmaceutical-life-sciences/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/八意制药.png" height="80px"
                                alt="八意制药">
                            <p>八意制药</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/mist-lake-strongest-popsicle-stand/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/雾之湖冰棒小摊.png" height="80px"
                                alt="雾之湖冰棒小摊">
                            <p>雾之湖冰棒小摊</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/bunbunmaru-media-group/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/文文报社.png" height="80px"
                                alt="文文报社">
                            <p>文文报社</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/chireiden-nuclear-cremation-biomass-energy-corp/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/地灵殿火葬场.png" height="80px"
                                alt="地灵殿火葬场">
                            <p>地灵殿火葬场</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/scarlet-estate-domestic-services-group/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/红魔馆家政.png" height="80px"
                                alt="红魔馆家政">
                            <p>红魔馆家政</p>
                        </div>
                    </a>
                    
                    <a href="https://www.wenzhimo.xyz/alices-workshop-artisanal-automata-guild/">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight
                                src="<?php echo get_template_directory_uri(); ?>/asset/img/爱丽丝工坊.png" height="80px"
                                alt="爱丽丝工坊">
                            <p>爱丽丝工坊</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>

    </section>

</div>

<?php get_footer(); ?>