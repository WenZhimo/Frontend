import test from "node:test";
import assert from "node:assert/strict";
import { makeExactBackgroundPlan, synthesizeExactBackgroundChannels } from "../src/background-audio.js";

test("background plan keeps the outro cue at the exact requested second", () => {
  const plan = makeExactBackgroundPlan(66.1, 50.3075);
  assert.equal(plan.targetSeconds, 67);
  assert.equal(plan.introDuration, 4);
  assert.equal(plan.loopDuration, 25);
  assert.equal(plan.outroStart, 40);
  assert.ok(Math.abs(plan.totalDuration - 77.3075) < 0.00001);
});

test("background synthesis loops noise beyond 40 seconds and preserves exact length", () => {
  const sampleRate = 100;
  const sourceLength = 5031;
  const source = new Float32Array(sourceLength);
  for (let index = 0; index < source.length; index += 1) source[index] = (index % 997) / 997;
  const result = synthesizeExactBackgroundChannels([source], sampleRate, 67);
  assert.equal(result.plan.targetSeconds, 67);
  assert.equal(result.channels[0].length, Math.ceil(result.plan.totalDuration * sampleRate));
  assert.deepEqual(Array.from(result.channels[0].slice(0, 400)), Array.from(source.slice(0, 400)));
  assert.ok(result.channels[0][5500] !== 0);
  assert.ok(result.channels[0][6704] !== 0);
  assert.ok(Array.from(result.channels[0]).every(Number.isFinite));
});

test("minimum four-second background transitions directly from intro to outro", () => {
  const plan = makeExactBackgroundPlan(1.2, 50.3075);
  assert.equal(plan.targetSeconds, 4);
  assert.ok(Math.abs(plan.totalDuration - 14.3075) < 0.00001);
});
