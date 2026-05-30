export type FocusMode = "timer" | "stopwatch";

export function formatTimerSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function timerProgress(mode: FocusMode, elapsedSeconds: number, durationSeconds: number): number {
  if (mode === "stopwatch") return 1;
  if (durationSeconds <= 0) return 0;
  return Math.max(0, Math.min(1, elapsedSeconds / durationSeconds));
}

