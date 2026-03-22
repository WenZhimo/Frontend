<?php get_header(); ?>

<div id="pager">
        <section class="page active">
            <div class="page-frame">
                <div class="page-scroll">
                    <div style="height: 35vh;align-items: center;">
                        <div style="height: 10vh;"></div>
                        <h1 data-selectable
                            style="margin: 0 auto;width: 40vw;text-align: justify;text-align-last: justify;font-family: 峄山碑篆体;font-size:clamp(40px, 10vw, 100px);">
                            文于止墨</h1>
                    </div>
                    <div data-selectable id="Homepage-Slogan" style="text-align: center;">
                    </div>
                    <script type=" text/javascript">
                createGlitch('#Homepage-Slogan', {
                phrases: ["人的野心就是力求超越俗众的欲望；", "而幸福则争取和大众一致的欲求。",],
                obfu_chars: "░▒▓▖▗▘▙▚▛▜▝▞▟",
                heightMode:"wrapper",
                color: "#988b32",
                fontFamily: "Smooch,华康金文体W3",
                fontSize: "clamp(24px, 10vw, 100px)", // 设置大小
                //fontWeight: "bold",
                disp_time: 3000,
                start_time: 80,
                end_time: 80
                });
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
                            有关嵌入式的内容，建议在 <a href="https://www.yuque.com/g/wenzhimo/qianrushi/collaborator/join?token=jJbeqT6BIV3fngcc&source=book_collaborator">语雀-嵌入式</a>查看。
                        </p>

                    </div>

                    <div class="cards">
                        <div class="card" data-selectable data-selectable-highlight 
                             style="background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.85)), url('https://www.wenzhimo.xyz/wp-content/uploads/2024/10/2566B02C88E0D556AAD62E5F9B131F17.jpg') center / cover no-repeat; 
                                    position: relative; 
                                    min-height: 300px; /* 增加最小高度 */
                                    display: flex; 
                                    flex-direction: column;">
                            
                            <a href="https://www.wenzhimo.xyz/%E6%9C%80%E8%BF%91%E6%9B%B4%E6%96%B0/" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></a>
                            
                            <div style="position: relative; z-index: 2; pointer-events: none; display: flex; flex-direction: column; height: 100%; flex-grow: 1;">
                                <h3>最近更新<p class="note">按照发布顺序排序</p></h3>
                                <p style="flex-grow: 1;">旅途总是有新的发现。</p> </div>
                        </div>
        
                        <div class="card" data-selectable data-selectable-highlight 
                             style="background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.85)), url('https://www.wenzhimo.xyz/wp-content/uploads/2024/10/紺屋鴉江_鉛の冠_99161141_p0-scaled.jpg') center / cover no-repeat; 
                                    position: relative; 
                                    min-height: 350px; 
                                    display: flex; 
                                    flex-direction: column;">
                            
                            <a href="https://www.wenzhimo.xyz/%e9%9f%b3%e4%b9%90%e5%a4%87%e5%bf%98%e5%bd%95/" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></a>
                            
                            <div style="position: relative; z-index: 2; pointer-events: none; display: flex; flex-direction: column; height: 100%; flex-grow: 1;">
                                <h3>音乐分享</h3>
                                <p style="flex-grow: 1;">心灵的碰撞。</p>
                            </div>
                        </div>
        
                        <div class="card" data-selectable data-selectable-highlight 
                             style="background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.85)), url('https://www.wenzhimo.xyz/wp-content/uploads/2024/08/SCP-LOGO-2-scaled.jpg') center / cover no-repeat; 
                                    position: relative; 
                                    min-height: 350px; 
                                    display: flex; 
                                    flex-direction: column;">
                            
                            <a href="https://www.wenzhimo.xyz/scp-foundation-cn-branch/" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></a>
                            
                            <div style="position: relative; z-index: 2; pointer-events: none; display: flex; flex-direction: column; height: 100%; flex-grow: 1;">
                                <h3>SCP基金会</h3>
                                <p style="flex-grow: 1;">最大的去中心化创作平台。</p>
                            </div>
                        </div>
                    </div>

                    <div id="page2-footnotes"></div>
                    <script>
                        new FootnoteGenerator(
                            'note',          // 目标类名
                            'page2',         // 作用域 ID
                            'page2-footnotes', // 容器ID
                            '壹',             // 数字类型
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
                            color: #988b32; /* 工业金 */
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
                                $card_bg_style = '';
                                if ( has_post_thumbnail() ) {
                                    $thumbnail_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
                                    $card_bg_style = 'style="background: linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.9)), url(\'' . esc_url($thumbnail_url) . '\') center / cover no-repeat; position: relative;"';
                                } else {
                                    // 即使没有背景图，也必须加上 position: relative
                                    $card_bg_style = 'style="position: relative;"';
                                }
                        ?>
                                <div class="card" data-selectable data-selectable-highlight <?php echo $card_bg_style; ?>>
                                    
                                    <a href="<?php the_permalink(); ?>" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1;"></a>
                                    
                                    <div style="display: flex; flex-direction: column; height: 100%; pointer-events: none;">
                                        
                                        <h3 style="color: #988b32; margin-top: 0; position: relative; z-index: 2;"><?php the_title(); ?></h3>
                                        
                                        <p style="font-size: 0.95rem; color: #ccc; flex-grow: 1; position: relative; z-index: 2;">
                                            <?php echo wp_trim_words( get_the_excerpt(), 40, '...' ); ?>
                                        </p>
                                        
                                        <div class="card-meta-links" style="font-size: 0.85rem; color: #888; border-top: 1px dashed #444; padding-top: 12px; margin-top: 15px; line-height: 1.6; position: relative; z-index: 3; pointer-events: auto;">
                                            <span>[责任人]：<?php the_author(); ?></span><br>
                                            
                                            <span>[所属域]：<?php the_category(' / '); ?></span><br>
                                            
                                            <span>[发布于]：<?php the_modified_time('Y-m-d H:i'); ?></span>
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
                        <a data-selectable href="https://www.wenzhimo.xyz/%E6%9C%80%E8%BF%91%E6%9B%B4%E6%96%B0/" 
                           style="display: inline-block; font-family: ZCOOLQingKeHuangYou-Regular; color: #988b32; text-decoration: none; border: 1px solid #988b32; padding: 10px 30px; font-size: 1.2rem; transition: all 0.3s; background: rgba(152, 139, 50, 0.1);">
                            > 检索最近更新的全部档案 <
                        </a>
                    </div>
                    
                </div>
            </div>
        </section>

        <!-- 成果一 -->
        <section class="page">
            <div class="page-frame" style="
          background:
            linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.85)),
            url('<?php echo get_template_directory_uri(); ?>/asset/img/metropolis-8800792_1280.jpg')
            center / cover no-repeat;position: absolute;
        ">
                <div class="page-scroll">
                    <h1 data-selectable>Gensokyo Wide Web“幻维网” - 幻想乡网络基础工程二期建设</h1>
                    <div data-selectable>
                        <p>
                            面向全体幻想乡民的网络基础建设。遍布博丽大结界的基建工程。
                        </p>
                        <p>
                            设计目标为 跨认知的信息可达性、高并发信息展示与可控的信息扩散范围。
                        </p>
                    </div>
                    <div style="position: absolute;right: 16px;bottom: 16px;">

                        <p data-selectable
                            style="font-size: clamp(24px, 4vw, 40px);font-family: 华康金文体W3;font-weight: 1000;text-align: end;align-content: flex-end;">
                            让需要流动的东西流动，其余保持安静。
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- 成果二 -->
        <section class="page">
            <div class="page-frame" style="
          background:
            linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.85)),
            url('<?php echo get_template_directory_uri(); ?>/asset/img/camera-2598507_1280.jpg')
            center / cover no-repeat;position: absolute;
        ">
                <div class="page-scroll">
                    <h1 data-selectable>“文々。カメラ” · 记者用照相机</h1>
                    <div data-selectable>
                        <p>
                            为《文文。新闻》※记者个人设计的专属照相机。
                        </p>
                        <p>
                            广泛应用于偷拍、符卡发射与高机动环境的图像拍摄。
                        </p>
                    </div>
                    <div style="position: absolute;right: 16px;bottom: 16px;">

                        <p data-selectable style="font-size: clamp(24px, 4vw, 40px);font-weight: 1000;text-align: end;">
                            <span style="font-family: bailutongtongshouxieti;">“我拍到的，才算发生过！”</span>
                            <br>
                            <span style="font-family: 华康金文体W3;">——《文文。新闻》※记者,<br>射命丸文</span>
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- 成果三 -->
        <section class="page">
            <div class="page-frame" style="
          background:
            linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.9)),
            url('<?php echo get_template_directory_uri(); ?>/asset/img/machine-1715424_1280.jpg')
            center / cover no-repeat;position: absolute;
        ">
                <div class="page-scroll">
                    <div>
                        <h1 data-selectable>非想天则（建设中）</h1>
                        <div data-selectable>
                            <p>
                                超大尺度环境—法则响应结构验证项目。
                            </p>
                            <p>
                                任何可反复出现的现象，都必然存在结构。世界的秩序可以被短暂理解，但不应被长期持有。
                            </p>
                            <p>
                                在幻想乡环境中，“可预测失效”比“高性能运行”更重要。
                                超规格结构必须主动削弱自身能力，才能被系统接受。
                                完全自动化在此类尺度下并非最安全方案。
                            </p>
                        </div>
                    </div>
                    <div style="position: absolute;right: 16px;bottom: 16px;">
                        <p data-selectable
                            style="font-size: clamp(24px, 4vw, 40px);;font-family: 华康金文体W3;font-weight: 1000;text-align: end;align-content: flex-end;">
                            工程的终点不是控制世界，<br>而是确保在失控前能够退出。
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- 技术能力 -->
        <section class="page">
            <div class="page-frame">
                <div class="page-scroll">
                    <h1 data-selectable>技术与能力</h1>
                    <div data-selectable>
                        <p>
                            河童重工 提供从设计到实现的完整系统级解决方案。
                        </p>
                    </div>


                    <div class="cards">
                        <div class="card" data-selectable data-selectable-highlight>
                            <h3>基础设施提供</h3>
                            <p>水道、堤坝、动力装置与大型机关。</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight>
                            <h3>高危险度试作设备的制造</h3>
                            <p>实验武装、异常弹幕发生器、防御结界补助装置。</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight>
                            <h3>技术中介服务</h3>
                            <p>为天狗、神社乃至人间之里提供“可理解、可维护”的技术解决方案，而非完整的现代工业体系，以避免对幻想乡平衡造成冲击。</p>
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
                            如需项目合作、方案讨论或技术交流，请通过正式渠道联系。
                        </p>
                    </div>

                    <h2 data-selectable>友情合作</h2>
                    <div class="cards">
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px; align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/幽香农业.png" height="80px"
                                alt="幽香农业">
                            <p>幽香农业</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/八云交通.png" height="80px"
                                alt="幽香农业">
                            <p>八云交通</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/香霖零售.png" height="80px"
                                alt="幽香农业">
                            <p>香霖零售</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/夜雀饮食.png" height="80px"
                                alt="幽香农业">
                            <p>夜雀饮食</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/博丽专制.png" height="80px"
                                alt="幽香农业">
                            <p>博丽专制</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/白泽乳业.png" height="80px"
                                alt="幽香农业">
                            <p>白泽乳业</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/三途川律师事务所.png" height="80px"
                                alt="幽香农业">
                            <p>三途川律师事务所</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/永江气象站.png" height="80px"
                                alt="幽香农业">
                            <p>永江气象站</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/藤原煤炭厂.png" height="80px"
                                alt="幽香农业">
                            <p>藤原煤炭厂</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/八意制药.png" height="80px"
                                alt="幽香农业">
                            <p>八意制药</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/雾之湖冰棒小摊.png" height="80px"
                                alt="幽香农业">
                            <p>雾之湖冰棒小摊</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/文文报社.png" height="80px"
                                alt="幽香农业">
                            <p>文文报社</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/地灵殿火葬场.png" height="80px"
                                alt="幽香农业">
                            <p>地灵殿火葬场</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/红魔馆家政.png" height="80px"
                                alt="幽香农业">
                            <p>红魔馆家政</p>
                        </div>
                        <div class="card" data-selectable data-selectable-highlight
                            style="display: grid;grid-template-columns: 1fr 3fr;gap: 16px;align-items: center;">
                            <img data-selectable data-selectable-highlight src="<?php echo get_template_directory_uri(); ?>/asset/img/爱丽丝工坊.png" height="80px"
                                alt="幽香农业">
                            <p>爱丽丝工坊</p>
                        </div>
                    </div>
                </div>
            </div>

        </section>

    </div>

<?php get_footer(); ?>