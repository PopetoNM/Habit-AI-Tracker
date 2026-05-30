// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HabitRepository } from "../../src/main/db/repository";

const cleanupDirs: string[] = [];

describe("HabitRepository", () => {
  afterEach(() => {
    for (const dir of cleanupDirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("persists distraction updates including zero and false values", () => {
    const repository = createRepository();

    repository.upsertDistractionLog({
      date: "2026-05-29",
      socialMediaMinutes: 45,
      junkFood: true,
      mainDistraction: "Shorts",
      trigger: "Tired",
      fixForTomorrow: "Phone outside room",
    });

    repository.upsertDistractionLog({
      date: "2026-05-29",
      socialMediaMinutes: 0,
      junkFood: false,
      mainDistraction: "",
      trigger: "",
      fixForTomorrow: "Keep phone away",
    });

    const log = repository.getDistractionLog("2026-05-29");
    expect(log).toMatchObject({
      socialMediaMinutes: 0,
      junkFood: false,
      mainDistraction: "",
      trigger: "",
      fixForTomorrow: "Keep phone away",
    });
    repository.db.close();
  });

  it("returns latest coach chat history", () => {
    const repository = createRepository();
    const session = repository.startSession();

    repository.addChatMessage({
      sessionId: session.id,
      role: "user",
      content: "Check my schedule",
    });
    repository.addChatMessage({
      sessionId: session.id,
      role: "assistant",
      content: "Your school block is protected.",
    });

    const history = repository.getCoachHistory();
    expect(history.session.id).toBe(session.id);
    expect(history.messages.map((message) => message.content)).toEqual([
      "Check my schedule",
      "Your school block is protected.",
    ]);
    repository.db.close();
  });

  it("starts public installs without personal starter habits or projects", () => {
    const repository = createRepository();
    const profile = repository.getProfileSummary();

    expect(repository.listHabits()).toEqual([]);
    expect(repository.listProjects()).toEqual([]);
    expect(profile.rawContent).toContain("Add your own profile");
    expect(profile.structuredJson).toContain('"name":"User"');
    repository.db.close();
  });
});

function createRepository(): HabitRepository {
  const dir = mkdtempSync(join(tmpdir(), "habit-repository-test-"));
  cleanupDirs.push(dir);
  return new HabitRepository(join(dir, "habit.sqlite"), join(dir, "backups"));
}
