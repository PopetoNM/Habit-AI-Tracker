export const keys = {
  month: (month: string) => ["month", month] as const,
  today: (date: string) => ["today", date] as const,
  week: (weekStart: string) => ["week", weekStart] as const,
  habits: () => ["habits"] as const,
  profile: () => ["profile"] as const,
  settings: () => ["settings"] as const,
  coachHealth: () => ["coach-health"] as const,
  coachModels: () => ["coach-models"] as const,
  backups: () => ["backups"] as const,
  focus: () => ["focus"] as const,
  distraction: (date: string) => ["distraction", date] as const,
};
