import { describe, expect, it } from "vitest";
import {
  normalizeTranscript,
  prepareAudioForLocalTranscription,
  resampleAudio,
  WHISPER_SAMPLE_RATE,
} from "../../src/renderer/src/coach/localTranscription";

describe("local transcription helpers", () => {
  it("resamples microphone PCM to the Whisper input rate", () => {
    const input = new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.5]);
    const resampled = resampleAudio(input, 48_000, WHISPER_SAMPLE_RATE);

    expect(resampled.length).toBe(2);
    expect(Array.from(resampled)).toEqual([0, 0.75]);
  });

  it("normalizes single and chunked ASR outputs", () => {
    expect(normalizeTranscript({ text: "  hello   friend  " })).toBe(
      "hello friend",
    );
    expect(
      normalizeTranscript([{ text: " hello " }, { text: "  coach" }]),
    ).toBe("hello coach");
  });

  it("prepares captured audio for the main-process transcription IPC", () => {
    const input = prepareAudioForLocalTranscription({
      samples: new Float32Array(9_600).fill(0.25),
      sampleRate: 48_000,
      wav: new ArrayBuffer(0),
    });

    expect(input.sampleRate).toBe(WHISPER_SAMPLE_RATE);
    expect(input.samples).toHaveLength(3_200);
    expect(input.samples[0]).toBe(0.25);
  });
});
