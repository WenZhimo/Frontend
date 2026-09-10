import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as controls from "../src/cassie-controls.js";
import * as inlineEffects from "../src/tts-inline-effects.js";
import * as backgroundAudio from "../src/background-audio.js";

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
    .replace(/^import[^\n]+\r?\n/gm, "")
    .replace("import.meta.url", '"http://localhost/app.js"');
  const context = vm.createContext({ document, URL, ...controls, ...inlineEffects, ...backgroundAudio });
  vm.runInContext(`${source}\nthis.api = {state, els, ttsAnnouncementTemplates, buildTtsTemplateText, applyTextToSentence, buildTtsUnits, makeTtsRenderItem, prepareControlRenderItem, renderTtsPostProcessedBuffer};`, context);
  const api = context.api;
  api.state.clips = JSON.parse(readFileSync(new URL("../assets/audio/manifest.json", import.meta.url), "utf8")).clips;
  return { ...api, context };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("original matching keeps SCP digits and phrase boundaries around wrapped commands", () => {
  const app = loadApp();
  app.els.textInput.value = "SCP-173 #{$SLEEP_500} has entered the facility #{$G_1,G_2,G_3}";
  app.applyTextToSentence();
  assert.ok(!app.els.missingTokens.textContent.includes("未匹配"));
  assert.deepEqual(Array.from(app.state.selected.slice(0, 4), (item) => item.clip.name.toLowerCase()), ["scp", "1", "7", "3"]);
  assert.equal(app.state.selected[4].control.durationMs, 500);
  assert.deepEqual(plain(app.state.selected.at(-1).control.clipNames), ["g1", "g2", "g3"]);

  app.els.textInput.value = "detonation #{$SLEEP_500} sequence cancelled";
  app.applyTextToSentence();
  assert.ok(!app.state.selected.some((item) => /detonation sequence cancelled/i.test(item.clip?.name)));
});

test("invalid wrapped commands clear stale original queue while legacy syntax is not parsed", () => {
  const app = loadApp();
  app.els.textInput.value = "attention all personnel";
  app.applyTextToSentence();
  assert.ok(app.state.selected.length > 0);
  app.els.textInput.value = "attention #{$SLEEP_invalid} personnel";
  app.applyTextToSentence();
  assert.equal(app.state.selected.length, 0);
  assert.ok(app.els.missingTokens.textContent.includes("指令"));
  assert.equal(app.els.status.dataset.tone, "error");

  app.els.textInput.value = "attention $SLEEP_500 personnel";
  app.applyTextToSentence();
  assert.ok(!app.state.selected.some((item) => item.control));
});

