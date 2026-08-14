/**
 * Generates a self-contained before/after climate-tuning report page,
 * inlining the rendered Köppen maps as data URIs (Artifact CSP blocks
 * external images). Output: tuning/climate/report.html
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

// Notable per-class F1 movers (160K regions, before → after)
const classes = [
    ['BWh', 'Hot desert', 0.198, 0.519, 'Sahara, Arabia, Outback now read as desert instead of steppe/savanna'],
    ['Dfc', 'Subarctic', 0.278, 0.438, 'Siberian & Canadian taiga belt sharpened'],
    ['BSh', 'Hot steppe', 0.090, 0.153, 'Sahel & desert fringes'],
    ['Af',  'Tropical rainforest', 0.453, 0.503, 'Amazon & Congo cores'],
    ['Csa', 'Mediterranean', 0.016, 0.024, 'Still weak — needs a targeted seasonal-reversal mechanism'],
];

const metrics = [
    ['Objective', '0.199', '0.259', '+30%', 'Combined score (½ exact + ½ macro-F1)'],
    ['Exact match', '27.4%', '36.4%', '+9.0 pts', 'Cell has the exact Köppen type (30 classes)'],
    ['Major group', '56.4%', '61.8%', '+5.4 pts', 'Right family: tropical / arid / temperate / continental / polar'],
    ['Macro F1', '0.124', '0.154', '+24%', 'Averaged across classes — rare types count equally'],
];

const changes = [
    ['Winter-heavy seasonal swing', 'temperature.js',
     'Continental interiors now cool further below the annual mean in winter than they warm above it in summer — the physical reality behind D-climate winters. This also corrected a comment that had long claimed a 40/60 split the code never applied.'],
    ['Wet/dry season contrast', 'precipitation.js',
     'A control that pushes each season away from the annual mean, restoring the seasonal precipitation signal that model-blending and normalization had been averaging flat.'],
    ['Tunable Köppen proxies', 'koppen.js',
     'The classifier estimates monthly criteria from two-season data; those estimation constants were fixed guesses. Making them tunable (e.g. the precip-to-mm scale) drove much of the second round of gains.'],
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

/* ── comparison slider ── */
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

/* ── reference + diff grid ── */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
@media (max-width:720px){.grid2{grid-template-columns:1fr;}}
figure{margin:0;border:1px solid var(--hair);border-radius:12px;overflow:hidden;background:var(--panel-2);box-shadow:var(--shadow);}
figure img{display:block;width:100%;aspect-ratio:2/1;object-fit:cover;}
figcaption{padding:11px 14px;font-size:13px;color:var(--muted);border-top:1px solid var(--hair);}
figcaption b{color:var(--ink);font-weight:600;}

/* ── metrics ── */
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

/* ── per-class bars ── */
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

/* ── changes ── */
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
    <p class="eyebrow">World Orogen · Climate Calibration</p>
    <h1>Teaching a procedural planet to look like Earth</h1>
    <p class="dek">The climate engine now runs against the real world as an answer key. Simulating climate on an imported Earth heightmap and scoring the resulting Köppen zones against the observed Köppen-Geiger map, then tuning ~90 parameters and three model changes, lifted the exact-zone match from <b>27.4%</b> to <b>36.4%</b>.</p>
  </header>

  <section>
    <p class="label">Simulated Köppen zones · drag to compare</p>
    <h2>Before &amp; after tuning</h2>
    <p class="sub">Both maps are World Orogen's own climate simulation of Earth's terrain — the only difference is the parameter set. Drag the divider; the deserts, taiga belt, and rainforest cores are where the change reads loudest.</p>
    <div class="compare" id="cmp">
      <img class="bottom" src="${beforeSim}" alt="Köppen zones simulated with the original parameters">
      <img class="top" src="${afterSim}" alt="Köppen zones simulated with the tuned parameters">
      <span class="tag l">Before</span>
      <span class="tag r">After</span>
      <div class="divider"></div>
      <div class="handle" aria-hidden="true">⇆</div>
      <input class="range" type="range" min="0" max="100" value="50" step="0.1"
             aria-label="Reveal before or after simulation" id="cmpRange">
    </div>
    <p class="hint">Left of the line: original defaults · Right: tuned defaults</p>
  </section>

  <section>
    <p class="label">The target · what &quot;correct&quot; looks like</p>
    <h2>Scored against observed Earth</h2>
    <p class="sub">The reference is the Köppen-Geiger classification of real Earth (Kottek et&nbsp;al., observed 1976–2000). The agreement map grades every scored land cell against it.</p>
    <div class="grid2">
      <figure>
        <img src="${truth}" alt="Real Earth Köppen-Geiger classification">
        <figcaption><b>Ground truth</b> — observed Köppen-Geiger, the answer key</figcaption>
      </figure>
      <figure>
        <img src="${afterDiff}" alt="Agreement map after tuning">
        <figcaption><b>Agreement (after)</b> — <span style="color:var(--pos)">green</span> exact · <span style="color:var(--amber)">amber</span> right family · <span style="color:#d24">red</span> miss</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <p class="label">The numbers · 160K-cell mesh, land where both agree</p>
    <h2>Every metric moved up</h2>
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
    <p class="label">Per-climate accuracy · F1 score</p>
    <h2>Where the gains landed</h2>
    <div class="legend-row">
      <span><i class="sw" style="background:color-mix(in oklab,var(--amber) 55%,transparent)"></i> before</span>
      <span><i class="sw" style="background:var(--pos)"></i> after</span>
      <span>F1 combines precision &amp; recall (1.0 = perfect)</span>
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
    <p class="label">Beyond the knobs</p>
    <h2>Three model changes the benchmark motivated</h2>
    <p class="sub">Tuning plateaus; these are structural fixes the confusion matrix pointed to. Each ships behind a parameter and is exactly neutral at its default, so nothing changed until the optimizer asked for it.</p>
    <div class="changes">
      ${changes.map(([t, file, body]) => `
      <div class="change">
        <h3>${t} <span class="file">${file}</span></h3>
        <p>${body}</p>
      </div>`).join('')}
    </div>
  </section>

  <footer>
    <p>Rendered by <code>tuning/climate/evaluate.mjs</code> at a 160,000-cell resolution. Scoring counts only land cells where the simulated and real land masks agree (96.6% of simulated land).</p>
    <p>Reproduce: <code>node tuning/climate/optimize.mjs</code> → <code>apply-params.mjs</code>. Still open: Mediterranean (Csa) and monsoon subtypes score near zero — the seasonal precipitation reversal isn't yet strong enough for the classifier to catch them.</p>
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
console.log('Wrote ' + OUT + ' (' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB)');
