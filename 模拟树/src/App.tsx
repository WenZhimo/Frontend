import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Shuffle, Crosshair, Copy } from 'lucide-react';
import { createDefaultConfig, STAGE_PRESETS, TREE_TYPE_PRESETS, type TreeConfig, type TreeStructure, WEATHER_PRESETS } from './lib/tree';
import { TreeViewport, type TreeViewportHandle } from './components/TreeViewport';
import { clamp } from './lib/seed';

const STORAGE_KEY = 'tree-sim-config-v1';

function loadInitialConfig(): TreeConfig {
  if (typeof window === 'undefined') return createDefaultConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultConfig();
    const parsed = JSON.parse(raw) as Partial<TreeConfig>;
    const fallback = createDefaultConfig();
    return {
      seed: typeof parsed.seed === 'string' ? parsed.seed : fallback.seed,
      treeType: typeof parsed.treeType === 'string' ? (parsed.treeType as TreeConfig['treeType']) : fallback.treeType,
      stageId: typeof parsed.stageId === 'string' ? parsed.stageId : fallback.stageId,
      growth: typeof parsed.growth === 'number' ? clamp(parsed.growth, 0, 1) : fallback.growth,
      trunkThickness: typeof parsed.trunkThickness === 'number' ? clamp(parsed.trunkThickness, 0, 1) : fallback.trunkThickness,
      branchSpread: typeof parsed.branchSpread === 'number' ? clamp(parsed.branchSpread, 0, 1) : fallback.branchSpread,
      twist: typeof parsed.twist === 'number' ? clamp(parsed.twist, 0, 1) : fallback.twist,
      leafDensity: typeof parsed.leafDensity === 'number' ? clamp(parsed.leafDensity, 0, 1) : fallback.leafDensity,
      asymmetry: typeof parsed.asymmetry === 'number' ? clamp(parsed.asymmetry, 0, 1) : fallback.asymmetry,
      soil: typeof parsed.soil === 'number' ? clamp(parsed.soil, 0, 1) : fallback.soil,
      moisture: typeof parsed.moisture === 'number' ? clamp(parsed.moisture, 0, 1) : fallback.moisture,
      temperature: typeof parsed.temperature === 'number' ? clamp(parsed.temperature, 0, 1) : fallback.temperature,
      wind: typeof parsed.wind === 'number' ? clamp(parsed.wind, 0, 1) : fallback.wind,
      weather: typeof parsed.weather === 'string' ? (parsed.weather as TreeConfig['weather']) : fallback.weather,
    };
  } catch {
    return createDefaultConfig();
  }
}

function rangeValue(value: number) {
  return Math.round(value * 100);
}

