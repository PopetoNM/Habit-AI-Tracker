export const VOICE_SILENCE_DELAY_MS = 3000;

const LOCAL_SPEECH_LEVEL_THRESHOLD = 0.05;
const LOCAL_SILENCE_LEVEL_THRESHOLD = 0.025;

export function isLocalSpeechActivity(level: number): boolean {
  return level >= LOCAL_SPEECH_LEVEL_THRESHOLD;
}

export function isLocalSilence(level: number): boolean {
  return level <= LOCAL_SILENCE_LEVEL_THRESHOLD;
}

export function formatVoiceCaptureStatus(transcript: string): string {
  const normalized = transcript.trim();
  return normalized
    ? `Heard: ${normalized} (pause 3 seconds to send)`
    : "Listening. Pause 3 seconds after speaking to send.";
}

export function formatLocalVoiceCaptureStatus(speechDetected: boolean): string {
  return speechDetected
    ? "Recording. Pause 3 seconds to transcribe."
    : "Recording. Start talking, then pause 3 seconds to transcribe.";
}
