import { daysInMonth, minutesFromTime, weekDays } from "../../shared/dates";
import type {
  BurnoutRisk,
  DailyScores,
  DayAnalytics,
  Habit,
  HabitAnalysisRow,
  HabitCheckin,
  MonthAnalytics,
  TimeBlock,
  Todo,
  WeekAnalytics
} from "../../shared/types";

const statusWeight = {
  missed: 0,
  minimum: 0.5,
  completed: 1
} as const;

export function calculateDayAnalytics(input: {
  date: string;
  habits: Habit[];
  checkins: HabitCheckin[];
  todos: Todo[];
  scores?: DailyScores | null;
}): DayAnalytics {
  const activeHabits = input.habits.filter((habit) => habit.active);
  const checkins = input.checkins.filter((checkin) => checkin.date === input.date);
  const completedHabits = checkins.filter((checkin) => checkin.status === "completed").length;
  const minimumHabits = checkins.filter((checkin) => checkin.status === "minimum").length;
  const missedHabits = Math.max(0, activeHabits.length - completedHabits - minimumHabits);
  const weighted = checkins.reduce((sum, checkin) => sum + statusWeight[checkin.status], 0);
  const completionPercentage = activeHabits.length ? Math.round((weighted / activeHabits.length) * 100) : 0;
  const todosForDay = input.todos.filter((todo) => todo.date === input.date);
  const doneTodos = todosForDay.filter((todo) => todo.status === "done").length;
  const todoCompletionPercentage = todosForDay.length ? Math.round((doneTodos / todosForDay.length) * 100) : 0;
  const mainBlockers: string[] = [];

  if ((input.scores?.sleepHours ?? 8) < 7) mainBlockers.push("Low sleep");
  if ((input.scores?.stressScore ?? 0) >= 8) mainBlockers.push("High stress");
  if (completionPercentage < 50 && activeHabits.length > 0) mainBlockers.push("Low habit completion");
  if (todosForDay.length > 0 && todoCompletionPercentage < 50) mainBlockers.push("Unfinished to-dos");

  return {
    date: input.date,
    completedHabits,
    minimumHabits,
    missedHabits,
    totalHabits: activeHabits.length,
    completionPercentage,
    todoCompletionPercentage,
    moodScore: input.scores?.moodScore,
    motivationScore: input.scores?.motivationScore,
    energyScore: input.scores?.energyScore,
    focusScore: input.scores?.focusScore,
    stressScore: input.scores?.stressScore,
    sleepHours: input.scores?.sleepHours,
    mainBlockers
  };
}

export function calculateMonthAnalytics(input: {
  month: string;
  habits: Habit[];
  checkins: HabitCheckin[];
  dailyScores: DailyScores[];
}): MonthAnalytics {
  const days = daysInMonth(input.month);
  const activeHabits = input.habits.filter((habit) => habit.active);
  const checkinByHabit = new Map<string, HabitCheckin[]>();

  for (const habit of activeHabits) checkinByHabit.set(habit.id, []);
  for (const checkin of input.checkins) {
    if (days.includes(checkin.date) && checkinByHabit.has(checkin.habitId)) {
      checkinByHabit.get(checkin.habitId)?.push(checkin);
    }
  }

  const perHabit: HabitAnalysisRow[] = activeHabits.map((habit) => {
    const habitCheckins = checkinByHabit.get(habit.id) ?? [];
    const completed = habitCheckins.filter((checkin) => checkin.status === "completed").length;
    const minimum = habitCheckins.filter((checkin) => checkin.status === "minimum").length;
    const actual = completed + minimum * 0.5;
    const goal = days.length;
    const left = Math.max(0, goal - actual);
    return {
      habitId: habit.id,
      habitName: habit.name,
      emoji: habit.emoji,
      goal,
      actual,
      minimum,
      missed: Math.max(0, days.length - completed - minimum),
      left,
      percentage: goal ? Math.round((actual / goal) * 100) : 0,
      streak: calculateCurrentStreak(days, habitCheckins)
    };
  });

  const completedCount = input.checkins.filter((checkin) => days.includes(checkin.date) && checkin.status === "completed")
    .length;
  const minimumCount = input.checkins.filter((checkin) => days.includes(checkin.date) && checkin.status === "minimum")
    .length;
  const totalHabitGoalCount = activeHabits.length * days.length;
  const weightedCompleted = completedCount + minimumCount * 0.5;
  const leftCount = Math.max(0, totalHabitGoalCount - weightedCompleted);
  const sorted = [...perHabit].sort((a, b) => b.percentage - a.percentage);

  return {
    month: input.month,
    totalHabitGoalCount,
    completedCount,
    minimumCount,
    leftCount,
    overallCompletionPercentage: totalHabitGoalCount
      ? Math.round((weightedCompleted / totalHabitGoalCount) * 100)
      : 0,
    perHabit,
    topHabits: sorted.slice(0, 10).map((row) => row.habitName),
    bottomHabits: sorted.slice(-5).reverse().map((row) => row.habitName),
    streaks: Object.fromEntries(perHabit.map((row) => [row.habitName, row.streak])),
    moodTrend: calculateTrend(input.dailyScores, "moodScore"),
    motivationTrend: calculateTrend(input.dailyScores, "motivationScore"),
    focusTrend: calculateTrend(input.dailyScores, "focusScore")
  };
}

