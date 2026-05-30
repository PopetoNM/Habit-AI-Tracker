import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }, "Invalid calendar date");
export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((value) => {
    const [, month] = value.split("-").map(Number);
    return month >= 1 && month <= 12;
  }, "Invalid month");
export const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }, "Invalid time");
export const idSchema = z.string().min(1);

const minutesFromSchemaTime = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const createHabitSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  targetType: z.string().min(1).default("boolean"),
  targetValue: z.number().nullable().optional(),
  minimumValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

export const updateHabitSchema = createHabitSchema.partial().extend({
  active: z.boolean().optional(),
});

export const setCheckinSchema = z.object({
  habitId: idSchema,
  date: dateSchema,
  status: z.enum(["missed", "minimum", "completed"]),
  value: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const createTodoSchema = z.object({
  date: dateSchema,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "scheduled", "done", "skipped"]).optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  scheduledBlockId: z.string().nullable().optional(),
});

export const dailyScoresSchema = z.object({
  date: dateSchema,
  moodScore: z.number().int().min(1).max(10).nullable().optional(),
  motivationScore: z.number().int().min(1).max(10).nullable().optional(),
  energyScore: z.number().int().min(1).max(10).nullable().optional(),
  focusScore: z.number().int().min(1).max(10).nullable().optional(),
  stressScore: z.number().int().min(1).max(10).nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  journalNote: z.string().nullable().optional(),
});

const blockBaseSchema = z.object({
  weekStartDate: dateSchema,
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  title: z.string().min(1),
  category: z.string().min(1),
  projectId: z.string().nullable().optional(),
  habitId: z.string().nullable().optional(),
  todoId: z.string().nullable().optional(),
  isLocked: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const createBlockSchema = blockBaseSchema.refine(
  (input) =>
    minutesFromSchemaTime(input.endTime) >
    minutesFromSchemaTime(input.startTime),
  {
    message: "endTime must be after startTime",
    path: ["endTime"],
  },
);

export const updateBlockSchema = blockBaseSchema
  .omit({ weekStartDate: true })
  .partial()
  .extend({
    status: z.enum(["planned", "done", "skipped"]).optional(),
  })
  .refine(
    (input) =>
      !input.startTime ||
      !input.endTime ||
      minutesFromSchemaTime(input.endTime) >
        minutesFromSchemaTime(input.startTime),
    {
      message: "endTime must be after startTime",
      path: ["endTime"],
    },
  );

export const saveTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  weekStartDate: dateSchema,
});

export const updateProfileSchema = z.object({
  rawContent: z.string().optional(),
  structuredJson: z.string().optional(),
});

export const coachMessageSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1),
  quickAction: z.string().optional(),
});

export const transcribeLocalAudioSchema = z.object({
  sampleRate: z.number().int().positive().max(192_000),
  samples: z
    .array(z.number().finite().min(-1).max(1))
    .min(3_200, "No speech detected. Hold the mic a little longer.")
    .max(16_000 * 180, "Voice recordings are limited to 3 minutes."),
});

export const setAiModelSchema = z.object({
  activeModel: z.string().min(1),
});

export const updateAppSettingsSchema = z.object({
  timezone: z.string().min(1).optional(),
  firstDayOfWeek: z.number().int().min(0).max(6).optional(),
  theme: z.literal("spreadsheet").optional(),
  defaultDashboardPage: z.enum(["dashboard", "planner"]).optional(),
  backupFolderPath: z.string().nullable().optional(),
});

export const createBackupSchema = z
  .object({
    kind: z.enum(["manual", "automatic", "pre_migration"]).optional(),
  })
  .optional();

export const restoreBackupSchema = z.object({
  filePath: z.string().min(1),
});

export const startFocusSessionSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().nullable().optional(),
  habitId: z.string().nullable().optional(),
  todoId: z.string().nullable().optional(),
  plannedMinutes: z.number().int().positive().nullable().optional(),
});

export const endFocusSessionSchema = z.object({
  outputProduced: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  distractionsCount: z.number().int().min(0).optional(),
});

export const upsertDistractionLogSchema = z.object({
  date: dateSchema,
  socialMediaMinutes: z.number().int().min(0).optional(),
  junkFood: z.boolean().optional(),
  mainDistraction: z.string().nullable().optional(),
  trigger: z.string().nullable().optional(),
  fixForTomorrow: z.string().nullable().optional(),
});
