const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
const argument = String.raw`(?:\(${number}\)|${number})`;
const commandPattern = new RegExp(
  String.raw`\$[a-z]+(?:\([^()\r\n]*\)|(?:_${argument})+)?|\bjam_(?:${argument})(?:_${argument})*|(?<![\w])\.?g[1-6](?![\w])`,
  "gi",
);

function parseControl(raw) {
  const glitch = /^\.?g([1-6])$/i.exec(raw);
  if (glitch) return { type: "noise", clipName: `g${glitch[1]}`, durationMs: null };
  const name = /^\$?([a-z]+)/i.exec(raw)[1].toLowerCase();
  const payload = raw.replace(/^\$?[a-z]+/i, "");
  const args = payload ? payload.replace(/[()]/g, "").replace(/^_/, "").split(/[_ ,]+/).map(Number) : [];
  if (args.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`指令参数无效：${raw}`);
  }
  const duration = (value, fallback) => clamp(value ?? fallback, 0, 10000);
  const count = (value, fallback) => {
    if (value != null && !Number.isInteger(value)) throw new Error(`重复次数必须是整数：${raw}`);
    return clamp(value ?? fallback, 0, 12);
  };
  if (name === "stutter" && args.length === 3) {
    return { type: "stutter-next", offsetSeconds: clamp(args[0], 0, 60), sliceSeconds: clamp(args[1], 0.01, 1), count: count(args[2], 3) };
  }
  if (name === "jam" && !raw.startsWith("$") && args.length === 2) {
    return { type: "stutter-next", offsetSeconds: clamp(args[0], 0, 60), sliceSeconds: 0.13, count: count(args[1], 3) };
  }
  if (name === "jam" && raw.startsWith("$") && args.length <= 2) {
    return { type: "jam", delayMs: duration(args[0], 180), durationMs: 120, count: count(args[1], 3), clipName: "g1" };
  }
  if (args.length <= 1) {
    if (name === "sleep" || name === "spac") return { type: name, durationMs: duration(args[0], name === "sleep" ? 500 : 200) };
    if (name === "noise") return { type: "noise", durationMs: duration(args[0], 300), clipName: "static" };
    if (name === "stutt" || name === "stutter") return { type: "stutter", count: count(args[0], 3) };
    if (name === "repeat") return { type: "repeat", count: count(args[0], 1) };
  }
  throw new Error(`未知指令或参数数量不正确：${raw}`);
}

export function parseCassieControlCommands(text) {
  const source = String(text || "");
  const segments = [];
  let cursor = 0;
  let controlsBefore = [];
  for (const match of source.matchAll(commandPattern)) {
    const chunk = source.slice(cursor, match.index);
    if (chunk.trim()) {
      segments.push({ text: chunk, controlsBefore });
      controlsBefore = [];
    }
    const end = match.index + match[0].length;
    if (/[\w_(]/.test(source[end] || "")) throw new Error(`指令格式无效：${source.slice(match.index).split(/\s/)[0]}`);
    controlsBefore.push(parseControl(match[0]));
    cursor = end;
  }
  const tail = source.slice(cursor);
  if (tail.trim() || controlsBefore.length || !segments.length) segments.push({ text: tail, controlsBefore });
  return segments;
}

export function controlLabel(control) {
  if (control.type === "stutter-next") return `STUTTER ${control.offsetSeconds}s / ${control.sliceSeconds}s x${control.count}`;
  if (control.type === "stutter" || control.type === "repeat") return `${control.type.toUpperCase()} x${control.count}`;
  if (control.type === "jam") return `JAM +${control.delayMs}ms x${control.count}`;
  if (control.durationMs == null) return control.clipName.toUpperCase();
  return `${control.type.toUpperCase()} ${control.durationMs}ms`;
}

function audibleEnd(buffer) {
  const window = Math.max(1, Math.round(buffer.sampleRate * 0.008));
  for (let end = buffer.length; end > 0; end -= window) {
    const start = Math.max(0, end - window);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      let sum = 0;
      for (let i = start; i < end; i++) sum += samples[i] ** 2;
      if (Math.sqrt(sum / (end - start)) > 0.01) return end / buffer.sampleRate;
    }
  }
  return buffer.duration;
}

