export type ExportFormat = "png";

export type ExportRequest = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  fileName: string;
  format: ExportFormat;
};

export type ExportResult = {
  blob: Blob;
  fileName: string;
  format: ExportFormat;
};
