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
      if (!world.renderBackend) world.renderBackend = backend.kind;
      if (backend.fallbackReason && !world.renderFallbackReason) {
        world.renderFallbackReason = backend.fallbackReason;
      }
    },
  };
}
