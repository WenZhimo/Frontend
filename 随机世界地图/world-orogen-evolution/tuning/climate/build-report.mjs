/**
 * 生成一个自包含的气候调参前后对比报告页，
 * 把渲染后的柯本地图以内联 data URI 写入（Artifact CSP 会阻止
 * 外部图片）。输出：tuning/climate/report.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPS = path.join(__dirname, 'maps');
const OUT = path.join(__dirname, 'report.html');

const uri = (name) => 'data:image/png;base64,' +
    fs.readFileSync(path.join(MAPS, name)).toString('base64');

const beforeSim = uri('before-sim.png');
const afterSim = uri('run2-hires-sim.png');
const truth = uri('before-truth.png');
const beforeDiff = uri('before-diff.png');
const afterDiff = uri('run2-hires-diff.png');

// 显著变化的单类 F1（160K 区域，调参前 → 调参后）
const classes = [
    ['BWh', '热沙漠', 0.198, 0.519, '撒哈拉、阿拉伯和澳洲内陆现在识别为沙漠，而不是草原/稀树草原'],
    ['Dfc', '亚寒带', 0.278, 0.438, '西伯利亚和加拿大针叶林带更加清晰'],
    ['BSh', '热草原', 0.090, 0.153, '萨赫勒与沙漠边缘'],
    ['Af',  '热带雨林', 0.453, 0.503, '亚马孙与刚果核心区'],
    ['Csa', '地中海型', 0.016, 0.024, '仍然较弱，需要定向的季节反转机制'],
];

const metrics = [
    ['目标分', '0.199', '0.259', '+30%', '综合分（½ 精确匹配 + ½ 宏平均 F1）'],
    ['精确匹配', '27.4%', '36.4%', '+9.0 个百分点', '单元格拥有完全正确的柯本类型（30 类）'],
    ['大类匹配', '56.4%', '61.8%', '+5.4 个百分点', '大类正确：热带 / 干旱 / 温带 / 大陆性 / 极地'],
    ['宏平均 F1', '0.124', '0.154', '+24%', '跨类别平均，稀有类型拥有同等权重'],
];

const changes = [
    ['冬季权重更高的季节温差', 'temperature.js',
     '大陆内部在冬季低于年均温的幅度，现在大于夏季高于年均温的幅度，这更贴近 D 类气候冬季的物理现实。同时修正了一个长期声称 40/60 拆分、但代码从未实际采用的注释。'],
    ['干湿季对比', 'precipitation.js',
     '新增控制项让每个季节偏离年均值，恢复此前被模型混合与归一化抹平的季节降水信号。'],
    ['可调柯本代理参数', 'koppen.js',
     '分类器用两季数据估计月度判据；这些估计常数原本是固定猜测。把它们变为可调参数（例如降水到毫米的换算比例）带来了第二轮提升的大部分收益。'],
];

const css = `
:root{
  --ground:#0a0e1a; --panel:#131a2c; --panel-2:#0f1524; --hair:#25304c;
  --ink:#c8d1e6; --ink-strong:#eef2fb; --muted:#7e8aa8;
  --pos:#54d98c; --pos-dim:#2f7a52; --amber:#f2a63b;
  --shadow:0 1px 0 rgba(255,255,255,.03),0 12px 40px -12px rgba(0,0,0,.6);
  --maxw:1080px;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#e9edf5; --panel:#ffffff; --panel-2:#f3f6fc; --hair:#d3dbeb;
    --ink:#33405c; --ink-strong:#141c2e; --muted:#657292;
    --pos:#1c9d5f; --pos-dim:#8fd9b4; --amber:#c47c12;
    --shadow:0 1px 0 rgba(255,255,255,.6),0 14px 40px -18px rgba(30,45,80,.28); }
}
:root[data-theme="dark"]{ --ground:#0a0e1a; --panel:#131a2c; --panel-2:#0f1524; --hair:#25304c;
  --ink:#c8d1e6; --ink-strong:#eef2fb; --muted:#7e8aa8; --pos:#54d98c; --pos-dim:#2f7a52; --amber:#f2a63b;
  --shadow:0 1px 0 rgba(255,255,255,.03),0 12px 40px -12px rgba(0,0,0,.6); }
:root[data-theme="light"]{ --ground:#e9edf5; --panel:#ffffff; --panel-2:#f3f6fc; --hair:#d3dbeb;
  --ink:#33405c; --ink-strong:#141c2e; --muted:#657292; --pos:#1c9d5f; --pos-dim:#8fd9b4; --amber:#c47c12;
  --shadow:0 1px 0 rgba(255,255,255,.6),0 14px 40px -18px rgba(30,45,80,.28); }

*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  line-height:1.55;-webkit-font-smoothing:antialiased;}
.wrap{max-width:var(--maxw);margin:0 auto;padding:clamp(28px,5vw,72px) clamp(18px,4vw,40px) 96px;}
.mono{font-family:ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;}

.eyebrow{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--muted);display:flex;align-items:center;gap:10px;margin:0 0 18px;}
.eyebrow::before{content:"";width:26px;height:1px;background:var(--pos);}
h1{font-size:clamp(30px,5vw,50px);line-height:1.04;letter-spacing:-.02em;font-weight:800;
  color:var(--ink-strong);margin:0 0 16px;text-wrap:balance;max-width:16ch;}
.dek{font-size:clamp(16px,2.2vw,19px);color:var(--ink);max-width:60ch;margin:0;}
.dek b{color:var(--ink-strong);font-weight:650;}

section{margin-top:clamp(44px,6vw,76px);}
.label{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--muted);margin:0 0 16px;}
h2{font-size:clamp(20px,3vw,26px);letter-spacing:-.01em;font-weight:750;color:var(--ink-strong);margin:0 0 6px;text-wrap:balance;}
.sub{color:var(--muted);margin:0 0 22px;max-width:64ch;}

/* ── 对比滑块 ── */
.compare{position:relative;border:1px solid var(--hair);border-radius:14px;overflow:hidden;
  background:var(--panel-2);box-shadow:var(--shadow);aspect-ratio:2/1;touch-action:none;user-select:none;}