// Both renderers use this plan for duration and playback, avoiding drift at controls.
export function buildCassieTimeline(items, options) {
  const events = [];
  const rate = options.playbackRate ?? 1;
  const defaultGap = Math.max(0, options.gapMs - options.overlapMs) / 1000;
  let cursor = options.voiceDelayMs / 1000;
  let pendingGap = 0;
  let previous = null;
  let nextStutter = null;
  const advance = (seconds) => {
    cursor += seconds;
    if (cursor > 1800 || events.length > 10000) throw new Error("播报超过 30 分钟或片段过多，请拆分文本。");
  };
  const play = (buffer, offset = 0, duration = buffer.duration, playbackRate = rate, loop = false, fade = false) => {
    if (duration <= 0) return;
    events.push({ buffer, at: cursor, offset, duration, playbackRate, loop, fade });
    advance(duration / playbackRate);
  };

  for (const item of items) {
    const control = item.control;
    if (!control) {
      advance(pendingGap);
      if (nextStutter) {
        const offset = Math.min(nextStutter.offsetSeconds, Math.max(0, item.buffer.duration - 0.01));
        const slice = Math.min(nextStutter.sliceSeconds, item.buffer.duration - offset);
        play(item.buffer, 0, offset, rate, false, true);
        for (let i = 0; i < nextStutter.count; i++) play(item.buffer, offset, slice, rate, false, true);
        play(item.buffer, offset, item.buffer.duration - offset, rate, false, true);
        nextStutter = null;
      } else {
        play(item.buffer);
      }
      previous = item.buffer;
      pendingGap = Math.max(defaultGap, (item.minGapAfterMs || 0) / 1000);
      continue;
    }
    if (control.type === "stutter-next") {
      if (nextStutter) throw new Error("连续的 STUTTER / jam 指令之间需要一段语音。");
      nextStutter = control;
      continue;
    }
    if (control.type === "sleep" || control.type === "spac") {
      advance(Math.max(pendingGap, control.durationMs / 1000));
      pendingGap = 0;
      continue;
    }
    if (control.type === "noise" || control.type === "jam") {
      if (!item.buffer) throw new Error(`缺少音效资源：${control.clipName}`);
      advance(Math.max(pendingGap, (control.delayMs || 0) / 1000));
      const duration = control.durationMs == null ? item.buffer.duration : control.durationMs / 1000;
      const count = control.type === "jam" ? control.count : 1;
      for (let i = 0; i < count; i++) play(item.buffer, 0, duration, 1, true, true);
      pendingGap = 0;
      continue;
    }
    if (!previous) throw new Error(`${controlLabel(control)} 前需要一个语音片段。`);
    if (control.count === 0) continue;
    const isStutter = control.type === "stutter";
    const end = isStutter ? audibleEnd(previous) : previous.duration;
    const duration = isStutter ? Math.min(0.12, end) : previous.duration;
    advance(pendingGap);
    for (let i = 0; i < control.count; i++) {
      play(previous, end - duration, duration, rate, false, isStutter);
      if (isStutter && i < control.count - 1) advance(0.035);
    }
    pendingGap = defaultGap;
  }
  if (nextStutter) throw new Error("STUTTER / jam 指令后需要一个语音片段。");
  return { events, duration: cursor };
}

export function scheduleCassieTimeline(context, timeline) {
  for (const event of timeline.events) {
    const source = context.createBufferSource();
    source.buffer = event.buffer;
    source.playbackRate.value = event.playbackRate;
    source.loop = event.loop;
    const end = event.at + event.duration / event.playbackRate;
    if (event.fade) {
      const gain = context.createGain();
      const fade = Math.min(0.003, (end - event.at) / 2);
      gain.gain.setValueAtTime(0, event.at);
      gain.gain.linearRampToValueAtTime(1, event.at + fade);
      gain.gain.setValueAtTime(1, end - fade);
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain).connect(context.destination);
    } else {
      source.connect(context.destination);
    }
    source.start(event.at, event.offset);
    source.stop(end);
  }
}