test("comments disappear before original matching and TTS segmentation", () => {
  const app = loadApp();
  app.els.textInput.value = "attention #{#editor note} all personnel";
  app.applyTextToSentence();
  assert.ok(!app.els.missingTokens.textContent.includes("未匹配"));
  assert.ok(!app.state.selected.some((item) => item.control));

  app.els.ttsGenerationMode.value = "normal";
  const { units } = app.buildTtsUnits("Danger, #{#discard G_1} light containment zone.");
  assert.ok(units.every((unit) => !/discard|G_1|#\{/.test(unit.text)));
  assert.equal(units.flatMap((unit) => [...unit.controlsBefore || [], ...unit.controlsAfter || []]).length, 0);
});

test("command syntax demo template exercises every explicit effect without changing spoken text", () => {
  const app = loadApp();
  app.els.ttsGenerationMode.value = "normal";
  const template = app.ttsAnnouncementTemplates.find((item) => item.id === "tts-command-syntax-demo");
  assert.ok(template);
  const templateText = app.buildTtsTemplateText(template, {});
  for (const syntax of ["#{$SLEEP_500}", "#{containm--ent}", "#{brea-a-a-a-ch}", "#{det_detected}", "#{$G_1,G_2,G_3,G_4,G_5,G_6}", "#{#停顿："]) {
    assert.ok(templateText.includes(syntax), syntax);
  }
  assert.ok(templateText.includes("3 个额外 a，因此卡顿 3 次"));
  assert.ok(templateText.includes("可用 G_1、G_2、G_3、G_4、G_5、G_6"));

  const { units } = app.buildTtsUnits(templateText);
  const controls = units.flatMap((unit) => [...unit.controlsBefore || [], ...unit.controlsAfter || []]);
  const effects = units.flatMap((unit) => unit.inlineEffects || []);
  const spokenText = units.map((unit) => unit.text).join(" ");
  assert.deepEqual(plain(controls.map((control) => control.type)), ["sleep", "glitch-overlay"]);
  assert.deepEqual(plain(effects.map((effect) => effect.type)), ["hold", "stutter", "restart"]);
  assert.ok(!/[#{}]|停顿|拖音|卡顿|复读|故障音/.test(spokenText));
  assert.ok(spokenText.includes("Attention all personnel."));
  assert.ok(spokenText.includes("A containment breach has been detected."));
  assert.ok(spokenText.includes("Security systems are now operating under emergency protocols."));
});

for (const mode of ["normal", "fragment"]) {
  test(`${mode} TTS removes wrapped commands before inference and preserves metadata`, () => {
    const app = loadApp();
    app.els.ttsGenerationMode.value = mode;
    const { units } = app.buildTtsUnits("#{$SLEEP_500} Danger, Light containment zone. #{$G_1,G_2,G_3} SCP-173 has entered. #{$SLEEP_200}");
    assert.ok(units.length > 3);
    assert.ok(units.every((unit) => !/#\{|SLEEP|G_1/.test(unit.text)));
    assert.equal(units[0].controlsBefore[0].type, "sleep");
    assert.equal(units[0].minGapAfterMs, 180);
    assert.ok(units.some((unit) => unit.text === "1 7 3"));
    assert.equal(units.flatMap((unit) => [...unit.controlsBefore || [], ...unit.controlsAfter || []]).length, 3);
    assert.equal(units.flatMap((unit) => [...unit.controlsBefore || [], ...unit.controlsAfter || []])[1].type, "glitch-overlay");
    assert.equal(units.at(-1).controlsAfter[0].durationMs, 200);
  });
}

for (const mode of ["normal", "fragment"]) {
  test(`${mode} TTS sends clean words to Kokoro and retains explicit inline effects`, () => {
    const app = loadApp();
    app.els.ttsGenerationMode.value = mode;
    const { units } = app.buildTtsUnits("A #{containm--ent} #{brea-a-a-a-ch} has been #{det_detected}.");
    const generatedText = units.map((unit) => unit.text).join(" ");
    assert.equal(generatedText.includes("#{"), false);
    assert.equal(generatedText.includes("--"), false);
    assert.equal(generatedText.includes("_"), false);
    assert.equal(units.reduce((sum, unit) => sum + (unit.inlineEffects?.length || 0), 0), 3);
  });
}

test("app loads every requested glitch clip and keeps it as an overlay control", async () => {
  const app = loadApp();
  vm.runInContext("decodeClip = async (clip) => ({ name: clip.name, duration: 0.1, numberOfChannels: 1 });", app.context);
  const glitch = controls.parseCassieControlCommands("#{$G_1,G_2,G_3,G_4,G_5,G_6}")[0].controlsBefore[0];
  const item = await app.prepareControlRenderItem(glitch);
  assert.equal(item.control.type, "glitch-overlay");
  assert.deepEqual(Array.from(item.buffers, (buffer) => buffer.name.toLowerCase()), ["g1", "g2", "g3", "g4", "g5", "g6"]);
});

test("TTS renderer keeps ordering between speech, pauses, and glitch overlays", async () => {
  const app = loadApp();
  const speech = { duration: 1, numberOfChannels: 1 };
  vm.runInContext("renderSpeechTimeline = async (items, options, mode, playbackRate) => ({ items, mode, playbackRate }); decodeClip = async (clip) => ({ name: clip.name, duration: 0.1 });", app.context);
  const sleep = controls.parseCassieControlCommands("#{$SLEEP_500}")[0].controlsBefore[0];
  const glitch = controls.parseCassieControlCommands("#{$G_1,G_2}")[0].controlsBefore[0];
  const items = [
    app.makeTtsRenderItem(speech, { controlsBefore: [sleep] }),
    app.makeTtsRenderItem(speech, { controlsAfter: [glitch] }),
  ];
  const result = await app.renderTtsPostProcessedBuffer(items, { pitchSemitones: 12 });
  assert.deepEqual(Array.from(result.items, (item) => item.control?.type || "speech"), ["sleep", "speech", "speech", "glitch-overlay"]);
  assert.equal(result.items.at(-1).buffers.length, 2);
  assert.equal(result.mode, "tts");
  assert.equal(result.playbackRate, 2);
});

test("worker returns effects and wrapped-command metadata while generating only spoken text", async () => {
  const calls = [], messages = [];
  const context = vm.createContext({
    self: { postMessage: (message) => messages.push(message) },
    generate: async (text, options) => { calls.push({ text, options }); return { samples: new Float32Array(240), sampleRate: 24000 }; },
  });
  vm.runInContext(readFileSync(new URL("../src/tts-worker.js", import.meta.url), "utf8"), context);
  vm.runInContext('state.currentJobId = 1; state.tts = { generate }; ensureLoaded = async () => ({backend:"wasm",dtype:"q8"}); this.generateJob = handleGenerate;', context);
  const before = controls.parseCassieControlCommands("#{$SLEEP_500}")[0].controlsBefore;
  const after = controls.parseCassieControlCommands("#{$G_1,G_2}")[0].controlsBefore;
  const inline = [{ type: "hold", anchorRatio: 0.5, durationMs: 440 }];
  await context.generateJob(1, { mode: "normal", voice: "am_michael", speed: 1.2, units: [{ text: "Attention.", controlsBefore: before, controlsAfter: after, inlineEffects: inline }] });
  assert.equal(calls[0].text, "Attention.");
  assert.equal(calls[0].options.speed, 1.2);
  const done = messages.find((message) => message.type === "done");
  assert.ok(done);
  assert.deepEqual(plain(done.parts[0].controlsBefore), before);
  assert.deepEqual(plain(done.parts[0].controlsAfter), after);
  assert.deepEqual(plain(done.parts[0].inlineEffects), inline);
  assert.ok(done.parts[0].wav.byteLength > 44);
});
