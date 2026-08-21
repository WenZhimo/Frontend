import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PRESETS } from "../presets";
import { canvasToPngBlob, downloadBlob } from "../export";
import { renderPrintEffectInWorker } from "../workers/render-client";
import type { DotShape, ImageSource, PrintPreset, SeparationMode } from "../image-pipeline";

type LoadedImage = {
  source: ImageSource;
  name: string;
  width: number;
  height: number;
  notice?: string;
};

type ChannelControlValue = {
  id: string;
  name: string;
  color: string;
  opacity: number;
  angle: number;
  offsetX: number;
  offsetY: number;
};

type ControlValues = {
  separationMode: SeparationMode;
  intensity: number;
  paperColor: string;
  paperGrain: number;
  paperFiber: number;
  paperStain: number;
  halftoneEnabled: boolean;
  dotShape: DotShape;
  dotSize: number;
  spacing: number;
  angle: number;
  halftoneContrast: number;
  grain: number;
  grainScale: number;
  grainSoftness: number;
  misregistration: number;
  misregistrationRandomize: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  posterizeLevels: number;
  channels: ChannelControlValue[];
};

type PreviewMode = "processed" | "original" | "compare";

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
};

type ColorControlProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

type TextControlProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

type SelectControlProps<Value extends string> = {
  label: string;
  options: Array<{ label: string; value: Value }>;
  value: Value;
  onChange: (value: Value) => void;
};

type ToggleControlProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

const MAX_PREVIEW_EDGE = 1200;
const MAX_EXPORT_EDGE = 2400;
const PREVIEW_MODES: Array<{ id: PreviewMode; label: string }> = [
  { id: "processed", label: "处理后" },
  { id: "original", label: "原图" },
  { id: "compare", label: "对比" },
];
const DOT_SHAPE_OPTIONS: Array<{ label: string; value: DotShape }> = [
  { label: "柔边圆点", value: "soft-round" },
  { label: "实心圆点", value: "round" },
  { label: "方形网点", value: "square" },
  { label: "粗糙圆点", value: "rough" },
];
const SEPARATION_MODE_OPTIONS: Array<{ label: string; value: SeparationMode }> = [
  { label: "风格化分色", value: "expressive" },
  { label: "CMYK 保真", value: "process-cmyk" },
];
const CUSTOM_PRESETS_STORAGE_KEY = "paper-print-photo-custom-presets";
const MAX_CHANNELS = 8;
const CUSTOM_CHANNEL_COLORS = ["#0096b7", "#c83277", "#e7bd16", "#1f2223", "#d84a24", "#217b82", "#d8a526", "#4c6a42"];

function fitSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function controlsFromPreset(preset: PrintPreset): ControlValues {
  return {
    separationMode: preset.separationMode ?? "expressive",
    intensity: preset.intensity ?? 1,
    paperColor: preset.paper.baseColor,
    paperGrain: preset.paper.grainAmount,
    paperFiber: preset.paper.fiberAmount,
    paperStain: preset.paper.stainAmount,
    halftoneEnabled: preset.halftone.enabled,
    dotShape: preset.halftone.dotShape ?? "soft-round",
    dotSize: preset.halftone.dotSize,
    spacing: preset.halftone.spacing,
    angle: preset.halftone.angle,
    halftoneContrast: preset.halftone.contrast,
    grain: preset.grain.amount,
    grainScale: preset.grain.scale,
    grainSoftness: preset.grain.softness,
    misregistration: preset.misregistration.amount,
    misregistrationRandomize: preset.misregistration.randomize,
    brightness: preset.tone.brightness,
    contrast: preset.tone.contrast,
    saturation: preset.tone.saturation,
    posterizeLevels: preset.tone.posterizeLevels,
    channels: preset.inks.map((ink) => ({
      id: ink.id,
      name: ink.name,
      color: ink.color,
      opacity: ink.opacity,
      angle: ink.angle,
      offsetX: ink.offsetX,
      offsetY: ink.offsetY,
    })),
  };
}

