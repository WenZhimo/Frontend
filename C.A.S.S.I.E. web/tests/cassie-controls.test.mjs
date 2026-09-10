import test from "node:test";
import assert from "node:assert/strict";
import { parseCassieControlCommands as parse, buildCassieTimeline as plan, scheduleCassieTimeline } from "../src/cassie-controls.js";

const options = { voiceDelayMs: 0, gapMs: 0, overlapMs: 0, playbackRate: 1 };
const control = (text) => parse(text).flatMap((segment) => segment.controlsBefore)[0];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
function buffer(seconds = 1, silence = 0) {
  const sampleRate = 1000;
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  samples.fill(0.2, 20, samples.length - silence * sampleRate);
  return { duration: seconds, sampleRate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples };
}

test("commands preserve following numbers, punctuation, and ordinary spoken words", () => {
  const segments = parse("Danger, $SLEEP_500 3 out of 3 generators. Repeat 2 words. sleep 5 seconds.");
  assert.equal(segments[0].text, "Danger, ");
  assert.equal(segments[1].text.trim(), "3 out of 3 generators. Repeat 2 words. sleep 5 seconds.");
  assert.equal(segments[1].controlsBefore[0].durationMs, 500);
  assert.equal(parse("$SLEEP_500.")[0].text, ".");
});

test("consecutive, leading and trailing controls retain their order", () => {
  const segments = parse("$SLEEP(500) $NOISE_300 Danger $REPEAT_2 $SPAC_200");
  assert.deepEqual(segments[0].controlsBefore.map((c) => c.type), ["sleep", "noise"]);
  assert.deepEqual(segments[1].controlsBefore.map((c) => c.type), ["repeat", "spac"]);
  assert.equal(segments[1].text, "");
});

test("game-style stutter, legacy jam and numbered glitch clips are recognized", () => {
  assert.deepEqual(control("$STUTTER_0.2_0.13_3"), { type: "stutter-next", offsetSeconds: 0.2, sliceSeconds: 0.13, count: 3 });
  assert.deepEqual(control("jam_0.05_4"), control("jam_(0.05)_(4)"));
  assert.equal(control("jam_0.05_4").offsetSeconds, 0.05);
  assert.equal(control("jam_0.05_4").sliceSeconds, 0.13);
  assert.equal(control("$JAM_500_3").delayMs, 500);
  assert.equal(control(".g6").clipName, "g6");
  assert.equal(control("g1").durationMs, null);
});

test("invalid commands fail explicitly, defaults and zero are preserved", () => {
  for (const text of ["$SLEEP_bad", "$SLEEP_-1", "$STUTT_1.5", "$UNKNOWN_3", "$SLEEP_3_4", "$SLEEP(abc)", "$JAM_1_2_3"]) {
    assert.throws(() => parse(text), Error, text);
  }
  assert.equal(control("$SLEEP").durationMs, 500);
  assert.equal(control("$SPAC").durationMs, 200);
  assert.equal(control("$STUTT").count, 3);
  assert.equal(control("$REPEAT_0").count, 0);
  assert.equal(control("$SLEEP_0").durationMs, 0);
  assert.equal(control("$REPEAT_999999").count, 12);
  assert.equal(control("$NOISE_999999").durationMs, 10000);
});

test("pause and delay have exact wall-clock duration at different speech rates", () => {
  const speech = buffer();
  const timeline = plan([
    { control: control("$SLEEP_500") }, { buffer: speech },
    { control: control("$SPAC_200") }, { buffer: speech },
    { control: control("$SLEEP_500") },
  ], { ...options, voiceDelayMs: 3000, playbackRate: 2 });
  near(timeline.events[0].at, 3.5);
  near(timeline.events[1].at, 4.2);
  near(timeline.duration, 5.2);
});

