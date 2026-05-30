import { describe, expect, it } from "vitest";
import { buildWhisperTranscriptionOptions } from "../../src/main/ai/localTranscription";

describe("main-process local transcription", () => {
  it("does not pass task or language to the English-only Whisper model", () => {
    const options = buildWhisperTranscriptionOptions(
      "Xenova/whisper-tiny.en",
    ) as Record<string, unknown>;

    expect(options).toMatchObject({
      chunk_length_s: 20,
      stride_length_s: 3,
    });
    expect(Object.hasOwn(options, "task")).toBe(false);
    expect(Object.hasOwn(options, "language")).toBe(false);
  });

  it("keeps explicit generation intent for multilingual Whisper models", () => {
    expect(buildWhisperTranscriptionOptions("Xenova/whisper-tiny")).toEqual({
      chunk_length_s: 20,
      stride_length_s: 3,
      language: "english",
      task: "transcribe",
    });
  });
});
