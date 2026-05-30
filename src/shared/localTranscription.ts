export const WHISPER_SAMPLE_RATE = 16_000;

export type AsrOutput = { text?: string } | Array<{ text?: string }>;

export function normalizeTranscript(result: AsrOutput): string {
  const text = Array.isArray(result)
    ? result.map((item) => item.text ?? "").join(" ")
    : (result.text ?? "");
  return text.replace(/\s+/g, " ").trim();
}

export function resampleAudio(
  samples: Float32Array,
  fromSampleRate: number,
  toSampleRate: number,
): Float32Array {
  if (fromSampleRate === toSampleRate) return new Float32Array(samples);
  if (samples.length === 0) return new Float32Array();
  const ratio = fromSampleRate / toSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const weight = sourceIndex - leftIndex;
    output[index] =
      samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
  }

  return output;
}

export function samplesToFloat32Array(samples: Float32Array | number[]) {
  return samples instanceof Float32Array
    ? new Float32Array(samples)
    : Float32Array.from(samples);
}
