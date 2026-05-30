import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  calculateDayAnalytics,
  calculateMonthAnalytics,
  calculateWeekAnalytics,
} from "../analytics/analytics";
import { DEFAULT_HABITS, DEFAULT_PROJECTS, STARTER_PROFILE } from "./defaults";
import { SCHEMA_SQL } from "./schema";
import {
  addDays,
  daysInMonth,
  minutesFromTime,
  startOfWeek,
  todayKey,
  weekDays,
} from "../../shared/dates";
import type {
  AiSettings,
  AppSettings,
  BackupMetadata,
  ChatMessage,
  CoachHistory,
  ChatSession,
  CoachContext,
  CreateBackupInput,
  CreateHabitInput,
  CreateTimeBlockInput,
  CreateTodoInput,
  DailyScores,
  DistractionLog,
  EndFocusSessionInput,
  DashboardMonth,
  FocusSession,
  Goal,
  Habit,
  HabitCheckin,
  ModelStatus,
  PlannerSettings,
  PlannerTemplate,
  ProfileSummary,
  Project,
  RestoreBackupInput,
  SaveTemplateInput,
  SetAiModelInput,
  SetHabitCheckinInput,
  StartFocusSessionInput,
  TimeBlock,
  TodaySummary,
  Todo,
  UpdateAppSettingsInput,
  UpdateHabitInput,
  UpdateProfileInput,
  UpdateTimeBlockInput,
  UpdateTodoInput,
  UpsertDistractionLogInput,
  WeekPlannerData,
} from "../../shared/types";

type Row = Record<string, unknown>;
const SCHEMA_VERSION = 1;

export class HabitRepository {
  readonly db: DatabaseSync;
  readonly dbPath: string;
  readonly backupDir: string;

  constructor(dbPath: string, backupDir: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    mkdirSync(backupDir, { recursive: true });
    this.dbPath = dbPath;
    this.backupDir = backupDir;
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
    this.seed();
  }

