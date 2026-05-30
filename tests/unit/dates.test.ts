import { describe, expect, it } from "vitest";
import { buildTimeSlots, daysInMonth, startOfWeek, timeFromMinutes } from "../../src/shared/dates";

describe("date utilities", () => {
  it("renders leap-year February correctly", () => {
    expect(daysInMonth("2024-02")).toHaveLength(29);
    expect(daysInMonth("2025-02")).toHaveLength(28);
  });

  it("calculates Monday week starts", () => {
    expect(startOfWeek("2026-05-28", 1)).toBe("2026-05-25");
  });

  it("builds stable planner time slots", () => {
    expect(buildTimeSlots("05:00", "06:00", 15)).toEqual(["05:00", "05:15", "05:30", "05:45"]);
    expect(timeFromMinutes(20 * 60 + 30)).toBe("20:30");
  });
});
