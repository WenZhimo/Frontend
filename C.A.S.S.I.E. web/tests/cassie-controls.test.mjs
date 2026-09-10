import test from "node:test";
import assert from "node:assert/strict";
import { parseCassieControlCommands as parse, buildCassieTimeline as plan, scheduleCassieTimeline } from "../src/cassie-controls.js";

const options = { voiceDelayMs: 0, gapMs: 0, overlapMs: 0, playbackRate: 1 };
const control = (text) => parse(text).flatMap((segment) => segment.controlsBefore)[0];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

function buffer(seconds = 1) {
  const sampleRate = 1000;
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  samples.fill(0.2);
  return { duration: seconds, sampleRate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples };
}

test("only wrapped dollar commands are removed from spoken text", () => {
  const source = "Danger, #{$SLEEP_500} 3 generators. $SLEEP_250 .g1 jam_0.1_3 #{brea-a-a-a-ch}";
  const segments = parse(source);
  assert.equal(segments[0].text, "Danger, ");
  assert.equal(segments[0].controlsBefore.length, 0);
  assert.equal(segments[1].controlsBefore[0].durationMs, 500);
  assert.equal(segments[1].text.trim(), "3 generators. $SLEEP_250 .g1 jam_0.1_3 #{brea-a-a-a-ch}");
});

test("leading, consecutive and trailing wrapped commands retain order", () => {
  const segments = parse("#{$SLEEP_100} #{$G_1,G_2,G_3} Danger #{$SLEEP_200}");
  assert.deepEqual(segments[0].controlsBefore.map((item) => item.type), ["sleep", "glitch-overlay"]);
  assert.deepEqual(segments[0].controlsBefore[1].clipNames, ["g1", "g2", "g3"]);
  assert.equal(segments[0].text.trim(), "Danger");
  assert.equal(segments[1].text, "");
  assert.equal(segments[1].controlsBefore[0].durationMs, 200);
});

test("comments are discarded without splitting the surrounding spoken segment", () => {
  const segments = parse("detonation #{#仅供编辑者阅读 $SLEEP_500} sequence cancelled");
  assert.deepEqual(segments, [{ text: "detonation  sequence cancelled", controlsBefore: [] }]);
});

test("malformed wrapped commands fail explicitly while bare legacy syntax remains text", () => {
  for (const text of [
    "#{$SLEEP_bad}",
    "#{$SLEEP_-1}",
    "#{$SLEEP_10001}",
    "#{$SLEEP}",
    "#{$UNKNOWN_3}",
    "#{$G_0}",
    "#{$G_1,G_7}",
    "#{$SLEEP_500",
    "#{#unfinished comment",
  ]) {
    assert.throws(() => parse(text), Error, text);
  }
  const bare = "$STUTT_3 $STUTTER_0.2_0.1_3 $REPEAT_2 $NOISE_300 $JAM_100_2 .g1 g2 $SLEEP_500";
  assert.deepEqual(parse(bare), [{ text: bare, controlsBefore: [] }]);
});

test("pause duration stays on wall clock at different speech rates", () => {
  const speech = buffer();
  const timeline = plan([
    { control: control("#{$SLEEP_500}") },
    { buffer: speech },
    { control: control("#{$SLEEP_200}") },
    { buffer: speech },
    { control: control("#{$SLEEP_500}") },
  ], { ...options, voiceDelayMs: 3000, playbackRate: 2 });
  near(timeline.events[0].at, 3.5);
  near(timeline.events[1].at, 4.2);
  near(timeline.duration, 5.2);
});

test("explicit pauses replace default gaps while preserving punctuation minima", () => {
  const speech = buffer();
  const items = [{ buffer: speech, minGapAfterMs: 280 }, { control: control("#{$SLEEP_50}") }, { buffer: speech }];
  near(plan(items, { ...options, gapMs: 80 }).duration, 2.28);
  items[1].control = control("#{$SLEEP_500}");
  near(plan(items, { ...options, gapMs: 80 }).duration, 2.5);
});

test("glitch sequence overlays the next speech without advancing its layout", () => {
  const first = buffer(1);
  const second = buffer(1);
  const g1 = buffer(0.1);
  const g2 = buffer(0.2);
  const glitch = control("#{$G_1,G_2}");
  const timeline = plan([
    { buffer: first },
    { control: glitch, buffers: [g1, g2] },
    { buffer: second },
  ], { ...options, gapMs: 200 });

  near(timeline.events[1].at, 1.2);
  near(timeline.events[2].at, 1.2);
  near(timeline.events[3].at, 1.3);
  assert.deepEqual(timeline.events.slice(2).map((event) => event.overlay), [true, true]);
  near(timeline.duration, 2.2);
});

test("leading glitches start with the first speech and trailing glitches cover its end", () => {
  const speech = buffer(1);
  const g1 = buffer(0.1);
  const g2 = buffer(0.2);
  const glitch = control("#{$G_1,G_2}");

  const leading = plan([{ control: glitch, buffers: [g1, g2] }, { buffer: speech }], { ...options, voiceDelayMs: 3_000 });
  near(leading.events[0].at, 3);
  near(leading.events[1].at, 3);
  near(leading.events[2].at, 3.1);
  near(leading.duration, 4);

  const trailing = plan([{ buffer: speech }, { control: glitch, buffers: [g1, g2] }], options);
  near(trailing.events[1].at, 0.7);
  near(trailing.events[2].at, 0.8);
  near(trailing.duration, 1);
});

test("overlay errors are explicit and long overlays extend only the rendered end", () => {
  const speech = buffer(0.1);
  const longGlitch = buffer(0.4);
  const glitch = control("#{$G_1}");
  assert.throws(() => plan([{ control: glitch }], options), /缺少故障音资源/);
  assert.throws(() => plan([{ control: glitch, buffers: [longGlitch] }], options), /需要至少一个语音片段/);
  near(plan([{ buffer: speech }, { control: glitch, buffers: [longGlitch] }], options).duration, 0.4);
});

test("Web Audio scheduling preserves overlapping event times", () => {
  const sources = [];
  const context = {
    destination: {},
    createBufferSource() {
      const source = { playbackRate: {}, connect: () => context.destination, start: (...args) => { source.started = args; }, stop: (end) => { source.ended = end; } };
      sources.push(source);
      return source;
    },
  };
  const speech = buffer();
  const glitchBuffer = buffer(0.3);
  const timeline = plan([
    { control: control("#{$G_1}"), buffers: [glitchBuffer] },
    { buffer: speech },
  ], options);
  scheduleCassieTimeline(context, timeline);
  assert.equal(sources.length, 2);
  near(sources[0].started[0], 0);
  near(sources[1].started[0], 0);
  near(sources[0].ended, 1);
  near(sources[1].ended, 0.3);
});