function App() {
  const [config, setConfig] = useState<TreeConfig>(() => loadInitialConfig());
  const [stats, setStats] = useState<TreeStructure | null>(null);
  const viewportRef = useRef<TreeViewportHandle | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const activeStage = useMemo(
    () => STAGE_PRESETS.find((stage) => stage.id === config.stageId) ?? STAGE_PRESETS[4],
    [config.stageId]
  );
  const activeTreeType = useMemo(
    () => TREE_TYPE_PRESETS.find((treeType) => treeType.id === config.treeType) ?? TREE_TYPE_PRESETS[0],
    [config.treeType]
  );

  const update = (patch: Partial<TreeConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
  };

  const randomSeed = () => {
    const samples = ['林', '榕', '桦', '松', '槐', '桂', '枫', '雾', '霜', '潮'];
    const suffix = Math.random().toString(16).slice(2, 7);
    const prefix = samples[Math.floor(Math.random() * samples.length)];
    setConfig((current) => ({ ...current, seed: `${prefix}-${suffix}` }));
  };

  const copySeed = async () => {
    try {
      await navigator.clipboard.writeText(config.seed);
    } catch {
      // ignore clipboard fallback
    }
  };

  const resetCamera = () => viewportRef.current?.resetCamera();
  const exportPng = () => viewportRef.current?.downloadPng();

  return (
    <div className="app-shell">
      <aside className="control-rail">
        <header className="rail-header">
          <div>
            <h1>模拟树木</h1>
            <p>3D 生长编辑器</p>
          </div>
          <div className="header-actions">
            <button type="button" className="icon-button" onClick={randomSeed} aria-label="随机种子" title="随机种子">
              <Shuffle size={16} />
            </button>
            <button type="button" className="icon-button" onClick={resetCamera} aria-label="重置视角" title="重置视角">
              <Crosshair size={16} />
            </button>
            <button type="button" className="icon-button" onClick={exportPng} aria-label="导出图片" title="导出图片">
              <Download size={16} />
            </button>
          </div>
        </header>

        <div className="section-block">
          <div className="section-head">
            <h2>种子</h2>
            <button type="button" className="ghost-button" onClick={copySeed} aria-label="复制种子" title="复制种子">
              <Copy size={14} />
            </button>
          </div>
          <label className="field">
            <span>文本</span>
            <input
              type="text"
              value={config.seed}
              onChange={(event) => update({ seed: event.target.value })}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="section-block">
          <div className="section-head">
            <h2>阶段</h2>
            <span className="meter">{activeStage.label}</span>
          </div>
          <div className="segmented" role="tablist" aria-label="树木阶段">
            {STAGE_PRESETS.map((stage) => (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={config.stageId === stage.id}
                className={config.stageId === stage.id ? 'segment active' : 'segment'}
                onClick={() => update({ stageId: stage.id, growth: stage.growth })}
              >
                {stage.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>成熟度</span>
            <input type="range" min="0" max="1" step="0.001" value={config.growth} onChange={(event) => update({ growth: Number(event.target.value) })} />
          </label>
        </div>

        <div className="section-block">
          <div className="section-head">
            <h2>树型</h2>
            <span className="meter">{activeTreeType.label}</span>
          </div>
          <div className="segmented" role="tablist" aria-label="树木类型">
            {TREE_TYPE_PRESETS.map((treeType) => (
              <button
                key={treeType.id}
                type="button"
                role="tab"
                aria-selected={config.treeType === treeType.id}
                className={config.treeType === treeType.id ? 'segment active' : 'segment'}
                onClick={() => update({ treeType: treeType.id })}
              >
                {treeType.label}
              </button>
            ))}
          </div>
        </div>

        <div className="section-block">
          <div className="section-head">
            <h2>树体</h2>
            <span className="meter">{rangeValue(config.leafDensity)}%</span>
          </div>
          <label className="field">
            <span>树干</span>
            <input type="range" min="0" max="1" step="0.001" value={config.trunkThickness} onChange={(event) => update({ trunkThickness: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>枝展</span>
            <input type="range" min="0" max="1" step="0.001" value={config.branchSpread} onChange={(event) => update({ branchSpread: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>扭曲</span>
            <input type="range" min="0" max="1" step="0.001" value={config.twist} onChange={(event) => update({ twist: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>叶密</span>
            <input type="range" min="0" max="1" step="0.001" value={config.leafDensity} onChange={(event) => update({ leafDensity: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>不对称</span>
            <input type="range" min="0" max="1" step="0.001" value={config.asymmetry} onChange={(event) => update({ asymmetry: Number(event.target.value) })} />
          </label>
        </div>

        <div className="section-block">
          <div className="section-head">
            <h2>环境</h2>
            <span className="meter">{WEATHER_PRESETS.find((item) => item.id === config.weather)?.label ?? '晴'}</span>
          </div>
          <label className="field">
            <span>土壤</span>
            <input type="range" min="0" max="1" step="0.001" value={config.soil} onChange={(event) => update({ soil: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>湿度</span>
            <input type="range" min="0" max="1" step="0.001" value={config.moisture} onChange={(event) => update({ moisture: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>温度</span>
            <input type="range" min="0" max="1" step="0.001" value={config.temperature} onChange={(event) => update({ temperature: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>风</span>
            <input type="range" min="0" max="1" step="0.001" value={config.wind} onChange={(event) => update({ wind: Number(event.target.value) })} />
          </label>
          <label className="field">
            <span>天气</span>
            <select value={config.weather} onChange={(event) => update({ weather: event.target.value as TreeConfig['weather'] })}>
              {WEATHER_PRESETS.map((weather) => (
                <option key={weather.id} value={weather.id}>
                  {weather.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="section-block stats-block">
          <div className="section-head">
            <h2>统计</h2>
            <span className="meter">{stats ? `${stats.stats.segmentCount}` : '0'}</span>
          </div>
          <dl className="stats-grid">
            <div>
              <dt>枝节</dt>
              <dd>{stats?.stats.segmentCount ?? 0}</dd>
            </div>
            <div>
              <dt>叶片</dt>
              <dd>{stats?.stats.leafCount ?? 0}</dd>
            </div>
            <div>
              <dt>高度</dt>
              <dd>{stats ? `${stats.stats.height.toFixed(1)}` : '0.0'}</dd>
            </div>
            <div>
              <dt>冠幅</dt>
              <dd>{stats ? `${stats.stats.spread.toFixed(1)}` : '0.0'}</dd>
            </div>
          </dl>
        </div>
      </aside>

      <main className="stage-pane">
        <div className="stage-frame">
          <TreeViewport ref={viewportRef} config={config} onStats={setStats} />
          <div className="stage-overlay">
            <div>
              <strong>{activeStage.label}</strong>
              <span>{config.seed}</span>
            </div>
            <div>
              <strong>{stats ? `${stats.stats.height.toFixed(1)}m` : '--'}</strong>
              <span>{WEATHER_PRESETS.find((item) => item.id === config.weather)?.label ?? ''}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
