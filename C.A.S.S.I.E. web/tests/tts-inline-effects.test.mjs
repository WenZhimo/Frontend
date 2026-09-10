import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInlineTtsEffects,
  attachInlineTtsEffects,
  applyInlineEffectsToChannels,
} from "../src/tts-inline-effects.js";

test("inline syntax cleans model text and distinguishes hold, repetition, and restart", () => {
  const parsed = parseInlineTtsEffects("A containm——ent brea-a-a-a-ch has been detect-t-t-t-t-detected.");
  assert.equal(parsed.text, "A containment breach has been detected.");
  assert.deepEqual(parsed.effects.map((effect) => effect.type), ["hold", "stutter", "stutter"]);
  assert.equal(parsed.effects[0].durationMs, 440);
  assert.equal(parsed.effects[1].chunk, "a");
  assert.equal(parsed.effects[1].count, 3);
  assert.equal(parsed.effects[1].restart, false);
  assert.equal(parsed.effects[2].restart, true);
  assert.equal(parsed.effects[2].count, 4);
  assert.equal(parsed.effects[2].word, "detected");
});

test("ordinary hyphenated terms are not treated as inline effects", () => {
  const source = "Nine-Tailed Fox-3 entered re-containment at Site-02.";
  assert.deepEqual(parseInlineTtsEffects(source), { text: source, effects: [] });
});

test("effects attach to the correct generated unit and word occurrence", () => {
  const parsed = parseInlineTtsEffects("Breach. Another brea-a-a-ch detected.");
  const units = [{ text: "Breach." }, { text: "Another breach detected." }];
  const attached = attachInlineTtsEffects(units, parsed.effects);
  assert.equal(attached.unmatched.length, 0);
  assert.equal(units[0].inlineEffects, undefined);
  assert.equal(units[1].inlineEffects.length, 1);
  assert.ok(units[1].inlineEffects[0].anchorRatio > 0.3);
  assert.ok(units[1].inlineEffects[0].wordEndRatio > units[1].inlineEffects[0].wordStartRatio);
});

test("audio processing inserts bounded finite samples", () => {
  const sampleRate = 1000;
  const source = new Float32Array(sampleRate);
  for (let index = 0; index < source.length; index += 1) {
    source[index] = Math.sin(index / 8) * 0.25;
  }
  const effects = [
    { type: "hold", anchorRatio: 0.35, durationMs: 440, sliceMs: 48 },
    { type: "stutter", anchorRatio: 0.7, count: 4, sliceMs: 56, gapMs: 22, restart: false },
  ];
  const [output] = applyInlineEffectsToChannels([source], sampleRate, effects);
  assert.ok(output.length > source.length + 650);
  assert.ok(Array.from(output).every(Number.isFinite));
  assert.ok(Math.max(...output) <= 1);
  assert.ok(Math.min(...output) >= -1);
});
