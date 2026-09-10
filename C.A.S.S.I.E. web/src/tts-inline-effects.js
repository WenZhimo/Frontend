const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const effectWrapperPattern = /#\{([^{}\r\n]*)\}/g;
const spokenWordPattern = /[A-Za-z0-9]+(?:['\u2019][A-Za-z0-9]+)?/g;
const vowelPattern = /^[aeiouy]+$/i;

function wordTokens(text) {
  const tokens = [];
  for (const match of String(text || "").matchAll(spokenWordPattern)) {
    tokens.push({ text: match[0], normalized: match[0].toLowerCase(), index: match.index });
  }
  return tokens;
}

function parseHeldWord(rawWord) {
  const holdPattern = /([A-Za-z])(-{2,})(?=[A-Za-z])/g;
  const effects = [];
  let cleanWord = "";
  let cursor = 0;
  let match;

  while ((match = holdPattern.exec(rawWord)) !== null) {
    cleanWord += rawWord.slice(cursor, match.index + 1);
    effects.push({
      type: "hold",
      anchorChar: cleanWord.length,
      durationMs: clamp(match[2].length * 220, 320, 2200),
      marker: match[2],
    });
    cursor = match.index + match[0].length;
  }

  if (effects.length === 0) return null;
  cleanWord += rawWord.slice(cursor);
  return { cleanWord, effects };
}

function parseRestartedWord(rawWord) {
  const segments = rawWord.split("_");
  if (segments.length < 2 || segments.length > 12) {
    return null;
  }
  const prefixes = segments.slice(0, -1);
  if (prefixes.some((segment) => !/^[A-Za-z]+$/.test(segment))) return null;

  const finalSegment = segments.at(-1);
  const decoratedFinal = parseHeldWord(finalSegment) || parseRepeatedWord(finalSegment);
  const cleanWord = decoratedFinal?.cleanWord || finalSegment;
  if (!/^[A-Za-z]+$/.test(cleanWord)) return null;

  const cleanWordLower = cleanWord.toLowerCase();
  if (prefixes.some((prefix) => !cleanWordLower.startsWith(prefix.toLowerCase()))) return null;
  const finalEffects = (decoratedFinal?.effects || []).map(({ anchorChar, ...effect }) => ({
    ...effect,
    anchorRatio: anchorChar / Math.max(1, cleanWord.length),
    wordStartRatio: 0,
    wordEndRatio: 1,
    word: cleanWord,
  }));

  return {
    cleanWord,
    effects: [{
      type: "restart",
      anchorChar: prefixes[0].length,
      restart: true,
      prefix: prefixes[0],
      restartPrefixes: prefixes.slice(1),
      finalEffects,
    }],
  };
}

function parseRepeatedWord(rawWord) {
  const repeated = /-([A-Za-z]{1,4})(?:-\1){1,}(?=-[A-Za-z])/i.exec(rawWord);
  if (!repeated) return null;

  const before = rawWord.slice(0, repeated.index);
  const after = rawWord.slice(repeated.index + repeated[0].length + 1);
  const chunk = repeated[1];
  const count = repeated[0].split("-").filter(Boolean).length;
  const beforeLower = before.toLowerCase();
  const afterLower = after.toLowerCase();
  const chunkLower = chunk.toLowerCase();
  const restart = before.length >= 2 && afterLower.startsWith(beforeLower);
  let cleanWord;
  let anchorChar;

  if (restart) {
    cleanWord = after;
    anchorChar = Math.min(before.length, cleanWord.length);
  } else {
    const needsBridge = !beforeLower.endsWith(chunkLower) && !afterLower.startsWith(chunkLower);
    cleanWord = `${before}${needsBridge ? chunk : ""}${after}`;
    anchorChar = before.length + (needsBridge ? chunk.length : 0);
  }

  if (!cleanWord || !/^[A-Za-z]+$/.test(cleanWord)) return null;
  return {
    cleanWord,
    effects: [{
      type: "stutter",
      anchorChar: clamp(anchorChar, 1, cleanWord.length),
      count: clamp(count, 2, 12),
      sliceMs: vowelPattern.test(chunk) ? 82 : 56,
      gapMs: vowelPattern.test(chunk) ? 14 : 22,
      chunk,
      restart,
    }],
  };
}

function parseDecoratedWord(rawWord) {
  return parseRestartedWord(rawWord) || parseHeldWord(rawWord) || parseRepeatedWord(rawWord);
}

export function parseInlineTtsEffects(text) {
  const source = String(text || "");
  const pendingEffects = [];
  let cleanText = "";
  let cursor = 0;

  for (const match of source.matchAll(effectWrapperPattern)) {
    const payload = match[1].trim();
    if (payload.startsWith("$")) continue;
    const parsed = parseDecoratedWord(payload);
    if (!parsed) throw new Error(`无法识别词内效果：#{${payload}}`);
    cleanText += source.slice(cursor, match.index);
    const wordStart = cleanText.length;
    cleanText += parsed.cleanWord;
    parsed.effects.forEach((effect) => pendingEffects.push({
      ...effect,
      rawWord: `#{${payload}}`,
      word: parsed.cleanWord,
      wordStart,
      anchorRatio: effect.anchorChar / Math.max(1, parsed.cleanWord.length),
    }));
    cursor = match.index + match[0].length;
  }

  cleanText += source.slice(cursor);
  if (pendingEffects.length === 0) return { text: source, effects: [] };

  const tokens = wordTokens(cleanText);
  const occurrenceCounts = new Map();
  for (const token of tokens) {
    const next = (occurrenceCounts.get(token.normalized) || 0) + 1;
    occurrenceCounts.set(token.normalized, next);
    pendingEffects.forEach((effect) => {
      if (effect.occurrence || effect.wordStart !== token.index) return;
      effect.occurrence = next;
    });
  }

  return {
    text: cleanText,
    effects: pendingEffects.map(({ wordStart, anchorChar, ...effect }) => ({
      ...effect,
      occurrence: effect.occurrence || 1,
    })),
  };
}

export function attachInlineTtsEffects(units, effects) {
  if (!effects?.length) return { units, unmatched: [] };
  const occurrences = new Map();
  const locations = new Map();

  units.forEach((unit, unitIndex) => {
    wordTokens(unit.text).forEach((token) => {
      const occurrence = (occurrences.get(token.normalized) || 0) + 1;
      occurrences.set(token.normalized, occurrence);
      locations.set(`${token.normalized}:${occurrence}`, { unitIndex, token });
    });
  });

  const unmatched = [];
  effects.forEach((effect) => {
    const location = locations.get(`${effect.word.toLowerCase()}:${effect.occurrence}`);
    if (!location) {
      unmatched.push(effect);
      return;
    }

    const unit = units[location.unitIndex];
    const textLength = Math.max(1, unit.text.length);
    const tokenLength = location.token.text.length;
    const inlineEffect = {
      ...effect,
      anchorRatio: clamp(
        (location.token.index + tokenLength * effect.anchorRatio) / textLength,
        0.01,
        0.99,
      ),
      wordStartRatio: clamp(location.token.index / textLength, 0, 0.99),
      wordEndRatio: clamp((location.token.index + tokenLength) / textLength, 0.01, 1),
    };
    unit.inlineEffects = [...(unit.inlineEffects || []), inlineEffect];
  });

  return { units, unmatched };
}

function rmsForRange(channels, start, end) {
  let sum = 0;
  let count = 0;
  for (const channel of channels) {
    for (let index = start; index < end; index += 1) {
      sum += channel[index] * channel[index];
      count += 1;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function findAudibleRange(channels, sampleRate) {
  const length = channels[0]?.length || 0;
  const windowSize = Math.max(1, Math.round(sampleRate * 0.008));
  let start = 0;
  let end = length;

  while (start + windowSize < length && rmsForRange(channels, start, start + windowSize) < 0.006) {
    start += windowSize;
  }
  while (end - windowSize > start && rmsForRange(channels, end - windowSize, end) < 0.006) {
    end -= windowSize;
  }
  return { start, end: Math.max(start + 1, end) };
}

function findQuietBoundary(channels, approximate, sampleRate, min, max) {
  const windowSize = Math.max(1, Math.round(sampleRate * 0.006));
  const radius = Math.round(sampleRate * 0.09);
  const from = clamp(approximate - radius, min, max);
  const to = clamp(approximate + radius, from, max);
  let best = clamp(approximate, min, max);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = from; index <= to; index += windowSize) {
    const start = clamp(index - Math.floor(windowSize / 2), min, max);
    const end = clamp(start + windowSize, start + 1, max);
    const distancePenalty = Math.abs(index - approximate) / Math.max(1, radius) * 0.002;
    const score = rmsForRange(channels, start, end) + distancePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return clamp(best, min, max);
}

function findBestPrecedingSlice(channels, anchor, desiredLength, sampleRate, audibleStart) {
  const searchBack = Math.round(sampleRate * 0.16);
  const step = Math.max(1, Math.round(sampleRate * 0.004));
  const latestStart = Math.max(audibleStart, anchor - desiredLength);
  const earliestStart = Math.max(audibleStart, anchor - searchBack);
  let bestStart = latestStart;
  let bestScore = -1;

  for (let start = earliestStart; start <= latestStart; start += step) {
    const end = Math.min(anchor, start + desiredLength);
    if (end - start < Math.floor(desiredLength * 0.65)) continue;
    const proximity = 1 - (latestStart - start) / Math.max(1, latestStart - earliestStart);
    const score = rmsForRange(channels, start, end) + proximity * 0.004;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  return { start: bestStart, end: Math.min(anchor, bestStart + desiredLength) };
}

function applyEnvelope(samples, fadeSamples) {
  const output = Float32Array.from(samples);
  const fade = Math.min(fadeSamples, Math.floor(output.length / 2));
  for (let index = 0; index < fade; index += 1) {
    const gain = index / Math.max(1, fade);
    output[index] *= gain;
    output[output.length - 1 - index] *= gain;
  }
  return output;
}

function makeStutterInsertion(slice, count, gapSamples, fadeSamples) {
  const length = slice.length * count + gapSamples * Math.max(0, count - 1);
  const output = new Float32Array(length);
  const shaped = applyEnvelope(slice, fadeSamples);
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    output.set(shaped, cursor);
    cursor += shaped.length + (index < count - 1 ? gapSamples : 0);
  }
  return output;
}

function makeHoldInsertion(slice, durationSamples, crossfadeSamples) {
  const output = new Float32Array(durationSamples);
  const weights = new Float32Array(durationSamples);
  const overlap = Math.min(crossfadeSamples, Math.floor(slice.length / 3));
  const hop = Math.max(1, slice.length - overlap);

  for (let offset = 0; offset < durationSamples; offset += hop) {
    for (let index = 0; index < slice.length && offset + index < durationSamples; index += 1) {
      let weight = 1;
      if (overlap > 0 && index < overlap) weight = index / overlap;
      if (overlap > 0 && index >= slice.length - overlap) {
        weight = Math.min(weight, (slice.length - 1 - index) / overlap);
      }
      output[offset + index] += slice[index] * Math.max(0, weight);
      weights[offset + index] += Math.max(0, weight);
    }
  }

  for (let index = 0; index < output.length; index += 1) {
    if (weights[index] > 0) output[index] /= weights[index];
  }
  return applyEnvelope(output, Math.min(Math.round(crossfadeSamples * 1.5), Math.floor(output.length / 2)));
}

function makeRestartInsertionsByChannel(channels, sampleRate, event, fadeSamples) {
  const finalRangeIndex = event.restartRanges.length - 1;
  const rangeInsertions = event.restartRanges.map((range, rangeIndex) => {
    let rangeChannels = channels.map((channel) => channel.subarray(range.start, range.end));
    if (rangeIndex === finalRangeIndex && event.effect.finalEffects?.length) {
      rangeChannels = applyInlineEffectsToChannels(rangeChannels, sampleRate, event.effect.finalEffects);
    }
    return rangeChannels.map((channel) => applyEnvelope(channel, fadeSamples));
  });

  return channels.map((_, channelIndex) => {
    const length = rangeInsertions.reduce((sum, insertion) => sum + insertion[channelIndex].length, 0);
    const output = new Float32Array(length);
    let offset = 0;
    rangeInsertions.forEach((insertion) => {
      output.set(insertion[channelIndex], offset);
      offset += insertion[channelIndex].length;
    });
    return output;
  });
}

function buildEffectEvents(channels, sampleRate, effects) {
  const audible = findAudibleRange(channels, sampleRate);
  const audibleLength = Math.max(1, audible.end - audible.start);
  return [...effects]
    .map((effect) => {
      const approximate = audible.start + Math.round(audibleLength * clamp(effect.anchorRatio, 0, 1));
      let anchor = findQuietBoundary(channels, approximate, sampleRate, audible.start + 1, audible.end - 1);
      const desiredSlice = Math.max(1, Math.round(sampleRate * ((effect.sliceMs || 48) / 1000)));
      const slice = findBestPrecedingSlice(channels, anchor, desiredSlice, sampleRate, audible.start);
      let skipTo = anchor;
      let restartRanges = [];

      if (effect.restart) {
        const wordStartApprox = audible.start + Math.round(audibleLength * clamp(effect.wordStartRatio, 0, 1));
        const wordEndApprox = audible.start + Math.round(audibleLength * clamp(effect.wordEndRatio, 0, 1));
        const wordStart = findQuietBoundary(channels, wordStartApprox, sampleRate, audible.start, anchor);
        const wordEnd = findQuietBoundary(channels, wordEndApprox, sampleRate, anchor + 1, audible.end);
        if (wordEnd > wordStart + Math.round(sampleRate * 0.08)) {
          const wordLength = wordEnd - wordStart;
          const cleanWordLength = Math.max(1, effect.word?.length || 1);
          const prefixRanges = (effect.restartPrefixes || []).map((prefix) => {
            const prefixRatio = clamp(prefix.length / cleanWordLength, 0.01, 1);
            if (prefixRatio >= 0.999) return { start: wordStart, end: wordEnd };
            const prefixEndApprox = wordStart + Math.round(wordLength * prefixRatio);
            const prefixEnd = findQuietBoundary(
              channels,
              prefixEndApprox,
              sampleRate,
              wordStart + 1,
              wordEnd,
            );
            return { start: wordStart, end: Math.max(wordStart + 1, prefixEnd) };
          });
          restartRanges = [...prefixRanges, { start: wordStart, end: wordEnd }];
          if ((effect.prefix?.length || 0) >= cleanWordLength) anchor = wordEnd;
          skipTo = wordEnd;
        }
      }

      return { effect, anchor, slice, restartRanges, skipTo };
    })
    .sort((a, b) => a.anchor - b.anchor);
}

export function applyInlineEffectsToChannels(channels, sampleRate, effects) {
  if (!Array.isArray(channels) || channels.length === 0 || !effects?.length) {
    return Array.isArray(channels) ? channels.map((channel) => Float32Array.from(channel)) : [];
  }

  const sourceLength = channels[0].length;
  const events = buildEffectEvents(channels, sampleRate, effects)
    .filter((event) => event.anchor > 0 && event.anchor < sourceLength);
  if (events.length === 0) return channels.map((channel) => Float32Array.from(channel));

  const insertionsByChannel = channels.map(() => []);
  events.forEach((event) => {
    const fadeSamples = Math.max(1, Math.round(sampleRate * 0.004));
    const restartInsertions = event.restartRanges.length > 0
      ? makeRestartInsertionsByChannel(channels, sampleRate, event, fadeSamples)
      : null;
    channels.forEach((channel, channelIndex) => {
      const slice = channel.subarray(event.slice.start, event.slice.end);
      let insertion;
      if (event.effect.type === "hold") {
        insertion = makeHoldInsertion(
          slice,
          Math.max(1, Math.round(sampleRate * event.effect.durationMs / 1000)),
          Math.max(1, Math.round(sampleRate * 0.008)),
        );
      } else if (event.effect.type === "restart") {
        insertion = new Float32Array(0);
      } else {
        insertion = makeStutterInsertion(
          slice,
          event.effect.count,
          Math.max(0, Math.round(sampleRate * (event.effect.gapMs || 0) / 1000)),
          fadeSamples,
        );
      }

      if (restartInsertions) {
        const restarts = restartInsertions[channelIndex];
        const combined = new Float32Array(
          insertion.length + restarts.length,
        );
        combined.set(insertion, 0);
        combined.set(restarts, insertion.length);
        insertion = combined;
      }
      insertionsByChannel[channelIndex].push(insertion);
    });
  });

  const removedSamples = events.reduce((sum, event) => sum + Math.max(0, event.skipTo - event.anchor), 0);
  const insertedSamples = insertionsByChannel[0].reduce((sum, insertion) => sum + insertion.length, 0);
  const outputLength = Math.max(1, sourceLength - removedSamples + insertedSamples);

  return channels.map((channel, channelIndex) => {
    const output = new Float32Array(outputLength);
    let sourceCursor = 0;
    let outputCursor = 0;
    events.forEach((event, eventIndex) => {
      if (event.anchor < sourceCursor) return;
      const sourcePart = channel.subarray(sourceCursor, event.anchor);
      output.set(sourcePart, outputCursor);
      outputCursor += sourcePart.length;
      const insertion = insertionsByChannel[channelIndex][eventIndex];
      output.set(insertion, outputCursor);
      outputCursor += insertion.length;
      sourceCursor = Math.max(event.anchor, event.skipTo);
    });
    output.set(channel.subarray(sourceCursor), outputCursor);
    return output;
  });
}
