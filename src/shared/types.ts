export type HabitStatus = "missed" | "minimum" | "completed";
export type TodoStatus = "open" | "scheduled" | "done" | "skipped";
export type TodoPriority = "low" | "medium" | "high" | "critical";
export type BlockStatus = "planned" | "done" | "skipped";
export type BurnoutRisk = "low" | "medium" | "high";

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: string;
  title: string;
  description?: string | null;
  why?: string | null;
  targetValue?: string | null;
  targetDate?: string | null;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Habit = {
  id: string;
  name: string;
  emoji?: string | null;
  category?: string | null;
  targetType: string;
  targetValue?: number | null;
  minimumValue?: number | null;
  unit?: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HabitCheckin = {
  id: string;
  habitId: string;
  date: string;
  status: HabitStatus;
  value?: number | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyScores = {
  id: string;
  date: string;
  moodScore?: number | null;
  motivationScore?: number | null;
  energyScore?: number | null;
  focusScore?: number | null;
  stressScore?: number | null;
  sleepHours?: number | null;
  journalNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Todo = {
  id: string;
  date: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  estimatedMinutes?: number | null;
  scheduledBlockId?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PlannerSettings = {
  id: string;
  visibleStartTime: string;
  visibleEndTime: string;
  slotMinutes: number;
  firstDayOfWeek: number;
  createdAt: string;
  updatedAt: string;
};

export type TimeBlock = {
  id: string;
  weekStartDate: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: string;
  projectId?: string | null;
  habitId?: string | null;
  todoId?: string | null;
  isLocked: boolean;
  isRecurring: boolean;
  recurrenceRule?: string | null;
  status: BlockStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlannerTemplate = {
  id: string;
  name: string;
  description?: string | null;
  templateJson: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  contextJson?: string | null;
  createdAt: string;
};

export type CoachHistory = {
  session: ChatSession;
  messages: ChatMessage[];
};

export type TranscribeLocalAudioInput = {
  sampleRate: number;
  samples: number[];
};

export type AppSettings = {
  id: string;
  timezone: string;
  firstDayOfWeek: number;
  theme: "spreadsheet";
  defaultDashboardPage: "dashboard" | "planner";
  backupFolderPath?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiSettings = {
  id: string;
  defaultModel: string;
  deepReviewModel?: string | null;
  fallbackModel?: string | null;
  activeModel: string;
  ollamaBaseUrl: string;
  streamEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BackupMetadata = {
  id: string;
  filePath: string;
  kind: "manual" | "automatic" | "pre_migration";
  sizeBytes?: number | null;
  appVersion?: string | null;
  createdAt: string;
};

export type FocusSession = {
  id: string;
  projectId?: string | null;
  habitId?: string | null;
  todoId?: string | null;
  title: string;
  startedAt: string;
  endedAt?: string | null;
  plannedMinutes?: number | null;
  actualMinutes?: number | null;
  distractionsCount: number;
  outputProduced?: string | null;
  nextAction?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DistractionLog = {
  id: string;
  date: string;
  socialMediaMinutes: number;
  junkFood: boolean;
  mainDistraction?: string | null;
  trigger?: string | null;
  fixForTomorrow?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DayAnalytics = {
  date: string;
  completedHabits: number;
  minimumHabits: number;
  missedHabits: number;
  totalHabits: number;
  completionPercentage: number;
  todoCompletionPercentage: number;
  moodScore?: number | null;
  motivationScore?: number | null;
  energyScore?: number | null;
  focusScore?: number | null;
  stressScore?: number | null;
  sleepHours?: number | null;
  mainBlockers: string[];
};

export type WeekAnalytics = {
  weekStart: string;
  completionRate: number;
  bestHabit?: string;
  weakestHabit?: string;
  bestDay?: string;
  worstDay?: string;
  deepWorkMinutes: number;
  sportMinutes: number;
  sleepAverage: number;
  schoolStudyMinutes: number;
  missPatterns: string[];
  burnoutRisk: BurnoutRisk;
};

export type HabitAnalysisRow = {
  habitId: string;
  habitName: string;
  emoji?: string | null;
  goal: number;
  actual: number;
  minimum: number;
  missed: number;
  left: number;
  percentage: number;
  streak: number;
};

export type MonthAnalytics = {
  month: string;
  totalHabitGoalCount: number;
  completedCount: number;
  minimumCount: number;
  leftCount: number;
  overallCompletionPercentage: number;
  perHabit: HabitAnalysisRow[];
  topHabits: string[];
  bottomHabits: string[];
  streaks: Record<string, number>;
  moodTrend: "up" | "down" | "flat" | "missing";
  motivationTrend: "up" | "down" | "flat" | "missing";
  focusTrend: "up" | "down" | "flat" | "missing";
};

export type DashboardMonth = {
  month: string;
  year: number;
  monthIndex: number;
  days: string[];
  habits: Habit[];
  checkins: HabitCheckin[];
  dailyScores: DailyScores[];
  analytics: MonthAnalytics;
};

export type TodaySummary = {
  date: string;
  habits: Habit[];
  checkins: HabitCheckin[];
  todos: Todo[];
  scores?: DailyScores | null;
  plannedBlocks: TimeBlock[];
  analytics: DayAnalytics;
};

export type WeekPlannerData = {
  weekStartDate: string;
  days: string[];
  settings: PlannerSettings;
  blocks: TimeBlock[];
  todos: Todo[];
  templates: PlannerTemplate[];
  warnings: PlannerWarning[];
};

export type PlannerWarning = {
  id: string;
  severity: "info" | "warning" | "danger";
  message: string;
  blockIds?: string[];
};

export type ProfileSummary = {
  rawContent: string;
  structuredJson?: string | null;
};

export type OllamaHealth = {
  available: boolean;
  baseUrl: string;
  activeModel: string;
  message: string;
};

export type ModelStatus = {
  name: string;
  installed: boolean;
  role: "default" | "deep_review" | "fallback" | "installed";
  active?: boolean;
};

export type CoachContext = {
  userProfileSummary: string;
  activeGoals: Goal[];
  activeProjects: Project[];
  today: {
    date: string;
    habits: Array<{
      habitId: string;
      name: string;
      status: HabitStatus | "missing";
    }>;
    todos: Todo[];
    scores?: DailyScores | null;
    plannedBlocks: TimeBlock[];
  };
  currentWeek: WeekAnalytics;
  weekPlanner: {
    weekStartDate: string;
    blocks: TimeBlock[];
    openTodos: Todo[];
  };
  currentMonth: Pick<
    MonthAnalytics,
    | "overallCompletionPercentage"
    | "topHabits"
    | "bottomHabits"
    | "streaks"
    | "moodTrend"
    | "motivationTrend"
  >;
  missingData: string[];
  userQuestion: string;
};

export type CreateHabitInput = Pick<
  Habit,
  | "name"
  | "emoji"
  | "category"
  | "targetType"
  | "targetValue"
  | "minimumValue"
  | "unit"
>;
export type UpdateHabitInput = Partial<CreateHabitInput> & { active?: boolean };
export type SetHabitCheckinInput = {
  habitId: string;
  date: string;
  status: HabitStatus;
  value?: number | null;
  note?: string | null;
};
export type CreateTodoInput = Pick<
  Todo,
  | "date"
  | "title"
  | "description"
  | "projectId"
  | "priority"
  | "estimatedMinutes"
>;
export type UpdateTodoInput = Partial<
  Pick<
    Todo,
    | "title"
    | "description"
    | "projectId"
    | "priority"
    | "status"
    | "estimatedMinutes"
    | "scheduledBlockId"
  >
>;
export type CreateTimeBlockInput = Pick<
  TimeBlock,
  "weekStartDate" | "date" | "startTime" | "endTime" | "title" | "category"
> &
  Partial<
    Pick<
      TimeBlock,
      | "projectId"
      | "habitId"
      | "todoId"
      | "isLocked"
      | "isRecurring"
      | "recurrenceRule"
      | "note"
    >
  >;
export type UpdateTimeBlockInput = Partial<
  Pick<
    TimeBlock,
    | "date"
    | "startTime"
    | "endTime"
    | "title"
    | "category"
    | "projectId"
    | "habitId"
    | "todoId"
    | "isLocked"
    | "isRecurring"
    | "recurrenceRule"
    | "status"
    | "note"
  >
>;
export type SaveTemplateInput = {
  name: string;
  description?: string;
  weekStartDate: string;
};
export type UpdateProfileInput = {
  rawContent?: string;
  structuredJson?: string;
};
export type CoachMessageInput = {
  sessionId?: string;
  message: string;
  quickAction?: string;
};
export type CoachStatus =
  | "received"
  | "preparing_context"
  | "selecting_model"
  | "contacting_model"
  | "streaming"
  | "done"
  | "error";
export type CoachStatusPayload = {
  sessionId: string;
  turnId?: string;
  status: CoachStatus;
  message?: string;
};
export type CoachTokenPayload = {
  sessionId: string;
  turnId?: string;
  token: string;
};
export type SetAiModelInput = {
  activeModel: string;
};
export type UpdateAppSettingsInput = Partial<
  Pick<
    AppSettings,
    | "timezone"
    | "firstDayOfWeek"
    | "theme"
    | "defaultDashboardPage"
    | "backupFolderPath"
  >
>;
export type CreateBackupInput = {
  kind?: BackupMetadata["kind"];
};
export type RestoreBackupInput = {
  filePath: string;
};

export type StartFocusSessionInput = {
  title: string;
  projectId?: string | null;
  habitId?: string | null;
  todoId?: string | null;
  plannedMinutes?: number | null;
};

export type EndFocusSessionInput = {
  outputProduced?: string | null;
  nextAction?: string | null;
  distractionsCount?: number;
};

export type UpsertDistractionLogInput = {
  date: string;
  socialMediaMinutes?: number;
  junkFood?: boolean;
  mainDistraction?: string | null;
  trigger?: string | null;
  fixForTomorrow?: string | null;
};
