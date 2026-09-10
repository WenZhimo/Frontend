const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const BACKGROUND_SEGMENTS = Object.freeze({
  introEndSeconds: 4,
  loopStartSeconds: 4,
  loopEndSeconds: 29,
  outroStartSeconds: 40,
});

export function makeExactBackgroundPlan(targetSeconds, sourceDuration, segments = BACKGROUND_SEGMENTS) {
  const target = Math.max(segments.introEndSeconds, Math.ceil(Number(targetSeconds) || 0));
  const introDuration = Math.min(segments.introEndSeconds, sourceDuration);
  const loopStart = clamp(segments.loopStartSeconds, 0, sourceDuration);
  const loopEnd = clamp(segments.loopEndSeconds, loopStart, sourceDuration);
  const outroStart = clamp(segments.outroStartSeconds, loopEnd, sourceDuration);
  const outroDuration = Math.max(0, sourceDuration - outroStart);

  if (loopEnd <= loopStart) throw new Error("背景音循环区间无效");
  if (outroDuration <= 0) throw new Error("背景音尾提示区间无效");

  return {
    targetSeconds: target,
    introDuration,
    loopStart,
    loopEnd,
    loopDuration: loopEnd - loopStart,
    noiseDuration: Math.max(0, target - introDuration),
    outroStart,
    outroDuration,
    totalDuration: target + outroDuration,
  };
}

export function synthesizeExactBackgroundChannels(channels, sampleRate, targetSeconds, segments = BACKGROUND_SEGMENTS) {
  if (!Array.isArray(channels) || channels.length === 0) throw new Error("背景音没有声道数据");
  const sourceLength = channels[0].length;
  const sourceDuration = sourceLength / sampleRate;
  const plan = makeExactBackgroundPlan(targetSeconds, sourceDuration, segments);
  const outputLength = Math.ceil(plan.totalDuration * sampleRate);
  const introLength = Math.min(sourceLength, Math.round(plan.introDuration * sampleRate));
  const noiseEnd = Math.round(plan.targetSeconds * sampleRate);
  const loopStart = Math.round(plan.loopStart * sampleRate);
  const loopEnd = Math.round(plan.loopEnd * sampleRate);
  const loopLength = Math.max(1, loopEnd - loopStart);
  const outroStart = Math.round(plan.outroStart * sampleRate);
  const loopCrossfade = Math.min(Math.round(sampleRate * 0.04), Math.floor(loopLength / 4));
  const loopHop = Math.max(1, loopLength - loopCrossfade);
  const outroCrossfade = Math.min(Math.round(sampleRate * 0.04), noiseEnd - introLength, sourceLength - outroStart);

  return {
    plan,
    channels: channels.map((channel) => {
      const output = new Float32Array(outputLength);
      output.set(channel.subarray(0, introLength), 0);

      const noiseLength = Math.max(0, noiseEnd - introLength);
      const noise = new Float32Array(noiseLength);
      const weights = new Float32Array(noiseLength);
      for (let offset = 0; offset < noiseLength; offset += loopHop) {
        const writeLength = Math.min(loopLength, noiseLength - offset);
        for (let index = 0; index < writeLength; index += 1) {
          let weight = 1;
          if (offset > 0 && index < loopCrossfade) weight = index / Math.max(1, loopCrossfade);
          if (index >= loopLength - loopCrossfade) {
            weight = Math.min(weight, (loopLength - 1 - index) / Math.max(1, loopCrossfade));
          }
          const target = offset + index;
          noise[target] += channel[loopStart + index] * Math.max(0, weight);
          weights[target] += Math.max(0, weight);
        }
      }
      for (let index = 0; index < noiseLength; index += 1) {
        if (weights[index] > 0) noise[index] /= weights[index];
      }
      output.set(noise, introLength);

      const outro = channel.subarray(outroStart);
      output.set(outro, noiseEnd);
      for (let index = 0; index < outroCrossfade; index += 1) {
        const ratio = index / Math.max(1, outroCrossfade);
        output[noiseEnd - outroCrossfade + index] *= 1 - ratio;
        output[noiseEnd + index] *= ratio;
      }
      return output;
    }),
  };
}