function createCustomChannel(index: number): ChannelControlValue {
  return {
    id: `ink-custom-${Date.now()}-${index}`,
    name: `自定义通道 ${index}`,
    color: CUSTOM_CHANNEL_COLORS[(index - 1) % CUSTOM_CHANNEL_COLORS.length],
    opacity: 0.68,
    angle: 0,
    offsetX: 0,
    offsetY: 0,
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function clonePreset(preset: PrintPreset): PrintPreset {
  return {
    ...preset,
    inks: preset.inks.map((ink) => ({ ...ink })),
    paper: { ...preset.paper },
    halftone: { ...preset.halftone },
    grain: { ...preset.grain },
    misregistration: { ...preset.misregistration },
    tone: { ...preset.tone },
  };
}

function loadCustomPresets() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY) ?? "[]");

    return Array.isArray(parsed) ? (parsed as PrintPreset[]) : [];
  } catch {
    return [];
  }
}

function writeCustomPresets(presets: PrintPreset[]) {
  window.localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("图片读取失败")));
    reader.readAsDataURL(file);
  });
}

async function loadImageElement(file: File) {
  const imageElement = new Image();
  imageElement.decoding = "async";
  imageElement.src = await fileToDataUrl(file);
  await imageElement.decode();

  const width = imageElement.naturalWidth || imageElement.width;
  const height = imageElement.naturalHeight || imageElement.height;

  if (!width || !height) {
    throw new Error("图片读取失败");
  }

  return {
    source: imageElement,
    width,
    height,
  };
}

async function decodeImageFile(file: File): Promise<Omit<LoadedImage, "name">> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
    };
  } catch {
    return loadImageElement(file);
  }
}

