import { CdCaseScene } from './scene.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('stage');
const controller = { scene: null };
const ui = createUI(() => controller.scene);

try {
  controller.scene = new CdCaseScene(canvas, {
    onReady: () => {
      ui.ready();
      if (new URLSearchParams(window.location.search).has('debug')) {
        window.__CD_CASE__ = controller.scene;
      }
    },
    onError: (err) => ui.fail(err),
    onIndex: (index, disc) => ui.setActive(index, disc),
  });
} catch (err) {
  ui.fail(err);
}

window.addEventListener('pagehide', () => {
  controller.scene?.dispose();
});
