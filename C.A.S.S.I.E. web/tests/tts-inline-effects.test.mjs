import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInlineTtsEffects,
  attachInlineTtsEffects,
  applyInlineEffectsToChannels,
} from "../src/tts-inline-effects.js";

test("wrapped syntax cleans model text and distinguishes stutter, hold, and restart", () => {
  const parsed = parseInlineTtsEffects("A #{containm--ent} #{brea-a-a-a-ch} has been #{det_detected}.");
  assert.equal(parsed.text, "A containment breach has been detected.");
  assert.deepEqual(parsed.effects.map((effect) => effect.type), ["hold", "stutter", "restart"]);
  assert.equal(parsed.effects[0].durationMs, 440);
  assert.equal(parsed.effects[1].chunk, "a");
  assert.equal(parsed.effects[1].count, 3);
  assert.equal(parsed.effects[2].prefix, "det");
  assert.equal(parsed.effects[2].restart, true);
  assert.equal(parsed.effects[2].word, "detected");
});

test("unwrapped punctuation and legacy effect spellings remain ordinary text", () => {
  const source = "Nine-Tailed Fox-3 entered re-containment with containm--ent brea-a-a-a-ch det_detected.";
  assert.deepEqual(parseInlineTtsEffects(source), { text: source, effects: [] });
});

test("invalid wrapped word effects fail instead of silently changing spelling", () => {
  for (const source of ["#{ordinary}", "#{re-containment}", "#{det_other}", "#{containm-ent}"]) {
    assert.throws(() => parseInlineTtsEffects(source), /无法识别词内效果/, source);
  }
});

test("effects attach to the correct generated unit and word occurrence", () => {
  const parsed = parseInlineTtsEffects("Breach. Another #{brea-a-a-ch} was #{det_detected}.");
  const units = [{ text: "Breach." }, { text: "Another breach was detected." }];
  const attached = attachInlineTtsEffects(units, parsed.effects);
  assert.equal(attached.unmatched.length, 0);
  assert.equal(units[0].inlineEffects, undefined);
  assert.equal(units[1].inlineEffects.length, 2);
  assert.ok(units[1].inlineEffects[0].anchorRatio > 0.2);
  assert.ok(units[1].inlineEffects[1].wordEndRatio > units[1].inlineEffects[1].wordStartRatio);
});

test("audio processing inserts bounded finite samples for all effect types", () => {
  const sampleRate = 1000;
  const source = new Float32Array(sampleRate);
  for (let index = 0; index < source.length; index += 1) {
    source[index] = Math.sin(index / 8) * 0.25;
  }
  const effects = [
    { type: "hold", anchorRatio: 0.25, durationMs: 440, sliceMs: 48 },
    { type: "stutter", anchorRatio: 0.55, count: 4, sliceMs: 56, gapMs: 22, restart: false },
    { type: "restart", anchorRatio: 0.75, wordStartRatio: 0.65, wordEndRatio: 0.9, restart: true },
  ];
  const [output] = applyInlineEffectsToChannels([source], sampleRate, effects);
  assert.ok(output.length > source.length + 500);
  assert.ok(Array.from(output).every(Number.isFinite));
  assert.ok(Math.max(...output) <= 1);
  assert.ok(Math.min(...output) >= -1);
});
