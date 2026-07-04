import { readFileSync } from "node:fs";
import { createWorld } from "../src/sim/world.js";
import { bindControlLabels, readParams } from "../src/ui/controls.js";

const failures = [];
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

for (const id of ["topologyMode", "projectionMode", "faceSize", "faceSizeLabel"]) {
  expect(html.includes(`id="${id}"`), `index.html exposes #${id}`);
}
expect(html.includes("cubed-sphere"), "index.html exposes cubed-sphere option");
expect(html.includes("orthographic"), "index.html exposes orthographic projection option");

const elements = createMockElements({
  topologyMode: "cubed-sphere",
  projectionMode: "orthographic",
  faceSize: "24",
});

bindControlLabels(elements);
const params = readParams(elements);
const world = createWorld(params);

expect(params.topologyMode === "cubed-sphere", "readParams preserves topology selector value");
expect(params.projectionMode === "orthographic", "readParams preserves projection selector value");
expect(params.faceSize === 24, "readParams parses face-size selector value");
expect(elements.faceSizeLabel.textContent === "24", "bindControlLabels updates face-size label");
expect(world.params.topologyMode === "cubed-sphere", "createWorld normalizes cubed-sphere topology");
expect(world.params.projectionMode === "orthographic", "createWorld normalizes orthographic projection");
expect(world.params.faceSize === 24, "createWorld preserves explicit face size");
expect(world.grid.topologyKind === "cubed-sphere", "createWorld uses cubed-sphere production grid");
expect(world.grid.topologyOptions?.graphBacked === true, "cubed-sphere production grid is graph-backed");
expect(world.grid.size === 6 * 24 * 24, "cubed-sphere grid size matches face size");

const autoElements = createMockElements({
  topologyMode: "cylindrical",
  projectionMode: "equirectangular",
  faceSize: "",
});
bindControlLabels(autoElements);
const autoParams = readParams(autoElements);
const autoWorld = createWorld(autoParams);
expect(autoParams.faceSize === undefined, "blank face-size selector remains automatic");
expect(autoElements.faceSizeLabel.textContent === "自动", "blank face-size selector labels automatic mode");
expect(autoWorld.params.topologyMode === "cylindrical", "default UI topology remains cylindrical");
expect(autoWorld.grid.topologyKind !== "cubed-sphere", "default UI path keeps legacy cylindrical grid");

const result = {
  valid: failures.length === 0,
  failures,
  controlsPresent: {
    topologyMode: html.includes('id="topologyMode"'),
    projectionMode: html.includes('id="projectionMode"'),
    faceSize: html.includes('id="faceSize"'),
    faceSizeLabel: html.includes('id="faceSizeLabel"'),
  },
  selectedParams: {
    topologyMode: params.topologyMode,
    projectionMode: params.projectionMode,
    faceSize: params.faceSize,
  },
  selectedWorld: {
    topologyMode: world.params.topologyMode,
    projectionMode: world.params.projectionMode,
    faceSize: world.params.faceSize,
    gridKind: world.grid.kind ?? world.grid.topologyKind ?? null,
    topologyKind: world.grid.topologyKind ?? null,
    graphBacked: world.grid.topologyOptions?.graphBacked === true,
    gridSize: world.grid.size,
  },
  defaultWorld: {
    topologyMode: autoWorld.params.topologyMode,
    projectionMode: autoWorld.params.projectionMode,
    faceSize: autoWorld.params.faceSize,
    gridKind: autoWorld.grid.kind ?? autoWorld.grid.topologyKind ?? null,
    topologyKind: autoWorld.grid.topologyKind ?? autoWorld.grid.topologyOptions?.kind ?? null,
    graphBacked: autoWorld.grid.topologyOptions?.graphBacked === true,
    gridSize: autoWorld.grid.size,
  },
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);

function createMockElements(overrides = {}) {
  return {
    seedText: mockControl("龙骨海-纪元7"),
    waterLevel: mockControl("50"),
    waterLabel: mockOutput(),
    intensity: mockControl("1"),
    intensityLabel: mockOutput(),
    plateCount: mockControl("14"),
    platesLabel: mockOutput(),
    timeScale: mockControl("1000000"),
    resolution: mockControl("256x128"),
    topologyMode: mockControl(overrides.topologyMode ?? "cylindrical"),
    projectionMode: mockControl(overrides.projectionMode ?? "equirectangular"),
    faceSize: mockControl(overrides.faceSize ?? ""),
    faceSizeLabel: mockOutput(),
    showBoundaries: mockControl("on", { checked: true }),
    pipelineMode: mockControl("geology-v2"),
  };
}

function mockControl(value, options = {}) {
  return {
    value,
    checked: options.checked === true,
    listeners: [],
    addEventListener(_eventName, listener) {
      this.listeners.push(listener);
    },
  };
}

function mockOutput() {
  return {
    textContent: "",
  };
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
