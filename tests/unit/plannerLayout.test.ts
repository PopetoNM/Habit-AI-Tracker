import { describe, expect, it } from "vitest";
import { minutesFromTime } from "../../src/shared/dates";
import {
  blockSlotSpan,
  visiblePlannerSlotLabel,
} from "../../src/renderer/src/planner/layout";

describe("planner layout helpers", () => {
  it("shows only hourly labels in compact planner rows", () => {
    expect(visiblePlannerSlotLabel("08:00")).toBe("08:00");
    expect(visiblePlannerSlotLabel("08:15")).toBe("");
    expect(visiblePlannerSlotLabel("08:30")).toBe("");
  });

  it("calculates visual row span for long school blocks", () => {
    expect(
      blockSlotSpan({
        startTime: "08:30",
        endTime: "16:30",
        slotMinutes: 15,
        minutesFromTime,
      }),
    ).toBe(32);
  });
});
