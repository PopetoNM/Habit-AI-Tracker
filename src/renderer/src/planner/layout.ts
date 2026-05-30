export function visiblePlannerSlotLabel(slot: string): string {
  return slot.endsWith(":00") ? slot : "";
}

export function blockSlotSpan(input: {
  startTime: string;
  endTime: string;
  slotMinutes: number;
  minutesFromTime: (time: string) => number;
}): number {
  const duration = Math.max(
    input.slotMinutes,
    input.minutesFromTime(input.endTime) -
      input.minutesFromTime(input.startTime),
  );
  return Math.max(1, duration / input.slotMinutes);
}
