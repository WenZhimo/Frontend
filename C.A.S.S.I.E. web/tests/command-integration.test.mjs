import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as controls from "../src/cassie-controls.js";

function loadApp() {
  const elements = new Map();
  const element = () => ({
    value: "", textContent: "", dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, replaceChildren() {}, appendChild() {},
    querySelector: () => element(),
  });
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    createElement: element, createDocumentFragment: element,
  };
  let source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  source = source.slice(0, source.lastIndexOf("\nrenderAnnouncementTemplates();"))
    .replace(/^import[^\n]+\n/, "")
    .replace("import.meta.url", '"http://localhost/app.js"');
  const context = vm.createContext({ document, URL, ...controls });
  vm.runInContext(`${source}\nthis.api = {state, els, applyTextToSentence, buildTtsUnits, makeTtsRenderItem, renderTtsPostProcessedBuffer};`, context);
  const api = context.api;
  api.state.clips = JSON.parse(readFileSync(new URL("../assets/audio/manifest.json", import.meta.url), "utf8")).clips;
  return { ...api, context };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("original matching keeps SCP digits and phrase boundaries around effects", () => {
  const app = loadApp();
  app.els.textInput.value = "SCP-173 $SLEEP_500 has entered the facility .g1 $REPEAT_2";
  app.applyTextToSentence();
  assert.ok(!app.els.missingTokens.textContent.includes("未匹配"));
  assert.deepEqual(Array.from(app.state.selected.slice(0, 4), (item) => item.clip.name.toLowerCase()), ["scp", "1", "7", "3"]);
  assert.equal(app.state.selected[4].control.durationMs, 500);
  assert.equal(app.state.selected.at(-2).control.clipName, "g1");
  assert.equal(app.state.selected.at(-1).control.type, "repeat");
  app.els.textInput.value = "detonation $SLEEP_500 sequence cancelled";
  app.applyTextToSentence();
  assert.ok(!app.state.selected.some((item) => /detonation sequence cancelled/i.test(item.clip?.name)));
});

test("invalid original commands clear stale queue and show the error", () => {
  const app = loadApp();
  app.els.textInput.value = "attention all personnel";
  app.applyTextToSentence();
  assert.ok(app.state.selected.length > 0);
  app.els.textInput.value = "attention $SLEEP_invalid personnel";
  app.applyTextToSentence();
  assert.equal(app.state.selected.length, 0);
  assert.ok(app.els.missingTokens.textContent.includes("指令"));
  assert.equal(app.els.status.dataset.tone, "error");
});

for (const mode of ["normal", "fragment"]) {
  test(`${mode} TTS removes commands before inference and preserves leading/trailing metadata`, () => {
    const app = loadApp();
    app.els.ttsGenerationMode.value = mode;
    const { units } = app.buildTtsUnits("$SLEEP_500 Danger, Light containment zone. $NOISE_300 SCP-173 has entered. $REPEAT_2 $SPAC_200");
    assert.ok(units.length > 3);
    assert.ok(units.every((unit) => !/\$|SLEEP|NOISE|REPEAT|SPAC/.test(unit.text)));
    assert.equal(units[0].controlsBefore[0].type, "sleep");
    assert.equal(units[0].minGapAfterMs, 180);
    assert.ok(units.some((unit) => unit.text === "1 7 3"));
    assert.deepEqual(plain(units.at(-1).controlsAfter).map((c) => c.type), ["repeat", "spac"]);
    assert.equal(units.flatMap((unit) => [...unit.controlsBefore || [], ...unit.controlsAfter || []]).length, 4);
  });
}

test("TTS renderer keeps ordering between audio buffers and controls", async () => {
  const app = loadApp();
  const speech = { duration: 1, numberOfChannels: 1 };
  vm.runInContext("renderSpeechTimeline = async (items, options, mode, playbackRate) => ({ items, mode, playbackRate });", app.context);
  const items = [
    app.makeTtsRenderItem(speech, { controlsBefore: [controls.parseCassieControlCommands("$SLEEP_500")[0].controlsBefore[0]] }),
    app.makeTtsRenderItem(speech, { controlsAfter: [controls.parseCassieControlCommands("$REPEAT_2")[0].controlsBefore[0]] }),
  ];
  const result = await app.renderTtsPostProcessedBuffer(items, { pitchSemitones: 12 });
  assert.deepEqual(Array.from(result.items, (item) => item.control?.type || "speech"), ["sleep", "speech", "speech", "repeat"]);
  assert.equal(result.mode, "tts");
  assert.equal(result.playbackRate, 2);
  await app.renderTtsPostProcessedBuffer([{ buffer: speech }], { pitchSemitones: 0 });
});

test("worker returns effects unchanged while generating only spoken text", async () => {
  const calls = [], messages = [];
  const context = vm.createContext({
    self: { postMessage: (message) => messages.push(message) },
    generate: async (text, options) => { calls.push({ text, options }); return { samples: new Float32Array(240), sampleRate: 24000 }; },
  });
  vm.runInContext(readFileSync(new URL("../src/tts-worker.js", import.meta.url), "utf8"), context);
  vm.runInContext('state.currentJobId = 1; state.tts = { generate }; ensureLoaded = async () => ({backend:"wasm",dtype:"q8"}); this.generateJob = handleGenerate;', context);
  const before = controls.parseCassieControlCommands("$SLEEP_500")[0].controlsBefore;
  const after = controls.parseCassieControlCommands("$REPEAT_2")[0].controlsBefore;
  await context.generateJob(1, { mode: "normal", voice: "am_michael", speed: 1.2, units: [{ text: "Attention.", controlsBefore: before, controlsAfter: after }] });
  assert.equal(calls[0].text, "Attention.");
  assert.equal(calls[0].options.speed, 1.2);
  const done = messages.find((message) => message.type === "done");
  assert.ok(done);
  assert.deepEqual(plain(done.parts[0].controlsBefore), before);
  assert.deepEqual(plain(done.parts[0].controlsAfter), after);
  assert.ok(done.parts[0].wav.byteLength > 44);
});
