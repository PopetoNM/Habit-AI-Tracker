// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCoachModelMessages,
  chooseCoachModel,
  streamCoachMessage,
} from "../../src/main/ai/coach";
import { HabitRepository } from "../../src/main/db/repository";
import type { ChatMessage, CoachContext } from "../../src/shared/types";

const cleanupDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of cleanupDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const settings = {
  activeModel: "missing-active",
  defaultModel: "missing-default",
  fallbackModel: "small-local",
  deepReviewModel: "large-local",
};

describe("chooseCoachModel", () => {
  it("falls back to an installed configured model when active is missing", () => {
    expect(chooseCoachModel(settings, ["small-local:latest"])).toEqual({
      model: "small-local:latest",
      installed: true,
      source: "fallback",
    });
  });

  it("uses the first installed model when configured models are missing", () => {
    expect(chooseCoachModel(settings, ["llama3.2:latest"])).toEqual({
      model: "llama3.2:latest",
      installed: true,
      source: "first_installed",
    });
  });
});

describe("buildCoachModelMessages", () => {
  it("keeps recent chat history and limits missing habits to the action catalog", () => {
    const messages = buildCoachModelMessages(coachContext(), [
      chat("m1", "user", "What should I build first?"),
      chat("m2", "assistant", "Ship the smallest working planner fix."),
      chat("m3", "user", "Now reply to this exact sentence"),
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messages.at(-1)?.content).toBe("Now reply to this exact sentence");
    expect(messages[1].content).toContain(
      "The habit catalog is for ID matching",
    );
    expect(messages[1].content).toContain('h2 "Sauna" [missing]');
    expect(messages[1].content).toContain("Morning focus block");
    expect(messages[1].content).toContain(
      'school-block 2026-05-29 08:30-16:30 "School"',
    );
    expect(messages[1].content).toContain('t3 2026-05-30 "Prepare schedule"');
  });

  it("keeps the normal coach prompt as the only assistant mode", () => {
    const messages = buildCoachModelMessages(coachContext(), []);

    expect(messages[0].content).toContain("local AI habit coach");
    expect(messages[0].content).not.toContain("JARVIS");
  });
});

describe("streamCoachMessage deterministic app control", () => {
  it("applies clear app actions even when Ollama is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Ollama offline")),
    );
    const repository = createRepository();
    repository.createHabit({
      name: "Run",
      emoji: null,
      category: "fitness",
      targetType: "duration",
      targetValue: 30,
      minimumValue: 10,
      unit: "minutes",
    });
    const sentEvents: Array<{ channel: string; payload: unknown }> = [];
    const window = {
      webContents: {
        send: (channel: string, payload: unknown) =>
          sentEvents.push({ channel, payload }),
      },
    } as unknown as BrowserWindow;

    const result = await streamCoachMessage({
      repository,
      window,
      message: "tick Run",
    });

    const run = repository.listHabits().find((habit) => habit.name === "Run");
    expect(run).toBeTruthy();
    expect(
      repository
        .listCheckins(
          repository.buildCoachContext("baseline").today.date,
          repository.buildCoachContext("baseline").today.date,
        )
        .find((checkin) => checkin.habitId === run?.id),
    ).toMatchObject({ status: "completed" });
    expect(result.assistantMessage?.content).toContain("Applied:");
    expect(sentEvents).toContainEqual(
      expect.objectContaining({ channel: "coach:done" }),
    );
    repository.db.close();
  });
});

function coachContext(): CoachContext {
  return {
    userProfileSummary: "The user is building a local habit app.",
    activeGoals: [],
    activeProjects: [],
    today: {
      date: "2026-05-29",
      habits: [
        { habitId: "h1", name: "Morning focus block", status: "completed" },
        { habitId: "h2", name: "Sauna", status: "missing" },
      ],
      todos: [
        todo("t1", "Fix coach chat", "open"),
        todo("t2", "Done task", "done"),
      ],
      scores: null,
      plannedBlocks: [],
    },
    currentWeek: {
      weekStart: "2026-05-25",
      completionRate: 52,
      deepWorkMinutes: 120,
      sportMinutes: 30,
      sleepAverage: 8,
      schoolStudyMinutes: 60,
      missPatterns: [],
      burnoutRisk: "low",
    },
    weekPlanner: {
      weekStartDate: "2026-05-25",
      blocks: [
        {
          id: "school-block",
          weekStartDate: "2026-05-25",
          date: "2026-05-29",
          startTime: "08:30",
          endTime: "16:30",
          title: "School",
          category: "school",
          isLocked: false,
          isRecurring: false,
          status: "planned",
          createdAt: "",
          updatedAt: "",
        },
      ],
      openTodos: [todo("t3", "Prepare schedule", "open", "2026-05-30")],
    },
    currentMonth: {
      overallCompletionPercentage: 61,
      topHabits: [],
      bottomHabits: [],
      streaks: {},
      moodTrend: "missing",
      motivationTrend: "missing",
    },
    missingData: [],
    userQuestion: "Now reply to this exact sentence",
  };
}

function chat(
  id: string,
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id,
    sessionId: "session-1",
    role,
    content,
    contextJson: null,
    createdAt: "2026-05-29T00:00:00.000Z",
  };
}

function todo(
  id: string,
  title: string,
  status: "open" | "done",
  date = "2026-05-29",
) {
  return {
    id,
    date,
    title,
    description: null,
    projectId: null,
    priority: "medium" as const,
    status,
    estimatedMinutes: null,
    scheduledBlockId: null,
    sortOrder: 0,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
  };
}

function createRepository(): HabitRepository {
  const dir = mkdtempSync(join(tmpdir(), "habit-coach-test-"));
  cleanupDirs.push(dir);
  return new HabitRepository(join(dir, "habit.sqlite"), join(dir, "backups"));
}
