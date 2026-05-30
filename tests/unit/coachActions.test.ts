// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCoachActions,
  extractDeterministicCoachActions,
  parseCoachActionResponse,
} from "../../src/main/ai/coachActions";
import { HabitRepository } from "../../src/main/db/repository";
import { startOfWeek } from "../../src/shared/dates";
import type { CoachContext } from "../../src/shared/types";

const cleanupDirs: string[] = [];

describe("coach action parsing and application", () => {
  afterEach(() => {
    for (const dir of cleanupDirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("parses visible text separately from validated actions", () => {
    const parsed = parseCoachActionResponse(
      'Done.\nHABIT_OS_ACTIONS=[{"type":"habit.check","habitName":"Run","date":"2026-05-30","status":"completed"}]',
    );

    expect(parsed.visibleContent).toBe("Done.");
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.actions).toEqual([
      {
        type: "habit.check",
        habitName: "Run",
        date: "2026-05-30",
        status: "completed",
      },
    ]);
  });

  it("keeps valid actions when a model emits one bad action", () => {
    const parsed = parseCoachActionResponse(
      'Done.\nHABIT_OS_ACTIONS=[{"type":"habit.check","habitName":"Run","date":"2026-05-30","status":"completed"},{"type":"habit.teleport","habitName":"Run"}]',
    );

    expect(parsed.actions).toEqual([
      {
        type: "habit.check",
        habitName: "Run",
        date: "2026-05-30",
        status: "completed",
      },
    ]);
    expect(parsed.parseErrors).toHaveLength(1);
    expect(parsed.parseErrors[0]).toContain("Skipped invalid action 2");
  });

  it("extracts simple tick commands without trusting model JSON", () => {
    const context = coachContext();

    expect(extractDeterministicCoachActions("tick run", context)).toEqual([
      {
        type: "habit.check",
        habitId: "run-habit",
        date: "2026-05-30",
        status: "completed",
      },
    ]);
  });

  it("extracts all-habit check commands without model JSON", () => {
    const context = coachContext();

    expect(
      extractDeterministicCoachActions("check all habits today", context),
    ).toEqual([
      {
        type: "habit.check",
        habitId: "run-habit",
        date: "2026-05-30",
        status: "completed",
      },
      {
        type: "habit.check",
        habitId: "study-habit",
        date: "2026-05-30",
        status: "completed",
      },
    ]);
  });

  it("extracts multiple habit creates and habit hide commands", () => {
    const context = coachContext();

    expect(
      extractDeterministicCoachActions(
        "set up habits cold shower, Bible reading and push ups",
        context,
      ),
    ).toEqual([
      { type: "habit.create", name: "cold shower", targetType: "boolean" },
      { type: "habit.create", name: "Bible reading", targetType: "boolean" },
      { type: "habit.create", name: "push ups", targetType: "boolean" },
    ]);

    expect(
      extractDeterministicCoachActions("hide habit study", context),
    ).toEqual([
      {
        type: "habit.update",
        habitId: "study-habit",
        active: false,
      },
    ]);
  });

  it("extracts free schedule commands without trusting model JSON", () => {
    const context = coachContext();

    expect(
      extractDeterministicCoachActions("free up my schedule today", context),
    ).toEqual([
      {
        type: "schedule.clear",
        date: "2026-05-30",
        scope: "day",
        mode: "delete",
      },
    ]);
  });

  it("extracts deterministic planner fill blocks", () => {
    const context = coachContext();

    const actions = extractDeterministicCoachActions(
      "prepare my schedule for 2026-06-01",
      context,
    );

    expect(actions).toContainEqual(
      expect.objectContaining({
        type: "schedule.create",
        date: "2026-06-01",
        title: "Run",
        category: "sport",
      }),
    );
    expect(
      actions.map((action) => "title" in action && action.title),
    ).not.toContain("School");
  });

  it("applies habit and schedule actions through repository methods", () => {
    const repository = createRepository();
    createRunHabit(repository);
    const context = repository.buildCoachContext("tick Run and plan study");
    const date = context.today.date;

    const results = applyCoachActions({
      repository,
      context,
      actions: [
        {
          type: "habit.check",
          habitName: "Run",
          date,
          status: "completed",
        },
        {
          type: "schedule.create",
          date,
          startTime: "17:00",
          endTime: "18:00",
          title: "Study block",
          category: "school",
        },
      ],
    });

    expect(results.every((result) => result.applied)).toBe(true);
    const run = repository.listHabits().find((habit) => habit.name === "Run");
    expect(
      repository
        .listCheckins(date, date)
        .find((checkin) => checkin.habitId === run?.id),
    ).toMatchObject({ status: "completed" });
    expect(repository.listBlocksByDate(date)).toContainEqual(
      expect.objectContaining({
        title: "Study block",
        startTime: "17:00",
        endTime: "18:00",
      }),
    );
    repository.db.close();
  });

  it("clears unlocked schedule blocks without deleting locked blocks", () => {
    const repository = createRepository();
    const context = repository.buildCoachContext("free up my schedule");
    const date = context.today.date;
    const weekStart = startOfWeek(
      date,
      repository.getAppSettings().firstDayOfWeek,
    );
    repository.createBlock({
      weekStartDate: weekStart,
      date,
      startTime: "16:00",
      endTime: "17:00",
      title: "Flexible build",
      category: "deep work",
    });
    repository.createBlock({
      weekStartDate: weekStart,
      date,
      startTime: "09:00",
      endTime: "15:00",
      title: "School",
      category: "school",
      isLocked: true,
    });

    const results = applyCoachActions({
      repository,
      context: repository.buildCoachContext("free up my schedule"),
      actions: [{ type: "schedule.clear", date, scope: "day", mode: "delete" }],
    });

    expect(results).toEqual([
      {
        applied: true,
        summary: `cleared 1 schedule block for ${date}`,
      },
    ]);
    expect(repository.listBlocksByDate(date)).toEqual([
      expect.objectContaining({ title: "School", isLocked: true }),
    ]);
    repository.db.close();
  });

  it("applies to-do commands through the repository", () => {
    const repository = createRepository();
    const date = repository.buildCoachContext("baseline").today.date;

    let context = repository.buildCoachContext("add todo Finish math");
    let results = applyCoachActions({
      repository,
      context,
      actions: extractDeterministicCoachActions(
        "add todo Finish math",
        context,
      ),
    });
    expect(results).toEqual([
      {
        applied: true,
        summary: `created todo Finish math for ${date}`,
      },
    ]);
    expect(repository.listTodosByDate(date)).toContainEqual(
      expect.objectContaining({ title: "Finish math", status: "open" }),
    );

    context = repository.buildCoachContext("complete todo Finish math");
    results = applyCoachActions({
      repository,
      context,
      actions: extractDeterministicCoachActions(
        "complete todo Finish math",
        context,
      ),
    });
    expect(results).toEqual([
      { applied: true, summary: "updated todo Finish math" },
    ]);
    expect(repository.listTodosByDate(date)).toContainEqual(
      expect.objectContaining({ title: "Finish math", status: "done" }),
    );

    context = repository.buildCoachContext("delete todo Finish math");
    results = applyCoachActions({
      repository,
      context,
      actions: extractDeterministicCoachActions(
        "delete todo Finish math",
        context,
      ),
    });
    expect(results).toEqual([
      { applied: true, summary: "deleted todo Finish math" },
    ]);
    expect(repository.listTodosByDate(date)).not.toContainEqual(
      expect.objectContaining({ title: "Finish math" }),
    );
    repository.db.close();
  });

  it("applies prepared schedules without duplicating blocks", () => {
    const repository = createRepository();
    const message = "prepare my schedule for 2026-06-01";
    const context = repository.buildCoachContext(message);
    const actions = extractDeterministicCoachActions(message, context);

    applyCoachActions({ repository, context, actions });
    const firstCount = repository.listBlocksByDate("2026-06-01").length;
    const results = applyCoachActions({
      repository,
      context: repository.buildCoachContext(message),
      actions,
    });

    expect(repository.listBlocksByDate("2026-06-01")).toHaveLength(firstCount);
    expect(results).toContainEqual(
      expect.objectContaining({
        applied: true,
        summary: expect.stringContaining("already scheduled Plan day"),
      }),
    );
    repository.db.close();
  });

  it("keeps manual and coach mutation entry points equivalent", () => {
    const manual = createRepository();
    const coach = createRepository();
    createRunHabit(manual);
    createRunHabit(coach);
    const manualContext = manual.buildCoachContext("manual baseline");
    const coachContextValue = coach.buildCoachContext("coach baseline");
    const date = manualContext.today.date;
    const manualRun = manual.listHabits().find((habit) => habit.name === "Run");
    expect(manualRun).toBeTruthy();

    manual.setCheckin({
      habitId: manualRun!.id,
      date,
      status: "completed",
    });
    manual.createBlock({
      weekStartDate: startOfWeek(date, manual.getAppSettings().firstDayOfWeek),
      date,
      startTime: "18:00",
      endTime: "19:00",
      title: "Deep work",
      category: "deep work",
    });

    applyCoachActions({
      repository: coach,
      context: coachContextValue,
      actions: [
        {
          type: "habit.check",
          habitName: "Run",
          date,
          status: "completed",
        },
        {
          type: "schedule.create",
          date,
          startTime: "18:00",
          endTime: "19:00",
          title: "Deep work",
          category: "deep work",
        },
      ],
    });

    expect(normalizedDay(manual, date)).toEqual(normalizedDay(coach, date));
    manual.db.close();
    coach.db.close();
  });
});

function coachContext(): CoachContext {
  return {
    userProfileSummary: "",
    activeGoals: [],
    activeProjects: [],
    today: {
      date: "2026-05-30",
      habits: [
        { habitId: "run-habit", name: "Run", status: "missing" },
        { habitId: "study-habit", name: "Study", status: "missing" },
      ],
      todos: [],
      scores: null,
      plannedBlocks: [],
    },
    currentWeek: {
      weekStart: "2026-05-25",
      completionRate: 0,
      bestHabit: undefined,
      weakestHabit: undefined,
      bestDay: undefined,
      worstDay: undefined,
      deepWorkMinutes: 0,
      sportMinutes: 0,
      sleepAverage: 0,
      schoolStudyMinutes: 0,
      missPatterns: [],
      burnoutRisk: "low",
    },
    weekPlanner: {
      weekStartDate: "2026-05-25",
      blocks: [],
      openTodos: [],
    },
    currentMonth: {
      overallCompletionPercentage: 0,
      topHabits: [],
      bottomHabits: [],
      streaks: {},
      moodTrend: "missing",
      motivationTrend: "missing",
    },
    missingData: [],
    userQuestion: "tick run",
  };
}

function createRepository(): HabitRepository {
  const dir = mkdtempSync(join(tmpdir(), "habit-coach-actions-test-"));
  cleanupDirs.push(dir);
  return new HabitRepository(join(dir, "habit.sqlite"), join(dir, "backups"));
}

function createRunHabit(repository: HabitRepository) {
  return repository.createHabit({
    name: "Run",
    emoji: null,
    category: "sport",
    targetType: "duration",
    targetValue: 30,
    minimumValue: 10,
    unit: "minutes",
  });
}

function normalizedDay(repository: HabitRepository, date: string) {
  return {
    checkins: repository
      .listCheckins(date, date)
      .map((checkin) => {
        const habit = repository.getHabit(checkin.habitId);
        return {
          habit: habit.name,
          date: checkin.date,
          status: checkin.status,
        };
      })
      .sort((a, b) => a.habit.localeCompare(b.habit)),
    blocks: repository
      .listBlocksByDate(date)
      .map((block) => ({
        date: block.date,
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        category: block.category,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  };
}
