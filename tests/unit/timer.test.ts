import { describe, expect, it } from "vitest";
import { formatTimerSeconds, timerProgress } from "../../src/renderer/src/focus/timer";

describe("focus timer helpers", () => {
  it("formats seconds as m:ss", () => {
    expect(formatTimerSeconds(3591)).toBe("59:51");
    expect(formatTimerSeconds(5)).toBe("0:05");
  });

  it("calculates countdown progress safely", () => {
    expect(timerProgress("timer", 30, 60)).toBe(0.5);
    expect(timerProgress("timer", 90, 60)).toBe(1);
    expect(timerProgress("stopwatch", 90, 0)).toBe(1);
  });
});