export function calculateWeekAnalytics(input: {
  weekStart: string;
  habits: Habit[];
  checkins: HabitCheckin[];
  dailyScores: DailyScores[];
  blocks: TimeBlock[];
}): WeekAnalytics {
  const days = weekDays(input.weekStart);
  const activeHabits = input.habits.filter((habit) => habit.active);
  const weekCheckins = input.checkins.filter((checkin) => days.includes(checkin.date));
  const perHabit: HabitAnalysisRow[] = activeHabits.map((habit) => {
    const habitCheckins = weekCheckins.filter((checkin) => checkin.habitId === habit.id);
    const completed = habitCheckins.filter((checkin) => checkin.status === "completed").length;
    const minimum = habitCheckins.filter((checkin) => checkin.status === "minimum").length;
    const actual = completed + minimum * 0.5;
    return {
      habitId: habit.id,
      habitName: habit.name,
      emoji: habit.emoji,
      goal: days.length,
      actual,
      minimum,
      missed: Math.max(0, days.length - completed - minimum),
      left: Math.max(0, days.length - actual),
      percentage: Math.round((actual / days.length) * 100),
      streak: 0
    };
  });
  const weightedWeek = weekCheckins.reduce((sum, checkin) => sum + statusWeight[checkin.status], 0);
  const totalWeekGoal = activeHabits.length * days.length;
  const completionRate = totalWeekGoal ? Math.round((weightedWeek / totalWeekGoal) * 100) : 0;
  const sorted = [...perHabit].sort((a, b) => b.percentage - a.percentage);
  const dailyRates = days.map((date) => {
    const dayCheckins = input.checkins.filter((checkin) => checkin.date === date);
    const weighted = dayCheckins.reduce((sum, checkin) => sum + statusWeight[checkin.status], 0);
    return {
      date,
    rate: activeHabits.length ? Math.round((weighted / activeHabits.length) * 100) : 0
    };
  });
  const blocks = input.blocks.filter((block) => days.includes(block.date));
  const deepWorkMinutes = sumBlockMinutes(blocks, ["deep work", "build", "study", "ai"]);
  const sportMinutes = sumBlockMinutes(blocks, ["run", "sport", "sauna"]);
  const schoolStudyMinutes = sumBlockMinutes(blocks, ["school", "study", "homework"]);
  const sleepValues = input.dailyScores
    .filter((score) => days.includes(score.date) && typeof score.sleepHours === "number")
    .map((score) => Number(score.sleepHours));
  const sleepAverage = sleepValues.length
    ? Math.round((sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length) * 10) / 10
    : 0;

  return {
    weekStart: input.weekStart,
    completionRate,
    bestHabit: sorted[0]?.habitName,
    weakestHabit: sorted[sorted.length - 1]?.habitName,
    bestDay: [...dailyRates].sort((a, b) => b.rate - a.rate)[0]?.date,
    worstDay: [...dailyRates].sort((a, b) => a.rate - b.rate)[0]?.date,
    deepWorkMinutes,
    sportMinutes,
    sleepAverage,
    schoolStudyMinutes,
    missPatterns: detectMissPatterns(input.checkins, input.dailyScores, days),
    burnoutRisk: calculateBurnoutRisk({
      completionRate,
      dailyScores: input.dailyScores.filter((score) => days.includes(score.date)),
      blocks
    })
  };
}

