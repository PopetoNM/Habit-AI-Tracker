import { describe, expect, it } from "vitest";
import {
  buildCapturedAudio,
  encodeWav,
  mergeAudioChunks,
} from "../../src/renderer/src/coach/audioCapture";

describe("audio capture helpers", () => {
  it("merges chunks and encodes a mono 16-bit WAV file", () => {
    const samples = mergeAudioChunks([
      new Float32Array([0, 0.5]),
      new Float32Array([-1, 1]),
    ]);
    const wav = encodeWav(samples, 16_000);
    const view = new DataView(wav);
    const ascii = (offset: number, length: number) =>
      Array.from({ length }, (_, index) =>
        String.fromCharCode(view.getUint8(offset + index)),
      ).join("");

    expect(Array.from(samples)).toEqual([0, 0.5, -1, 1]);
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
  });

  it("preserves raw samples and sample rate for local transcription", () => {
    const captured = buildCapturedAudio(
      [new Float32Array([0.25, -0.25])],
      48_000,
    );

    expect(Array.from(captured.samples)).toEqual([0.25, -0.25]);
    expect(captured.sampleRate).toBe(48_000);
    expect(captured.wav.byteLength).toBe(48);
  });
});
