import { contextBridge, ipcRenderer } from "electron";
import type {
  CoachMessageInput,
  CoachHistory,
  CoachStatusPayload,
  CoachTokenPayload,
  CreateBackupInput,
  CreateHabitInput,
  CreateTimeBlockInput,
  CreateTodoInput,
  SaveTemplateInput,
  SetAiModelInput,
  SetHabitCheckinInput,
  StartFocusSessionInput,
  EndFocusSessionInput,
  TranscribeLocalAudioInput,
  UpsertDistractionLogInput,
  UpdateAppSettingsInput,
  UpdateHabitInput,
  UpdateProfileInput,
  UpdateTimeBlockInput,
  UpdateTodoInput,
} from "../shared/types";

const habitApi = {
  dashboard: {
    getMonth: (month: string) =>
      ipcRenderer.invoke("dashboard:getMonth", month),
    getToday: (date: string) => ipcRenderer.invoke("dashboard:getToday", date),
  },
  habits: {
    list: () => ipcRenderer.invoke("habits:list"),
    create: (input: CreateHabitInput) =>
      ipcRenderer.invoke("habits:create", input),
    update: (id: string, input: UpdateHabitInput) =>
      ipcRenderer.invoke("habits:update", id, input),
    reorder: (ids: string[]) => ipcRenderer.invoke("habits:reorder", ids),
    setCheckin: (input: SetHabitCheckinInput) =>
      ipcRenderer.invoke("habits:setCheckin", input),
    clearCheckin: (input: Pick<SetHabitCheckinInput, "habitId" | "date">) =>
      ipcRenderer.invoke("habits:clearCheckin", input),
  },
  todos: {
    listByDate: (date: string) => ipcRenderer.invoke("todos:listByDate", date),
    create: (input: CreateTodoInput) =>
      ipcRenderer.invoke("todos:create", input),
    update: (id: string, input: UpdateTodoInput) =>
      ipcRenderer.invoke("todos:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todos:delete", id),
    reorder: (date: string, ids: string[]) =>
      ipcRenderer.invoke("todos:reorder", date, ids),
  },
  scores: {
    upsert: (input: unknown) => ipcRenderer.invoke("scores:upsert", input),
  },
  planner: {
    getWeek: (weekStartDate: string) =>
      ipcRenderer.invoke("planner:getWeek", weekStartDate),
    createBlock: (input: CreateTimeBlockInput) =>
      ipcRenderer.invoke("planner:createBlock", input),
    updateBlock: (id: string, input: UpdateTimeBlockInput) =>
      ipcRenderer.invoke("planner:updateBlock", id, input),
    deleteBlock: (id: string) => ipcRenderer.invoke("planner:deleteBlock", id),
    applyTemplate: (templateId: string, weekStartDate: string) =>
      ipcRenderer.invoke("planner:applyTemplate", templateId, weekStartDate),
    saveTemplate: (input: SaveTemplateInput) =>
      ipcRenderer.invoke("planner:saveTemplate", input),
  },
  profile: {
    importMarkdown: () => ipcRenderer.invoke("profile:importMarkdown"),
    exportMarkdown: () => ipcRenderer.invoke("profile:exportMarkdown"),
    getSummary: () => ipcRenderer.invoke("profile:getSummary"),
    updateSummary: (input: UpdateProfileInput) =>
      ipcRenderer.invoke("profile:updateSummary", input),
  },
  analytics: {
    getDay: (date: string) => ipcRenderer.invoke("analytics:getDay", date),
    getWeek: (weekStartDate: string) =>
      ipcRenderer.invoke("analytics:getWeek", weekStartDate),
    getMonth: (month: string) =>
      ipcRenderer.invoke("analytics:getMonth", month),
  },
  coach: {
    health: () => ipcRenderer.invoke("coach:health"),
    checkModels: () => ipcRenderer.invoke("coach:checkModels"),
    setModel: (input: SetAiModelInput) =>
      ipcRenderer.invoke("coach:setModel", input),
    startSession: () => ipcRenderer.invoke("coach:startSession"),
    getHistory: (sessionId?: string): Promise<CoachHistory> =>
      ipcRenderer.invoke("coach:getHistory", sessionId),
    sendMessage: (input: CoachMessageInput) =>
      ipcRenderer.invoke("coach:sendMessage", input),
    transcribeLocalAudio: (input: TranscribeLocalAudioInput) =>
      ipcRenderer.invoke("coach:transcribeLocalAudio", input),
    onToken: (callback: (payload: CoachTokenPayload) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: CoachTokenPayload,
      ) => callback(payload);
      ipcRenderer.on("coach:token", listener);
      return () => {
        ipcRenderer.removeListener("coach:token", listener);
      };
    },
    onStatus: (callback: (payload: CoachStatusPayload) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: CoachStatusPayload,
      ) => callback(payload);
      ipcRenderer.on("coach:status", listener);
      return () => {
        ipcRenderer.removeListener("coach:status", listener);
      };
    },
    onDone: (callback: (payload: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) =>
        callback(payload);
      ipcRenderer.on("coach:done", listener);
      return () => {
        ipcRenderer.removeListener("coach:done", listener);
      };
    },
    onError: (
      callback: (payload: {
        sessionId: string;
        turnId?: string;
        message: string;
      }) => void,
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { sessionId: string; turnId?: string; message: string },
      ) => callback(payload);
      ipcRenderer.on("coach:error", listener);
      return () => {
        ipcRenderer.removeListener("coach:error", listener);
      };
    },
    cancel: (sessionId?: string) =>
      ipcRenderer.invoke("coach:cancel", sessionId),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (input: UpdateAppSettingsInput) =>
      ipcRenderer.invoke("settings:update", input),
  },
  backup: {
    list: () => ipcRenderer.invoke("backup:list"),
    create: (input?: CreateBackupInput) =>
      ipcRenderer.invoke("backup:create", input),
    restore: () => ipcRenderer.invoke("backup:restore"),
  },
  focus: {
    start: (input: StartFocusSessionInput) =>
      ipcRenderer.invoke("focus:start", input),
    end: (id: string, input: EndFocusSessionInput) =>
      ipcRenderer.invoke("focus:end", id, input),
    recent: () => ipcRenderer.invoke("focus:recent"),
  },
  distractions: {
    get: (date: string) => ipcRenderer.invoke("distractions:get", date),
    upsert: (input: UpsertDistractionLogInput) =>
      ipcRenderer.invoke("distractions:upsert", input),
  },
  export: {
    csv: () => ipcRenderer.invoke("export:csv"),
    xlsx: () => ipcRenderer.invoke("export:xlsx"),
    backup: () => ipcRenderer.invoke("export:backup"),
  },
};

contextBridge.exposeInMainWorld("habitApi", habitApi);

export type HabitApi = typeof habitApi;
