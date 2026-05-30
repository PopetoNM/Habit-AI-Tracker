const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function parseMonthKey(key: string): { year: number; monthIndex: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

export function daysInMonth(month: string): string[] {
  const { year, monthIndex } = parseMonthKey(month);
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => toDateKey(new Date(year, monthIndex, index + 1)));
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function startOfWeek(dateKey: string, firstDayOfWeek = 1): string {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const diff = (day - firstDayOfWeek + 7) % 7;
  date.setDate(date.getDate() - diff);
  return toDateKey(date);
}

export function weekDays(weekStartDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
}

export function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeFromMinutes(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildTimeSlots(startTime: string, endTime: string, slotMinutes: number): string[] {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  const slots: string[] = [];
  for (let cursor = start; cursor < end; cursor += slotMinutes) {
    slots.push(timeFromMinutes(cursor));
  }
  return slots;
}

export function dateRange(startDate: string, endDate: string): string[] {
  const start = parseDateKey(startDate).getTime();
  const end = parseDateKey(endDate).getTime();
  const length = Math.max(0, Math.floor((end - start) / DAY_MS) + 1);
  return Array.from({ length }, (_, index) => toDateKey(new Date(start + index * DAY_MS)));
}

export function formatShortDay(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}
