import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
  checkOllamaHealth,
  listInstalledModels,
  cancelCoachStream,
  streamCoachMessage,
} from "../ai/coach";
import { transcribeAudioWithLocalWhisper } from "../ai/localTranscription";
import type { HabitRepository } from "../db/repository";
import {
  coachMessageSchema,
  createBackupSchema,
  createBlockSchema,
  createHabitSchema,
  createTodoSchema,
  dailyScoresSchema,
  dateSchema,
  idSchema,
  monthSchema,
  saveTemplateSchema,
  setAiModelSchema,
  setCheckinSchema,
  startFocusSessionSchema,
  endFocusSessionSchema,
  transcribeLocalAudioSchema,
  upsertDistractionLogSchema,
  updateAppSettingsSchema,
  updateBlockSchema,
  updateHabitSchema,
  updateProfileSchema,
  updateTodoSchema,
} from "./schemas";

export function registerIpc(
  repository: HabitRepository,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("dashboard:getMonth", (_event, month: unknown) =>
    repository.getMonth(monthSchema.parse(month)),
  );
  ipcMain.handle("dashboard:getToday", (_event, date: unknown) =>
    repository.getToday(dateSchema.parse(date)),
  );

  ipcMain.handle("habits:list", () => repository.listHabits());
  ipcMain.handle("habits:create", (_event, input: unknown) =>
    repository.createHabit(createHabitSchema.parse(input)),
  );
  ipcMain.handle("habits:update", (_event, id: unknown, input: unknown) =>
    repository.updateHabit(idSchema.parse(id), updateHabitSchema.parse(input)),
  );
  ipcMain.handle("habits:reorder", (_event, ids: unknown) =>
    repository.reorderHabits(idSchema.array().parse(ids)),
  );
  ipcMain.handle("habits:setCheckin", (_event, input: unknown) =>
    repository.setCheckin(setCheckinSchema.parse(input)),
  );
  ipcMain.handle("habits:clearCheckin", (_event, input: unknown) =>
    repository.clearCheckin(
      setCheckinSchema.pick({ habitId: true, date: true }).parse(input),
    ),
  );

  ipcMain.handle("todos:listByDate", (_event, date: unknown) =>
    repository.listTodosByDate(dateSchema.parse(date)),
  );
  ipcMain.handle("todos:create", (_event, input: unknown) =>
    repository.createTodo(createTodoSchema.parse(input)),
  );
  ipcMain.handle("todos:update", (_event, id: unknown, input: unknown) =>
    repository.updateTodo(idSchema.parse(id), updateTodoSchema.parse(input)),
  );
  ipcMain.handle("todos:delete", (_event, id: unknown) =>
    repository.deleteTodo(idSchema.parse(id)),
  );
  ipcMain.handle("todos:reorder", (_event, date: unknown, ids: unknown) =>
    repository.reorderTodos(
      dateSchema.parse(date),
      idSchema.array().parse(ids),
    ),
  );

  ipcMain.handle("scores:upsert", (_event, input: unknown) =>
    repository.upsertDailyScores(dailyScoresSchema.parse(input)),
  );

  ipcMain.handle("planner:getWeek", (_event, weekStartDate: unknown) =>
    repository.getWeek(dateSchema.parse(weekStartDate)),
  );
  ipcMain.handle("planner:createBlock", (_event, input: unknown) =>
    repository.createBlock(createBlockSchema.parse(input)),
  );
  ipcMain.handle("planner:updateBlock", (_event, id: unknown, input: unknown) =>
    repository.updateBlock(idSchema.parse(id), updateBlockSchema.parse(input)),
  );
  ipcMain.handle("planner:deleteBlock", (_event, id: unknown) =>
    repository.deleteBlock(idSchema.parse(id)),
  );
  ipcMain.handle(
    "planner:applyTemplate",
    (_event, templateId: unknown, weekStartDate: unknown) =>
      repository.applyTemplate(
        idSchema.parse(templateId),
        dateSchema.parse(weekStartDate),
      ),
  );
  ipcMain.handle("planner:saveTemplate", (_event, input: unknown) =>
    repository.saveTemplate(saveTemplateSchema.parse(input)),
  );

  ipcMain.handle("profile:importMarkdown", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Import profile.md",
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    };
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return repository.getProfileSummary();
    return repository.importProfileMarkdown(filePath);
  });
  ipcMain.handle("profile:exportMarkdown", () =>
    repository.exportProfileMarkdown(),
  );
  ipcMain.handle("profile:getSummary", () => repository.getProfileSummary());
  ipcMain.handle("profile:updateSummary", (_event, input: unknown) =>
    repository.updateProfileSummary(updateProfileSchema.parse(input)),
  );

  ipcMain.handle(
    "analytics:getDay",
    (_event, date: unknown) =>
      repository.getToday(dateSchema.parse(date)).analytics,
  );
  ipcMain.handle("analytics:getWeek", (_event, weekStartDate: unknown) =>
    repository.getWeekAnalytics(dateSchema.parse(weekStartDate)),
  );
  ipcMain.handle(
    "analytics:getMonth",
    (_event, month: unknown) =>
      repository.getMonth(monthSchema.parse(month)).analytics,
  );

  ipcMain.handle("coach:health", () => checkOllamaHealth(repository));
  ipcMain.handle("coach:checkModels", async () =>
    repository.modelStatuses(await listInstalledModels(repository)),
  );
  ipcMain.handle("coach:setModel", (_event, input: unknown) =>
    repository.setAiModel(setAiModelSchema.parse(input)),
  );
  ipcMain.handle("coach:startSession", () => repository.startSession());
  ipcMain.handle("coach:getHistory", (_event, sessionId?: unknown) =>
    repository.getCoachHistory(
      typeof sessionId === "string" ? sessionId : undefined,
    ),
  );
  ipcMain.handle("coach:sendMessage", async (_event, input: unknown) => {
    const window = getWindow();
    if (!window) throw new Error("No active window");
    return streamCoachMessage({
      repository,
      window,
      ...coachMessageSchema.parse(input),
    });
  });
  ipcMain.handle("coach:transcribeLocalAudio", async (_event, input: unknown) =>
    transcribeAudioWithLocalWhisper(
      transcribeLocalAudioSchema.parse(input),
      app.getPath("userData"),
    ),
  );
  ipcMain.handle("coach:cancel", (_event, sessionId?: unknown) =>
    cancelCoachStream(typeof sessionId === "string" ? sessionId : undefined),
  );

  ipcMain.handle("settings:get", () => repository.getAppSettings());
  ipcMain.handle("settings:update", (_event, input: unknown) =>
    repository.updateAppSettings(updateAppSettingsSchema.parse(input)),
  );

  ipcMain.handle("backup:list", () => repository.listBackups());
  ipcMain.handle("backup:create", (_event, input: unknown) =>
    repository.createBackup(createBackupSchema.parse(input)),
  );
  ipcMain.handle("backup:restore", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Restore Habit OS backup",
      properties: ["openFile"],
      filters: [{ name: "SQLite backup", extensions: ["sqlite", "db"] }],
    };
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return;
    await repository.restoreBackup({ filePath });
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("focus:start", (_event, input: unknown) =>
    repository.startFocusSession(startFocusSessionSchema.parse(input)),
  );
  ipcMain.handle("focus:end", (_event, id: unknown, input: unknown) =>
    repository.endFocusSession(
      idSchema.parse(id),
      endFocusSessionSchema.parse(input),
    ),
  );
  ipcMain.handle("focus:recent", () => repository.listRecentFocusSessions());
  ipcMain.handle("distractions:get", (_event, date: unknown) =>
    repository.getDistractionLog(dateSchema.parse(date)),
  );
  ipcMain.handle("distractions:upsert", (_event, input: unknown) =>
    repository.upsertDistractionLog(upsertDistractionLogSchema.parse(input)),
  );

  ipcMain.handle("export:csv", () => repository.exportCsv());
  ipcMain.handle("export:xlsx", () => repository.exportXlsx());
  ipcMain.handle(
    "export:backup",
    async () => (await repository.createBackup({ kind: "manual" })).filePath,
  );
}
