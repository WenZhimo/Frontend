import { renderPrintEffect } from "../image-pipeline";
import type { PrintPreset, RenderMetadata, RenderMode, RenderSize } from "../image-pipeline";

type RenderWorkerRequest = {
  id: number;
  image: ImageBitmap;
  mode: RenderMode;
  preset: PrintPreset;
  size: RenderSize;
};

type RenderWorkerResponse =
  | {
      id: number;
      ok: true;
      bitmap: ImageBitmap;
      metadata: RenderMetadata;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

const workerSelf = self as unknown as {
  addEventListener: typeof self.addEventListener;
  postMessage: (message: RenderWorkerResponse, transfer?: Transferable[]) => void;
};

workerSelf.addEventListener("message", (event: MessageEvent<RenderWorkerRequest>) => {
  void handleRender(event.data);
});

async function handleRender(message: RenderWorkerRequest) {
  try {
    const output = await renderPrintEffect({
      image: message.image,
      mode: message.mode,
      preset: message.preset,
      size: message.size,
    });
    message.image.close();

    const bitmap =
      "transferToImageBitmap" in output.canvas
        ? output.canvas.transferToImageBitmap()
        : await createImageBitmap(output.canvas);
    const response: RenderWorkerResponse = {
      id: message.id,
      ok: true,
      bitmap,
      metadata: output.metadata,
    };

    workerSelf.postMessage(response, [bitmap]);
  } catch (error) {
    message.image.close();
    const response: RenderWorkerResponse = {
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : "渲染失败",
    };
    workerSelf.postMessage(response);
  }
}
