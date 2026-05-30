import { minutesFromTime, timeFromMinutes } from "../../../shared/dates";
import type { CreateTimeBlockInput, Habit, TimeBlock, Todo, WeekPlannerData } from "../../../shared/types";

export type PlannerProposal = CreateTimeBlockInput & {
  reason: string;
};

type OccupiedBlock = Pick<TimeBlock, "date" | "startTime" | "endTime">;

const MAX_PROPOSALS = 18;

export function generateCoachFillProposals(data: WeekPlannerData, habits: Habit[]): PlannerProposal[] {
  const occupied: OccupiedBlock[] = [...data.blocks];
  const proposals: PlannerProposal[] = [];

  for (const todo of data.todos.filter((item) => item.status === "open")) {
    const duration = clampDuration(todo.estimatedMinutes ?? 30);
    const startTime = findOpenSlot(todo.date, preferredTodoStart(todo), duration, data, occupied);
    if (!startTime) continue;
    const proposal = buildProposal(data.weekStartDate, todo.date, startTime, duration, todo.title, "todo", "Unscheduled task", {
      todoId: todo.id
    });
    proposals.push(proposal);
    occupied.push(proposal);
    if (proposals.length >= MAX_PROPOSALS) return proposals;
  }

  const priorityHabits = habits
    .filter((habit) => !/sleep/i.test(habit.name))
    .slice(0, 5);

  for (const date of data.days.slice(0, 5)) {
    for (const habit of priorityHabits) {
      if (data.blocks.some((block) => block.date === date && block.habitId === habit.id)) continue;
      const duration = clampDuration(habit.minimumValue ?? 25);
      const startTime = findOpenSlot(date, preferredHabitStart(habit), duration, data, occupied);
      if (!startTime) continue;
      const proposal = buildProposal(
        data.weekStartDate,
        date,
        startTime,
        duration,
        `${habit.emoji ?? ""} ${habit.name}`.trim(),
        habit.category ?? "habit",
        "Daily habit anchor",
        { habitId: habit.id }
      );
      proposals.push(proposal);
      occupied.push(proposal);
      if (proposals.length >= MAX_PROPOSALS) return proposals;
    }
  }

  return proposals;
}

function buildProposal(
  weekStartDate: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  title: string,
  category: string,
  reason: string,
  links: Partial<Pick<CreateTimeBlockInput, "todoId" | "habitId">> = {}
): PlannerProposal {
  return {
    weekStartDate,
    date,
    startTime,
    endTime: timeFromMinutes(minutesFromTime(startTime) + durationMinutes),
    title,
    category,
    reason,
    ...links
  };
}

function findOpenSlot(date: string, preferredStart: string, durationMinutes: number, data: WeekPlannerData, occupied: OccupiedBlock[]): string | null {
  const start = minutesFromTime(data.settings.visibleStartTime);
  const end = minutesFromTime(data.settings.visibleEndTime);
  const preferred = Math.max(start, roundToSlot(minutesFromTime(preferredStart), data.settings.slotMinutes));
  const candidates = [...range(preferred, end, data.settings.slotMinutes), ...range(start, preferred, data.settings.slotMinutes)];
  return candidates
    .filter((candidate) => candidate + durationMinutes <= end)
    .map(timeFromMinutes)
    .find((candidate) => !hasConflict(date, candidate, timeFromMinutes(minutesFromTime(candidate) + durationMinutes), occupied)) ?? null;
}

function hasConflict(date: string, startTime: string, endTime: string, occupied: OccupiedBlock[]): boolean {
  return occupied.some(
    (block) => block.date === date && minutesFromTime(block.startTime) < minutesFromTime(endTime) && minutesFromTime(block.endTime) > minutesFromTime(startTime)
  );
}

function preferredTodoStart(todo: Todo): string {
  if (todo.priority === "critical" || todo.priority === "high") return "17:00";
  return "18:30";
}

function preferredHabitStart(habit: Habit): string {
  const haystack = `${habit.name} ${habit.category ?? ""}`.toLowerCase();
  if (haystack.includes("wake") || haystack.includes("morning")) return "06:00";
  if (haystack.includes("run") || haystack.includes("sport") || haystack.includes("sauna")) return "17:00";
  if (haystack.includes("school") || haystack.includes("study")) return "16:30";
  if (haystack.includes("bible") || haystack.includes("prayer") || haystack.includes("faith")) return "07:00";
  if (haystack.includes("build") || haystack.includes("focus") || haystack.includes("ai")) return "18:00";
  return "19:00";
}

function clampDuration(minutes: number): number {
  return Math.max(15, Math.min(120, Math.round(minutes / 15) * 15));
}

function roundToSlot(minutes: number, slotMinutes: number): number {
  return Math.ceil(minutes / slotMinutes) * slotMinutes;
}

function range(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let cursor = start; cursor < end; cursor += step) values.push(cursor);
  return values;
}