function Slider({ label, value, min, max, step, suffix = "", onChange }: SliderProps) {
  return (
    <label className="control">
      <span>
        <strong>{label}</strong>
        <em>
          {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}
          {suffix}
        </em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ColorControl({ label, value, onChange }: ColorControlProps) {
  return (
    <label className="control color-control">
      <span>
        <strong>{label}</strong>
        <em>{value.toUpperCase()}</em>
      </span>
      <input type="color" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function TextControl({ label, value, onChange }: TextControlProps) {
  return (
    <label className="control text-control">
      <span>
        <strong>{label}</strong>
      </span>
      <input type="text" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function SelectControl<Value extends string>({ label, options, value, onChange }: SelectControlProps<Value>) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <label className="control select-control">
      <span>
        <strong>{label}</strong>
        <em>{selectedLabel}</em>
      </span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value as Value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleControl({ label, checked, onChange }: ToggleControlProps) {
  return (
    <label className="control toggle-control">
      <span>
        <strong>{label}</strong>
        <em>{checked ? "开启" : "关闭"}</em>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

export function App() {
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [customPresets, setCustomPresets] = useState<PrintPreset[]>(loadCustomPresets);
  const [presetId, setPresetId] = useState(DEFAULT_PRESETS[0].id);
  const [controls, setControls] = useState<ControlValues>(() => controlsFromPreset(DEFAULT_PRESETS[0]));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("processed");
  const [status, setStatus] = useState("等待导入图片");
  const [isRendering, setIsRendering] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastRenderMs, setLastRenderMs] = useState<number | null>(null);
  const renderJobRef = useRef(0);

  const allPresets = useMemo(() => [...DEFAULT_PRESETS, ...customPresets], [customPresets]);

  const basePreset = useMemo<PrintPreset>(
    () => allPresets.find((item) => item.id === presetId) ?? DEFAULT_PRESETS[0],
    [allPresets, presetId],
  );

  const workingPreset = useMemo<PrintPreset>(
    () => ({
      ...basePreset,
      separationMode: controls.separationMode,
      intensity: controls.intensity,
      paper: {
        ...basePreset.paper,
        baseColor: controls.paperColor,
        grainAmount: controls.paperGrain,
        fiberAmount: controls.paperFiber,
        stainAmount: controls.paperStain,
      },
      inks: controls.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        color: channel.color,
        opacity: Math.min(1, channel.opacity * controls.intensity),
        angle: channel.angle,
        offsetX: channel.offsetX,
        offsetY: channel.offsetY,
      })),
      halftone: {
        ...basePreset.halftone,
        enabled: controls.halftoneEnabled,
        dotShape: controls.dotShape,
        dotSize: controls.dotSize,
        spacing: controls.spacing,
        angle: controls.angle,
        contrast: controls.halftoneContrast,
      },
      grain: {
        ...basePreset.grain,
        amount: controls.grain,
        scale: controls.grainScale,
        softness: controls.grainSoftness,
      },
      misregistration: {
        ...basePreset.misregistration,
        amount: controls.misregistration,
        randomize: controls.misregistrationRandomize,
      },
      tone: {
        ...basePreset.tone,
        brightness: controls.brightness,
        contrast: controls.contrast,
        saturation: controls.saturation,
        posterizeLevels: controls.posterizeLevels,
      },
    }),
    [basePreset, controls],
  );

  function updateControl<Key extends keyof ControlValues>(key: Key, value: ControlValues[Key]) {
    setControls((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateChannel(index: number, patch: Partial<ChannelControlValue>) {
    setControls((current) => ({
      ...current,
      channels: current.channels.map((channel, channelIndex) =>
        channelIndex === index ? { ...channel, ...patch } : channel,
      ),
    }));
  }

  function handleAddChannel() {
    setControls((current) => {
      if (current.channels.length >= MAX_CHANNELS) {
        return current;
      }

      return {
        ...current,
        channels: [...current.channels, createCustomChannel(current.channels.length + 1)],
      };
    });
  }

  function handleRemoveChannel(index: number) {
    setControls((current) => {
      if (current.channels.length <= 1) {
        return current;
      }

      return {
        ...current,
        channels: current.channels.filter((_, channelIndex) => channelIndex !== index),
      };
    });
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setLastRenderMs(null);
      setStatus("请选择图片文件");
      return;
    }

    try {
      const decoded = await decodeImageFile(file);
      const previewSize = fitSize(decoded.width, decoded.height, MAX_PREVIEW_EDGE);
      const exportSize = fitSize(decoded.width, decoded.height, MAX_EXPORT_EDGE);
      const notice =
        previewSize.width !== decoded.width || previewSize.height !== decoded.height
          ? exportSize.width !== decoded.width || exportSize.height !== decoded.height
            ? "预览和导出会自动降采样"
            : "预览会自动降采样"
          : undefined;

      setImage({
        source: decoded.source,
        name: file.name,
        width: decoded.width,
        height: decoded.height,
        notice,
      });
      setLastRenderMs(null);
      setStatus(notice ? `已导入 ${file.name} · ${notice}` : `已导入 ${file.name}`);
    } catch {
      setLastRenderMs(null);
      setStatus("图片读取失败");
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  function handlePresetChange(nextPreset: PrintPreset) {
    setPresetId(nextPreset.id);
    setControls(controlsFromPreset(nextPreset));
  }

  function handleSaveCustomPreset() {
    const name = window.prompt("自定义预设名称", `${basePreset.name} 自定义`)?.trim();

    if (!name) {
      return;
    }

    const customPreset = clonePreset({
      ...workingPreset,
      id: `custom-${Date.now()}`,
      name,
      description: "自定义预设 · 保存当前所有可见参数",
      intensity: controls.intensity,
      inks: controls.channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        color: channel.color,
        opacity: channel.opacity,
        angle: channel.angle,
        offsetX: channel.offsetX,
        offsetY: channel.offsetY,
      })),
    });

    const nextCustomPresets = [...customPresets, customPreset];
    setCustomPresets(nextCustomPresets);
    writeCustomPresets(nextCustomPresets);
    setPresetId(customPreset.id);
    setControls(controlsFromPreset(customPreset));
    setLastRenderMs(null);
    setStatus(`已保存自定义预设 ${name}`);
  }

  function handleClearCustomPresets() {
    if (!window.confirm("清除全部自定义预设？")) {
      return;
    }

    setCustomPresets([]);
    writeCustomPresets([]);
    setPresetId(DEFAULT_PRESETS[0].id);
    setControls(controlsFromPreset(DEFAULT_PRESETS[0]));
    setLastRenderMs(null);
    setStatus("已清除自定义预设");
  }

  function handleReset() {
    setControls(controlsFromPreset(basePreset));
    setPreviewMode("processed");
    setLastRenderMs(null);
    setStatus(`已重置 ${basePreset.name}`);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  }

  async function handleExport() {
    if (!image) {
      setLastRenderMs(null);
      setStatus("请先导入图片");
      return;
    }

    try {
      setIsExporting(true);
      setLastRenderMs(null);
      setStatus("正在生成导出图...");
      const exportSize = fitSize(image.width, image.height, MAX_EXPORT_EDGE);
      const output = await renderPrintEffectInWorker({
        image: image.source,
        preset: workingPreset,
        size: exportSize,
        mode: "export",
      });
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = output.metadata.width;
      exportCanvas.height = output.metadata.height;
      const exportContext = exportCanvas.getContext("2d");
      if (!exportContext) {
        output.bitmap.close();
        throw new Error("无法创建导出画布");
      }
      exportContext.drawImage(output.bitmap, 0, 0);
      output.bitmap.close();
      const blob = await canvasToPngBlob(exportCanvas);
      const baseName = image.name.replace(/\.[^.]+$/, "") || "print-photo";
      downloadBlob(blob, `${baseName}-${workingPreset.id}.png`);
      setLastRenderMs(output.metadata.renderMs);
      setStatus(`PNG 已导出 · ${output.metadata.width} x ${output.metadata.height}`);
    } catch {
      setLastRenderMs(null);
      setStatus("导出失败");
    } finally {
      setIsExporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const jobId = (renderJobRef.current += 1);

    async function render() {
      const processedCanvas = processedCanvasRef.current;
      const originalCanvas = originalCanvasRef.current;
      if (!processedCanvas || !originalCanvas || !image) {
        return;
      }

      setIsRendering(true);
      const previewSize = fitSize(image.width, image.height, MAX_PREVIEW_EDGE);
      const output = await renderPrintEffectInWorker({
        image: image.source,
        preset: workingPreset,
        size: previewSize,
        mode: "preview",
      }, controller.signal);

      if (cancelled || jobId !== renderJobRef.current) {
        output.bitmap.close();
        return;
      }

      processedCanvas.width = output.metadata.width;
      processedCanvas.height = output.metadata.height;
      originalCanvas.width = output.metadata.width;
      originalCanvas.height = output.metadata.height;

      const processedContext = processedCanvas.getContext("2d");
      const originalContext = originalCanvas.getContext("2d");
      if (!processedContext || !originalContext) {
        setStatus("画布初始化失败");
        setLastRenderMs(null);
        setIsRendering(false);
        return;
      }

      originalContext.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
      originalContext.drawImage(image.source as CanvasImageSource, 0, 0, originalCanvas.width, originalCanvas.height);
      processedContext.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
      processedContext.drawImage(output.bitmap, 0, 0);
      output.bitmap.close();
      setLastRenderMs(output.metadata.renderMs);
      setStatus(image.notice ? `已应用 ${workingPreset.name} · ${image.notice}` : `已应用 ${workingPreset.name}`);
    }

    void render().catch((error: unknown) => {
      if (cancelled || isAbortError(error)) {
        return;
      }
      setIsRendering(false);
      setLastRenderMs(null);
      setStatus(error instanceof Error ? error.message : "渲染失败");
    }).finally(() => {
      if (!cancelled && jobId === renderJobRef.current) {
        setIsRendering(false);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [image, workingPreset]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>纸质印刷照片处理</h1>
          <p>上传照片，用基础色圆点分层叠印出纸张、网点和轻微错版质感。</p>
        </div>
        <div className="topbar-actions">
          <label className="button button-primary">
            导入图片
            <input type="file" accept="image/*" onChange={handleInputChange} />
          </label>
          <button className="button" type="button" disabled={isExporting} onClick={handleReset}>
            重置
          </button>
          <button className="button" type="button" disabled={isExporting} onClick={() => void handleExport()}>
            {isExporting ? "导出中..." : "导出 PNG"}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <h2>预设</h2>
          <p className="sidebar-note">预设只是可见参数的快捷起点，右侧所有字段都可以继续调整。</p>
          <button className="button sidebar-action" type="button" onClick={handleSaveCustomPreset}>
            保存当前参数
          </button>
          {customPresets.length > 0 ? (
            <button className="button sidebar-action" type="button" onClick={handleClearCustomPresets}>
              清空自定义预设
            </button>
          ) : null}
          <div className="preset-list">
            {allPresets.map((item) => (
              <button
                className={item.id === workingPreset.id ? "preset is-active" : "preset"}
                key={item.id}
                type="button"
                onClick={() => handlePresetChange(item)}
              >
                <span>{item.name}</span>
                <small>{item.description}</small>
              </button>
            ))}
          </div>
        </aside>

        <section
          className={isDragging ? "canvas-stage is-dragging" : "canvas-stage"}
          aria-label="图片预览"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {image ? (
            <div className={`preview-frame preview-mode-${previewMode}`} data-preview-mode={previewMode}>
              <div className="preview-toolbar" aria-label="预览模式">
                {PREVIEW_MODES.map((mode) => (
                  <button
                    className={mode.id === previewMode ? "preview-mode-button is-active" : "preview-mode-button"}
                    key={mode.id}
                    type="button"
                    onClick={() => setPreviewMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div className="preview-canvas-stack">
                <canvas ref={originalCanvasRef} className="original-canvas" aria-label="原图预览" />
                <div className="processed-layer" aria-hidden={previewMode === "original"}>
                  <canvas ref={processedCanvasRef} className="processed-canvas" aria-label="处理后预览" />
                </div>
                {previewMode === "compare" ? (
                  <>
                    <span className="compare-divider" aria-hidden="true" />
                    <span className="compare-label compare-label-processed">处理后</span>
                    <span className="compare-label compare-label-original">原图</span>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>拖入或导入一张照片</strong>
              <span>应用会在本地把原图分解成多层基础色网点，再叠压成印刷质感。</span>
            </div>
          )}
        </section>

        <aside className="inspector">
          <h2>参数</h2>
          <div className="control-group">
            <section className="control-section">
              <h3>基础</h3>
              <Slider
                label="网点浓度"
                min={0.35}
                max={1.35}
                step={0.05}
                value={controls.intensity}
                onChange={(value) => updateControl("intensity", value)}
              />
              <SelectControl
                label="分色模式"
                options={SEPARATION_MODE_OPTIONS}
                value={controls.separationMode}
                onChange={(value) => updateControl("separationMode", value)}
              />
              <ColorControl
                label="纸张颜色"
                value={controls.paperColor}
                onChange={(value) => updateControl("paperColor", value)}
              />
              <Slider
                label="网点大小"
                min={0.5}
                max={4}
                step={0.1}
                value={controls.dotSize}
                onChange={(value) => updateControl("dotSize", value)}
              />
            </section>

            <section className="control-section">
              <h3>半调网点</h3>
              <ToggleControl
                label="启用半调"
                checked={controls.halftoneEnabled}
                onChange={(value) => updateControl("halftoneEnabled", value)}
              />
              <SelectControl
                label="墨点形状"
                options={DOT_SHAPE_OPTIONS}
                value={controls.dotShape}
                onChange={(value) => updateControl("dotShape", value)}
              />
              <Slider
                label="网点间距"
                min={4}
                max={16}
                step={1}
                suffix="px"
                value={controls.spacing}
                onChange={(value) => updateControl("spacing", value)}
              />
              <Slider
                label="网点角度"
                min={0}
                max={90}
                step={1}
                suffix="deg"
                value={controls.angle}
                onChange={(value) => updateControl("angle", value)}
              />
              <Slider
                label="网点对比"
                min={0}
                max={1}
                step={0.05}
                value={controls.halftoneContrast}
                onChange={(value) => updateControl("halftoneContrast", value)}
              />
            </section>

            <section className="control-section">
              <h3>纸张</h3>
              <Slider
                label="纸张颗粒"
                min={0}
                max={1}
                step={0.05}
                value={controls.paperGrain}
                onChange={(value) => updateControl("paperGrain", value)}
              />
              <Slider
                label="纸张纤维"
                min={0}
                max={1}
                step={0.05}
                value={controls.paperFiber}
                onChange={(value) => updateControl("paperFiber", value)}
              />
              <Slider
                label="纸面污渍"
                min={0}
                max={0.4}
                step={0.02}
                value={controls.paperStain}
                onChange={(value) => updateControl("paperStain", value)}
              />
            </section>

            <section className="control-section">
              <h3>油墨颗粒</h3>
              <Slider
                label="纸面颗粒"
                min={0}
                max={1}
                step={0.05}
                value={controls.grain}
                onChange={(value) => updateControl("grain", value)}
              />
              <Slider
                label="颗粒缩放"
                min={0.4}
                max={2.4}
                step={0.1}
                value={controls.grainScale}
                onChange={(value) => updateControl("grainScale", value)}
              />
              <Slider
                label="颗粒柔度"
                min={0}
                max={1}
                step={0.05}
                value={controls.grainSoftness}
                onChange={(value) => updateControl("grainSoftness", value)}
              />
            </section>

            <section className="control-section">
              <h3>错版</h3>
              <Slider
                label="错版偏移"
                min={0}
                max={6}
                step={0.5}
                suffix="px"
                value={controls.misregistration}
                onChange={(value) => updateControl("misregistration", value)}
              />
              <ToggleControl
                label="随机错版"
                checked={controls.misregistrationRandomize}
                onChange={(value) => updateControl("misregistrationRandomize", value)}
              />
            </section>

            <section className="control-section">
              <h3>色调</h3>
              <Slider
                label="亮度"
                min={-0.25}
                max={0.25}
                step={0.02}
                value={controls.brightness}
                onChange={(value) => updateControl("brightness", value)}
              />
              <Slider
                label="对比压缩"
                min={-0.4}
                max={0.6}
                step={0.05}
                value={controls.contrast}
                onChange={(value) => updateControl("contrast", value)}
              />
              <Slider
                label="色彩强度"
                min={-1}
                max={1}
                step={0.05}
                value={controls.saturation}
                onChange={(value) => updateControl("saturation", value)}
              />
              <Slider
                label="色阶数量"
                min={2}
                max={256}
                step={1}
                value={controls.posterizeLevels}
                onChange={(value) => updateControl("posterizeLevels", value)}
              />
            </section>

            <section className="control-section">
              <h3>色彩通道</h3>
              <div className="channel-toolbar">
                <span>{controls.channels.length} 个通道</span>
                <button
                  className="button button-small"
                  type="button"
                  disabled={controls.channels.length >= MAX_CHANNELS}
                  onClick={handleAddChannel}
                >
                  新增通道
                </button>
              </div>
              <div className="channel-list">
                {controls.channels.map((channel, index) => (
                  <article className="channel-card" key={`${channel.id}-${index}`}>
                    <div className="channel-card-header">
                      <h4>
                        <span className="paper-swatch" style={{ background: channel.color }} aria-hidden="true" />
                        {channel.name}
                      </h4>
                      <button
                        className="button button-small"
                        type="button"
                        disabled={controls.channels.length <= 1}
                        onClick={() => handleRemoveChannel(index)}
                      >
                        移除
                      </button>
                    </div>
                    <TextControl
                      label="通道名称"
                      value={channel.name}
                      onChange={(value) => updateChannel(index, { name: value || `通道 ${index + 1}` })}
                    />
                    <ColorControl
                      label={`${channel.name} 色彩`}
                      value={channel.color}
                      onChange={(value) => updateChannel(index, { color: value })}
                    />
                    <Slider
                      label={`${channel.name} 浓度`}
                      min={0}
                      max={1}
                      step={0.05}
                      value={channel.opacity}
                      onChange={(value) => updateChannel(index, { opacity: value })}
                    />
                    <Slider
                      label={`${channel.name} 角度`}
                      min={0}
                      max={90}
                      step={1}
                      suffix="deg"
                      value={channel.angle}
                      onChange={(value) => updateChannel(index, { angle: value })}
                    />
                    <Slider
                      label={`${channel.name} X 偏移`}
                      min={-8}
                      max={8}
                      step={0.5}
                      suffix="px"
                      value={channel.offsetX}
                      onChange={(value) => updateChannel(index, { offsetX: value })}
                    />
                    <Slider
                      label={`${channel.name} Y 偏移`}
                      min={-8}
                      max={8}
                      step={0.5}
                      suffix="px"
                      value={channel.offsetY}
                      onChange={(value) => updateChannel(index, { offsetY: value })}
                    />
                  </article>
                ))}
              </div>
            </section>
          </div>

          <dl>
            <div>
              <dt>纸张</dt>
              <dd className="paper-meta">
                <span className="paper-swatch" style={{ background: workingPreset.paper.baseColor }} aria-hidden="true" />
                {workingPreset.paper.name} · {workingPreset.paper.baseColor.toUpperCase()}
              </dd>
            </div>
            <div>
              <dt>网点色彩</dt>
              <dd>
                {workingPreset.separationMode === "process-cmyk" ? "CMYK 保真分色" : "基础色分层叠印"} ·{" "}
                {workingPreset.inks.length} 层通道网点
              </dd>
            </div>
            <div>
              <dt>图片</dt>
              <dd>{image ? `${image.width} x ${image.height}` : "未导入"}</dd>
            </div>
          </dl>
          <p className="status">
            {isRendering ? "正在渲染..." : status}
            {lastRenderMs !== null ? ` · ${Math.round(lastRenderMs)}ms` : ""}
          </p>
        </aside>
      </section>
    </main>
  );
}
