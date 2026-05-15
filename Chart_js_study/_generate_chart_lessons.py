"""Chart.js 教程生成脚本。

本脚本会重新生成首页 index.html、15 个课程页面，以及兼容旧文件 001ini.html / 002柱形图.html。
所有页面共享同一份外部样式文件 css/style.css，便于统一维护。
每个课程页面的 JavaScript 中，都为 Chart.js 的关键参数加了详细中文注释，
说明该参数的含义、可选值、典型默认值，以及如何根据自己的需求自定义。
"""
from pathlib import Path
from string import Template
import textwrap

base = Path(__file__).resolve().parent

lessons = [
    ('001认识Chart.js.html', '第 1 课：认识 Chart.js', '先跑通一个最小可运行示例，理解 Chart.js 最核心的 4 个部分：type、data、options 与 new Chart(...)。'),
    ('002基础柱形图.html', '第 2 课：基础柱形图', '学习柱形图最常见的配置：标签、数据、颜色、边框，以及如何切换为水平柱形图。'),
    ('003折线图.html', '第 3 课：折线图', '用折线图表达趋势，并掌握 tension、fill、pointRadius 等常见参数。'),
    ('004饼图与环形图.html', '第 4 课：饼图与环形图', '学习 pie 与 doughnut 两种占比类图表，以及它们适合什么场景。'),
    ('005雷达图.html', '第 5 课：雷达图', '用雷达图比较多个维度的数据，例如技能、能力、指标完成度。'),
    ('006极地区域图.html', '第 6 课：极地区域图', '认识 polarArea 图表，它适合展示不同类别的强弱与占比感。'),
    ('007散点图与气泡图.html', '第 7 课：散点图与气泡图', '学习如何用 x/y 坐标表示二维关系，以及如何用 r 表示第三维大小。'),
    ('008多数据集对比.html', '第 8 课：多数据集对比', '在同一张图中放入多个 dataset，比对不同对象在同一组标签下的表现。'),
    ('009图表样式美化.html', '第 9 课：图表样式美化', '学习如何美化图表，包括圆角、透明度、线条粗细、点样式和配色。'),
    ('010坐标轴与刻度.html', '第 10 课：坐标轴与刻度', '掌握 scales 配置，控制坐标轴标题、刻度、网格线与最值范围。'),
    ('011标题图例提示框.html', '第 11 课：标题、图例与提示框', '理解 plugins 区域中 title、legend、tooltip 的作用与常见改法。'),
    ('012响应式布局.html', '第 12 课：响应式布局', '让图表跟着容器自适应，并理解 responsive 与 maintainAspectRatio。'),
    ('013堆叠图与组合图.html', '第 13 课：堆叠图与组合图', '学习 stacked bar 与 bar + line 组合图，适合做综合对比图。'),
    ('014数据更新与动态图.html', '第 14 课：数据更新与动态图', '点击按钮后动态更新图表数据，理解为什么更新后要调用 chart.update()。'),
    ('015实战案例.html', '第 15 课：实战案例', '把前面学过的图表知识拼起来，做一个简单的业务看板页面。'),
]

lesson_map = {name: {'title': title, 'intro': intro} for name, title, intro in lessons}
lesson_names = [name for name, _, _ in lessons]

page_template = Template(textwrap.dedent('''
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>$title</title>
    <link rel="stylesheet" href="css/style.css" />
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <header class="hero">
        <div class="hero-inner">
            <div class="badge">Chart.js 系列课程</div>
            <h1>$title</h1>
            <p>$intro</p>
        </div>
    </header>

    <main class="main">
        <section class="panel">
            <h2>本课你会学到什么</h2>
            <ul class="learn-list">
$learning_points
            </ul>
        </section>

        <section class="panel">
            <h2>图表示例</h2>
            <div class="chart-grid">
$canvases
            </div>
        </section>

        <section class="panel">
            <h2>如何自定义成你自己的图表</h2>
            <ul class="tip-list">
$customize_points
            </ul>
        </section>

        <section class="panel">
            <h2>课后练习建议</h2>
            <ol class="exercise-list">
$exercise_points
            </ol>
        </section>

        <section class="panel">
            <h2>课程导航</h2>
            <div class="nav-links">
                $prev_link
                <a href="index.html">返回首页</a>
                $next_link
            </div>
        </section>
    </main>

    <footer>建议一边运行、一边修改源码中的 labels、datasets 和 options 练习。源码注释里写明了每个参数的含义和可选值。</footer>

    <script>
$script
    </script>
</body>
</html>
''').strip())


def li_list(items, indent='                '):
    return '\n'.join(f'{indent}<li>{item}</li>' for item in items)


def nav_links(filename):
    idx = lesson_names.index(filename)
    prev_link = f'<a href="{lesson_names[idx - 1]}">上一课</a>' if idx > 0 else '<a href="index.html">课程首页</a>'
    next_link = f'<a href="{lesson_names[idx + 1]}">下一课</a>' if idx < len(lesson_names) - 1 else '<a href="index.html">完成本系列</a>'
    return prev_link, next_link


def chart_card(title, desc, canvas_id, shell_class=''):
    shell_class = f'chart-shell {shell_class}'.strip()
    return textwrap.dedent(f'''
        <article class="chart-card">
            <h3>{title}</h3>
            <p>{desc}</p>
            <div class="{shell_class}">
                <canvas id="{canvas_id}"></canvas>
            </div>
        </article>
    ''').strip()


def build_page(filename, learning_points, canvases, customize_points, exercise_points, script):
    title = lesson_map[filename]['title']
    intro = lesson_map[filename]['intro']
    prev_link, next_link = nav_links(filename)
    html = page_template.substitute(
        title=title,
        intro=intro,
        learning_points=li_list(learning_points),
        canvases=textwrap.indent('\n'.join(canvases), '                '),
        customize_points=li_list(customize_points),
        exercise_points=li_list(exercise_points),
        prev_link=prev_link,
        next_link=next_link,
        script=textwrap.indent(textwrap.dedent(script).strip(), '        ')
    )
    (base / filename).write_text(html + '\n', encoding='utf-8')
    return html