test("explicit pauses replace default gaps while preserving punctuation minima", () => {
  const speech = buffer();
  const items = [{ buffer: speech, minGapAfterMs: 280 }, { control: control("$SLEEP_50") }, { buffer: speech }];
  near(plan(items, { ...options, gapMs: 80 }).duration, 2.28);
  items[1].control = control("$SLEEP_500");
  near(plan(items, { ...options, gapMs: 80 }).duration, 2.5);
});

test("tail stutter loops an audible syllable rather than a whole clip or trailing silence", () => {
  const speech = buffer(2, 0.4);
  const timeline = plan([{ buffer: speech }, { control: control("$STUTT_3") }], options);
  assert.equal(timeline.events.length, 4);
  for (const event of timeline.events.slice(1)) {
    near(event.duration, 0.12);
    assert.ok(event.offset >= 1.47 && event.offset + event.duration <= 1.608);
    assert.equal(event.fade, true);
  }
  near(timeline.duration, 2.43);
});

test("repeat uses the complete preceding speech and never the preceding noise", () => {
  const speech = buffer(1), noise = buffer(0.3);
  const timeline = plan([{ buffer: speech }, { control: control("$NOISE_300"), buffer: noise }, { control: control("$REPEAT_2") }], options);
  assert.equal(timeline.events.length, 4);
  assert.equal(timeline.events.at(-1).buffer, speech);
  near(timeline.duration, 3.3);
});

test("native stutter repeats the requested slice of the next clip and resumes it", () => {
  const speech = buffer();
  const timeline = plan([{ control: control("$STUTTER_0.2_0.13_3") }, { buffer: speech }], options);
  assert.equal(timeline.events.length, 5);
  near(timeline.events[0].duration, 0.2);
  for (const event of timeline.events.slice(1, 4)) {
    near(event.offset, 0.2);
    near(event.duration, 0.13);
  }
  near(timeline.events.at(-1).offset, 0.2);
  near(timeline.duration, 1.39);
});

test("noise loops or crops without changing pitch; JAM delay is included", () => {
  const noise = buffer(0.68);
  const timeline = plan([{ control: control("$NOISE_1300"), buffer: noise }, { control: control("$JAM_500_3"), buffer: noise }], { ...options, playbackRate: 2 });
  assert.equal(timeline.events.length, 4);
  for (const event of timeline.events) {
    assert.equal(event.playbackRate, 1);
    assert.equal(event.loop, true);
  }
  near(timeline.events[1].at, 1.8);
  near(timeline.duration, 2.16);
});

test("missing target and missing sound fail instead of silently dropping effects", () => {
  assert.throws(() => plan([{ control: control("$REPEAT_2") }], options), /前需要/);
  assert.throws(() => plan([{ control: control("jam_0.1_3") }], options), /后需要/);
  assert.throws(() => plan([{ control: control("$NOISE_300") }], options), /缺少音效/);
});

test("Web Audio events end at planned times with bounded slice fades", () => {
  const sources = [], automation = [];
  const context = {
    destination: {},
    createBufferSource() {
      const source = { playbackRate: {}, connect: () => ({ connect() {} }), start: (...args) => { source.started = args; }, stop: (end) => { source.ended = end; } };
      sources.push(source);
      return source;
    },
    createGain() { return { gain: { setValueAtTime: (...args) => automation.push(args), linearRampToValueAtTime: (...args) => automation.push(args) } }; },
  };
  const timeline = plan([{ buffer: buffer() }, { control: control("$STUTT_3") }, { control: control("$NOISE_300"), buffer: buffer(0.68) }], options);
  scheduleCassieTimeline(context, timeline);
  assert.equal(sources.length, timeline.events.length);
  near(sources.at(-1).ended, timeline.duration);
  sources.forEach((source, index) => {
    const event = timeline.events[index];
    near(source.started[0], event.at);
    near(source.started[1], event.offset);
    near(source.ended, event.at + event.duration / event.playbackRate);
  });
  assert.ok(automation.every(([, time]) => time >= 0 && time <= timeline.duration));
});
