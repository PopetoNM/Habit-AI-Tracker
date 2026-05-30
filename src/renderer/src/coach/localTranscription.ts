import type { TranscribeLocalAudioInput } from "../../../shared/types";
import type { CapturedAudio } from "./audioCapture";
import {
  resampleAudio,
  WHISPER_SAMPLE_RATE,
} from "../../../shared/localTranscription";

export {
  normalizeTranscript,
  resampleAudio,
  WHISPER_SAMPLE_RATE,
} from "../../../shared/localTranscription";

export function prepareAudioForLocalTranscription(
  audio: CapturedAudio,
): TranscribeLocalAudioInput {
  const samples = resampleAudio(
    audio.samples,
    audio.sampleRate,
    WHISPER_SAMPLE_RATE,
  );
  if (samples.length < WHISPER_SAMPLE_RATE / 5) {
    throw new Error("No speech detected. Hold the mic a little longer.");
  }
  return {
    sampleRate: WHISPER_SAMPLE_RATE,
    samples: Array.from(samples),
  };
}