  migrate(): void {
    const currentVersion = Number(
      (this.db.prepare("PRAGMA user_version").get() as Row | undefined)
        ?.user_version ?? 0,
    );
    if (currentVersion > 0 && currentVersion < SCHEMA_VERSION) {
      this.createCheckpointedBackup("pre_migration");
    }
    this.db.exec(SCHEMA_SQL);
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  seed(): void {
    const now = new Date().toISOString();
    const timezone = getSystemTimeZone();
    this.runTransaction(() => {
      if (this.count("profiles") === 0) {
        this.db
          .prepare(
            `INSERT INTO profiles (id, display_name, alias, age, location, timezone, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run("default-profile", "User", null, null, null, timezone, now, now);
      }

      if (this.count("profile_sources") === 0) {
        this.db
          .prepare(
            `INSERT INTO profile_sources
             (id, profile_id, source_type, title, raw_content, structured_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "starter-profile",
            "default-profile",
            "markdown",
            "Starter profile.md",
            STARTER_PROFILE,
            JSON.stringify(buildProfileSummary(STARTER_PROFILE)),
            now,
            now,
          );
      }

      if (this.count("projects") === 0) {
        const stmt = this.db.prepare(
          `INSERT INTO projects (id, name, description, category, priority, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        DEFAULT_PROJECTS.forEach((project) => {
          stmt.run(
            randomUUID(),
            project.name,
            project.description ?? null,
            project.category ?? null,
            project.priority,
            project.active ? 1 : 0,
            now,
            now,
          );
        });
      }

      if (this.count("habits") === 0) {
        const stmt = this.db.prepare(
          `INSERT INTO habits
           (id, name, emoji, category, target_type, target_value, minimum_value, unit, sort_order, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        DEFAULT_HABITS.forEach((habit, index) => {
          stmt.run(
            randomUUID(),
            habit.name,
            habit.emoji ?? null,
            habit.category ?? null,
            habit.targetType,
            habit.targetValue ?? null,
            habit.minimumValue ?? null,
            habit.unit ?? null,
            index,
            1,
            now,
            now,
          );
        });
      }

      if (this.count("planner_settings") === 0) {
        this.db
          .prepare(
            `INSERT INTO planner_settings
             (id, visible_start_time, visible_end_time, slot_minutes, first_day_of_week, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run("default-planner-settings", "05:00", "21:00", 15, 1, now, now);
      }

      if (this.count("app_settings") === 0) {
        this.db
          .prepare(
            `INSERT INTO app_settings
             (id, profile_id, theme, timezone, first_day_of_week, default_dashboard_page, backup_folder_path, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "default-app-settings",
            "default-profile",
            "spreadsheet",
            timezone,
            1,
            "dashboard",
            this.backupDir,
            now,
            now,
          );
      }

      if (this.count("ai_settings") === 0) {
        this.db
          .prepare(
            `INSERT INTO ai_settings
             (id, default_model, deep_review_model, fallback_model, active_model, ollama_base_url, stream_enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "default-ai-settings",
            "llama3.2:3b",
            "mistral-nemo:12b",
            "llama3.2:3b",
            "llama3.2:3b",
            "http://localhost:11434",
            1,
            now,
            now,
          );
      }
    });
  }

  count(table: string): number {
    return Number(
      (
        this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count,
    );
  }

  private runTransaction(work: () => void): void {
    this.db.exec("BEGIN");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private createDatabaseCopy(filePath: string): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    copyFileSync(this.dbPath, filePath);
  }

  getMonth(month: string): DashboardMonth {
    const days = daysInMonth(month);
    const habits = this.listHabits();
    const checkins = this.listCheckins(days[0], days[days.length - 1]);
    const dailyScores = this.listDailyScores(days[0], days[days.length - 1]);
    const analytics = calculateMonthAnalytics({
      month,
      habits,
      checkins,
      dailyScores,
    });
    const [year, monthNumber] = month.split("-").map(Number);
    return {
      month,
      year,
      monthIndex: monthNumber - 1,
      days,
      habits,
      checkins,
      dailyScores,
      analytics,
    };
  }

  getToday(date: string): TodaySummary {
    const habits = this.listHabits();
    const checkins = this.listCheckins(date, date);
    const todos = this.listTodosByDate(date);
    const scores = this.getDailyScores(date);
    const plannedBlocks = this.listBlocksByDate(date);
    return {
      date,
      habits,
      checkins,
      todos,
      scores,
      plannedBlocks,
      analytics: calculateDayAnalytics({
        date,
        habits,
        checkins,
        todos,
        scores,
      }),
    };
  }

  listProjects(): Project[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM projects WHERE active = 1 ORDER BY priority ASC, name ASC",
        )
        .all() as Row[]
    ).map(mapProject);
  }

  listGoals(): Goal[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM goals WHERE active = 1 ORDER BY priority ASC, title ASC",
        )
        .all() as Row[]
    ).map(mapGoal);
  }

  listHabits(): Habit[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM habits WHERE active = 1 ORDER BY sort_order ASC, created_at ASC",
        )
        .all() as Row[]
    ).map(mapHabit);
  }

  createHabit(input: CreateHabitInput): Habit {
    const now = new Date().toISOString();
    const id = randomUUID();
    const sortOrder = this.count("habits");
    this.db
      .prepare(
        `INSERT INTO habits
         (id, name, emoji, category, target_type, target_value, minimum_value, unit, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.emoji ?? null,
        input.category ?? null,
        input.targetType,
        input.targetValue ?? null,
        input.minimumValue ?? null,
        input.unit ?? null,
        sortOrder,
        1,
        now,
        now,
      );
    return this.getHabit(id);
  }

  getHabit(id: string): Habit {
    return mapHabit(
      this.db.prepare("SELECT * FROM habits WHERE id = ?").get(id) as Row,
    );
  }

  updateHabit(id: string, input: UpdateHabitInput): Habit {
    const fields: Record<string, unknown> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.emoji !== undefined) fields.emoji = input.emoji;
    if (input.category !== undefined) fields.category = input.category;
    if (input.targetType !== undefined) fields.target_type = input.targetType;
    if (input.targetValue !== undefined)
      fields.target_value = input.targetValue;
    if (input.minimumValue !== undefined)
      fields.minimum_value = input.minimumValue;
    if (input.unit !== undefined) fields.unit = input.unit;
    if (input.active !== undefined) fields.active = input.active ? 1 : 0;
    this.updateById("habits", id, fields);
    return this.getHabit(id);
  }

  reorderHabits(ids: string[]): void {
    const stmt = this.db.prepare(
      "UPDATE habits SET sort_order = ?, updated_at = ? WHERE id = ?",
    );
    const now = new Date().toISOString();
    this.runTransaction(() =>
      ids.forEach((id, index) => stmt.run(index, now, id)),
    );
  }

  setCheckin(input: SetHabitCheckinInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO habit_checkins (id, habit_id, date, status, value, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(habit_id, date) DO UPDATE SET
           status = excluded.status,
           value = excluded.value,
           note = excluded.note,
           updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        input.habitId,
        input.date,
        input.status,
        input.value ?? null,
        input.note ?? null,
        now,
        now,
      );
  }

  clearCheckin(input: Pick<SetHabitCheckinInput, "habitId" | "date">): void {
    this.db
      .prepare("DELETE FROM habit_checkins WHERE habit_id = ? AND date = ?")
      .run(input.habitId, input.date);
  }

  listCheckins(startDate: string, endDate: string): HabitCheckin[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM habit_checkins WHERE date >= ? AND date <= ? ORDER BY date ASC",
        )
        .all(startDate, endDate) as Row[]
    ).map(mapHabitCheckin);
  }

  listDailyScores(startDate: string, endDate: string): DailyScores[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM daily_scores WHERE date >= ? AND date <= ? ORDER BY date ASC",
        )
        .all(startDate, endDate) as Row[]
    ).map(mapDailyScores);
  }

  getDailyScores(date: string): DailyScores | null {
    const row = this.db
      .prepare("SELECT * FROM daily_scores WHERE date = ?")
      .get(date);
    return row ? mapDailyScores(row as Row) : null;
  }

  upsertDailyScores(
    input: Partial<DailyScores> & { date: string },
  ): DailyScores {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO daily_scores
         (id, date, mood_score, motivation_score, energy_score, focus_score, stress_score, sleep_hours, journal_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           mood_score = excluded.mood_score,
           motivation_score = excluded.motivation_score,
           energy_score = excluded.energy_score,
           focus_score = excluded.focus_score,
           stress_score = excluded.stress_score,
           sleep_hours = excluded.sleep_hours,
           journal_note = excluded.journal_note,
           updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        input.date,
        input.moodScore ?? null,
        input.motivationScore ?? null,
        input.energyScore ?? null,
        input.focusScore ?? null,
        input.stressScore ?? null,
        input.sleepHours ?? null,
        input.journalNote ?? null,
        now,
        now,
      );
    return this.getDailyScores(input.date) as DailyScores;
  }

  listTodosByDate(date: string): Todo[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM todos WHERE date = ? ORDER BY sort_order ASC, created_at ASC",
        )
        .all(date) as Row[]
    ).map(mapTodo);
  }

  createTodo(input: CreateTodoInput): Todo {
    const now = new Date().toISOString();
    const id = randomUUID();
    const sortOrder =
      Number(
        (
          this.db
            .prepare(
              "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM todos WHERE date = ?",
            )
            .get(input.date) as Row
        ).next,
      ) ?? 0;
    this.db
      .prepare(
        `INSERT INTO todos
         (id, date, title, description, project_id, priority, status, estimated_minutes, scheduled_block_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.date,
        input.title,
        input.description ?? null,
        input.projectId ?? null,
        input.priority ?? "medium",
        "open",
        input.estimatedMinutes ?? null,
        null,
        sortOrder,
        now,
        now,
      );
    return this.getTodo(id);
  }

  getTodo(id: string): Todo {
    return mapTodo(
      this.db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as Row,
    );
  }

  updateTodo(id: string, input: UpdateTodoInput): Todo {
    const fields: Record<string, unknown> = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.description !== undefined) fields.description = input.description;
    if (input.projectId !== undefined) fields.project_id = input.projectId;
    if (input.priority !== undefined) fields.priority = input.priority;
    if (input.status !== undefined) fields.status = input.status;
    if (input.estimatedMinutes !== undefined)
      fields.estimated_minutes = input.estimatedMinutes;
    if (input.scheduledBlockId !== undefined)
      fields.scheduled_block_id = input.scheduledBlockId;
    this.updateById("todos", id, fields);
    return this.getTodo(id);
  }

  deleteTodo(id: string): void {
    this.db.prepare("DELETE FROM todos WHERE id = ?").run(id);
  }

  reorderTodos(date: string, ids: string[]): void {
    const stmt = this.db.prepare(
      "UPDATE todos SET sort_order = ?, updated_at = ? WHERE id = ? AND date = ?",
    );
    const now = new Date().toISOString();
    this.runTransaction(() =>
      ids.forEach((id, index) => stmt.run(index, now, id, date)),
    );
  }

  getPlannerSettings(): PlannerSettings {
    return mapPlannerSettings(
      this.db.prepare("SELECT * FROM planner_settings LIMIT 1").get() as Row,
    );
  }

  getWeek(weekStartDate: string): WeekPlannerData {
    const days = weekDays(weekStartDate);
    const blocks = this.listBlocksForWeek(weekStartDate);
    const todos = (
      this.db
        .prepare(
          "SELECT * FROM todos WHERE date >= ? AND date <= ? ORDER BY date ASC, sort_order ASC",
        )
        .all(days[0], days[6]) as Row[]
    ).map(mapTodo);
    return {
      weekStartDate,
      days,
      settings: this.getPlannerSettings(),
      blocks,
      todos,
      templates: this.listTemplates(),
      warnings: buildPlannerWarnings(blocks),
    };
  }

  getWeekAnalytics(weekStartDate: string) {
    const days = weekDays(weekStartDate);
    return calculateWeekAnalytics({
      weekStart: weekStartDate,
      habits: this.listHabits(),
      checkins: this.listCheckins(days[0], days[6]),
      dailyScores: this.listDailyScores(days[0], days[6]),
      blocks: this.listBlocksForWeek(weekStartDate),
    });
  }

  listBlocksForWeek(weekStartDate: string): TimeBlock[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM time_blocks WHERE week_start_date = ? ORDER BY date ASC, start_time ASC",
        )
        .all(weekStartDate) as Row[]
    ).map(mapTimeBlock);
  }

  listBlocksByDate(date: string): TimeBlock[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM time_blocks WHERE date = ? ORDER BY start_time ASC",
        )
        .all(date) as Row[]
    ).map(mapTimeBlock);
  }

  createBlock(input: CreateTimeBlockInput): TimeBlock {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO time_blocks
         (id, week_start_date, date, start_time, end_time, title, category, project_id, habit_id, todo_id,
          is_locked, is_recurring, recurrence_rule, status, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.weekStartDate,
        input.date,
        input.startTime,
        input.endTime,
        input.title,
        input.category,
        input.projectId ?? null,
        input.habitId ?? null,
        input.todoId ?? null,
        input.isLocked ? 1 : 0,
        input.isRecurring ? 1 : 0,
        input.recurrenceRule ?? null,
        "planned",
        input.note ?? null,
        now,
        now,
      );
    if (input.todoId)
      this.updateTodo(input.todoId, {
        status: "scheduled",
        scheduledBlockId: id,
      });
    return this.getBlock(id);
  }

  getBlock(id: string): TimeBlock {
    return mapTimeBlock(
      this.db.prepare("SELECT * FROM time_blocks WHERE id = ?").get(id) as Row,
    );
  }

  updateBlock(id: string, input: UpdateTimeBlockInput): TimeBlock {
    const existing = this.getBlock(id);
    if (existing.isLocked && input.isLocked !== false) return existing;
    const fields: Record<string, unknown> = {};
    if (input.date !== undefined) fields.date = input.date;
    if (input.startTime !== undefined) fields.start_time = input.startTime;
    if (input.endTime !== undefined) fields.end_time = input.endTime;
    if (input.title !== undefined) fields.title = input.title;
    if (input.category !== undefined) fields.category = input.category;
    if (input.projectId !== undefined) fields.project_id = input.projectId;
    if (input.habitId !== undefined) fields.habit_id = input.habitId;
    if (input.todoId !== undefined) fields.todo_id = input.todoId;
    if (input.isLocked !== undefined) fields.is_locked = input.isLocked ? 1 : 0;
    if (input.isRecurring !== undefined)
      fields.is_recurring = input.isRecurring ? 1 : 0;
    if (input.recurrenceRule !== undefined)
      fields.recurrence_rule = input.recurrenceRule;
    if (input.status !== undefined) fields.status = input.status;
    if (input.note !== undefined) fields.note = input.note;
    this.updateById("time_blocks", id, fields);
    return this.getBlock(id);
  }

  deleteBlock(id: string): void {
    const block = this.getBlock(id);
    if (block.isLocked) return;
    this.db.prepare("DELETE FROM time_blocks WHERE id = ?").run(id);
    if (block.todoId)
      this.updateTodo(block.todoId, { status: "open", scheduledBlockId: null });
  }

  listTemplates(): PlannerTemplate[] {
    return (
      this.db
        .prepare("SELECT * FROM planner_templates ORDER BY name ASC")
        .all() as Row[]
    ).map(mapTemplate);
  }

  saveTemplate(input: SaveTemplateInput): PlannerTemplate {
    const now = new Date().toISOString();
    const id = randomUUID();
    const blocks = this.listBlocksForWeek(input.weekStartDate).map((block) => ({
      dayOffset: weekDays(input.weekStartDate).indexOf(block.date),
      startTime: block.startTime,
      endTime: block.endTime,
      title: block.title,
      category: block.category,
      isLocked: block.isLocked,
    }));
    this.db
      .prepare(
        `INSERT INTO planner_templates (id, name, description, template_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        JSON.stringify({ blocks }),
        now,
        now,
      );
    return mapTemplate(
      this.db
        .prepare("SELECT * FROM planner_templates WHERE id = ?")
        .get(id) as Row,
    );
  }

  applyTemplate(templateId: string, weekStartDate: string): void {
    const template = mapTemplate(
      this.db
        .prepare("SELECT * FROM planner_templates WHERE id = ?")
        .get(templateId) as Row,
    );
    const parsed = JSON.parse(template.templateJson) as {
      blocks: Array<
        Omit<CreateTimeBlockInput, "weekStartDate" | "date"> & {
          dayOffset: number;
        }
      >;
    };
    for (const block of parsed.blocks) {
      this.createBlock({
        weekStartDate,
        date: addDays(weekStartDate, block.dayOffset),
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        category: block.category,
        isLocked: block.isLocked,
      });
    }
  }

  getProfileSummary(): ProfileSummary {
    const row = this.db
      .prepare(
        "SELECT raw_content, structured_json FROM profile_sources ORDER BY updated_at DESC LIMIT 1",
      )
      .get() as Row | undefined;
    return {
      rawContent: String(row?.raw_content ?? STARTER_PROFILE),
      structuredJson: row?.structured_json
        ? String(row.structured_json)
        : JSON.stringify(buildProfileSummary(STARTER_PROFILE), null, 2),
    };
  }

  importProfileMarkdown(filePath: string): ProfileSummary {
    assertReadableFile(filePath, [".md", ".markdown", ".txt"], 1_000_000);
    const rawContent = readFileSync(filePath, "utf8");
    return this.updateProfileSummary({
      rawContent,
      structuredJson: JSON.stringify(buildProfileSummary(rawContent), null, 2),
    });
  }

  updateProfileSummary(input: UpdateProfileInput): ProfileSummary {
    const existing = this.getProfileSummary();
    const now = new Date().toISOString();
    const rawContent = input.rawContent ?? existing.rawContent;
    const structuredJson =
      input.structuredJson ??
      existing.structuredJson ??
      JSON.stringify(buildProfileSummary(rawContent), null, 2);
    this.db
      .prepare(
        `INSERT INTO profile_sources
         (id, profile_id, source_type, title, raw_content, structured_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        "default-profile",
        "markdown",
        "Edited profile.md",
        rawContent,
        structuredJson,
        now,
        now,
      );
    return { rawContent, structuredJson };
  }

  exportProfileMarkdown(): string {
    return this.getProfileSummary().rawContent;
  }

  getAppSettings(): AppSettings {
    return mapAppSettings(
      this.db.prepare("SELECT * FROM app_settings LIMIT 1").get() as Row,
    );
  }

  updateAppSettings(input: UpdateAppSettingsInput): AppSettings {
    const fields: Record<string, unknown> = {};
    if (input.timezone !== undefined) fields.timezone = input.timezone;
    if (input.firstDayOfWeek !== undefined)
      fields.first_day_of_week = input.firstDayOfWeek;
    if (input.theme !== undefined) fields.theme = input.theme;
    if (input.defaultDashboardPage !== undefined)
      fields.default_dashboard_page = input.defaultDashboardPage;
    if (input.backupFolderPath !== undefined)
      fields.backup_folder_path = input.backupFolderPath;
    this.updateById("app_settings", "default-app-settings", fields);
    return this.getAppSettings();
  }

  getAiSettings(): AiSettings {
    return mapAiSettings(
      this.db.prepare("SELECT * FROM ai_settings LIMIT 1").get() as Row,
    );
  }

  setAiModel(input: SetAiModelInput): AiSettings {
    this.updateById("ai_settings", "default-ai-settings", {
      active_model: input.activeModel,
    });
    return this.getAiSettings();
  }

  modelStatuses(installedModels: string[]): ModelStatus[] {
    const settings = this.getAiSettings();
    const rows: ModelStatus[] = [];
    const seen = new Set<string>();
    const addModel = (
      name: string | null | undefined,
      role: ModelStatus["role"],
      installed: boolean,
    ) => {
      if (!name || seen.has(`${role}:${name}`)) return;
      seen.add(`${role}:${name}`);
      rows.push({
        name,
        role,
        installed,
        active: name === settings.activeModel,
      });
    };

    addModel(
      settings.defaultModel,
      "default",
      modelIsInstalled(settings.defaultModel, installedModels),
    );
    addModel(
      settings.deepReviewModel ?? "qwen3.6:27b-mlx",
      "deep_review",
      modelIsInstalled(settings.deepReviewModel, installedModels),
    );
    addModel(
      settings.fallbackModel ?? "qwen3.5:4b-mlx",
      "fallback",
      modelIsInstalled(settings.fallbackModel, installedModels),
    );
    for (const model of installedModels) {
      if (!rows.some((row) => row.name === model))
        addModel(model, "installed", true);
    }
    return rows;
  }

  startSession(): ChatSession {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, "New coach chat", now, now);
    return mapChatSession(
      this.db
        .prepare("SELECT * FROM chat_sessions WHERE id = ?")
        .get(id) as Row,
    );
  }

  getLatestSession(): ChatSession | null {
    const row = this.db
      .prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT 1")
      .get();
    return row ? mapChatSession(row as Row) : null;
  }

  getOrCreateSession(sessionId?: string): ChatSession {
    if (sessionId) {
      const row = this.db
        .prepare("SELECT * FROM chat_sessions WHERE id = ?")
        .get(sessionId);
      if (row) return mapChatSession(row as Row);
    }
    return this.startSession();
  }

  getCoachHistory(sessionId?: string): CoachHistory {
    const session = sessionId
      ? this.getOrCreateSession(sessionId)
      : (this.getLatestSession() ?? this.startSession());
    return {
      session,
      messages: this.listChatMessages(session.id),
    };
  }

  addChatMessage(input: {
    sessionId: string;
    role: ChatMessage["role"];
    content: string;
    contextJson?: string | null;
  }): ChatMessage {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO chat_messages (id, session_id, role, content, context_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.sessionId,
        input.role,
        input.content,
        input.contextJson ?? null,
        now,
      );
    this.db
      .prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?")
      .run(now, input.sessionId);
    return mapChatMessage(
      this.db
        .prepare("SELECT * FROM chat_messages WHERE id = ?")
        .get(id) as Row,
    );
  }

  listChatMessages(sessionId: string): ChatMessage[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
        )
        .all(sessionId) as Row[]
    ).map(mapChatMessage);
  }

  buildCoachContext(userQuestion: string): CoachContext {
    const date = todayKey();
    const appSettings = this.getAppSettings();
    const weekStart = startOfWeek(date, appSettings.firstDayOfWeek);
    const month = date.slice(0, 7);
    const today = this.getToday(date);
    const weekBlocks = this.listBlocksForWeek(weekStart);
    const weekDaysList = weekDays(weekStart);
    const weekTodos = (
      this.db
        .prepare(
          "SELECT * FROM todos WHERE date >= ? AND date <= ? ORDER BY date ASC, sort_order ASC",
        )
        .all(weekDaysList[0], weekDaysList[6]) as Row[]
    ).map(mapTodo);
    const weekAnalytics = calculateWeekAnalytics({
      weekStart,
      habits: this.listHabits(),
      checkins: this.listCheckins(weekStart, addDays(weekStart, 6)),
      dailyScores: this.listDailyScores(weekStart, addDays(weekStart, 6)),
      blocks: weekBlocks,
    });
    const monthAnalytics = this.getMonth(month).analytics;
    const profile = this.getProfileSummary();
    const missingData: string[] = [];
    if (!today.scores)
      missingData.push("No daily mood/energy/sleep scores logged today");
    if (today.todos.length === 0) missingData.push("No to-dos logged today");

    return {
      userProfileSummary:
        profile.structuredJson ?? profile.rawContent.slice(0, 4000),
      activeGoals: this.listGoals(),
      activeProjects: this.listProjects(),
      today: {
        date,
        habits: today.habits.map((habit) => ({
          habitId: habit.id,
          name: habit.name,
          status:
            today.checkins.find((checkin) => checkin.habitId === habit.id)
              ?.status ?? "missing",
        })),
        todos: today.todos,
        scores: today.scores,
        plannedBlocks: today.plannedBlocks,
      },
      currentWeek: weekAnalytics,
      weekPlanner: {
        weekStartDate: weekStart,
        blocks: weekBlocks,
        openTodos: weekTodos.filter((todo) => todo.status === "open"),
      },
      currentMonth: {
        overallCompletionPercentage: monthAnalytics.overallCompletionPercentage,
        topHabits: monthAnalytics.topHabits,
        bottomHabits: monthAnalytics.bottomHabits,
        streaks: monthAnalytics.streaks,
        moodTrend: monthAnalytics.moodTrend,
        motivationTrend: monthAnalytics.motivationTrend,
      },
      missingData,
      userQuestion,
    };
  }

  async createBackup(input: CreateBackupInput = {}): Promise<BackupMetadata> {
    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "-");
    const filePath = join(this.backupDir, `habit-os-backup-${stamp}.sqlite`);
    this.createDatabaseCopy(filePath);
    const sizeBytes = statSync(filePath).size;
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO backups (id, file_path, kind, size_bytes, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        filePath,
        input.kind ?? "manual",
        sizeBytes,
        "0.1.0",
        now.toISOString(),
      );
    return mapBackup(
      this.db.prepare("SELECT * FROM backups WHERE id = ?").get(id) as Row,
    );
  }

  createCheckpointedBackup(kind: BackupMetadata["kind"]): string {
    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "-");
    const filePath = join(
      this.backupDir,
      `habit-os-backup-${stamp}-${kind}.sqlite`,
    );
    this.createDatabaseCopy(filePath);
    return filePath;
  }

  listBackups(): BackupMetadata[] {
    return (
      this.db
        .prepare("SELECT * FROM backups ORDER BY created_at DESC")
        .all() as Row[]
    ).map(mapBackup);
  }

  async restoreBackup(input: RestoreBackupInput): Promise<void> {
    assertReadableFile(input.filePath, [".sqlite", ".db"], 1_000_000_000);
    await this.createBackup({ kind: "pre_migration" });
    this.db.close();
    copyFileSync(input.filePath, this.dbPath);
  }

  startFocusSession(input: StartFocusSessionInput): FocusSession {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO focus_sessions
         (id, project_id, habit_id, todo_id, title, started_at, ended_at, planned_minutes, actual_minutes,
          distractions_count, output_produced, next_action, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId ?? null,
        input.habitId ?? null,
        input.todoId ?? null,
        input.title,
        now,
        null,
        input.plannedMinutes ?? null,
        null,
        0,
        null,
        null,
        now,
        now,
      );
    return mapFocusSession(
      this.db
        .prepare("SELECT * FROM focus_sessions WHERE id = ?")
        .get(id) as Row,
    );
  }

  endFocusSession(id: string, input: EndFocusSessionInput): FocusSession {
    const existing = mapFocusSession(
      this.db
        .prepare("SELECT * FROM focus_sessions WHERE id = ?")
        .get(id) as Row,
    );
    const endedAt = new Date().toISOString();
    const actualMinutes = Math.max(
      1,
      Math.round(
        (new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()) /
          60_000,
      ),
    );
    this.db
      .prepare(
        `UPDATE focus_sessions
         SET ended_at = ?, actual_minutes = ?, distractions_count = ?, output_produced = ?, next_action = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        endedAt,
        actualMinutes,
        input.distractionsCount ?? existing.distractionsCount,
        input.outputProduced ?? existing.outputProduced ?? null,
        input.nextAction ?? existing.nextAction ?? null,
        endedAt,
        id,
      );
    return mapFocusSession(
      this.db
        .prepare("SELECT * FROM focus_sessions WHERE id = ?")
        .get(id) as Row,
    );
  }

  listRecentFocusSessions(): FocusSession[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 12",
        )
        .all() as Row[]
    ).map(mapFocusSession);
  }

  getDistractionLog(date: string): DistractionLog | null {
    const row = this.db
      .prepare(
        "SELECT * FROM distraction_logs WHERE date = ? ORDER BY updated_at DESC LIMIT 1",
      )
      .get(date);
    return row ? mapDistractionLog(row as Row) : null;
  }

  upsertDistractionLog(input: UpsertDistractionLogInput): DistractionLog {
    const now = new Date().toISOString();
    const existing = this.getDistractionLog(input.date);
    if (!existing) {
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO distraction_logs
           (id, date, social_media_minutes, junk_food, main_distraction, trigger, fix_for_tomorrow, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.date,
          input.socialMediaMinutes ?? 0,
          input.junkFood ? 1 : 0,
          input.mainDistraction ?? null,
          input.trigger ?? null,
          input.fixForTomorrow ?? null,
          now,
          now,
        );
      return mapDistractionLog(
        this.db
          .prepare("SELECT * FROM distraction_logs WHERE id = ?")
          .get(id) as Row,
      );
    }
    this.db
      .prepare(
        `UPDATE distraction_logs
         SET social_media_minutes = ?, junk_food = ?, main_distraction = ?, trigger = ?, fix_for_tomorrow = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.socialMediaMinutes ?? existing.socialMediaMinutes,
        (input.junkFood ?? existing.junkFood) ? 1 : 0,
        input.mainDistraction ?? existing.mainDistraction ?? null,
        input.trigger ?? existing.trigger ?? null,
        input.fixForTomorrow ?? existing.fixForTomorrow ?? null,
        now,
        existing.id,
      );
    return mapDistractionLog(
      this.db
        .prepare("SELECT * FROM distraction_logs WHERE id = ?")
        .get(existing.id) as Row,
    );
  }

  exportCsv(): string {
    const habits = this.listHabits();
    const todos = (
      this.db
        .prepare("SELECT * FROM todos ORDER BY date ASC, sort_order ASC")
        .all() as Row[]
    ).map(mapTodo);
    const checkins = (
      this.db
        .prepare("SELECT * FROM habit_checkins ORDER BY date ASC")
        .all() as Row[]
    ).map(mapHabitCheckin);
    return [
      "Habits",
      toCsv(habits),
      "",
      "Checkins",
      toCsv(checkins),
      "",
      "Todos",
      toCsv(todos),
    ].join("\n");
  }

  exportXlsx(): string {
    const filePath = join(
      this.backupDir,
      `habit-os-export-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}.xlsx`,
    );
    writeSimpleXlsx(filePath, [
      { name: "Habits", rows: this.listHabits() },
      {
        name: "Checkins",
        rows: (
          this.db
            .prepare("SELECT * FROM habit_checkins ORDER BY date ASC")
            .all() as Row[]
        ).map(mapHabitCheckin),
      },
      {
        name: "Daily Scores",
        rows: (
          this.db
            .prepare("SELECT * FROM daily_scores ORDER BY date ASC")
            .all() as Row[]
        ).map(mapDailyScores),
      },
      {
        name: "Todos",
        rows: (
          this.db
            .prepare("SELECT * FROM todos ORDER BY date ASC, sort_order ASC")
            .all() as Row[]
        ).map(mapTodo),
      },
      {
        name: "Week Planner",
        rows: (
          this.db
            .prepare(
              "SELECT * FROM time_blocks ORDER BY date ASC, start_time ASC",
            )
            .all() as Row[]
        ).map(mapTimeBlock),
      },
      { name: "Projects", rows: this.listProjects() },
    ]);
    return filePath;
  }

  private updateById(
    table: string,
    id: string,
    fields: Record<string, unknown>,
  ): void {
    const entries = Object.entries(fields);
    if (!entries.length) return;
    entries.push(["updated_at", new Date().toISOString()]);
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    this.db
      .prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?`)
      .run(...entries.map(([, value]) => toSqlValue(value)), id);
  }
}

