import { z } from "zod";
import {
  addDays,
  minutesFromTime,
  startOfWeek,
  timeFromMinutes,
  weekDays,
} from "../../shared/dates";
import type {
  BlockStatus,
  CoachContext,
  Habit,
  HabitStatus,
  TimeBlock,
  Todo,
  TodoPriority,
  TodoStatus,
} from "../../shared/types";
import type { HabitRepository } from "../db/repository";
import { dateSchema, timeSchema } from "../ipc/schemas";

const ACTION_MARKER = "HABIT_OS_ACTIONS=";

const nullableString = z.string().nullable().optional();
const habitLookupSchema = z.object({
  habitId: z.string().min(1).optional(),
  habitName: z.string().min(1).optional(),
});
const blockLookupSchema = z.object({
  blockId: z.string().min(1).optional(),
  blockTitle: z.string().min(1).optional(),
});
const todoLookupSchema = z.object({
  todoId: z.string().min(1).optional(),
  todoTitle: z.string().min(1).optional(),
});

const coachActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("habit.check"),
      date: dateSchema.optional(),
      status: z.enum(["missed", "minimum", "completed"]).default("completed"),
      value: z.number().nullable().optional(),
      note: nullableString,
    })
    .merge(habitLookupSchema),
  z
    .object({
      type: z.literal("habit.clear"),
      date: dateSchema.optional(),
    })
    .merge(habitLookupSchema),
  z.object({
    type: z.literal("habit.create"),
    name: z.string().min(1),
    emoji: nullableString,
    category: nullableString,
    targetType: z.string().min(1).default("boolean"),
    targetValue: z.number().nullable().optional(),
    minimumValue: z.number().nullable().optional(),
    unit: nullableString,
  }),
  z
    .object({
      type: z.literal("habit.update"),
      name: z.string().min(1).optional(),
      emoji: nullableString,
      category: nullableString,
      targetType: z.string().min(1).optional(),
      targetValue: z.number().nullable().optional(),
      minimumValue: z.number().nullable().optional(),
      unit: nullableString,
      active: z.boolean().optional(),
    })
    .merge(habitLookupSchema),
  z.object({
    type: z.literal("schedule.create"),
    date: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    title: z.string().min(1),
    category: z.string().min(1).default("todo"),
    habitId: z.string().nullable().optional(),
    habitName: z.string().min(1).optional(),
    isLocked: z.boolean().optional(),
    note: nullableString,
  }),
  z
    .object({
      type: z.literal("schedule.update"),
      date: dateSchema.optional(),
      startTime: timeSchema.optional(),
      endTime: timeSchema.optional(),
      title: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      note: nullableString,
      status: z.enum(["planned", "done", "skipped"]).optional(),
    })
    .merge(blockLookupSchema),
  z
    .object({
      type: z.literal("schedule.delete"),
    })
    .merge(blockLookupSchema),
  z.object({
    type: z.literal("schedule.clear"),
    date: dateSchema.optional(),
    scope: z.enum(["day", "week"]).default("day"),
    mode: z.enum(["delete", "skip"]).default("delete"),
  }),
  z.object({
    type: z.literal("todo.create"),
    date: dateSchema.optional(),
    title: z.string().min(1),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    estimatedMinutes: z.number().int().positive().nullable().optional(),
  }),
  z
    .object({
      type: z.literal("todo.update"),
      date: dateSchema.optional(),
      title: z.string().min(1).optional(),
      status: z.enum(["open", "scheduled", "done", "skipped"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      estimatedMinutes: z.number().int().positive().nullable().optional(),
    })
    .merge(todoLookupSchema),
  z
    .object({
      type: z.literal("todo.delete"),
      date: dateSchema.optional(),
    })
    .merge(todoLookupSchema),
]);

export type CoachAction = z.infer<typeof coachActionSchema>;

export type ParsedCoachActions = {
  visibleContent: string;
  actions: CoachAction[];
  parseErrors: string[];
};

export type CoachActionResult = {
  applied: boolean;
  summary: string;
};

