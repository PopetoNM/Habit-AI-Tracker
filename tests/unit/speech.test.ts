import { describe, expect, it } from "vitest";
import { collectSpeechTranscript } from "../../src/renderer/src/coach/speech";
import {
  VOICE_SILENCE_DELAY_MS,
  formatLocalVoiceCaptureStatus,
  formatVoiceCaptureStatus,
  isLocalSilence,
  isLocalSpeechActivity,
} from "../../src/renderer/src/coach/voiceCapture";

describe("speech transcript helpers", () => {
  it("collects and normalizes the full recognition result list", () => {
    const transcript = collectSpeechTranscript({
      results: [
        { 0: { transcript: "  hello " }, isFinal: true },
        { 0: { transcript: " friend   " }, isFinal: false },
        { 0: { transcript: " keep listening " }, isFinal: false },
      ],
    });

    expect(transcript).toBe("hello friend keep listening");
  });
});

describe("voice capture silence window", () => {
  it("uses a 3 second silence delay", () => {
    expect(VOICE_SILENCE_DELAY_MS).toBe(3000);
  });

  it("detects speech and silence with separate thresholds", () => {
    expect(isLocalSpeechActivity(0.06)).toBe(true);
    expect(isLocalSpeechActivity(0.03)).toBe(false);
    expect(isLocalSilence(0.02)).toBe(true);
    expect(isLocalSilence(0.04)).toBe(false);
  });

  it("shows the user how the voice capture will finish", () => {
    expect(formatVoiceCaptureStatus("open my schedule")).toContain(
      "pause 3 seconds",
    );
    expect(formatLocalVoiceCaptureStatus(false)).toContain("Start talking");
    expect(formatLocalVoiceCaptureStatus(true)).toContain("Pause 3 seconds");
  });
});
