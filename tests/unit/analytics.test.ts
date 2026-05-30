import { describe, expect, it } from "vitest";
import { calculateDayAnalytics, calculateMonthAnalytics, calculateWeekAnalytics } from "../../src/main/analytics/analytics";
import type { DailyScores, Habit, HabitCheckin, TimeBlock, Todo } from "../../src/shared/types";

const now = "2026-05-28T00:00:00.000Z";
const habits: Habit[] = [
  habit("h1", "Sleep on time"),
  habit("h2", "Run")
];

describe("analytics", () => {
  it("scores minimum check-ins as half credit", () => {
    const checkins: HabitCheckin[] = [
      checkin("h1", "2026-05-01", "completed"),
      checkin("h2", "2026-05-01", "minimum")
    ];
    const result = calculateDayAnalytics({
      date: "2026-05-01",
      habits,
      checkins,
      todos: [todo("done"), todo("open")]
    });
    expect(result.completionPercentage).toBe(75);
    expect(result.todoCompletionPercentage).toBe(50);
  });

  it("builds per-habit monthly analysis", () => {
    const result = calculateMonthAnalytics({
      month: "2026-05",
      habits,
      checkins: [
        checkin("h1", "2026-05-01", "completed"),
        checkin("h1", "2026-05-02", "minimum"),
        checkin("h2", "2026-05-01", "missed")
      ],
      dailyScores: []
    });
    expect(result.totalHabitGoalCount).toBe(62);
    expect(result.perHabit.find((row) => row.habitId === "h1")?.actual).toBe(1.5);
  });

  it("flags high burnout risk from low sleep, low mood, and high stress", () => {
    const scores: DailyScores[] = [
      score("2026-05-25", 3, 3, 9, 6),
      score("2026-05-26", 4, 4, 8, 6)
    ];
    const blocks: TimeBlock[] = [
      block("2026-05-25", "08:30", "16:30", "School", "school"),
      block("2026-05-25", "17:00", "20:00", "Deep work", "deep work")
    ];
    const result = calculateWeekAnalytics({
      weekStart: "2026-05-25",
      habits,
      checkins: [],
      dailyScores: scores,
      blocks
    });
    expect(result.burnoutRisk).toBe("high");
  });
});

function habit(id: string, name: string): Habit {
  return {
    id,
    name,
    emoji: null,
    category: null,
    targetType: "boolean",
    targetValue: 1,
    minimumValue: 0.5,
    unit: "check",
    sortOrder: 0,
    active: true,
    createdAt: now,
    updatedAt: now
  };
}

function checkin(habitId: string, date: string, status: HabitCheckin["status"]): HabitCheckin {
  return {
    id: `${habitId}-${date}`,
    habitId,
    date,
    status,
    value: null,
    note: null,
    createdAt: now,
    updatedAt: now
  };
}

function todo(status: Todo["status"]): Todo {
  return {
    id: status,
    date: "2026-05-01",
    title: status,
    description: null,
    projectId: null,
    priority: "medium",
    status,
    estimatedMinutes: null,
    scheduledBlockId: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now
  };
}

function score(date: string, moodScore: number, energyScore: number, stressScore: number, sleepHours: number): DailyScores {
  return {
    id: date,
    date,
    moodScore,
    motivationScore: moodScore,
    energyScore,
    focusScore: energyScore,
    stressScore,
    sleepHours,
    journalNote: null,
    createdAt: now,
    updatedAt: now
  };
}

function block(date: string, startTime: string, endTime: string, title: string, category: string): TimeBlock {
  return {
    id: `${date}-${startTime}`,
    weekStartDate: "2026-05-25",
    date,
    startTime,
    endTime,
    title,
    category,
    projectId: null,
    habitId: null,
    todoId: null,
    isLocked: false,
    isRecurring: false,
    recurrenceRule: null,
    status: "planned",
    note: null,
    createdAt: now,
    updatedAt: now
  };
}