.compare img{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:auto;pointer-events:none;}
.compare .top{clip-path:inset(0 calc(100% - var(--pos,50%)) 0 0);}
.divider{position:absolute;top:0;bottom:0;left:var(--pos,50%);width:2px;margin-left:-1px;
  background:var(--ink-strong);box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none;}
.handle{position:absolute;top:50%;left:var(--pos,50%);transform:translate(-50%,-50%);
  width:44px;height:44px;border-radius:50%;background:var(--ink-strong);color:var(--ground);
  display:grid;place-items:center;font-size:15px;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none;}
.range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;}
.range:focus-visible{outline:none}
.range:focus-visible ~ .handle{outline:3px solid var(--pos);outline-offset:3px;}
.tag{position:absolute;top:12px;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;padding:5px 10px;border-radius:6px;background:rgba(6,10,20,.72);
  color:#fff;backdrop-filter:blur(3px);pointer-events:none;}
.tag.l{left:12px;} .tag.r{right:12px;}
.tag.r{color:var(--pos);}
.hint{text-align:center;color:var(--muted);font-size:13px;margin:12px 0 0;}

/* ── 参考与差异网格 ── */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
@media (max-width:720px){.grid2{grid-template-columns:1fr;}}
figure{margin:0;border:1px solid var(--hair);border-radius:12px;overflow:hidden;background:var(--panel-2);box-shadow:var(--shadow);}
figure img{display:block;width:100%;aspect-ratio:2/1;object-fit:cover;}
figcaption{padding:11px 14px;font-size:13px;color:var(--muted);border-top:1px solid var(--hair);}
figcaption b{color:var(--ink);font-weight:600;}

/* ── 指标 ── */
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
@media (max-width:860px){.metrics{grid-template-columns:repeat(2,1fr);}}
@media (max-width:460px){.metrics{grid-template-columns:1fr;}}
.metric{border:1px solid var(--hair);border-radius:12px;padding:18px 18px 16px;background:var(--panel);
  display:flex;flex-direction:column;gap:6px;box-shadow:var(--shadow);}
.metric .name{font-size:13px;color:var(--muted);letter-spacing:.02em;}
.metric .nums{display:flex;align-items:baseline;gap:8px;}
.metric .before{color:var(--muted);font-size:16px;}
.metric .arrow{color:var(--muted);font-size:13px;}
.metric .after{color:var(--ink-strong);font-size:27px;font-weight:750;}
.metric .delta{align-self:flex-start;margin-top:2px;font-size:12px;font-weight:600;color:var(--pos);
  background:color-mix(in oklab,var(--pos) 15%,transparent);padding:3px 8px;border-radius:20px;letter-spacing:.02em;}
.metric .note{font-size:12px;color:var(--muted);line-height:1.4;margin-top:2px;}

/* ── 单类柱状条 ── */
.bars{display:flex;flex-direction:column;gap:2px;border:1px solid var(--hair);border-radius:12px;
  overflow:hidden;box-shadow:var(--shadow);}
.bar{display:grid;grid-template-columns:150px 1fr 132px;align-items:center;gap:16px;
  padding:14px 18px;background:var(--panel);}
.bar:nth-child(even){background:var(--panel-2);}
@media (max-width:640px){.bar{grid-template-columns:1fr;gap:8px;}}
.bar .code{font-weight:700;color:var(--ink-strong);}
.bar .code small{display:block;font-weight:400;color:var(--muted);font-size:12px;letter-spacing:0;}
.track{position:relative;height:10px;border-radius:6px;background:color-mix(in oklab,var(--muted) 22%,transparent);overflow:hidden;}
.track .fill-before{position:absolute;top:0;left:0;height:100%;background:color-mix(in oklab,var(--amber) 55%,transparent);}
.track .fill-after{position:absolute;top:0;left:0;height:100%;background:var(--pos);opacity:.92;}
.bar .val{text-align:right;font-size:13px;color:var(--muted);}
.bar .val b{color:var(--pos);}
.bar .desc{grid-column:1/-1;font-size:12px;color:var(--muted);margin-top:-2px;}
@media (max-width:640px){.bar .val{text-align:left;}}
.legend-row{display:flex;gap:20px;margin:0 0 16px;font-size:12px;color:var(--muted);flex-wrap:wrap;}
.legend-row span{display:inline-flex;align-items:center;gap:7px;}
.sw{width:12px;height:12px;border-radius:3px;display:inline-block;}

/* ── 改动 ── */
.changes{display:grid;gap:14px;}
.change{border:1px solid var(--hair);border-left:2px solid var(--pos);border-radius:10px;
  padding:18px 20px;background:var(--panel);box-shadow:var(--shadow);}
.change h3{margin:0 0 4px;font-size:16px;color:var(--ink-strong);display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
.change h3 .file{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted);background:var(--panel-2);
  padding:2px 8px;border-radius:5px;border:1px solid var(--hair);letter-spacing:0;}
.change p{margin:0;font-size:14px;color:var(--ink);}

footer{margin-top:64px;padding-top:24px;border-top:1px solid var(--hair);color:var(--muted);font-size:13px;}
footer code{font-family:ui-monospace,monospace;background:var(--panel);padding:2px 7px;border-radius:5px;border:1px solid var(--hair);color:var(--ink);}
footer p{margin:0 0 8px;}

@media (prefers-reduced-motion:no-preference){
  .metric,.change{transition:transform .15s ease;}
}
`;

const html = `<div class="wrap">
  <header>
    <p class="eyebrow">World Orogen · 气候校准</p>
    <h1>让程序化行星更像地球</h1>
    <p class="dek">气候引擎现在以真实世界作为答案键：在导入的地球高度图上模拟气候，把生成的柯本气候区与观测到的 Köppen-Geiger 地图评分对比；经过约 90 个参数和 3 个模型改动的调校后，精确气候区匹配率从 <b>27.4%</b> 提升到 <b>36.4%</b>。</p>
  </header>

  <section>
    <p class="label">模拟柯本气候区 · 拖动对比</p>
    <h2>调参前后对比</h2>
    <p class="sub">两张地图都来自 World Orogen 对地球地形的气候模拟，唯一差异是参数集。拖动分割线即可看到沙漠、针叶林带和雨林核心区的变化最明显。</p>
    <div class="compare" id="cmp">
      <img class="bottom" src="${beforeSim}" alt="使用原始参数模拟的柯本气候区">
      <img class="top" src="${afterSim}" alt="使用调校参数模拟的柯本气候区">
      <span class="tag l">调参前</span>
      <span class="tag r">调参后</span>
      <div class="divider"></div>
      <div class="handle" aria-hidden="true">⇆</div>
      <input class="range" type="range" min="0" max="100" value="50" step="0.1"
             aria-label="显示调参前或调参后的模拟结果" id="cmpRange">
    </div>
    <p class="hint">分割线左侧：原始默认值 · 右侧：调校后的默认值</p>
  </section>

  <section>
    <p class="label">目标 · “正确答案”的样子</p>
    <h2>对照真实地球评分</h2>
    <p class="sub">参考答案是真实地球的 Köppen-Geiger 分类（Kottek 等，1976–2000 年观测）。一致性地图会对每个参与评分的陆地单元格进行分级。</p>
    <div class="grid2">
      <figure>
        <img src="${truth}" alt="真实地球 Köppen-Geiger 分类">
        <figcaption><b>真实答案</b> — 观测得到的 Köppen-Geiger，作为答案键</figcaption>
      </figure>
      <figure>
        <img src="${afterDiff}" alt="调参后的一致性地图">
        <figcaption><b>一致性（调参后）</b> — <span style="color:var(--pos)">绿色</span> 精确 · <span style="color:var(--amber)">琥珀色</span> 大类正确 · <span style="color:#d24">红色</span> 未命中</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <p class="label">数字 · 160K 单元网格，双方都认为是陆地的区域</p>
    <h2>所有指标均有提升</h2>
    <div class="metrics">
      ${metrics.map(([n, b, a, d, note]) => `
      <div class="metric">
        <div class="name">${n}</div>
        <div class="nums mono"><span class="before">${b}</span><span class="arrow">→</span><span class="after">${a}</span></div>
        <div class="delta mono">${d}</div>
        <div class="note">${note}</div>
      </div>`).join('')}
    </div>
  </section>

  <section>
    <p class="label">各气候类型准确率 · F1 分数</p>
    <h2>提升落在哪里</h2>
    <div class="legend-row">
      <span><i class="sw" style="background:color-mix(in oklab,var(--amber) 55%,transparent)"></i> 调参前</span>
      <span><i class="sw" style="background:var(--pos)"></i> 调参后</span>
      <span>F1 结合精确率与召回率（1.0 = 完美）</span>
    </div>
    <div class="bars">
      ${classes.map(([code, name, b, a, desc]) => `
      <div class="bar">
        <div class="code">${code}<small>${name}</small></div>
        <div class="track">
          <div class="fill-before" style="width:${(b * 100).toFixed(0)}%"></div>
          <div class="fill-after" style="width:${(a * 100).toFixed(0)}%"></div>
        </div>
        <div class="val mono">${b.toFixed(2)} → <b>${a.toFixed(2)}</b></div>
        <div class="desc">${desc}</div>
      </div>`).join('')}
    </div>
  </section>

  <section>
    <p class="label">不只是旋钮</p>
    <h2>基准测试推动的三个模型改动</h2>
    <p class="sub">单纯调参会遇到平台期；这些是混淆矩阵指出的结构性修正。每个改动都挂在参数后面，并且默认值严格中性，因此只有优化器需要时才会产生影响。</p>
    <div class="changes">
      ${changes.map(([t, file, body]) => `
      <div class="change">
        <h3>${t} <span class="file">${file}</span></h3>
        <p>${body}</p>
      </div>`).join('')}
    </div>
  </section>

  <footer>
    <p>由 <code>tuning/climate/evaluate.mjs</code> 以 160,000 单元分辨率渲染。评分只统计模拟与真实陆地掩膜一致的陆地单元（占模拟陆地的 96.6%）。</p>
    <p>复现：<code>node tuning/climate/optimize.mjs</code> → <code>apply-params.mjs</code>。仍待解决：地中海型（Csa）和季风子类型得分接近零，季节性降水反转还不够强，分类器暂时捕捉不到。</p>
  </footer>
</div>

<script>
(function(){
  var cmp=document.getElementById('cmp'), range=document.getElementById('cmpRange');
  function set(v){ cmp.style.setProperty('--pos', v+'%'); }
  range.addEventListener('input', function(){ set(range.value); });
  set(range.value);
})();
</script>`;

fs.writeFileSync(OUT, `<style>${css}</style>\n${html}`);
console.log('已写入 ' + OUT + '（' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB）');
