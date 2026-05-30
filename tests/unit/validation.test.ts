import { describe, expect, it } from "vitest";
import { createBlockSchema, createTodoSchema, setCheckinSchema } from "../../src/main/ipc/schemas";

describe("IPC validation", () => {
  it("rejects invalid dates", () => {
    expect(() => createTodoSchema.parse({ date: "today", title: "Task", priority: "medium" })).toThrow();
    expect(() => createTodoSchema.parse({ date: "2026-02-31", title: "Task", priority: "medium" })).toThrow();
  });

  it("rejects invalid planner times", () => {
    expect(() =>
      createBlockSchema.parse({
        weekStartDate: "2026-05-25",
        date: "2026-05-28",
        startTime: "18:00",
        endTime: "17:00",
        title: "Bad block",
        category: "test"
      })
    ).toThrow();
    expect(() =>
      createBlockSchema.parse({
        weekStartDate: "2026-05-25",
        date: "2026-05-28",
        startTime: "99:99",
        endTime: "20:00",
        title: "Bad block",
        category: "test"
      })
    ).toThrow();
  });

  it("accepts habit half-credit checkins", () => {
    expect(
      setCheckinSchema.parse({
        habitId: "h1",
        date: "2026-05-28",
        status: "minimum"
      }).status
    ).toBe("minimum");
  });
});