# ----------------------------------------------------------------------------
# 第 1 课：认识 Chart.js —— 用满满的注释解释每一行配置
# ----------------------------------------------------------------------------
page1 = build_page(
    '001认识Chart.js.html',
    [
        'Chart.js 最小可运行示例由 <strong>canvas + CDN + data + config</strong> 组成。',
        '知道 <code>type</code> 用来指定图表类型，<code>data</code> 放数据，<code>options</code> 放行为和外观配置。',
        '理解以后你要自定义图表时，最先改的通常就是标签、数据数组和图表类型。',
    ],
    [chart_card('最小柱形图示例', '这是第一张最基础的 Chart.js 图表，只做一件事：先让图跑起来。', 'lessonChart')],
    [
        '如果你要换成自己的分类名称，优先修改 <code>labels</code> 数组，例如把“周一、周二”改成“产品 A、产品 B”。',
        '如果你要换成自己的数值，优先修改 <code>datasets[0].data</code> 数组，并保持数据个数与 <code>labels</code> 个数一致。',
        '如果你想从柱形图换成折线图，只需要把 <code>type: "bar"</code> 改成 <code>type: "line"</code>，然后再微调颜色和点样式。',
        '如果图表高度不合适，优先改外层容器高度，或配合 <code>maintainAspectRatio: false</code> 控制尺寸。',
    ],
    [
        '把本课的学习时长改成你一周的真实数据。',
        '把柱形图改成折线图，观察默认样式有什么变化。',
        '新增一个数据项，比如“周日”，并同步补上标签和值。',
    ],
    '''
        // ============================================================
        // 第 1 步：拿到 canvas 元素
        // ------------------------------------------------------------
        // Chart.js 必须在 <canvas> 上绘制。
        // document.getElementById('lessonChart') 中的字符串必须与 HTML
        // 里 <canvas id="lessonChart"> 的 id 完全一致。
        // 自定义建议：如果你修改了 HTML 中的 id，这里也要同步修改。
        // ============================================================
        const ctx = document.getElementById('lessonChart');

        // ============================================================
        // 第 2 步：准备 labels（横轴上的分类名称）
        // ------------------------------------------------------------
        // labels 是一个字符串数组。
        // 含义：每一个元素，对应一根柱子（或一个数据点）的“名字”。
        // 自定义建议：
        //   - 想换成月份：['1月','2月','3月',...]
        //   - 想换成产品：['产品A','产品B','产品C']
        //   - 想换成时间：['8:00','9:00','10:00']
        // 注意：labels 的长度必须与下面 data 数组的长度一致。
        // ============================================================
        const labels = ['周一', '周二', '周三', '周四', '周五', '周六'];

        // ============================================================
        // 第 3 步：组装 data 对象
        // ------------------------------------------------------------
        // data 是 Chart.js 必填项之一，结构为：
        //   { labels: [...], datasets: [ {...}, {...} ] }
        // datasets 必须是数组，即使现在只有一组数据。
        // ============================================================
        const data = {
            labels,
            datasets: [
                {
                    // label：这组数据的名字（字符串）
                    //   - 显示位置：图例（legend）、提示框（tooltip）
                    //   - 自定义建议：写得越具体越好，比如“2024年销售额”
                    label: '学习时长（分钟）',

                    // data：每个标签对应的数值（数字数组）
                    //   - 长度必须与 labels 一致
                    //   - 可以是整数、小数；负数也支持
                    //   - 自定义建议：直接替换为你自己的真实数据
                    data: [25, 40, 35, 60, 50, 70],

                    // backgroundColor：柱子的填充颜色
                    //   - 可选值类型：
                    //       1) 单个颜色字符串 → 所有柱子同色
                    //          例：'red'、'#4f7cff'、'rgb(79,124,255)'、'rgba(79,124,255,0.5)'
                    //       2) 颜色数组 → 每根柱子一个颜色
                    //          例：['red','blue','green',...]
                    //   - 推荐使用 rgba()，第 4 位是透明度（0~1）
                    backgroundColor: 'rgba(79, 124, 255, 0.55)',

                    // borderColor：柱子的边框颜色
                    //   - 取值规则与 backgroundColor 相同
                    //   - 默认：与 backgroundColor 接近
                    borderColor: 'rgb(79, 124, 255)',

                    // borderWidth：边框线的粗细（单位：像素）
                    //   - 取值：非负数字，0 表示无边框
                    //   - 默认：bar 图为 0，line 图为 3
                    //   - 自定义建议：1~3 之间最常见
                    borderWidth: 1,
                },
            ],
        };

        // ============================================================
        // 第 4 步：组装 config（图表总配置）
        // ------------------------------------------------------------
        // config 由 type / data / options 三部分组成。
        // ============================================================
        const config = {
            // type：图表类型（字符串）
            //   - 可选值：'bar'（柱形图）、'line'（折线图）、'pie'（饼图）、
            //              'doughnut'（环形图）、'radar'（雷达图）、
            //              'polarArea'（极地区域图）、'scatter'（散点图）、
            //              'bubble'（气泡图）
            //   - 自定义建议：换图表类型时，这是最先改的地方
            type: 'bar',

            // data：上一步组装的数据对象
            data,

            // options：图表的行为与外观配置
            options: {
                // responsive：是否随容器尺寸变化而自适应
                //   - 可选值：true / false
                //   - 默认：true
                //   - 关掉它会让图变成固定尺寸（用 canvas 的 width/height 属性）
                responsive: true,

                // maintainAspectRatio：是否保持默认宽高比
                //   - 可选值：true / false
                //   - 默认：true（保持 2:1 的宽高比）
                //   - 设为 false 后，图表会完全填满外层容器的高度
                //   - 建议：当你已经手动设置了容器 height 时，写 false
                maintainAspectRatio: false,

                // scales：坐标轴配置
                //   - 对柱形图、折线图、散点图等“坐标系图表”有效
                //   - 对饼图、环形图无效
                scales: {
                    // y：纵轴配置（横轴是 x）
                    y: {
                        // beginAtZero：是否从 0 开始
                        //   - 可选值：true / false
                        //   - 默认：false（Chart.js 自动选择起点）
                        //   - 建议：做对比类图表时设为 true，更直观
                        beginAtZero: true,

                        // ticks：刻度文字的配置
                        ticks: {
                            // stepSize：刻度间隔（数字）
                            //   - 默认：自动计算
                            //   - 例：stepSize: 10 → 0, 10, 20, 30, ...
                            stepSize: 10,
                        },
                    },
                },

                // plugins：插件配置区（标题、图例、提示框都在这里）
                plugins: {
                    // title：图表标题
                    title: {
                        // display：是否显示标题（true / false，默认 false）
                        display: true,
                        // text：标题文字（字符串，或字符串数组实现多行）
                        text: '我的第一张 Chart.js 图表',
                    },
                },
            },
        };

        // ============================================================
        // 第 5 步：创建图表实例
        // ------------------------------------------------------------
        // new Chart(canvas, config) 会真正画出图表。
        // 返回的 chart 实例后续可以用于：chart.update()、chart.destroy() 等。
        // ============================================================
        const chart = new Chart(ctx, config);
    '''
)

