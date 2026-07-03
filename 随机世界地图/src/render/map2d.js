import { createRenderBackend } from "./renderBackend.js";

export function createMapRenderer(canvas, options = {}) {
  const backend = createRenderBackend(canvas, options);

  return {
    get kind() {
      return backend.kind;
    },
    get fallbackReason() {
      return backend.fallbackReason;
    },
    render(world) {
      backend.render(world);
      world.renderBackend = backend.kind;
      if (backend.fallbackReason) world.renderFallbackReason = backend.fallbackReason;
    },
  };
}
