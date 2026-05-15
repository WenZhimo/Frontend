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
