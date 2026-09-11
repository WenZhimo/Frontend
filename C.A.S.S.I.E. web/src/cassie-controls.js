const commandWrapperPattern = /#\{([^{}\r\n]*)\}/g;
const sleepCommandPattern = /^\$SLEEP_(\d+)$/i;
const gapCommandPattern = /^\$GAP_(\d+)$/i;
const glitchCommandPattern = /^\$G_[1-6](?:\s*,\s*G_[1-6])*$/i;
const commandSeparatedScpPattern = /\bSCP\b\s*[-_#]?\s*(#\{[$#][^{}\r\n]*\})\s*(\d+(?:[-_]\d+)*)\b/gi;

function spaceDigits(value) {
  return String(value || "").replace(/\D/g, "").split("").filter(Boolean).join(" ");
}

function normalizeCommandSeparatedDesignations(source) {
  return String(source || "").replace(
    commandSeparatedScpPattern,
    (_match, command, digits) => `SCP ${command} ${spaceDigits(digits)}`,
  );
}

function parseControl(payload) {
  const sleep = sleepCommandPattern.exec(payload);
  if (sleep) {
    const durationMs = Number(sleep[1]);
    if (durationMs > 10000) throw new Error(`停顿时长必须在 0 到 10000ms 之间：#{${payload}}`);
    return { type: "sleep", durationMs };
  }

  const gap = gapCommandPattern.exec(payload);
  if (gap) {
    const durationMs = Number(gap[1]);
    if (durationMs > 10000) throw new Error(`精确间隔必须在 0 到 10000ms 之间：#{${payload}}`);
    return { type: "gap", durationMs };
  }

  if (glitchCommandPattern.test(payload)) {
    const clipNames = payload
      .slice(1)
      .split(",")
      .map((name) => name.trim().toLowerCase().replace("_", ""));
    return { type: "glitch-overlay", clipNames };
  }

  throw new Error(`未知指令或格式不正确：#{${payload}}`);
}

export function parseCassieControlCommands(text) {
  const source = normalizeCommandSeparatedDesignations(text);
  const dangling = /#\{[$#][^}\r\n]*(?=\r?\n|$)/.exec(source);
  if (dangling) throw new Error(`标记缺少右花括号：${dangling[0]}`);

  const segments = [];
  let cursor = 0;
  let spokenText = "";
  let controlsBefore = [];

  for (const match of source.matchAll(commandWrapperPattern)) {
    const payload = match[1].trim();
    const isCommand = payload.startsWith("$");
    const isComment = payload.startsWith("#");
    if (!isCommand && !isComment) continue;

    spokenText += source.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    if (isComment) continue;

    if (spokenText.trim()) {
      segments.push({ text: spokenText, controlsBefore });
      controlsBefore = [];
      spokenText = "";
    }
    controlsBefore.push(parseControl(payload));
  }

  spokenText += source.slice(cursor);
  if (spokenText.trim() || controlsBefore.length || !segments.length) {
    segments.push({ text: spokenText, controlsBefore });
  }
  return segments;
}

export function controlLabel(control) {
  if (control.type === "sleep") return `SLEEP ${control.durationMs}ms`;
  if (control.type === "gap") return `GAP ${control.durationMs}ms`;
  if (control.type === "glitch-overlay") return `GLITCH ${control.clipNames.map((name) => name.toUpperCase()).join(" → ")}`;
  return String(control.type || "CONTROL").toUpperCase();
}

function eventEnd(event) {
  return event.at + event.duration / event.playbackRate;
}

// Speech and overlay events share one plan so preview and export stay sample-aligned.
export function buildCassieTimeline(items, options) {
  const events = [];
  const rate = options.playbackRate ?? 1;
  const defaultGap = Math.max(0, options.gapMs - options.overlapMs) / 1000;
  let cursor = options.voiceDelayMs / 1000;
  let pendingGap = 0;
  let pendingOverlayBuffers = [];
  let lastSpeech = null;
  let duration = cursor;

  const checkLimits = () => {
    if (duration > 1800 || events.length > 10000) {
      throw new Error("播报超过 30 分钟或片段过多，请拆分文本。");
    }
  };

  const addEvent = ({ buffer, at, offset = 0, duration: eventDuration = buffer.duration, playbackRate = rate, loop = false, fade = false, overlay = false }) => {
    if (!buffer || eventDuration <= 0) return;
    const event = { buffer, at, offset, duration: eventDuration, playbackRate, loop, fade, overlay };
    events.push(event);
    duration = Math.max(duration, eventEnd(event));
    checkLimits();
  };

  const addOverlaySequence = (buffers, at) => {
    let overlayAt = at;
    for (const buffer of buffers) {
      addEvent({ buffer, at: overlayAt, playbackRate: 1, overlay: true });
      overlayAt += buffer.duration;
    }
  };

  for (const item of items) {
    const control = item.control;
    if (!control) {
      cursor += pendingGap;
      const speechStart = cursor;
      addEvent({ buffer: item.buffer, at: speechStart });
      cursor += item.buffer.duration / rate;
      duration = Math.max(duration, cursor);
      lastSpeech = { start: speechStart, end: cursor };

      if (pendingOverlayBuffers.length > 0) {
        addOverlaySequence(pendingOverlayBuffers, speechStart);
        pendingOverlayBuffers = [];
      }

      pendingGap = Math.max(defaultGap, (item.minGapAfterMs || 0) / 1000);
      checkLimits();
      continue;
    }

    if (control.type === "sleep") {
      cursor += Math.max(pendingGap, control.durationMs / 1000);
      pendingGap = 0;
      duration = Math.max(duration, cursor);
      checkLimits();
      continue;
    }

    if (control.type === "gap") {
      cursor += control.durationMs / 1000;
      pendingGap = 0;
      duration = Math.max(duration, cursor);
      checkLimits();
      continue;
    }

    if (control.type === "glitch-overlay") {
      if (!Array.isArray(item.buffers) || item.buffers.length !== control.clipNames.length) {
        throw new Error(`缺少故障音资源：${control.clipNames.join(", ")}`);
      }
      pendingOverlayBuffers.push(...item.buffers);
      continue;
    }

    throw new Error(`不支持的控制指令：${control.type}`);
  }

  if (pendingOverlayBuffers.length > 0) {
    if (!lastSpeech) throw new Error("故障音覆盖需要至少一个语音片段。");
    const overlayDuration = pendingOverlayBuffers.reduce((sum, buffer) => sum + buffer.duration, 0);
    addOverlaySequence(pendingOverlayBuffers, Math.max(lastSpeech.start, lastSpeech.end - overlayDuration));
  }

  return { events, duration };
}

export function scheduleCassieTimeline(context, timeline) {
  for (const event of timeline.events) {
    const source = context.createBufferSource();
    source.buffer = event.buffer;
    source.playbackRate.value = event.playbackRate;
    source.loop = event.loop;
    const end = eventEnd(event);
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
