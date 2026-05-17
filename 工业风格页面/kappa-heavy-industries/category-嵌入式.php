<?php
/**
 * 嵌入式分类模板
 */
get_header(); ?>

<div id="pager">
    <section class="page active">
        <div class="inner-page-shell inner-page-shell--wide inner-page-shell--spaced category-embedded-shell">
            <div class="category-embedded-bg" aria-hidden="true">
                <div class="category-embedded-grid"></div>
                <div class="category-embedded-bus category-embedded-bus--horizontal"></div>
                <div class="category-embedded-bus category-embedded-bus--vertical"></div>
            </div>

            <div class="category-embedded-content">
                <header class="inner-page-header inner-page-header--wide category-embedded-header">
                    <div class="category-embedded-status" data-selectable>
                        <span class="category-embedded-status-dot" aria-hidden="true"></span>
                        <span>[ EMBEDDED SYSTEM BUS : STANDBY ]</span>
                    </div>

                    <div class="category-embedded-layout">
                        <div class="category-embedded-copy">
                            <p class="category-embedded-kicker" data-selectable>DRIVER / BUS / PERIPHERAL / DEBUG</p>
                            <h1 data-selectable class="inner-page-title">
                                [ 嵌入式域 ]：<?php the_archive_title(); ?>
                            </h1>
                            <?php
                            if ( get_the_archive_description() ) {
                                echo '<div class="category-embedded-desc" data-selectable>' . get_the_archive_description() . '</div>';
                            }
                            ?>
                            <div class="category-embedded-lead" data-selectable>
                                <p>围绕驱动、通讯协议、外设接入、板级调试与系统组织方式建立文档索引。</p>
                            </div>
                            <div class="category-embedded-note" data-selectable>
                                <p>这里是学习笔记、实验记录和驱动封装仓库，而不是严谨难懂的文档；重点是易理解、可复用、可移植和可调试。</p>
                            </div>
                            <div class="category-embedded-actions">
                                <a href="https://www.yuque.com/wenzhimo/qianrushi" class="category-embedded-btn" title="查看语雀嵌入式文档">
                                    <span class="cmd">C:\></span>
                                    <span>打开语雀嵌入式文档</span>
                                    <span class="tag">[ DOC_PORT ]</span>
                                </a>
                            </div>
                        </div>

                        <div class="category-embedded-sidepanel">
                            <div class="category-embedded-panel-header">[ CONTROL SURFACE ]</div>

                            <div class="category-embedded-panel-row category-embedded-panel-row--knobs">
                                <div class="category-embedded-knob-block">
                                    <button type="button" class="category-embedded-knob" data-knob data-selectable
                                        data-angles="-34,-8,24" data-values="48MHz,72MHz,96MHz"
                                        style="--knob-angle:-34deg;" aria-label="切换总线时钟">
                                        <span class="category-embedded-knob-ring" aria-hidden="true"></span>
                                        <span class="category-embedded-knob-cap" aria-hidden="true"></span>
                                        <span class="category-embedded-knob-pointer" aria-hidden="true"></span>
                                    </button>
                                    <div class="category-embedded-knob-meta">
                                        <div class="category-embedded-knob-label">BUS CLK</div>
                                        <div class="category-embedded-knob-value" data-knob-value>48MHz</div>
                                    </div>
                                </div>
                                <div class="category-embedded-knob-block">
                                    <button type="button" class="category-embedded-knob" data-knob data-selectable
                                        data-angles="-28,2,30" data-values="-6dB,0dB,+4dB"
                                        style="--knob-angle:2deg;" aria-label="切换输入增益">
                                        <span class="category-embedded-knob-ring" aria-hidden="true"></span>
                                        <span class="category-embedded-knob-cap" aria-hidden="true"></span>
                                        <span class="category-embedded-knob-pointer" aria-hidden="true"></span>
                                    </button>
                                    <div class="category-embedded-knob-meta">
                                        <div class="category-embedded-knob-label">I/O GAIN</div>
                                        <div class="category-embedded-knob-value" data-knob-value>0dB</div>
                                    </div>
                                </div>
                            </div>

                            <div class="category-embedded-panel-row category-embedded-panel-row--buttons">
                                <button type="button" class="category-embedded-mini-btn" data-panel-button data-selectable aria-pressed="false">RST</button>
                                <button type="button" class="category-embedded-mini-btn is-active" data-panel-button data-selectable aria-pressed="true">DBG</button>
                                <button type="button" class="category-embedded-mini-btn" data-panel-button data-selectable aria-pressed="false">LOG</button>
                            </div>

                            <div class="category-embedded-panel-row category-embedded-panel-row--indicators">
                                <button type="button" class="category-embedded-indicator-group is-online" data-indicator data-selectable aria-label="切换 UART 状态">
                                    <span class="category-embedded-indicator" aria-hidden="true"></span>
                                    <span class="category-embedded-indicator-text">UART</span>
                                    <span class="category-embedded-indicator-state">SYNC</span>
                                </button>
                                <button type="button" class="category-embedded-indicator-group is-idle" data-indicator data-selectable aria-label="切换 SPI 状态">
                                    <span class="category-embedded-indicator" aria-hidden="true"></span>
                                    <span class="category-embedded-indicator-text">SPI</span>
                                    <span class="category-embedded-indicator-state">IDLE</span>
                                </button>
                                <button type="button" class="category-embedded-indicator-group is-warn" data-indicator data-selectable aria-label="切换 I2C 状态">
                                    <span class="category-embedded-indicator" aria-hidden="true"></span>
                                    <span class="category-embedded-indicator-text">I2C</span>
                                    <span class="category-embedded-indicator-state">BUSY</span>
                                </button>
                            </div>

                            <div class="category-embedded-panel-row category-embedded-panel-row--bars">
                                <div class="category-embedded-status-bars" data-status-bars>
                                    <span class="category-embedded-status-bar" style="--bar-level:22%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:48%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:34%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:72%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:58%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:84%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:40%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:66%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:28%;"></span>
                                    <span class="category-embedded-status-bar" style="--bar-level:54%;"></span>
                                </div>
                            </div>

                            <aside class="category-embedded-quote" data-selectable>
                                <div class="category-embedded-quote-label">[ ENGINEERING NOTE ]</div>
                                <p>真正稳定的系统，并不是不会出错，而是出了错也知道该从哪里查起。</p>
                            </aside>
                        </div>
                    </div>

                    <div class="category-embedded-meter" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                    </div>
                </header>

                <div class="category-embedded-archive-grid">
                    <?php get_template_part( 'template-parts/cards/post-card-list', null, array(
                        'empty_title'   => '[ 总线当前空闲 ]',
                        'empty_message' => '嵌入式分类中暂未录入任何档案。',
                    ) ); ?>
                </div>

                <div style="margin-top: 60px; text-align: center; position: relative; z-index: 1;">
                    <div style="margin-bottom: 30px; font-family: ZCOOLQingKeHuangYou-Regular;">
                        <?php
                        the_posts_pagination( array(
                            'prev_text' => '< 上一页',
                            'next_text' => '下一页 >',
                        ) );
                        ?>
                    </div>

                    <?php get_template_part( 'template-parts/common/return-console-link', null, array(
                        'href'  => home_url(),
                        'label' => '> 返回主控制台 <',
                        'style' => 'display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);'
                    ) ); ?>
                </div>
            </div>
        </div>
    </section>
</div>

<?php get_footer(); ?>