function calculateCurrentStreak(days: string[], checkins: HabitCheckin[]): number {
  const statusByDate = new Map(checkins.map((checkin) => [checkin.date, checkin.status]));
  let streak = 0;
  for (const date of [...days].reverse()) {
    const status = statusByDate.get(date);
    if (status === "completed" || status === "minimum") streak += 1;
    else if (status === "missed") break;
  }
  return streak;
}

function calculateTrend(scores: DailyScores[], field: keyof Pick<DailyScores, "moodScore" | "motivationScore" | "focusScore">) {
  const values = scores
    .filter((score) => typeof score[field] === "number")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((score) => Number(score[field]));
  if (values.length < 3) return "missing" as const;
  const midpoint = Math.floor(values.length / 2);
  const first = average(values.slice(0, midpoint));
  const second = average(values.slice(midpoint));
  if (second - first > 0.5) return "up" as const;
  if (first - second > 0.5) return "down" as const;
  return "flat" as const;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumBlockMinutes(blocks: TimeBlock[], keywords: string[]): number {
  return blocks
    .filter((block) => {
      const haystack = `${block.title} ${block.category}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .reduce((sum, block) => sum + Math.max(0, minutesFromTime(block.endTime) - minutesFromTime(block.startTime)), 0);
}

function detectMissPatterns(checkins: HabitCheckin[], scores: DailyScores[], days: string[]): string[] {
  const patterns: string[] = [];
  const lowSleepDates = new Set(scores.filter((score) => (score.sleepHours ?? 8) < 7).map((score) => score.date));
  const missesAfterLowSleep = checkins.filter(
    (checkin) => days.includes(checkin.date) && checkin.status === "missed" && lowSleepDates.has(checkin.date)
  ).length;
  const weekendMisses = checkins.filter((checkin) => {
    if (!days.includes(checkin.date) || checkin.status !== "missed") return false;
    const day = new Date(`${checkin.date}T00:00:00`).getDay();
    return day === 0 || day === 6;
  }).length;
  if (missesAfterLowSleep >= 2) patterns.push("Habits drop after low sleep");
  if (weekendMisses >= 3) patterns.push("Weekend consistency is weaker");
  return patterns;
}

function calculateBurnoutRisk(input: {
  completionRate: number;
  dailyScores: DailyScores[];
  blocks: TimeBlock[];
}): BurnoutRisk {
  let score = 0;
  const moodAverage = average(input.dailyScores.map((item) => item.moodScore).filter(isNumber));
  const energyAverage = average(input.dailyScores.map((item) => item.energyScore).filter(isNumber));
  const stressAverage = average(input.dailyScores.map((item) => item.stressScore).filter(isNumber));
  const sleepAverage = average(input.dailyScores.map((item) => item.sleepHours).filter(isNumber));
  const plannedWorkMinutes = sumBlockMinutes(input.blocks, ["deep work", "build", "study", "school", "homework"]);

  if (moodAverage && moodAverage <= 4) score += 2;
  if (energyAverage && energyAverage <= 4) score += 2;
  if (stressAverage && stressAverage >= 8) score += 2;
  if (sleepAverage && sleepAverage < 7) score += 2;
  if (input.completionRate < 45) score += 1;
  if (plannedWorkMinutes > 2400) score += 1;

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