# ----------------------------------------------------------------------------
# 第 2 课：基础柱形图
# ----------------------------------------------------------------------------
page2 = build_page(
    '002基础柱形图.html',
    [
        '柱形图最适合做分类比较，例如月份销量、班级成绩、功能使用次数。',
        '你会学到单色柱形图、分色柱形图，以及如何用 <code>indexAxis: "y"</code> 变成水平柱形图。',
        '理解 <code>backgroundColor</code>、<code>borderColor</code>、<code>borderWidth</code>、<code>beginAtZero</code> 的作用。',
    ],
    [
        chart_card('垂直柱形图', '先用最常见的垂直柱形图展示每个月的销量。', 'barVertical'),
        chart_card('水平柱形图', '把 indexAxis 改成 y，就能变成水平柱形图。', 'barHorizontal'),
    ],
    [
        '想修改柱子名称时，改 <code>labels</code>；想修改柱子高度时，改 <code>data</code>。',
        '想每根柱子显示不同颜色时，把 <code>backgroundColor</code> 从单个字符串改成数组。',
        '想做水平柱形图时，在 <code>options</code> 里加入 <code>indexAxis: "y"</code>。',
        '如果你要比较多组数据，不要复制很多张图，而是进入第 8 课学习多数据集。',
    ],
    [
        '把销量数据改成你自己的业务数据，例如访客数或订单数。',
        '把垂直柱形图改成不同颜色的版本。',
        '把水平柱形图的标签改成产品名称，看是否比月份更适合横向展示。',
    ],
    '''
        // ============================================================
        // 示例 1：垂直柱形图（Chart.js 默认方向）
        // ============================================================
        const verticalCtx = document.getElementById('barVertical');

        new Chart(verticalCtx, {
            // type='bar' 时，indexAxis 默认为 'x'（柱子竖着长）
            type: 'bar',
            data: {
                // labels：横轴上的分类。长度必须等于 data 数组长度
                labels: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月'],
                datasets: [{
                    // label：在图例 / tooltip 中显示
                    label: '销量（件）',
                    // data：与 labels 一一对应的数值
                    data: [120, 150, 180, 170, 210, 240],
                    // backgroundColor：单个字符串 → 所有柱子同色
                    backgroundColor: 'rgba(52, 211, 153, 0.55)',
                    // borderColor：柱子边框颜色
                    borderColor: 'rgb(5, 150, 105)',
                    // borderWidth：边框粗细（像素），0 表示无边框
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,           // 跟随容器自适应
                maintainAspectRatio: false, // 让图表充满容器高度
                scales: {
                    y: {
                        // beginAtZero：从 0 开始，更利于对比
                        beginAtZero: true,
                    },
                },
                plugins: {
                    title: {
                        display: true,
                        text: '上半年销量（垂直柱形图）',
                    },
                },
            },
        });

        // ============================================================
        // 示例 2：水平柱形图（每根柱子不同颜色）
        // ============================================================
        const horizontalCtx = document.getElementById('barHorizontal');

        new Chart(horizontalCtx, {
            type: 'bar',
            data: {
                labels: ['产品 A', '产品 B', '产品 C', '产品 D', '产品 E'],
                datasets: [{
                    label: '收藏次数',
                    data: [88, 132, 76, 145, 98],
                    // backgroundColor 改成数组 → 每根柱子单独配色
                    //   - 数组长度建议与 data 长度一致
                    //   - 长度不够时，颜色会循环使用
                    backgroundColor: [
                        'rgba(79, 124, 255, 0.55)',
                        'rgba(56, 189, 248, 0.55)',
                        'rgba(244, 114, 182, 0.55)',
                        'rgba(250, 204, 21, 0.55)',
                        'rgba(45, 212, 191, 0.55)',
                    ],
                    // borderColor 同样支持数组写法
                    borderColor: [
                        'rgb(79, 124, 255)',
                        'rgb(14, 165, 233)',
                        'rgb(236, 72, 153)',
                        'rgb(202, 138, 4)',
                        'rgb(13, 148, 136)',
                    ],
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,

                // indexAxis：决定图表的方向
                //   - 'x'（默认）：分类在横轴，柱子竖着长（垂直柱形图）
                //   - 'y'：分类在纵轴，柱子横着长（水平柱形图）
                //   - 当标签文字较长时，'y' 通常更易读
                indexAxis: 'y',

                scales: {
                    // 注意：水平柱形图中数值轴变成了 x，所以 beginAtZero 写在 x 下
                    x: { beginAtZero: true },
                },
                plugins: {
                    title: {
                        display: true,
                        text: '热门产品收藏数（水平柱形图）',
                    },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 3 课：折线图
# ----------------------------------------------------------------------------
build_page(
    '003折线图.html',
    [
        '折线图适合展示随时间变化的趋势，例如温度、访问量、销售额。',
        '本课重点学习 <code>tension</code>、<code>fill</code>、<code>pointRadius</code> 和线条颜色配置。',
        '理解折线图和柱形图的区别：柱形图更适合分类对比，折线图更适合看变化趋势。',
    ],
    [chart_card('访问量趋势图', '折线图最常见的用法是观察一段时间内的数据起伏。', 'lineTrend')],
    [
        '如果你要换自己的时间维度，先改 <code>labels</code>，例如从“周一~周日”改成“1 月~12 月”。',
        '如果你想让线更平滑，增大 <code>tension</code>；如果想更硬朗的折线，可以把它改成 <code>0</code>。',
        '如果你不想要面积填充，把 <code>fill</code> 改成 <code>false</code>。',
        '如果数据点太明显或太小，可以调 <code>pointRadius</code>、<code>pointHoverRadius</code>。',
    ],
    [
        '把本课数据改成你最近 7 天的真实访问量。',
        '把曲线改成完全折线，比较视觉差异。',
        '再添加一组数据，例如“注册人数”，做双折线对比。',
    ],
    '''
        const ctx = document.getElementById('lineTrend');

        new Chart(ctx, {
            // type='line'：折线图
            type: 'line',
            data: {
                labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                datasets: [{
                    label: '网站访问量',
                    data: [180, 220, 210, 260, 300, 280, 340],

                    // borderColor：折线本身的颜色（折线图主色）
                    //   - 可写颜色字符串：'red'、'#4f7cff'、'rgb(...)' 等
                    borderColor: 'rgb(79, 124, 255)',

                    // backgroundColor：折线图中是“线下方填充区”的颜色
                    //   - 配合 fill 一起使用
                    //   - 建议用低透明度的 rgba()，避免太抢眼
                    backgroundColor: 'rgba(79, 124, 255, 0.18)',

                    // fill：是否填充线下方区域
                    //   - 可选值：
                    //       true       → 填充到 0 基线
                    //       false      → 不填充
                    //       'origin'   → 等价于 true
                    //       'start'    → 填充到坐标轴起点
                    //       'end'      → 填充到坐标轴终点
                    //       数字（dataset 索引）→ 填充到指定 dataset 之间
                    fill: true,

                    // tension：曲线的张力 / 平滑度
                    //   - 取值范围：0 ~ 1
                    //   - 0 → 完全折线（拐角硬）
                    //   - 0.4 左右 → 自然的平滑曲线（推荐）
                    //   - 1 → 很圆滑，但容易“失真”
                    tension: 0.35,

                    // pointRadius：每个数据点的半径（像素）
                    //   - 默认：3
                    //   - 设为 0 可以隐藏数据点
                    pointRadius: 4,

                    // pointHoverRadius：鼠标悬停时数据点的半径
                    //   - 通常比 pointRadius 大一些，用来强调
                    pointHoverRadius: 7,

                    // borderWidth：折线的粗细（像素）
                    //   - 折线图默认：3
                    borderWidth: 3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true },
                },
                plugins: {
                    title: {
                        display: true,
                        text: '最近一周访问量趋势',
                    },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 4 课：饼图与环形图
# ----------------------------------------------------------------------------
build_page(
    '004饼图与环形图.html',
    [
        'pie 与 doughnut 都适合展示“整体由哪些部分组成”。',
        'pie 是实心圆，doughnut 中间有空洞，更适合在中心留说明文案。',
        '本课重点观察：这种图表通常没有坐标轴，主要通过颜色、标签和提示框来识别数据。',
    ],
    [
        chart_card('饼图（Pie）', '适合做基础占比展示。', 'pieChart'),
        chart_card('环形图（Doughnut）', '适合做现代信息卡片式展示。', 'doughnutChart'),
    ],
    [
        '想换成自己的分类，例如“渠道来源、预算分配”，优先改 <code>labels</code>。',
        '想换成自己的占比数值，优先改 <code>data</code>。Chart.js 会自动根据总和计算扇区大小。',
        '想换配色，直接改 <code>backgroundColor</code> 数组，数组长度最好与数据项个数一致。',
        '如果你更喜欢中心留白的视觉效果，就用 <code>type: "doughnut"</code>。',
    ],
    [
        '把本课改成“每月支出占比”图。',
        '尝试增加一个新的类别，例如“教育支出”。',
        '把 pie 改成 doughnut，对比视觉差异。',
    ],
    '''
        // ============================================================
        // 饼图与环形图共享的数据
        // ------------------------------------------------------------
        // pie / doughnut 没有坐标轴，但仍然需要 labels 和 data。
        //   - labels：每个扇区的名字
        //   - data：每个扇区的数值（Chart.js 会自动按比例换算）
        //   - colors：每个扇区的颜色（顺序与 labels 一一对应）
        // ============================================================
        const labels = ['搜索', '推荐', '广告', '社群', '直接访问'];
        const values = [35, 22, 18, 15, 10];
        const colors = ['#4f7cff', '#38bdf8', '#34d399', '#f59e0b', '#f472b6'];

        // ============================================================
        // 示例 1：饼图（Pie）
        // ============================================================
        new Chart(document.getElementById('pieChart'), {
            // type='pie'：实心饼图
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    label: '访问来源占比',
                    data: values,
                    // backgroundColor 数组：每个扇区一个颜色
                    backgroundColor: colors,
                    // borderColor：扇区之间分隔线的颜色
                    //   - 通常用白色，分隔感更强
                    borderColor: '#ffffff',
                    // borderWidth：分隔线粗细
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: '访问来源占比（Pie）' },
                },
            },
        });

        // ============================================================
        // 示例 2：环形图（Doughnut）
        // ------------------------------------------------------------
        // 与饼图几乎相同，唯一区别是 type='doughnut'，中间有空洞。
        // 你可以再加 cutout 配置控制空洞大小：
        //   options.cutout = '50%' （默认 50%）
        //   - 数值越大，空洞越大
        //   - '0%' 时退化为饼图
        // ============================================================
        new Chart(document.getElementById('doughnutChart'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    label: '访问来源占比',
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // cutout：环形图中心空洞大小
                //   - 取值：百分比字符串 '50%'，或像素数字 80
                //   - 默认：'50%'
                cutout: '55%',
                plugins: {
                    title: { display: true, text: '访问来源占比（Doughnut）' },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 5 课：雷达图
# ----------------------------------------------------------------------------
build_page(
    '005雷达图.html',
    [
        '雷达图适合比较多个维度，例如语言能力、产品能力、运动能力。',
        '每个轴代表一个维度，离中心越远通常表示数值越高。',
        '本课会演示一组能力评估数据，并说明如何加入第二组对象做对比。',
    ],
    [chart_card('能力雷达图', '一张图同时比较多个维度的表现。', 'radarChart')],
    [
        '如果你要换成自己的评价维度，修改 <code>labels</code>，例如“速度、质量、成本、稳定性”。',
        '如果你要比较另一个人或另一个产品，只需要在 <code>datasets</code> 中再加一个对象。',
        '想让区域更透明或更明显，可以修改 <code>backgroundColor</code> 的透明度。',
        '如果你发现图太拥挤，减少维度数量通常比继续加样式更有效。',
    ],
    [
        '增加第二组数据，例如“同学 B”或“竞品 B”。',
        '把维度改成你自己的技能项。',
        '把数值范围改到 0~10，并同步调整刻度设置。',
    ],
    '''
        new Chart(document.getElementById('radarChart'), {
            // type='radar'：雷达图（多维度对比）
            type: 'radar',
            data: {
                // labels：每个轴的名字（即每个维度）
                //   - 维度个数 = 轴的个数
                //   - 推荐 4~8 个，过多会拥挤
                labels: ['HTML', 'CSS', 'JavaScript', 'Chart.js', '审美', '表达'],
                datasets: [{
                    label: '当前掌握度',
                    // data：对应每个维度的分值
                    //   - 长度必须等于 labels 长度
                    data: [85, 78, 72, 60, 68, 74],

                    // backgroundColor：包围多边形的填充色
                    //   - 推荐低透明度，叠加多组数据时不会互相遮挡
                    backgroundColor: 'rgba(79, 124, 255, 0.20)',

                    // borderColor：多边形边线颜色
                    borderColor: 'rgb(79, 124, 255)',

                    // pointBackgroundColor：每个顶点的填充色
                    pointBackgroundColor: 'rgb(79, 124, 255)',

                    // borderWidth：边线粗细
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // scales.r：雷达图唯一的轴（径向轴）
                //   - 与 x、y 不同，雷达图只有一个轴 r
                scales: {
                    r: {
                        // beginAtZero：是否从 0 开始（推荐 true）
                        beginAtZero: true,
                        // min / max：轴的最小值 / 最大值
                        //   - 自定义建议：根据你的评分体系修改
                        //     例：100 分制写 0~100，10 分制写 0~10
                        min: 0,
                        max: 100,
                        // ticks.stepSize：刻度间隔
                        ticks: { stepSize: 20 },
                    },
                },
                plugins: {
                    title: { display: true, text: '前端学习能力雷达图' },
                },
            },
        });

        // 拓展：要新增一组对比对象，只需在 datasets 里再加一个对象，例如：
        // {
        //     label: '同学 B',
        //     data: [70, 82, 88, 50, 75, 60],
        //     backgroundColor: 'rgba(244, 114, 182, 0.20)',
        //     borderColor: 'rgb(244, 114, 182)',
        //     pointBackgroundColor: 'rgb(244, 114, 182)',
        //     borderWidth: 2,
        // }
    '''
)

# ----------------------------------------------------------------------------
# 第 6 课：极地区域图
# ----------------------------------------------------------------------------
build_page(
    '006极地区域图.html',
    [
        '极地区域图（polarArea）也在展示组成，但它更强调每个类别的强弱感。',
        '和饼图不同，它主要通过“半径大小”来表现数值。',
        '当你想做一个更有视觉张力的分类比较图时，可以试试 polarArea。',
    ],
    [chart_card('极地区域图', '不同类别的半径大小不同，视觉上更强调强弱。', 'polarChart')],
    [
        '改分类名称时，还是优先改 <code>labels</code>。',
        '改半径大小时，改 <code>data</code> 数组。数值越大，扇区越长。',
        '想做更鲜明的视觉对比，可以把高值项的颜色写得更深或更暖。',
        '如果你更关心严格的百分比阅读，通常饼图或柱形图更直观。',
    ],
    [
        '用 polarArea 画“各渠道线索质量评分”。',
        '尝试把最低的两个分类颜色改成浅灰色。',
        '把标签数量增加到 8 个，观察画面是否仍然易读。',
    ],
    '''
        new Chart(document.getElementById('polarChart'), {
            // type='polarArea'：极地区域图
            //   - 与饼图相比：扇区角度都相同，靠半径长度区分数值大小
            //   - 与雷达图相比：用扇区代替多边形
            type: 'polarArea',
            data: {
                // labels：每个扇区的分类名
                labels: ['阅读', '练习', '复盘', '项目', '提问', '分享'],
                datasets: [{
                    label: '学习投入度',
                    // data：每个扇区的数值
                    //   - 数值越大 → 该扇区半径越长
                    //   - 不需要预先归一化，Chart.js 会自动按最大值缩放
                    data: [18, 22, 12, 28, 9, 15],
                    // backgroundColor：每个扇区的颜色（数组）
                    //   - 推荐 0.6~0.8 的透明度，看起来更有层次
                    backgroundColor: [
                        'rgba(79, 124, 255, 0.70)',
                        'rgba(56, 189, 248, 0.70)',
                        'rgba(52, 211, 153, 0.70)',
                        'rgba(250, 204, 21, 0.70)',
                        'rgba(244, 114, 182, 0.70)',
                        'rgba(251, 146, 60, 0.70)',
                    ],
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: '不同学习方式的投入度' },
                    legend: {
                        // legend.position：图例位置
                        //   - 可选值：'top'（默认） / 'bottom' / 'left' / 'right'
                        //   - 当分类多时，'right' 比 'top' 更省空间
                        position: 'right',
                    },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 7 课：散点图与气泡图
# ----------------------------------------------------------------------------
build_page(
    '007散点图与气泡图.html',
    [
        '散点图适合看两个变量的关系，例如学习时长和成绩、价格和销量。',
        '气泡图比散点图多一个 <code>r</code> 半径字段，用来表示第三个维度。',
        '本课要重点记住：scatter / bubble 的数据不是普通数组，而是对象数组。',
    ],
    [
        chart_card('散点图', '每个点都有一个 x 和 y 坐标。', 'scatterChart'),
        chart_card('气泡图', '每个点除了 x 和 y，还多了一个 r 表示大小。', 'bubbleChart'),
    ],
    [
        '散点图要改自己的数据时，改成 <code>{ x: 数值, y: 数值 }</code> 这种对象数组。',
        '气泡图则要写成 <code>{ x: 数值, y: 数值, r: 半径 }</code>。',
        '如果你看不懂横轴和纵轴，请先在 <code>scales.x.title</code> 与 <code>scales.y.title</code> 里写清楚轴标题。',
        '当你想表达第三维（例如用户规模、项目体量）时，优先考虑气泡图。',
    ],
    [
        '把散点图改成“学习时长与考试分数”的关系。',
        '把气泡图改成“产品价格、销量、利润”的三维关系。',
        '手动增加 3 个点，观察整体分布是否更集中。',
    ],
    '''
        // ============================================================
        // 示例 1：散点图（scatter）
        // ------------------------------------------------------------
        // 关键点：data 不再是数字数组，而是 { x, y } 对象数组。
        // 也因此 scatter 通常不用 labels（每个点自带坐标）。
        // ============================================================
        new Chart(document.getElementById('scatterChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '学习时长与成绩',
                    // data：对象数组
                    //   - x：横轴坐标（数字）
                    //   - y：纵轴坐标（数字）
                    data: [
                        { x: 1, y: 62 },
                        { x: 2, y: 68 },
                        { x: 3, y: 74 },
                        { x: 4, y: 79 },
                        { x: 5, y: 84 },
                        { x: 6, y: 91 },
                    ],
                    backgroundColor: 'rgba(79, 124, 255, 0.75)',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        // title：轴标题（强烈推荐写，否则别人看不懂）
                        title: { display: true, text: '每天学习时长（小时）' },
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '成绩' },
                    },
                },
                plugins: {
                    title: { display: true, text: '散点图：学习时长与成绩' },
                },
            },
        });

        // ============================================================
        // 示例 2：气泡图（bubble）
        // ------------------------------------------------------------
        // 比 scatter 多一个 r 字段：每个气泡的半径（像素）。
        // r 用来表示第三维信息，比如“用户量、利润、权重”。
        // ============================================================
        new Chart(document.getElementById('bubbleChart'), {
            type: 'bubble',
            data: {
                datasets: [{
                    label: '产品：价格 / 销量 / 利润',
                    data: [
                        // 每个点：{ x, y, r }
                        //   - x: 价格    y: 销量    r: 利润大小
                        //   - r 单位是像素（不是数据值），通常需要按比例换算
                        { x: 59,  y: 120, r: 10 },
                        { x: 89,  y: 95,  r: 14 },
                        { x: 129, y: 75,  r: 18 },
                        { x: 149, y: 62,  r: 9  },
                    ],
                    backgroundColor: 'rgba(52, 211, 153, 0.55)',
                    borderColor: 'rgb(5, 150, 105)',
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: '价格（元）' } },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: '销量（件）' },
                    },
                },
                plugins: {
                    title: { display: true, text: '气泡图：价格、销量与利润体量' },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 8 课：多数据集对比
# ----------------------------------------------------------------------------
build_page(
    '008多数据集对比.html',
    [
        '多数据集对比的关键是：同一个 labels，共享多个 dataset。',
        '这是做“多个班级、多个年份、多个产品组”对比时最常见的写法。',
        '本课会用 grouped bar（并列柱形图）做演示。',
    ],
    [chart_card('多数据集并列柱形图', '把多个对象放在同一组标签下比较，是最常见的数据分析图。', 'multiBar')],
    [
        '增加对比对象时，不要改 labels，而是继续往 <code>datasets</code> 里添加对象。',
        '每个 dataset 都可以有自己的 <code>label</code>、<code>data</code> 和颜色。',
        '如果你想比较“同一批月份下的三条产品线”，这种写法最合适。',
        '如果你想把它们堆起来而不是并列展示，请看第 13 课。',
    ],
    [
        '增加第三组数据，例如“高三（3）班”。',
        '把颜色改成你项目的品牌色。',
        '把图例放到底部，观察布局变化。',
    ],
    '''
        new Chart(document.getElementById('multiBar'), {
            type: 'bar',
            data: {
                // 共享的 labels：所有 dataset 都按这套分类来对应数据
                labels: ['语文', '数学', '英语', '物理', '化学'],

                // datasets：多个对象 → 多组对比柱子
                //   - 默认会自动并列显示（grouped bar）
                //   - 想堆叠显示，请见第 13 课
                datasets: [
                    {
                        // 第 1 组：高三（1）班
                        label: '高三（1）班',
                        data: [92, 88, 95, 84, 90],
                        backgroundColor: 'rgba(79, 124, 255, 0.60)',
                        borderColor: 'rgb(79, 124, 255)',
                        borderWidth: 1,
                    },
                    {
                        // 第 2 组：高三（2）班
                        //   - 注意：data 长度必须与 labels 一致
                        label: '高三（2）班',
                        data: [86, 91, 89, 87, 85],
                        backgroundColor: 'rgba(52, 211, 153, 0.60)',
                        borderColor: 'rgb(5, 150, 105)',
                        borderWidth: 1,
                    },
                    // 想加第 3 组？复制上面的对象，改 label/data/颜色即可。
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        // max：纵轴最大值（数字）
                        //   - 没设置时，Chart.js 自动选择
                        //   - 这里固定 100，让两个班的对比更稳定
                        max: 100,
                    },
                },
                plugins: {
                    title: { display: true, text: '两个班级的科目成绩对比' },
                    legend: {
                        // legend.position：图例位置
                        //   - 'top' / 'bottom' / 'left' / 'right'
                        position: 'top',
                    },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 9 课：图表样式美化
# ----------------------------------------------------------------------------
build_page(
    '009图表样式美化.html',
    [
        '同一份数据，换一套样式，图表的气质会差很多。',
        '本课重点学习 <code>borderRadius</code>、<code>borderSkipped</code>、<code>pointStyle</code> 等美化参数。',
        '注意：美化应该服务于可读性，不要为了花哨而牺牲信息表达。',
    ],
    [
        chart_card('圆角柱形图', '让柱子更柔和、更接近现代看板视觉。', 'prettyBar'),
        chart_card('带点样式的折线图', '通过点样式和颜色层次增强趋势图的识别度。', 'prettyLine'),
    ],
    [
        '柱形图想更圆润，优先改 <code>borderRadius</code>。',
        '如果柱子顶部和底部都要圆角，可以加 <code>borderSkipped: false</code>。',
        '折线图想让数据点更醒目，可以调 <code>pointRadius</code>、<code>pointStyle</code>、<code>pointBackgroundColor</code>。',
        '如果你想统一整套项目风格，最值得沉淀的是颜色方案和图例位置。',
    ],
    [
        '把柱形图颜色换成一组冷色系品牌色。',
        '把折线图点样式从 circle 改成 rectRounded 或 triangle。',
        '把两张图都做成深色背景版。',
    ],
    '''
        // ============================================================
        // 示例 1：圆角柱形图
        // ============================================================
        new Chart(document.getElementById('prettyBar'), {
            type: 'bar',
            data: {
                labels: ['A 版', 'B 版', 'C 版', 'D 版', 'E 版'],
                datasets: [{
                    label: '点击率',
                    data: [12, 19, 16, 24, 21],
                    backgroundColor: [
                        'rgba(79, 124, 255, 0.65)',
                        'rgba(56, 189, 248, 0.65)',
                        'rgba(52, 211, 153, 0.65)',
                        'rgba(250, 204, 21, 0.65)',
                        'rgba(244, 114, 182, 0.65)',
                    ],

                    // borderRadius：柱子的圆角半径（像素）
                    //   - 默认：0
                    //   - 推荐：8~12，看起来更现代
                    //   - 也可以写成对象，针对单角设置：
                    //       { topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 0 }
                    borderRadius: 12,

                    // borderSkipped：哪一侧不画边框（柱形图常用于圆角控制）
                    //   - 默认：'start'（柱底不画，所以底部不会出现圆角）
                    //   - 设为 false：四个角都画 → 顶部和底部都圆
                    //   - 其它可选：'top' / 'bottom' / 'left' / 'right'
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    title: { display: true, text: '圆角柱形图样式' },
                },
            },
        });

        // ============================================================
        // 示例 2：带点样式的折线图
        // ============================================================
        new Chart(document.getElementById('prettyLine'), {
            type: 'line',
            data: {
                labels: ['第 1 周', '第 2 周', '第 3 周', '第 4 周', '第 5 周'],
                datasets: [{
                    label: '满意度',
                    data: [72, 78, 75, 86, 91],
                    borderColor: 'rgb(99, 102, 241)',
                    backgroundColor: 'rgba(99, 102, 241, 0.14)',
                    fill: true,
                    borderWidth: 3,

                    // pointRadius：数据点半径（像素）
                    pointRadius: 5,
                    // pointHoverRadius：鼠标悬停时数据点半径
                    pointHoverRadius: 8,

                    // pointStyle：数据点形状
                    //   - 可选值：'circle'（默认）、'cross'、'crossRot'、'dash'、
                    //              'line'、'rect'、'rectRounded'、'rectRot'、
                    //              'star'、'triangle'、'rotate'
                    //   - 也可以传一个 Image 对象自定义图标
                    pointStyle: 'rectRounded',

                    // pointBackgroundColor：数据点的填充色
                    pointBackgroundColor: 'rgb(99, 102, 241)',

                    // tension：曲线平滑度（0~1）
                    tension: 0.3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 },
                },
                plugins: {
                    title: { display: true, text: '带点样式的折线图' },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 10 课：坐标轴与刻度
# ----------------------------------------------------------------------------
build_page(
    '010坐标轴与刻度.html',
    [
        'scales 是柱形图、折线图、散点图等坐标类图表最重要的配置区域。',
        '你会学到如何控制轴标题、刻度步长、最小最大值、网格线颜色。',
        '本课能帮你解决“图虽然画出来了，但读起来不够专业”的问题。',
    ],
    [chart_card('坐标轴与刻度设置', '通过清晰的轴标题与刻度配置，让图表更可读。', 'axisChart')],
    [
        '如果横轴和纵轴的含义不够明确，优先加 <code>title.text</code>。',
        '如果你想让纵轴只显示固定间隔，改 <code>ticks.stepSize</code>。',
        '如果图表上下留白太多，可以调 <code>min</code> 和 <code>max</code>。',
        '如果网格线太抢眼，可以把 <code>grid.color</code> 改浅，甚至关闭网格线。',
    ],
    [
        '把本课单位改成“元”或“分钟”，并同步改轴标题。',
        '把纵轴最大值改成 300，看看视觉变化。',
        '只保留 y 轴网格线，隐藏 x 轴网格线。',
    ],
    '''
        new Chart(document.getElementById('axisChart'), {
            type: 'line',
            data: {
                labels: ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月'],
                datasets: [{
                    label: '广告投放回报',
                    data: [120, 145, 165, 180, 210, 235],
                    borderColor: 'rgb(79, 124, 255)',
                    backgroundColor: 'rgba(79, 124, 255, 0.12)',
                    fill: true,
                    tension: 0.25,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,

                // ============================================================
                // scales：坐标轴配置（本课重点）
                // ============================================================
                scales: {
                    // x：横轴
                    x: {
                        // title：轴标题
                        title: {
                            display: true,    // 是否显示
                            text: '月份',     // 标题文本
                            // 可选：font、color、padding 等都可以单独配置
                        },
                        // grid：网格线（垂直方向）
                        grid: {
                            // color：网格线颜色
                            //   - 推荐用低饱和度的灰，避免抢眼
                            //   - 设为 'transparent' 可隐藏
                            color: 'rgba(148, 163, 184, 0.15)',
                            // 还可以配置：
                            //   display: false   → 完全隐藏网格线
                            //   lineWidth: 1     → 线粗细
                            //   drawBorder: true → 是否画轴边线
                        },
                    },

                    // y：纵轴
                    y: {
                        // beginAtZero：是否从 0 开始
                        beginAtZero: true,

                        // min / max：手动指定纵轴范围（数字）
                        //   - 不设置时，Chart.js 自动按数据范围计算
                        //   - 固定后能让多张图保持一致的视觉尺度
                        min: 0,
                        max: 260,

                        // ticks：刻度文字配置
                        ticks: {
                            // stepSize：刻度间隔
                            //   - 例：50 → 0, 50, 100, 150, 200, 250
                            stepSize: 50,
                            // 可选：
                            //   color：刻度文字颜色
                            //   font：字体样式
                            //   callback：自定义文字格式
                            //     callback(value) { return value + ' 元'; }
                        },

                        title: {
                            display: true,
                            text: '回报（元）',
                        },

                        grid: {
                            color: 'rgba(79, 124, 255, 0.12)',
                        },
                    },
                },

                plugins: {
                    title: {
                        display: true,
                        text: '带坐标轴标题和刻度的趋势图',
                    },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 11 课：标题、图例与提示框
# ----------------------------------------------------------------------------
build_page(
    '011标题图例提示框.html',
    [
        'plugins 是 Chart.js 很重要的配置区，常见功能都在这里。',
        'title 控制图标题，legend 控制图例，tooltip 控制鼠标悬停时的提示内容。',
        '本课会演示如何把 tooltip 文案改得更像真实业务图表。',
    ],
    [chart_card('标题、图例与提示框', '把图做得更“像一个正式产品里的图表”。', 'pluginChart')],
    [
        '如果你想隐藏图例，把 <code>legend.display</code> 改成 <code>false</code>。',
        '如果你想改变图例位置，改 <code>legend.position</code>。',
        '如果提示框里默认文案不够友好，可以在 <code>tooltip.callbacks</code> 里自定义。',
        '标题建议写“图表要回答的问题”，而不只是一个很泛的名字。',
    ],
    [
        '把 tooltip 文案改成带“元”或“人”的单位。',
        '把图例移到底部。',
        '把标题改成更像报告风格的句子。',
    ],
    '''
        new Chart(document.getElementById('pluginChart'), {
            type: 'bar',
            data: {
                labels: ['短视频', '图文', '直播', '社群'],
                datasets: [{
                    label: '新增线索',
                    data: [86, 62, 108, 74],
                    backgroundColor: 'rgba(79, 124, 255, 0.6)',
                    borderColor: 'rgb(79, 124, 255)',
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },

                // ============================================================
                // plugins：本课重点
                //   - title    图表标题
                //   - legend   图例
                //   - tooltip  鼠标悬停提示框
                // ============================================================
                plugins: {
                    title: {
                        // display：是否显示标题
                        display: true,
                        // text：标题内容
                        //   - 写成字符串数组可以多行：['第一行', '第二行']
                        text: '哪个内容渠道带来的新增线索最多？',
                        // 可选：
                        //   position: 'top' / 'bottom' / 'left' / 'right'
                        //   font: { size: 18, weight: 'bold' }
                        //   color: '#1f2a44'
                        //   padding: 12
                    },

                    legend: {
                        // display：是否显示图例
                        display: true,
                        // position：图例位置
                        //   - 'top'（默认） / 'bottom' / 'left' / 'right' / 'chartArea'
                        position: 'top',
                        // 可选：
                        //   align：'start' / 'center' / 'end'
                        //   labels.color：图例文字颜色
                        //   labels.font：图例字体
                        //   labels.usePointStyle：是否用点样式代替方块
                    },

                    tooltip: {
                        // tooltip 默认就会显示，主要靠 callbacks 自定义文案
                        //   - 还可以配置：
                        //       enabled: false → 关闭 tooltip
                        //       backgroundColor、titleColor、bodyColor 控制颜色
                        //       padding、cornerRadius 控制外观
                        //       mode: 'index' / 'point' / 'nearest' / 'dataset'
                        callbacks: {
                            // label 回调：自定义每行文字
                            //   - context.dataset.label → 当前 dataset 的 label
                            //   - context.parsed.y      → 当前柱子的数值（柱形图）
                            //   - context.parsed.x      → 横轴数值（散点图等）
                            //   - context.label         → 当前柱子的分类名
                            label(context) {
                                return `${context.dataset.label}：${context.parsed.y} 条`;
                            },
                            // 还可以重写：
                            //   title(items) → 自定义提示框顶部文字
                            //   afterLabel(context) → 在主文案下方追加内容
                        },
                    },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 12 课：响应式布局
# ----------------------------------------------------------------------------
build_page(
    '012响应式布局.html',
    [
        '响应式不是只看图能不能缩放，还要看容器高度、排列方式、文字是否拥挤。',
        '本课重点理解 <code>responsive</code> 与 <code>maintainAspectRatio</code> 的配合关系。',
        '你会看到同一套图表代码在不同容器中如何表现。',
    ],
    [
        chart_card('较高容器中的图表', '容器更高时，更适合看细节较多的图。', 'responsiveTall', 'tall'),
        chart_card('较矮容器中的图表', '容器更矮时，更适合做概览型展示。', 'responsiveShort', 'short'),
    ],
    [
        '如果你希望图表跟着窗口变化，保持 <code>responsive: true</code>。',
        '如果你已经手动控制了容器高度，通常建议加 <code>maintainAspectRatio: false</code>。',
        '布局问题很多时候不是图表本身的问题，而是外层容器太高、太矮或太窄。',
        '做真实项目时，先定卡片高度，再定图表样式，通常比反过来更稳定。',
    ],
    [
        '把第一个图表容器高度再加大 100px。',
        '删掉 <code>maintainAspectRatio: false</code> 看看图表行为差异。',
        '把两个图放进手机宽度里试试阅读性。',
    ],
    '''
        // ============================================================
        // 两个图表共用同一份数据，只是装在不同高度的容器里
        // ============================================================
        const commonData = {
            labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
            datasets: [{
                label: '活跃用户',
                data: [320, 360, 410, 390, 460, 520, 580],
                borderColor: 'rgb(79, 124, 255)',
                backgroundColor: 'rgba(79, 124, 255, 0.14)',
                fill: true,
                tension: 0.28,
            }],
        };

        // ============================================================
        // 通用 options
        // ------------------------------------------------------------
        // 关键参数说明：
        //
        // responsive: true
        //   - 默认值就是 true
        //   - 让图表监听容器尺寸变化，自动重绘
        //   - 如果你想做固定尺寸图（比如导出图片），可以设 false
        //
        // maintainAspectRatio: false
        //   - 默认值是 true（按 2:1 默认比例显示）
        //   - 设为 false 后：图表会完全填满外层容器的高度
        //   - 推荐：当你已经手动控制了 .chart-shell 的 height 时使用
        // ============================================================
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: {
                legend: { position: 'bottom' },
            },
        };

        // 较高容器中的图表（折线图，看细节）
        new Chart(document.getElementById('responsiveTall'), {
            type: 'line',
            data: commonData,
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: { display: true, text: '较高容器：更适合读细节' },
                },
            },
        });

        // 较矮容器中的图表（柱形图，看概览）
        new Chart(document.getElementById('responsiveShort'), {
            type: 'bar',
            data: {
                labels: ['搜索', '推荐', '广告', '社群'],
                datasets: [{
                    label: '新增用户',
                    data: [160, 220, 140, 110],
                    backgroundColor: 'rgba(52, 211, 153, 0.60)',
                    // borderRadius：圆角半径，第 9 课讲过
                    borderRadius: 10,
                }],
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: { display: true, text: '较矮容器：更适合看概览' },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 13 课：堆叠图与组合图
# ----------------------------------------------------------------------------
build_page(
    '013堆叠图与组合图.html',
    [
        '堆叠图适合看“总量由哪些部分组成”，组合图适合把两个维度放在同一画面里。',
        'stacked bar 的重点是 <code>scales.x.stacked</code> 与 <code>scales.y.stacked</code>。',
        '组合图的重点是：不同 dataset 可以写不同的 <code>type</code>。',
    ],
    [
        chart_card('堆叠柱形图', '适合看总量组成，比如不同来源共同构成总销售额。', 'stackedChart'),
        chart_card('柱形图 + 折线图组合', '适合把销量和转化率放在一起看。', 'comboChart'),
    ],
    [
        '如果你要看“总量结构”，优先考虑堆叠图。',
        '如果你既想看绝对值又想看趋势或比率，优先考虑组合图。',
        '组合图中每个 dataset 都能单独指定 <code>type</code>。',
        '图层多了以后，标题和图例就更重要，因为读者需要知道每一层代表什么。',
    ],
    [
        '给堆叠图增加第三组来源数据。',
        '把组合图里的折线数据改成真实转化率。',
        '尝试把组合图的柱形数据改成两组产品线。',
    ],
    '''
        // ============================================================
        // 示例 1：堆叠柱形图
        // ------------------------------------------------------------
        // 多个 dataset + scales.x.stacked / scales.y.stacked = 堆叠效果
        // ============================================================
        new Chart(document.getElementById('stackedChart'), {
            type: 'bar',
            data: {
                labels: ['1 月', '2 月', '3 月', '4 月'],
                datasets: [
                    {
                        label: '线上订单',
                        data: [120, 150, 170, 190],
                        backgroundColor: 'rgba(79, 124, 255, 0.65)',
                    },
                    {
                        label: '线下订单',
                        data: [80, 70, 90, 95],
                        backgroundColor: 'rgba(52, 211, 153, 0.65)',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    // stacked：堆叠开关（重点）
                    //   - 默认 false（默认是并列 grouped 显示）
                    //   - 设为 true 时，多个 dataset 会按相同分类叠加
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true },
                },
                plugins: {
                    title: { display: true, text: '堆叠柱形图：总订单由哪些部分组成' },
                },
            },
        });

        // ============================================================
        // 示例 2：柱形图 + 折线图组合
        // ------------------------------------------------------------
        // 关键点：
        //   1) 顶层不写 type，由每个 dataset 自己指定 type
        //   2) 用第二条 y 轴（y1）展示量纲不同的数据（这里是百分比）
        // ============================================================
        new Chart(document.getElementById('comboChart'), {
            // 顶层不写 type → 由 dataset.type 决定每条数据的画法
            data: {
                labels: ['1 月', '2 月', '3 月', '4 月', '5 月'],
                datasets: [
                    {
                        // 第 1 组：柱形图
                        type: 'bar',
                        label: '成交单数',
                        data: [120, 150, 180, 170, 210],
                        backgroundColor: 'rgba(56, 189, 248, 0.60)',
                    },
                    {
                        // 第 2 组：折线图
                        type: 'line',
                        label: '转化率（%）',
                        data: [18, 22, 24, 23, 27],
                        borderColor: 'rgb(244, 114, 182)',
                        backgroundColor: 'rgba(244, 114, 182, 0.12)',

                        // yAxisID：把这条数据绑定到名为 'y1' 的轴
                        //   - 默认会绑定到 'y'（左侧轴）
                        //   - 设置后必须在 scales 中定义同名轴
                        yAxisID: 'y1',
                        tension: 0.3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    // 默认主轴 y（左侧）：用于柱形图绝对值
                    y: {
                        beginAtZero: true,
                        // position：轴显示在哪一侧
                        //   - 'left'（默认） / 'right' / 'top' / 'bottom'
                        position: 'left',
                        title: { display: true, text: '成交单数' },
                    },
                    // 第二条 y 轴：用于折线图的百分比
                    //   - id 与 dataset 的 yAxisID 对应
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        // grid.drawOnChartArea：是否在图表区域绘制网格线
                        //   - 双 y 轴时，关掉副轴的网格线，避免与主轴重叠
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '转化率（%）' },
                    },
                },
                plugins: {
                    title: { display: true, text: '组合图：销量与转化率' },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 14 课：数据更新与动态图
# ----------------------------------------------------------------------------
build_page(
    '014数据更新与动态图.html',
    [
        'Chart.js 不只是静态画图，也可以在用户点击后更新内容。',
        '本课最关键的一句是：数据改完以后，要调用 <code>chart.update()</code> 才会重新渲染。',
        '这正是你未来接真实接口、筛选器、时间范围切换时的基本思路。',
    ],
    [chart_card('可交互动态图表', '点击按钮切换数据，观察图表是如何重新绘制的。', 'dynamicChart')],
    [
        '如果你想切换不同的数据方案，常见做法是准备多个数组，然后在点击事件里替换进去。',
        '修改 <code>chart.data.labels</code> 可以切换横轴文字，修改 <code>chart.data.datasets[0].data</code> 可以切换数值。',
        '调用 <code>chart.update()</code> 的原因是：Chart.js 不会自动猜到你已经改完数据，它需要一个“重新渲染”的指令。',
        '未来接后端接口时，通常是“请求数据 → 填入 chart.data → chart.update()”。',
    ],
    [
        '增加一个“季度数据”按钮。',
        '增加第二个 dataset，切换时同时修改两组数据。',
        '把按钮改成下拉菜单或日期筛选器。',
    ],
    '''
        // ============================================================
        // 第 1 步：准备多套数据
        //   - 每套数据里都包含：labels、values、title
        //   - 切换时，把这三项写回 chart.data 即可
        // ============================================================
        const weeklyPlanA = {
            labels: ['周一', '周二', '周三', '周四', '周五'],
            values: [32, 48, 41, 55, 62],
            title: '本周任务完成数',
        };
        const weeklyPlanB = {
            labels: ['周一', '周二', '周三', '周四', '周五'],
            values: [28, 36, 52, 47, 70],
            title: '下周任务完成数',
        };

        // ============================================================
        // 第 2 步：先用方案 A 创建图表
        //   - 这里跟前面几课一样，没有特殊配置
        // ============================================================
        const chart = new Chart(document.getElementById('dynamicChart'), {
            type: 'bar',
            data: {
                labels: weeklyPlanA.labels,
                datasets: [{
                    label: '完成数',
                    data: weeklyPlanA.values,
                    backgroundColor: 'rgba(79, 124, 255, 0.60)',
                    borderColor: 'rgb(79, 124, 255)',
                    borderWidth: 1,
                    borderRadius: 10,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    title: { display: true, text: weeklyPlanA.title },
                },
            },
        });

        // ============================================================
        // 第 3 步：动态插入按钮（也可以直接在 HTML 写 <button>）
        // ============================================================
        const panel = document.querySelector('.chart-card');
        const controls = document.createElement('div');
        controls.className = 'button-row';
        controls.innerHTML = `
            <button id="showWeekA">显示本周</button>
            <button id="showWeekB">显示下周</button>
            <button id="randomize" class="secondary">随机生成一组新数据</button>
        `;
        panel.appendChild(controls);

        // ============================================================
        // 第 4 步：封装“替换数据并重绘”的函数
        // ------------------------------------------------------------
        // 核心套路（务必记住）：
        //   1) 修改 chart.data.labels / chart.data.datasets[i].data
        //   2) 修改 chart.options（如标题）
        //   3) 调用 chart.update() 触发重新渲染
        // ============================================================
        function applyData(plan) {
            // ① 改 labels：横轴文字
            chart.data.labels = plan.labels;

            // ② 改 data：第 0 个 dataset 的数值
            //    - 多个 dataset 时，可以分别改 datasets[0]、datasets[1]
            chart.data.datasets[0].data = plan.values;

            // ③ 改 options：这里是顺便改一下标题文字
            chart.options.plugins.title.text = plan.title;

            // ④ 关键：调用 update()
            //    - 如果不调用，画面不会刷新
            //    - update() 还可以传配置：
            //        chart.update('none')   → 跳过动画
            //        chart.update('show')   → 用显示动画
            //        chart.update('hide')   → 用隐藏动画
            chart.update();
        }

        // ============================================================
        // 第 5 步：绑定按钮点击事件
        // ============================================================
        document.getElementById('showWeekA').addEventListener('click', () => applyData(weeklyPlanA));
        document.getElementById('showWeekB').addEventListener('click', () => applyData(weeklyPlanB));
        document.getElementById('randomize').addEventListener('click', () => {
            applyData({
                labels: ['周一', '周二', '周三', '周四', '周五'],
                // Math.random() 范围 0~1，乘 50 后取整 + 20 → 得到 20~69 的整数
                values: Array.from({ length: 5 }, () => Math.floor(Math.random() * 50) + 20),
                title: '随机生成的数据样例',
            });
        });
    '''
)

# ----------------------------------------------------------------------------
# 第 15 课：实战案例
# ----------------------------------------------------------------------------
build_page(
    '015实战案例.html',
    [
        '真实业务页面通常不只一张图，而是“指标卡片 + 多张图表”的组合。',
        '本课会用柱形图、折线图、环形图拼一个简化的业务看板。',
        '你要重点观察：不同图表是如何分工协作讲故事的。',
    ],
    [
        chart_card('渠道线索来源', '用柱形图比较各渠道带来的线索量。', 'dashboardBar'),
        chart_card('近 7 天成交趋势', '用折线图看趋势和波动。', 'dashboardLine'),
        chart_card('客户类型占比', '用环形图看整体构成。', 'dashboardDoughnut'),
    ],
    [
        '如果你要做自己的看板，先想清楚“这张图回答什么问题”，再决定图表类型。',
        '柱形图通常回答“谁更多”，折线图通常回答“最近怎么变了”，环形图通常回答“整体由什么组成”。',
        '如果你的项目有品牌色，优先统一所有图表的主色和辅助色。',
        '实战页最重要的不只是配置参数，而是每张图承担的业务叙事角色。',
    ],
    [
        '把卡片数据改成你自己的业务指标。',
        '把其中一张图替换成雷达图或散点图，看是否更适合你的场景。',
        '尝试给看板增加一个日期筛选器，配合第 14 课的 update 思路。',
    ],
    '''
        // ============================================================
        // 第 1 步：动态插入“关键指标卡片”
        //   - 真实看板的固定套路：先用大数字告诉读者整体情况
        // ============================================================
        const summaryPanel = document.createElement('section');
        summaryPanel.className = 'panel';
        summaryPanel.innerHTML = `
            <h2>本周关键指标</h2>
            <div class="cards">
                <div class="mini-card"><span>新增线索</span><strong>430</strong><div>较上周 +12%</div></div>
                <div class="mini-card"><span>成交订单</span><strong>126</strong><div>较上周 +8%</div></div>
                <div class="mini-card"><span>平均客单价</span><strong>¥468</strong><div>较上周 +5%</div></div>
                <div class="mini-card"><span>复购率</span><strong>31%</strong><div>较上周 +3pt</div></div>
            </div>
        `;
        document.querySelector('.main').insertBefore(
            summaryPanel,
            document.querySelectorAll('.panel')[1],
        );

        // ============================================================
        // 第 2 步：图 1 —— 柱形图（“谁更多”）
        //   - 适合横向对比若干分类
        // ============================================================
        new Chart(document.getElementById('dashboardBar'), {
            type: 'bar',
            data: {
                labels: ['短视频', '图文', '直播', '社群', '老带新'],
                datasets: [{
                    label: '线索量',
                    data: [120, 86, 104, 72, 48],
                    backgroundColor: 'rgba(79, 124, 255, 0.60)',
                    borderRadius: 10,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    title: { display: true, text: '各渠道带来的线索量' },
                },
            },
        });

        // ============================================================
        // 第 3 步：图 2 —— 折线图（“最近怎么变了”）
        //   - 适合时间维度的趋势观察
        // ============================================================
        new Chart(document.getElementById('dashboardLine'), {
            type: 'line',
            data: {
                labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                datasets: [{
                    label: '成交订单',
                    data: [12, 18, 15, 20, 22, 17, 22],
                    borderColor: 'rgb(52, 211, 153)',
                    backgroundColor: 'rgba(52, 211, 153, 0.14)',
                    fill: true,
                    tension: 0.3,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    title: { display: true, text: '近 7 天成交趋势' },
                },
            },
        });

        // ============================================================
        // 第 4 步：图 3 —— 环形图（“整体由什么组成”）
        //   - 适合展示构成比例
        // ============================================================
        new Chart(document.getElementById('dashboardDoughnut'), {
            type: 'doughnut',
            data: {
                labels: ['新客户', '复购客户', '会员客户'],
                datasets: [{
                    label: '客户结构',
                    data: [46, 34, 20],
                    backgroundColor: ['#4f7cff', '#34d399', '#f59e0b'],
                    borderColor: '#ffffff',
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: '客户类型占比' },
                    // 圆形/环形图分类多时，图例放底部最稳
                    legend: { position: 'bottom' },
                },
            },
        });
    '''
)

# ----------------------------------------------------------------------------
# 兼容旧文件名
# ----------------------------------------------------------------------------
(base / '001ini.html').write_text(page1 + '\n', encoding='utf-8')
(base / '002柱形图.html').write_text(page2 + '\n', encoding='utf-8')

# ----------------------------------------------------------------------------
# 首页
# ----------------------------------------------------------------------------
course_cards = []
for idx, (name, title, intro) in enumerate(lessons, start=1):
    course_cards.append(textwrap.dedent(f'''
        <a class="course-card" href="{name}">
            <div class="num">LESSON {idx:02d}</div>
            <h3>{title}</h3>
            <p>{intro}</p>
        </a>
    ''').strip())

index_html = Template(textwrap.dedent('''
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chart.js 从入门到应用</title>
    <link rel="stylesheet" href="css/style.css" />
</head>
<body>
    <header class="hero">
        <div class="hero-inner">
            <div class="badge">Chart.js 学习地图</div>
            <h1>Chart.js 从入门到应用</h1>
            <p>这是一个纯静态 HTML 的学习系列。你不需要安装 npm，也不需要配置构建工具，直接用浏览器打开页面即可学习。建议按顺序从第 1 课开始，边看边改源码里的 labels、data、datasets 和 options，每个参数旁边都有详细注释告诉你它的含义和可选值。</p>
        </div>
    </header>

    <main class="main">
        <section class="panel">
            <h2>学习方式建议</h2>
            <div class="callout">
                <strong>推荐顺序：</strong>先学 001 ~ 008 掌握常见图表类型，再学 009 ~ 014 理解样式、坐标轴、交互与组合图，最后用 015 实战案例把知识串起来。
            </div>
            <ul class="learn-list">
                <li>先运行，再修改：每一课都能直接打开并看到结果。</li>
                <li>优先练这四处：<code>type</code>、<code>labels</code>、<code>datasets</code>、<code>options</code>。</li>
                <li>每个参数都有中文注释，边学边照着注释改。</li>
            </ul>
        </section>

        <section class="panel">
            <h2>15 课完整目录</h2>
            <div class="course-grid">
$courses
            </div>
        </section>

        <section class="panel">
            <h2>这个系列会覆盖什么</h2>
            <div class="cards">
                <div class="mini-card"><span>基础图表</span><strong>8 类</strong><div>柱形图、折线图、饼图、环形图、雷达图、极地区域图、散点图、气泡图</div></div>
                <div class="mini-card"><span>配置重点</span><strong>options</strong><div>坐标轴、刻度、标题、图例、提示框、响应式布局</div></div>
                <div class="mini-card"><span>进阶能力</span><strong>动态更新</strong><div>堆叠图、组合图、按钮切换数据、业务看板</div></div>
            </div>
        </section>
    </main>

    <footer>提示：所有页面共享 css/style.css，如果你想换主题色，只改这一个文件即可。</footer>
</body>
</html>
''').strip()).substitute(
    courses=textwrap.indent('\n'.join(course_cards), '                '),
)

(base / 'index.html').write_text(index_html + '\n', encoding='utf-8')
print('Generated index, 15 lesson pages, and shared css/style.css link.')