function toSqlValue(
  value: unknown,
): string | number | bigint | Uint8Array | null {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  )
    return value;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

export function mapHabit(row: Row): Habit {
  return {
    id: String(row.id),
    name: String(row.name),
    emoji: nullableString(row.emoji),
    category: nullableString(row.category),
    targetType: String(row.target_type),
    targetValue: nullableNumber(row.target_value),
    minimumValue: nullableNumber(row.minimum_value),
    unit: nullableString(row.unit),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHabitCheckin(row: Row): HabitCheckin {
  return {
    id: String(row.id),
    habitId: String(row.habit_id),
    date: String(row.date),
    status: row.status as HabitCheckin["status"],
    value: nullableNumber(row.value),
    note: nullableString(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDailyScores(row: Row): DailyScores {
  return {
    id: String(row.id),
    date: String(row.date),
    moodScore: nullableNumber(row.mood_score),
    motivationScore: nullableNumber(row.motivation_score),
    energyScore: nullableNumber(row.energy_score),
    focusScore: nullableNumber(row.focus_score),
    stressScore: nullableNumber(row.stress_score),
    sleepHours: nullableNumber(row.sleep_hours),
    journalNote: nullableString(row.journal_note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTodo(row: Row): Todo {
  return {
    id: String(row.id),
    date: String(row.date),
    title: String(row.title),
    description: nullableString(row.description),
    projectId: nullableString(row.project_id),
    priority: row.priority as Todo["priority"],
    status: row.status as Todo["status"],
    estimatedMinutes: nullableNumber(row.estimated_minutes),
    scheduledBlockId: nullableString(row.scheduled_block_id),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProject(row: Row): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    category: nullableString(row.category),
    priority: Number(row.priority ?? 0),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapGoal(row: Row): Goal {
  return {
    id: String(row.id),
    title: String(row.title),
    description: nullableString(row.description),
    why: nullableString(row.why),
    targetValue: nullableString(row.target_value),
    targetDate: nullableString(row.target_date),
    priority: Number(row.priority ?? 0),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPlannerSettings(row: Row): PlannerSettings {
  return {
    id: String(row.id),
    visibleStartTime: String(row.visible_start_time),
    visibleEndTime: String(row.visible_end_time),
    slotMinutes: Number(row.slot_minutes),
    firstDayOfWeek: Number(row.first_day_of_week),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTimeBlock(row: Row): TimeBlock {
  return {
    id: String(row.id),
    weekStartDate: String(row.week_start_date),
    date: String(row.date),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    title: String(row.title),
    category: String(row.category),
    projectId: nullableString(row.project_id),
    habitId: nullableString(row.habit_id),
    todoId: nullableString(row.todo_id),
    isLocked: Boolean(row.is_locked),
    isRecurring: Boolean(row.is_recurring),
    recurrenceRule: nullableString(row.recurrence_rule),
    status: row.status as TimeBlock["status"],
    note: nullableString(row.note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTemplate(row: Row): PlannerTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    templateJson: String(row.template_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAppSettings(row: Row): AppSettings {
  return {
    id: String(row.id),
    timezone: String(row.timezone),
    firstDayOfWeek: Number(row.first_day_of_week),
    theme: "spreadsheet",
    defaultDashboardPage:
      row.default_dashboard_page === "planner" ? "planner" : "dashboard",
    backupFolderPath: nullableString(row.backup_folder_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAiSettings(row: Row): AiSettings {
  return {
    id: String(row.id),
    defaultModel: String(row.default_model),
    deepReviewModel: nullableString(row.deep_review_model),
    fallbackModel: nullableString(row.fallback_model),
    activeModel: String(row.active_model),
    ollamaBaseUrl: String(row.ollama_base_url),
    streamEnabled: Boolean(row.stream_enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapBackup(row: Row): BackupMetadata {
  return {
    id: String(row.id),
    filePath: String(row.file_path),
    kind: row.kind as BackupMetadata["kind"],
    sizeBytes: nullableNumber(row.size_bytes),
    appVersion: nullableString(row.app_version),
    createdAt: String(row.created_at),
  };
}

function mapChatSession(row: Row): ChatSession {
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapChatMessage(row: Row): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as ChatMessage["role"],
    content: String(row.content),
    contextJson: nullableString(row.context_json),
    createdAt: String(row.created_at),
  };
}

function mapFocusSession(row: Row): FocusSession {
  return {
    id: String(row.id),
    projectId: nullableString(row.project_id),
    habitId: nullableString(row.habit_id),
    todoId: nullableString(row.todo_id),
    title: String(row.title),
    startedAt: String(row.started_at),
    endedAt: nullableString(row.ended_at),
    plannedMinutes: nullableNumber(row.planned_minutes),
    actualMinutes: nullableNumber(row.actual_minutes),
    distractionsCount: Number(row.distractions_count ?? 0),
    outputProduced: nullableString(row.output_produced),
    nextAction: nullableString(row.next_action),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDistractionLog(row: Row): DistractionLog {
  return {
    id: String(row.id),
    date: String(row.date),
    socialMediaMinutes: Number(row.social_media_minutes ?? 0),
    junkFood: Boolean(row.junk_food),
    mainDistraction: nullableString(row.main_distraction),
    trigger: nullableString(row.trigger),
    fixForTomorrow: nullableString(row.fix_for_tomorrow),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function modelIsInstalled(
  model: string | null | undefined,
  installedModels: string[],
): boolean {
  if (!model) return false;
  return installedModels.some(
    (installed) =>
      installed === model ||
      installed === `${model}:latest` ||
      installed.replace(/:latest$/, "") === model,
  );
}

function buildProfileSummary(rawContent: string): Record<string, unknown> {
  return {
    name: "User",
    priorities: [],
    coachStyle: "direct, practical, honest, systems-focused",
    sourceCharacters: rawContent.length,
  };
}

function getSystemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function buildPlannerWarnings(
  blocks: TimeBlock[],
): WeekPlannerData["warnings"] {
  const warnings: WeekPlannerData["warnings"] = [];
  for (const block of blocks) {
    const overlaps = blocks.filter(
      (candidate) =>
        candidate.id !== block.id &&
        candidate.date === block.date &&
        candidate.startTime < block.endTime &&
        candidate.endTime > block.startTime,
    );
    if (overlaps.length) {
      warnings.push({
        id: `conflict-${block.id}`,
        severity: "danger",
        message: `${block.title} conflicts with ${overlaps.map((item) => item.title).join(", ")}`,
        blockIds: [block.id, ...overlaps.map((item) => item.id)],
      });
    }
  }
  for (const day of new Set(blocks.map((block) => block.date))) {
    const workMinutes = blocks
      .filter(
        (block) =>
          block.date === day &&
          ["school", "deep work", "study", "AI/business"].includes(
            block.category,
          ),
      )
      .reduce(
        (sum, block) =>
          sum +
          Math.max(
            0,
            minutesFromTime(block.endTime) - minutesFromTime(block.startTime),
          ),
        0,
      );
    if (workMinutes > 900) {
      warnings.push({
        id: `overload-${day}`,
        severity: "warning",
        message: `${day} looks overloaded. Protect sleep and reduce lower-priority work.`,
      });
    }
  }
  return warnings;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return lines.join("\n");
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

type XlsxSheet = { name: string; rows: object[] };

function writeSimpleXlsx(filePath: string, sheets: XlsxSheet[]): void {
  const files: Array<{ path: string; content: string }> = [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(safeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`,
    },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheet.rows),
    })),
  ];
  writeFileSync(filePath, zipFiles(files));
}

function worksheetXml(rows: object[]): string {
  const headers = rows.length
    ? Object.keys(rows[0] as Record<string, unknown>)
    : ["empty"];
  const dataRows = [
    headers,
    ...rows.map((row) =>
      headers.map((header) => (row as Record<string, unknown>)[header] ?? ""),
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
${dataRows
  .map(
    (row, rowIndex) =>
      `<row r="${rowIndex + 1}">${row
        .map((value, columnIndex) => {
          const cell = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          return `<c r="${cell}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
        })
        .join("")}</row>`,
  )
  .join("")}
</sheetData>
</worksheet>`;
}

function zipFiles(files: Array<{ path: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path);
    const raw = Buffer.from(file.content);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, end]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function columnName(index: number): string {
  let name = "";
  let cursor = index;
  while (cursor > 0) {
    const mod = (cursor - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    cursor = Math.floor((cursor - mod) / 26);
  }
  return name;
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function assertReadableFile(
  filePath: string,
  extensions: string[],
  maxBytes: number,
): void {
  if (!existsSync(filePath)) {
    throw new Error("Selected file does not exist");
  }
  const lower = filePath.toLowerCase();
  if (!extensions.some((extension) => lower.endsWith(extension))) {
    throw new Error(`File must be one of: ${extensions.join(", ")}`);
  }
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error("Selected path is not a file");
  }
  if (stats.size > maxBytes) {
    throw new Error("Selected file is too large");
  }
}