export function parseCoachActionResponse(content: string): ParsedCoachActions {
  const markerIndex = content.lastIndexOf(ACTION_MARKER);
  if (markerIndex < 0)
    return { visibleContent: content.trim(), actions: [], parseErrors: [] };

  const visibleContent = content.slice(0, markerIndex).trim();
  const actionText = content.slice(markerIndex + ACTION_MARKER.length).trim();
  const jsonText = extractJsonArray(actionText);
  if (!jsonText) {
    return {
      visibleContent,
      actions: [],
      parseErrors: ["Action marker was present, but no JSON array was found."],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      visibleContent,
      actions: [],
      parseErrors: [
        error instanceof Error
          ? `Action JSON parse failed: ${error.message}`
          : "Action JSON parse failed.",
      ],
    };
  }

  const arrayResult = z.array(z.unknown()).safeParse(parsed);
  if (!arrayResult.success) {
    return {
      visibleContent,
      actions: [],
      parseErrors: [
        `Action schema failed: ${arrayResult.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      ],
    };
  }

  const actions: CoachAction[] = [];
  const parseErrors: string[] = [];
  arrayResult.data.forEach((item, index) => {
    const result = coachActionSchema.safeParse(item);
    if (result.success) {
      actions.push(result.data);
      return;
    }
    parseErrors.push(
      `Skipped invalid action ${index + 1}: ${result.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  });

  return { visibleContent, actions, parseErrors };
}

export function isExplicitMutationRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return /\b(tick|check|complete|finish|mark|done|untick|uncheck|clear|free|fill|prepare|set|setup|add|create|new|rename|change|update|edit|move|reschedule|schedule|plan|delete|remove|hide|disable)\b/.test(
    lower,
  );
}

export function extractDeterministicCoachActions(
  message: string,
  context: CoachContext,
): CoachAction[] {
  if (!isExplicitMutationRequest(message)) return [];
  const actions: CoachAction[] = [];
  const lower = message.toLowerCase();
  const date = resolveNaturalDate(message, context.today.date);
  const targetHabit = findMentionedContextHabit(message, context);
  const targetTodo = findMentionedContextTodo(message, context);

  if (isScheduleClearRequest(lower)) {
    actions.push({
      type: "schedule.clear",
      date,
      scope: lower.includes("week") ? "week" : "day",
      mode: "delete",
    });
  }

  if (isSchedulePreparationRequest(lower)) {
    actions.push(
      ...buildPreparedScheduleActions({
        date,
        scope:
          lower.includes("week") || lower.includes("planner") ? "week" : "day",
        context,
      }),
    );
  }

  if (isAllHabitClearRequest(lower)) {
    for (const habit of context.today.habits) {
      actions.push({
        type: "habit.clear",
        habitId: habit.habitId,
        date,
      });
    }
  } else if (isAllHabitCheckRequest(lower)) {
    for (const habit of context.today.habits) {
      actions.push({
        type: "habit.check",
        habitId: habit.habitId,
        date,
        status: "completed",
      });
    }
  } else if (targetHabit && /\b(untick|uncheck|clear)\b/.test(lower)) {
    actions.push({
      type: "habit.clear",
      habitId: targetHabit.habitId,
      date,
    });
  } else if (targetHabit && /\b(tick|check|complete|mark|done)\b/.test(lower)) {
    actions.push({
      type: "habit.check",
      habitId: targetHabit.habitId,
      date,
      status: "completed",
    });
  }

  const renameMatch = message.match(
    /\b(?:rename|change|update|edit)\s+(?:habit\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i,
  );
  if (renameMatch) {
    const existingHabit = findContextHabitByName(renameMatch[1], context);
    const newName = cleanActionTitle(renameMatch[2]);
    if (existingHabit && newName) {
      actions.push({
        type: "habit.update",
        habitId: existingHabit.habitId,
        name: newName,
      });
    }
  }

  const habitHideMatch = message.match(
    /\b(?:delete|remove|hide|disable)\s+(?:the\s+)?(?:habit\s+)?(.+?)(?:\s+habit)?$/i,
  );
  if (habitHideMatch && !mentionsPlannerOrTodo(lower)) {
    const existingHabit = findContextHabitByName(habitHideMatch[1], context);
    if (existingHabit) {
      actions.push({
        type: "habit.update",
        habitId: existingHabit.habitId,
        active: false,
      });
    }
  }

  for (const name of extractHabitCreateNames(message)) {
    if (name && !findContextHabitByName(name, context)) {
      actions.push({
        type: "habit.create",
        name,
        targetType: "boolean",
      });
    }
  }

  const todoCreateTitle = extractTodoCreateTitle(message);
  if (todoCreateTitle) {
    actions.push({
      type: "todo.create",
      date,
      title: todoCreateTitle,
      priority: inferTodoPriority(lower),
    });
  }

  if (targetTodo && /\b(delete|remove)\b/.test(lower)) {
    actions.push({
      type: "todo.delete",
      todoId: targetTodo.id,
      date: targetTodo.date,
    });
  } else if (
    targetTodo &&
    /\b(complete|finish|mark|done|check)\b/.test(lower)
  ) {
    actions.push({
      type: "todo.update",
      todoId: targetTodo.id,
      date: targetTodo.date,
      status: "done",
    });
  }

  const scheduleMatch = message.match(
    /\b(?:schedule|plan|add|create)\s+(?:a\s+)?(?:block\s+)?(.+?)\s+(?:from\s+)?(\d{1,2}:\d{2})\s*(?:-|to|until)\s*(\d{1,2}:\d{2})/i,
  );
  if (scheduleMatch) {
    const startTime = normalizeTime(scheduleMatch[2]);
    const endTime = normalizeTime(scheduleMatch[3]);
    if (
      timeSchema.safeParse(startTime).success &&
      timeSchema.safeParse(endTime).success &&
      minutesFromTime(endTime) > minutesFromTime(startTime)
    ) {
      const title = cleanActionTitle(scheduleMatch[1]);
      actions.push({
        type: "schedule.create",
        date,
        startTime,
        endTime,
        title: title || "Focus block",
        category: inferCategory(title),
      });
    }
  }

  return dedupeActions(actions);
}

export function applyCoachActions(input: {
  repository: HabitRepository;
  context: CoachContext;
  actions: CoachAction[];
}): CoachActionResult[] {
  const results: CoachActionResult[] = [];
  for (const action of dedupeActions(input.actions)) {
    try {
      results.push(applyCoachAction(input.repository, input.context, action));
    } catch (error) {
      results.push({
        applied: false,
        summary:
          error instanceof Error
            ? error.message
            : `Skipped ${action.type}: unknown error.`,
      });
    }
  }
  return results;
}

export function appendActionSummary(
  content: string,
  results: CoachActionResult[],
  parseErrors: string[] = [],
): string {
  const applied = results.filter((result) => result.applied);
  const skipped = results.filter((result) => !result.applied);
  const lines: string[] = [];
  if (content.trim()) lines.push(content.trim());
  if (applied.length > 0) {
    lines.push(
      `Applied: ${applied.map((result) => result.summary).join("; ")}.`,
    );
  }
  if (skipped.length > 0 || parseErrors.length > 0) {
    lines.push(
      `Skipped: ${[...skipped.map((result) => result.summary), ...parseErrors].join("; ")}.`,
    );
  }
  return lines.join("\n\n").trim() || "Done.";
}

function applyCoachAction(
  repository: HabitRepository,
  context: CoachContext,
  action: CoachAction,
): CoachActionResult {
  if (action.type === "habit.create") {
    const existing = repository
      .listHabits()
      .find(
        (habit) => normalizeName(habit.name) === normalizeName(action.name),
      );
    if (existing) {
      return {
        applied: true,
        summary: `habit already exists: ${existing.name}`,
      };
    }
    const habit = repository.createHabit({
      name: action.name.trim(),
      emoji: action.emoji ?? null,
      category: action.category ?? "custom",
      targetType: action.targetType,
      targetValue: action.targetValue ?? null,
      minimumValue: action.minimumValue ?? null,
      unit: action.unit ?? null,
    });
    return { applied: true, summary: `created habit ${habit.name}` };
  }

  if (
    action.type === "habit.check" ||
    action.type === "habit.clear" ||
    action.type === "habit.update"
  ) {
    const habit = resolveHabit(repository.listHabits(), action);
    if (!habit) return { applied: false, summary: "habit was not found" };
    if (action.type === "habit.check") {
      const date = action.date ?? context.today.date;
      repository.setCheckin({
        habitId: habit.id,
        date,
        status: action.status as HabitStatus,
        value: action.value ?? null,
        note: action.note ?? null,
      });
      return {
        applied: true,
        summary: `ticked ${habit.name} for ${date}`,
      };
    }
    if (action.type === "habit.clear") {
      const date = action.date ?? context.today.date;
      repository.clearCheckin({ habitId: habit.id, date });
      return {
        applied: true,
        summary: `cleared ${habit.name} for ${date}`,
      };
    }
    const updated = repository.updateHabit(habit.id, {
      name: action.name,
      emoji: action.emoji,
      category: action.category,
      targetType: action.targetType,
      targetValue: action.targetValue,
      minimumValue: action.minimumValue,
      unit: action.unit,
      active: action.active,
    });
    return {
      applied: true,
      summary: `updated habit ${updated.name}`,
    };
  }

  if (action.type === "schedule.create") {
    if (minutesFromTime(action.endTime) <= minutesFromTime(action.startTime)) {
      return {
        applied: false,
        summary: `${action.title} has an invalid time range`,
      };
    }
    const appSettings = repository.getAppSettings();
    const duplicate = repository
      .listBlocksByDate(action.date)
      .find(
        (block) =>
          block.startTime === action.startTime &&
          block.endTime === action.endTime &&
          normalizeName(block.title) === normalizeName(action.title),
      );
    if (duplicate) {
      return {
        applied: true,
        summary: `already scheduled ${duplicate.title} ${duplicate.date} ${duplicate.startTime}-${duplicate.endTime}`,
      };
    }
    const habit = action.habitId
      ? resolveHabit(repository.listHabits(), {
          habitId: action.habitId,
          habitName: action.habitName,
        })
      : action.habitName
        ? resolveHabit(repository.listHabits(), { habitName: action.habitName })
        : null;
    const block = repository.createBlock({
      weekStartDate: startOfWeek(action.date, appSettings.firstDayOfWeek),
      date: action.date,
      startTime: action.startTime,
      endTime: action.endTime,
      title: action.title.trim(),
      category: action.category,
      habitId: habit?.id ?? action.habitId ?? null,
      isLocked: action.isLocked,
      note: action.note ?? null,
    });
    return {
      applied: true,
      summary: `scheduled ${block.title} ${block.date} ${block.startTime}-${block.endTime}`,
    };
  }

  if (action.type === "schedule.clear") {
    const appSettings = repository.getAppSettings();
    const date = action.date ?? context.today.date;
    const period =
      action.scope === "week"
        ? startOfWeek(date, appSettings.firstDayOfWeek)
        : date;
    const blocks =
      action.scope === "week"
        ? repository.listBlocksForWeek(period)
        : repository.listBlocksByDate(date);
    const editableBlocks = blocks.filter((block) => !block.isLocked);
    if (editableBlocks.length === 0) {
      return {
        applied: true,
        summary:
          blocks.length === 0
            ? `schedule already clear for ${action.scope === "week" ? `week of ${period}` : date}`
            : `no unlocked schedule blocks to clear for ${action.scope === "week" ? `week of ${period}` : date}`,
      };
    }
    for (const block of editableBlocks) {
      if (action.mode === "skip") {
        repository.updateBlock(block.id, { status: "skipped" });
      } else {
        repository.deleteBlock(block.id);
      }
    }
    return {
      applied: true,
      summary: `${action.mode === "skip" ? "skipped" : "cleared"} ${editableBlocks.length} schedule block${editableBlocks.length === 1 ? "" : "s"} for ${action.scope === "week" ? `week of ${period}` : date}`,
    };
  }

  if (
    action.type === "todo.create" ||
    action.type === "todo.update" ||
    action.type === "todo.delete"
  ) {
    const date = action.date ?? context.today.date;
    if (action.type === "todo.create") {
      const existing = repository
        .listTodosByDate(date)
        .find(
          (todo) => normalizeName(todo.title) === normalizeName(action.title),
        );
      if (existing) {
        return {
          applied: true,
          summary: `todo already exists: ${existing.title}`,
        };
      }
      const todo = repository.createTodo({
        date,
        title: cleanActionTitle(action.title),
        priority: action.priority as TodoPriority,
        estimatedMinutes: action.estimatedMinutes ?? null,
      });
      return {
        applied: true,
        summary: `created todo ${todo.title} for ${todo.date}`,
      };
    }

    const todo = resolveTodo(repository, context, action);
    if (!todo) return { applied: false, summary: "todo was not found" };
    if (action.type === "todo.delete") {
      repository.deleteTodo(todo.id);
      return { applied: true, summary: `deleted todo ${todo.title}` };
    }
    const updated = repository.updateTodo(todo.id, {
      title: action.title,
      status: action.status as TodoStatus | undefined,
      priority: action.priority as TodoPriority | undefined,
      estimatedMinutes: action.estimatedMinutes,
    });
    return {
      applied: true,
      summary: `updated todo ${updated.title}`,
    };
  }

  if (action.type === "schedule.delete" || action.type === "schedule.update") {
    const block = resolveBlock(repository, context, action);
    if (!block)
      return { applied: false, summary: "schedule block was not found" };
    if (action.type === "schedule.delete") {
      repository.deleteBlock(block.id);
      return { applied: true, summary: `deleted ${block.title}` };
    }

    const startTime = action.startTime ?? block.startTime;
    const endTime = action.endTime ?? block.endTime;
    if (minutesFromTime(endTime) <= minutesFromTime(startTime)) {
      return {
        applied: false,
        summary: `${block.title} has an invalid updated time range`,
      };
    }

    const updated = repository.updateBlock(block.id, {
      date: action.date,
      startTime: action.startTime,
      endTime: action.endTime,
      title: action.title,
      category: action.category,
      note: action.note,
      status: action.status as BlockStatus | undefined,
    });
    return {
      applied: true,
      summary: `updated ${updated.title}`,
    };
  }

  return { applied: false, summary: "unsupported action" };
}

function resolveHabit(
  habits: Habit[],
  lookup: { habitId?: string; habitName?: string },
): Habit | null {
  if (lookup.habitId) {
    const exact = habits.find((habit) => habit.id === lookup.habitId);
    if (exact) return exact;
  }
  if (!lookup.habitName) return null;
  const target = normalizeName(lookup.habitName);
  const exact = habits.find((habit) => normalizeName(habit.name) === target);
  if (exact) return exact;
  const candidates = habits.filter((habit) => {
    const normalized = normalizeName(habit.name);
    return normalized.includes(target) || target.includes(normalized);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function resolveBlock(
  repository: HabitRepository,
  context: CoachContext,
  lookup: { blockId?: string; blockTitle?: string },
): TimeBlock | null {
  const blocks = [
    ...context.weekPlanner.blocks,
    ...repository.listBlocksForWeek(context.weekPlanner.weekStartDate),
  ];
  if (lookup.blockId) {
    const exact = blocks.find((block) => block.id === lookup.blockId);
    if (exact) return exact;
  }
  if (!lookup.blockTitle) return null;
  const target = normalizeName(lookup.blockTitle);
  const exact = blocks.find((block) => normalizeName(block.title) === target);
  if (exact) return exact;
  const candidates = blocks.filter((block) => {
    const normalized = normalizeName(block.title);
    return normalized.includes(target) || target.includes(normalized);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function resolveTodo(
  repository: HabitRepository,
  context: CoachContext,
  lookup: { todoId?: string; todoTitle?: string; date?: string },
): Todo | null {
  const todos = [
    ...context.today.todos,
    ...context.weekPlanner.openTodos,
    ...(lookup.date ? repository.listTodosByDate(lookup.date) : []),
  ];
  if (lookup.todoId) {
    const exact = todos.find((todo) => todo.id === lookup.todoId);
    if (exact) return exact;
  }
  if (!lookup.todoTitle) return null;
  const target = normalizeName(lookup.todoTitle);
  const exact = todos.find((todo) => normalizeName(todo.title) === target);
  if (exact) return exact;
  const candidates = todos.filter((todo) => {
    const normalized = normalizeName(todo.title);
    return normalized.includes(target) || target.includes(normalized);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function isScheduleClearRequest(message: string): boolean {
  const hasScheduleTarget =
    /\b(schedule|planner|calendar|blocks?|time\s*blocks?|day|today|tomorrow|week)\b/.test(
      message,
    );
  const hasClearIntent =
    /\b(clear|free\s+up|empty|wipe|reset|delete|remove)\b/.test(message);
  return hasScheduleTarget && hasClearIntent;
}

function isSchedulePreparationRequest(message: string): boolean {
  const hasScheduleTarget =
    /\b(schedule|planner|calendar|timetable|day|week)\b/.test(message);
  const hasPrepareIntent = /\b(prepare|fill|set\s+up|setup|organize)\b/.test(
    message,
  );
  return hasScheduleTarget && hasPrepareIntent;
}

function isAllHabitCheckRequest(message: string): boolean {
  return (
    /\b(all|every|everything)\b/.test(message) &&
    /\b(habits?|routine|checks?)\b/.test(message) &&
    /\b(tick|check|complete|finish|mark|done)\b/.test(message)
  );
}

function isAllHabitClearRequest(message: string): boolean {
  return (
    /\b(all|every|everything)\b/.test(message) &&
    /\b(habits?|routine|checks?)\b/.test(message) &&
    /\b(untick|uncheck|clear|reset)\b/.test(message)
  );
}

function mentionsPlannerOrTodo(message: string): boolean {
  return /\b(schedule|planner|calendar|block|todo|to-do|task)\b/.test(message);
}

function findMentionedContextHabit(
  message: string,
  context: CoachContext,
): CoachContext["today"]["habits"][number] | null {
  const normalizedMessage = normalizeName(message);
  const candidates = context.today.habits.filter((habit) =>
    normalizedMessage.includes(normalizeName(habit.name)),
  );
  return candidates.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

function findMentionedContextTodo(
  message: string,
  context: CoachContext,
): Todo | null {
  if (
    !/\b(todo|to-do|task|complete|finish|done|delete|remove|check)\b/i.test(
      message,
    )
  )
    return null;
  const normalizedMessage = normalizeName(message);
  const todos = [...context.today.todos, ...context.weekPlanner.openTodos];
  const candidates = todos.filter((todo) =>
    normalizedMessage.includes(normalizeName(todo.title)),
  );
  return candidates.sort((a, b) => b.title.length - a.title.length)[0] ?? null;
}

function findContextHabitByName(
  name: string,
  context: CoachContext,
): CoachContext["today"]["habits"][number] | null {
  const normalized = normalizeName(name);
  return (
    context.today.habits.find(
      (habit) => normalizeName(habit.name) === normalized,
    ) ??
    context.today.habits.find((habit) =>
      normalizeName(habit.name).includes(normalized),
    ) ??
    null
  );
}

function resolveNaturalDate(message: string, today: string): string {
  const lower = message.toLowerCase();
  const explicitDate = message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (explicitDate && dateSchema.safeParse(explicitDate).success)
    return explicitDate;
  if (lower.includes("tomorrow")) return addDays(today, 1);
  if (lower.includes("yesterday")) return addDays(today, -1);
  return today;
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function dedupeActions(actions: CoachAction[]): CoachAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function normalizeTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function cleanActionTitle(value: string): string {
  return value
    .replace(/\b(today|tomorrow|yesterday)\b/gi, "")
    .replace(/\b(on|for|at|from)$/gi, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function extractHabitCreateNames(message: string): string[] {
  const match = message.match(
    /\b(?:add|create|new|set\s+up|setup)\s+(?:my\s+)?habits?(?:\s+(?:called|named|with|for))?\s+(.+)$/i,
  );
  if (!match) return [];
  return splitNaturalList(match[1])
    .map(cleanActionTitle)
    .filter((name) => name.length > 0 && name.split(/\s+/).length <= 5);
}

function extractTodoCreateTitle(message: string): string | null {
  const match = message.match(
    /\b(?:add|create|new)\s+(?:a\s+)?(?:todo|to-do|task)(?:\s+(?:called|named))?\s+(.+)$/i,
  );
  if (!match) return null;
  const title = cleanActionTitle(match[1]);
  return title || null;
}

function splitNaturalList(value: string): string[] {
  return value
    .split(/\s*(?:,|;|\/|\band\b|&)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferTodoPriority(message: string): TodoPriority {
  if (/\b(critical|urgent|asap)\b/.test(message)) return "critical";
  if (/\b(high|important)\b/.test(message)) return "high";
  if (/\b(low|minor|later)\b/.test(message)) return "low";
  return "medium";
}

function buildPreparedScheduleActions(input: {
  date: string;
  scope: "day" | "week";
  context: CoachContext;
}): CoachAction[] {
  const targetDates =
    input.scope === "week"
      ? weekDays(startOfWeek(input.date)).filter(
          (date) => date >= input.context.today.date,
        )
      : [input.date];
  return targetDates.flatMap((date) =>
    buildPreparedDayScheduleActions(date, input.context),
  );
}

function buildPreparedDayScheduleActions(
  date: string,
  context: CoachContext,
): CoachAction[] {
  const actions: CoachAction[] = [];
  let cursor = 9 * 60;
  const existing = context.weekPlanner.blocks.filter(
    (block) => block.date === date,
  );
  const openTodos = context.weekPlanner.openTodos
    .filter((todo) => todo.date === date)
    .slice(0, 3);
  const openHabits = context.today.habits
    .filter((habit) => habit.status === "missing")
    .slice(0, 3);

  for (const todo of openTodos) {
    const startTime = nextOpenStartTime(cursor, 45, existing, actions);
    actions.push({
      type: "schedule.create",
      date,
      startTime,
      endTime: timeFromMinutes(minutesFromTime(startTime) + 45),
      title: todo.title,
      category: inferCategory(todo.title),
    });
    cursor = minutesFromTime(startTime) + 60;
  }

  for (const habit of openHabits) {
    const startTime = nextOpenStartTime(cursor, 30, existing, actions);
    actions.push({
      type: "schedule.create",
      date,
      startTime,
      endTime: timeFromMinutes(minutesFromTime(startTime) + 30),
      title: habit.name,
      category: inferCategory(habit.name),
      habitId: habit.habitId,
    });
    cursor = minutesFromTime(startTime) + 45;
  }

  if (actions.length === 0) {
    actions.push({
      type: "schedule.create",
      date,
      startTime: "09:00",
      endTime: "09:15",
      title: "Plan day",
      category: "planning",
    });
  }
  return actions;
}

function nextOpenStartTime(
  preferredStart: number,
  duration: number,
  existing: TimeBlock[],
  proposed: CoachAction[],
): string {
  const existingRanges = existing.map((block) => ({
    start: minutesFromTime(block.startTime),
    end: minutesFromTime(block.endTime),
  }));
  const proposedRanges = proposed
    .filter(
      (action): action is Extract<CoachAction, { type: "schedule.create" }> =>
        action.type === "schedule.create",
    )
    .map((action) => ({
      start: minutesFromTime(action.startTime),
      end: minutesFromTime(action.endTime),
    }));
  for (
    let candidate = preferredStart;
    candidate + duration <= 21 * 60;
    candidate += 15
  ) {
    const end = candidate + duration;
    const overlaps = [...existingRanges, ...proposedRanges].some(
      (range) => candidate < range.end && end > range.start,
    );
    if (!overlaps) return timeFromMinutes(candidate);
  }
  return timeFromMinutes(preferredStart);
}

function inferCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("school") || lower.includes("study")) return "school";
  if (lower.includes("gym") || lower.includes("run") || lower.includes("sport"))
    return "sport";
  if (lower.includes("sleep")) return "sleep";
  if (lower.includes("bible") || lower.includes("prayer")) return "faith";
  if (lower.includes("focus") || lower.includes("build")) return "deep work";
  return "todo";
}
