import { renderPrintEffect } from "../image-pipeline";
import type { RenderInput, RenderMetadata } from "../image-pipeline";

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

export type WorkerRenderOutput = {
  bitmap: ImageBitmap;
  metadata: RenderMetadata;
  threaded: boolean;
};

let nextRenderId = 0;

function abortError() {
  return new DOMException("渲染已取消", "AbortError");
}

function isWorkerAvailable() {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
}

async function renderOnMainThread(input: RenderInput): Promise<WorkerRenderOutput> {
  const output = await renderPrintEffect(input);
  const bitmap = await createImageBitmap(output.canvas);

  return {
    bitmap,
    metadata: output.metadata,
    threaded: false,
  };
}

export async function renderPrintEffectInWorker(input: RenderInput, signal?: AbortSignal): Promise<WorkerRenderOutput> {
  if (signal?.aborted) {
    throw abortError();
  }

  if (!isWorkerAvailable()) {
    return renderOnMainThread(input);
  }

  let sourceBitmap: ImageBitmap;
  try {
    sourceBitmap = await createImageBitmap(input.image as ImageBitmapSource);
  } catch {
    return renderOnMainThread(input);
  }

  if (signal?.aborted) {
    sourceBitmap.close();
    throw abortError();
  }

  const id = (nextRenderId += 1);
  const worker = new Worker(new URL("./render-worker.ts", import.meta.url), { type: "module" });

  return new Promise<WorkerRenderOutput>((resolve, reject) => {
    let settled = false;
    let sourceTransferred = false;

    function cleanup() {
      worker.terminate();
      signal?.removeEventListener("abort", handleAbort);
    }

    function settle(resolveOrReject: () => void) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolveOrReject();
    }

    function handleAbort() {
      if (!sourceTransferred) {
        sourceBitmap.close();
      }
      settle(() => reject(abortError()));
    }

    worker.addEventListener("message", (event: MessageEvent<RenderWorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) {
        return;
      }

      if (!message.ok) {
        settle(() => reject(new Error(message.error)));
        return;
      }

      settle(() =>
        resolve({
          bitmap: message.bitmap,
          metadata: message.metadata,
          threaded: true,
        }),
      );
    });

    worker.addEventListener("error", (event) => {
      settle(() => reject(new Error(event.message || "Worker 渲染失败")));
    });

    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage(
      {
        id,
        image: sourceBitmap,
        mode: input.mode,
        preset: input.preset,
        size: input.size,
      },
      [sourceBitmap],
    );
    sourceTransferred = true;
  });
}
