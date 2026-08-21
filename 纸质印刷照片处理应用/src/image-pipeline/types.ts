export type RenderMode = "preview" | "export";

export type RenderSize = {
  width: number;
  height: number;
};

export type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export type DotShape = "soft-round" | "round" | "square" | "rough";
export type SeparationMode = "expressive" | "process-cmyk";

export type InkLayer = {
  id: string;
  name: string;
  color: string;
  opacity: number;
  angle: number;
  offsetX: number;
  offsetY: number;
};

export type PaperProfile = {
  id: string;
  name: string;
  baseColor: string;
  grainAmount: number;
  fiberAmount: number;
  stainAmount: number;
};

export type HalftoneSettings = {
  enabled: boolean;
  dotShape: DotShape;
  dotSize: number;
  spacing: number;
  angle: number;
  contrast: number;
};

export type GrainSettings = {
  amount: number;
  scale: number;
  softness: number;
};

export type MisregistrationSettings = {
  amount: number;
  randomize: boolean;
};

export type ToneSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  posterizeLevels: number;
};

export type PrintPreset = {
  id: string;
  name: string;
  description: string;
  separationMode?: SeparationMode;
  intensity?: number;
  inks: InkLayer[];
  paper: PaperProfile;
  halftone: HalftoneSettings;
  grain: GrainSettings;
  misregistration: MisregistrationSettings;
  tone: ToneSettings;
};

export type RenderInput = {
  image: ImageSource;
  preset: PrintPreset;
  size: RenderSize;
  mode: RenderMode;
};

export type RenderMetadata = {
  width: number;
  height: number;
  renderMs: number;
  presetId: string;
  mode: RenderMode;
};

export type RenderOutput = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  metadata: RenderMetadata;
};

export type PrintRenderer = (input: RenderInput) => Promise<RenderOutput>;
