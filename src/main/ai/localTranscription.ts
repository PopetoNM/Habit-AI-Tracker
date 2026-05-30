import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { TranscribeLocalAudioInput } from "../../shared/types";
import {
  normalizeTranscript,
  resampleAudio,
  samplesToFloat32Array,
  WHISPER_SAMPLE_RATE,
  type AsrOutput,
} from "../../shared/localTranscription";

const WHISPER_MODEL = "Xenova/whisper-tiny.en";

type AsrPipeline = {
  (
    audio: Float32Array,
    options?: WhisperTranscriptionOptions,
  ): Promise<AsrOutput>;
};

type WhisperTranscriptionOptions = {
  chunk_length_s: number;
  stride_length_s: number;
  language?: "english";
  task?: "transcribe";
};

let transcriberPromise: Promise<AsrPipeline> | null = null;

export function buildWhisperTranscriptionOptions(
  modelId = WHISPER_MODEL,
): WhisperTranscriptionOptions {
  const options = {
    chunk_length_s: 20,
    stride_length_s: 3,
  };
  if (isEnglishOnlyWhisperModel(modelId)) return options;
  return { ...options, language: "english", task: "transcribe" };
}

export async function transcribeAudioWithLocalWhisper(
  input: TranscribeLocalAudioInput,
  userDataPath: string,
): Promise<string> {
  const rawSamples = samplesToFloat32Array(input.samples);
  const samples =
    input.sampleRate === WHISPER_SAMPLE_RATE
      ? rawSamples
      : resampleAudio(rawSamples, input.sampleRate, WHISPER_SAMPLE_RATE);

  if (samples.length < WHISPER_SAMPLE_RATE / 5) {
    throw new Error("No speech detected. Hold the mic a little longer.");
  }

  const transcriber = await getTranscriber(userDataPath);
  const result = await transcriber(
    samples,
    buildWhisperTranscriptionOptions(WHISPER_MODEL),
  );
  const transcript = normalizeTranscript(result);
  if (!transcript) throw new Error("No speech detected.");
  return transcript;
}

export function resetLocalWhisperForTests(): void {
  transcriberPromise = null;
}

async function getTranscriber(userDataPath: string): Promise<AsrPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = import("@huggingface/transformers").then(
      async ({ env, pipeline }) => {
        const cacheDir = join(userDataPath, "transformers-cache");
        mkdirSync(cacheDir, { recursive: true });

        env.allowRemoteModels = true;
        env.allowLocalModels = false;
        env.useBrowserCache = false;
        env.useFSCache = true;
        env.cacheDir = cacheDir;

        const pipe = await pipeline(
          "automatic-speech-recognition",
          WHISPER_MODEL,
          { dtype: "q8" },
        );
        return pipe as unknown as AsrPipeline;
      },
    );
  }
  return transcriberPromise;
}

function isEnglishOnlyWhisperModel(modelId: string): boolean {
  return /(?:^|\/)whisper-[^/]+\.en(?:$|[:@])/.test(modelId);
}
