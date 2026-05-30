import { describe, expect, it } from "vitest";
import { generateCoachFillProposals } from "../../src/renderer/src/planner/coachFill";
import type { Habit, WeekPlannerData } from "../../src/shared/types";

describe("generateCoachFillProposals", () => {
  it("creates non-conflicting planner proposals from open todos and habits", () => {
    const proposals = generateCoachFillProposals(
      {
        weekStartDate: "2026-05-25",
        days: ["2026-05-25", "2026-05-26"],
        settings: {
          id: "settings",
          visibleStartTime: "05:00",
          visibleEndTime: "21:00",
          slotMinutes: 15,
          firstDayOfWeek: 1,
          createdAt: "",
          updatedAt: ""
        },
        blocks: [
          block("2026-05-25", "17:00", "17:30", "Existing", "school")
        ],
        todos: [
          {
            id: "todo-1",
            date: "2026-05-25",
            title: "Ship feature",
            priority: "high",
            status: "open",
            sortOrder: 0,
            createdAt: "",
            updatedAt: ""
          }
        ],
        templates: [],
        warnings: []
      },
      [habit("habit-1", "Morning focus block", "🎯", "deep work")]
    );

    expect(proposals.some((proposal) => proposal.title === "Ship feature")).toBe(true);
    expect(proposals.some((proposal) => proposal.habitId === "habit-1")).toBe(true);
    expect(proposals).not.toContainEqual(expect.objectContaining({ startTime: "17:00", date: "2026-05-25" }));
  });
});

function habit(id: string, name: string, emoji: string, category: string): Habit {
  return {
    id,
    name,
    emoji,
    category,
    targetType: "duration",
    targetValue: 90,
    minimumValue: 25,
    unit: "minutes",
    sortOrder: 0,
    active: true,
    createdAt: "",
    updatedAt: ""
  };
}

function block(date: string, startTime: string, endTime: string, title: string, category: string) {
  return {
    id: `${date}-${startTime}`,
    weekStartDate: "2026-05-25",
    date,
    startTime,
    endTime,
    title,
    category,
    isLocked: false,
    isRecurring: false,
    status: "planned" as const,
    createdAt: "",
    updatedAt: ""
  };
}

