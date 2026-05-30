import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Electron app boots with secure preload API", async () => {
  const userData = mkdtempSync(join(tmpdir(), "habit-os-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env,
  });
  const page = await app.firstWindow();

  await expect(page.locator("text=HABIT TRACKER")).toBeVisible();
  await expect(page.locator("text=AI Coach")).toBeVisible();
  await expect(page.getByRole("button", { name: "JARVIS" })).toHaveCount(0);
  await expect(
    page
      .locator(".right-rail .panel-head")
      .filter({ hasText: "Mission Control" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".right-rail .panel-head").filter({ hasText: "Distractions" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".dashboard-grid .panel-head")
      .filter({ hasText: "Mood / motivation / mental state" }),
  ).toHaveCount(0);
  await expect(page.locator(".check-cell")).toHaveCount(0);

  const todoPanel = page.locator(".todo-panel");
  await todoPanel.getByPlaceholder("Add task").fill("Temporary todo");
  await todoPanel.getByRole("button", { name: "Add" }).click();
  await expect(todoPanel.getByText("Temporary todo")).toBeVisible();
  await todoPanel
    .getByRole("button", { name: "Delete Temporary todo" })
    .click();
  await expect(todoPanel.getByText("Temporary todo")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  const habitSettings = page
    .locator(".settings-card")
    .filter({ hasText: "Habits and customization" });
  await habitSettings.getByPlaceholder("Habit name").fill("Cold shower");
  await habitSettings.getByPlaceholder("Emoji").fill("C");
  await habitSettings.getByPlaceholder("Category").fill("health");
  await habitSettings.getByPlaceholder("Minimum").fill("1");
  await habitSettings.getByPlaceholder("Unit").fill("check");
  await habitSettings.getByRole("button", { name: "Add habit" }).click();
  await expect(
    habitSettings.getByLabel("Habit name Cold shower"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  const firstSelectedCell = page.locator(".check-cell.selected").first();
  await firstSelectedCell.click();
  await expect(firstSelectedCell).toHaveText("✓");
  await firstSelectedCell.click();
  await expect(firstSelectedCell).toHaveText("");
  await page.getByTestId("check-all-current-day").click();
  await expect(firstSelectedCell).toHaveText("✓");

  await page.getByTestId("nav-collapse-toggle").click();
  await expect(page.locator(".app-shell.nav-collapsed")).toHaveCount(1);
  await page.getByTestId("nav-collapse-toggle").click();
  await expect(page.locator(".app-shell.nav-collapsed")).toHaveCount(0);

  const security = await page.evaluate(() => {
    const globalWindow = globalThis as unknown as {
      habitApi?: {
        coach?: {
          transcribeAudio?: unknown;
          transcribeLocalAudio?: unknown;
        };
      };
      require?: unknown;
    };
    return {
      hasHabitApi: typeof globalWindow.habitApi === "object",
      hasRequire: typeof globalWindow.require,
      hasSwiftTranscriptionIpc:
        typeof globalWindow.habitApi?.coach?.transcribeAudio,
      hasLocalTranscriptionIpc:
        typeof globalWindow.habitApi?.coach?.transcribeLocalAudio,
    };
  });

  expect(security).toEqual({
    hasHabitApi: true,
    hasRequire: "undefined",
    hasSwiftTranscriptionIpc: "undefined",
    hasLocalTranscriptionIpc: "function",
  });
  await app.close();
});

test("planner custom tiles require an explicit drop before creating a block", async () => {
  const userData = mkdtempSync(join(tmpdir(), "habit-os-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env,
  });
  const page = await app.firstWindow();

  await page.getByRole("button", { name: "Week Planner" }).click();
  const compactSlotHeight = await page
    .locator(".planner-slot")
    .first()
    .evaluate((node) => node.getBoundingClientRect().height);
  expect(compactSlotHeight).toBeLessThanOrEqual(14);
  await expect(
    page.locator(".planner-time").filter({ hasText: "05:15" }),
  ).toHaveCount(0);
  const slot = page.locator('[data-testid^="planner-slot-"]').first();
  await page.getByPlaceholder("Block title").fill("Double click block");
  await slot.dblclick();
  await expect(
    page.locator(".time-block").filter({ hasText: "Double click block" }),
  ).toHaveCount(0);

  await page.getByPlaceholder("Block title").fill("Focused build");
  await page.getByRole("button", { name: "Add tile" }).click();

  await expect(
    page.locator(".time-block").filter({ hasText: "Focused build" }),
  ).toHaveCount(0);

  const tile = page.locator('[data-testid^="planner-drag-draft:"]').first();
  await tile.dragTo(slot);

  await expect(
    page.locator(".time-block").filter({ hasText: "Focused build" }),
  ).toHaveCount(1);
  await expect(tile).toHaveCount(0);
  await app.close();
});

test("focus block opens a timer screen", async () => {
  const userData = mkdtempSync(join(tmpdir(), "habit-os-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env,
  });
  const page = await app.firstWindow();
  await expect(page.locator("text=HABIT TRACKER")).toBeVisible();

  await page.locator(".focus-panel input").fill("Focused test");
  await page
    .locator(".focus-panel")
    .getByRole("button", { name: "Start" })
    .click();

  await expect(page.getByRole("dialog", { name: "Focus timer" })).toBeVisible();
  await expect(page.locator(".focus-time")).toContainText("25:00");
  await page.getByRole("button", { name: "Close focus screen" }).click();
  await expect(page.getByRole("dialog", { name: "Focus timer" })).toHaveCount(
    0,
  );
  await app.close();
});

test("coach visual mode renders a reactive 3D core", async () => {
  const userData = mkdtempSync(join(tmpdir(), "habit-os-e2e-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userData}`],
    env,
  });
  const page = await app.firstWindow();
  await expect(page.locator("text=HABIT TRACKER")).toBeVisible();

  await page
    .locator(".coach-panel")
    .getByRole("button", { name: "Visual" })
    .click();
  await expect(page.locator(".coach-panel.visual-mode")).toBeVisible();
  await expect(page.getByTestId("coach-orb-canvas")).toBeVisible();
  await expect(
    page
      .locator(".coach-panel")
      .getByRole("button", { name: "Start voice input" }),
  ).toBeVisible();

  await page.locator(".coach-panel textarea").fill("I need focus today");
  await expect(page.getByTestId("coach-orb-stage")).toHaveClass(/topic-focus/);
  await page.locator(".coach-panel textarea").fill("I ate junk food");
  await expect(page.getByTestId("coach-orb-stage")).toHaveClass(/topic-food/);
  await page.locator(".coach-panel textarea").fill("My mindset is low");
  await expect(page.getByTestId("coach-orb-stage")).toHaveClass(
    /topic-mentality/,
  );
  await page.waitForTimeout(600);

  const hasRenderedPixels = await page
    .getByTestId("coach-orb-canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return false;
      const coordinates = [
        [0.5, 0.5],
        [0.48, 0.5],
        [0.52, 0.5],
        [0.5, 0.46],
        [0.5, 0.54],
      ];
      const pixel = new Uint8Array(4);
      return coordinates.some(([x, y]) => {
        gl.readPixels(
          Math.floor(gl.drawingBufferWidth * x),
          Math.floor(gl.drawingBufferHeight * y),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        return pixel[0] + pixel[1] + pixel[2] > 10;
      });
    });
  expect(hasRenderedPixels).toBe(true);

  await app.close();
});
