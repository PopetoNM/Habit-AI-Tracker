import type { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import type {
  AiSettings,
  ChatMessage,
  CoachContext,
  CoachStatus,
  OllamaHealth,
} from "../../shared/types";
import type { HabitRepository } from "../db/repository";
import {
  appendActionSummary,
  applyCoachActions,
  extractDeterministicCoachActions,
  isExplicitMutationRequest,
  parseCoachActionResponse,
} from "./coachActions";

export const COACH_SYSTEM_PROMPT = `You are a local AI habit coach inside a private habit tracker app.

You are coaching the current local user. Use their saved profile only when it is relevant, and adapt to their own habits, schedule, priorities, values, and goals.

Your job:
- Answer the latest message first, like a normal chatbot.
- Help the user improve daily consistency when that is actually what they ask about.
- Protect sleep, health, school or work responsibilities, values, and important relationships.
- Help the user make progress on meaningful goals without burnout.
- Give practical, small, concrete next actions.
- Use actual habit data, to-dos, planner blocks, and profile context.
- Treat app data as supporting context, not as a script.
- Do not invent statistics.
- Do not shame him.
- Do not tell the user to sacrifice sleep.
- Do not start with generic phrases like "Let's focus on improving daily consistency."
- Do not list missing habits, missed habits, or incomplete routines unless the user explicitly asks for a habit audit, missed-items list, or today's missing habits.
- Do not encourage risky financial behavior or give trading signals.
- For trading/business topics, focus on learning, backtesting process, risk awareness, planning, and execution.
- If mood, depression, or burnout patterns look serious, encourage the user to talk to a trusted person or qualified professional.

Response style:
- Direct
- Calm
- Practical
- Short by default: 1-4 short sentences or bullets, under 90 words unless the user asks for depth
- Prefer 1-2 high-leverage changes
- Sound conversational, not like a repeated report template

Data changes:
- Only modify app data when the latest user message explicitly asks you to tick, clear, add, update, move, schedule, reschedule, delete, set up, free up, or otherwise change something.
- When you need to modify app data, finish your normal short reply, then put one final line exactly like: HABIT_OS_ACTIONS=[...]
- The actions JSON must be a valid array. Do not wrap it in markdown.
- Supported actions:
  - {"type":"habit.check","habitId":"...","habitName":"...","date":"YYYY-MM-DD","status":"completed"}
  - {"type":"habit.clear","habitId":"...","habitName":"...","date":"YYYY-MM-DD"}
  - {"type":"habit.create","name":"...","emoji":"...","category":"...","targetType":"boolean","minimumValue":null,"unit":null}
  - {"type":"habit.update","habitId":"...","habitName":"...","name":"...","emoji":"...","category":"...","minimumValue":null,"unit":null,"active":true}
  - {"type":"todo.create","date":"YYYY-MM-DD","title":"...","priority":"medium","estimatedMinutes":25}
  - {"type":"todo.update","todoId":"...","todoTitle":"...","date":"YYYY-MM-DD","status":"done"}
  - {"type":"todo.delete","todoId":"...","todoTitle":"...","date":"YYYY-MM-DD"}
  - {"type":"schedule.create","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","title":"...","category":"...","habitId":"...","isLocked":false}
  - {"type":"schedule.update","blockId":"...","blockTitle":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","title":"...","category":"...","status":"planned"}
  - {"type":"schedule.delete","blockId":"...","blockTitle":"..."}
  - {"type":"schedule.clear","date":"YYYY-MM-DD","scope":"day","mode":"delete"}
- Prefer IDs from context over names when available.
- If the user asks to free up or clear a schedule, use schedule.clear instead of deleting blocks one by one.
- If the user asks you to set up habits but does not name the habits yet, ask 1 short follow-up question instead of inventing them.
- If the user is only asking for advice, do not output HABIT_OS_ACTIONS.`;

const activeStreams = new Map<string, AbortController>();

export type CoachModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function checkOllamaHealth(
  repository: HabitRepository,
): Promise<OllamaHealth> {
  const settings = repository.getAiSettings();
  try {
    const response = await fetch(
      `${normalizeOllamaBaseUrl(settings.ollamaBaseUrl)}/api/tags`,
      { signal: AbortSignal.timeout(1500) },
    );
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const json = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    const installedModels = json.models?.map((model) => model.name) ?? [];
    if (installedModels.length === 0) {
      return {
        available: false,
        baseUrl: settings.ollamaBaseUrl,
        activeModel: settings.activeModel,
        message:
          "Ollama is running, but no local models are installed. Run `ollama pull llama3.2:3b` or choose an installed model in Settings.",
      };
    }
    const selection = chooseCoachModel(settings, installedModels);
    if (!selection.model) {
      return {
        available: false,
        baseUrl: settings.ollamaBaseUrl,
        activeModel: settings.activeModel,
        message:
          "Ollama is running, but no local models are installed. Run `ollama pull llama3.2:3b` or choose an installed model in Settings.",
      };
    }
    return {
      available: true,
      baseUrl: settings.ollamaBaseUrl,
      activeModel: selection.model,
      message: selection.installed
        ? `Ollama is running with ${selection.model}`
        : `Ollama is running, but ${settings.activeModel} is not installed.`,
    };
  } catch {
    return {
      available: false,
      baseUrl: settings.ollamaBaseUrl,
      activeModel: settings.activeModel,
      message: "AI Coach unavailable. Start Ollama to use local chat.",
    };
  }
}

export async function listInstalledModels(
  repository: HabitRepository,
): Promise<string[]> {
  const settings = repository.getAiSettings();
  try {
    const response = await fetch(
      `${normalizeOllamaBaseUrl(settings.ollamaBaseUrl)}/api/tags`,
      { signal: AbortSignal.timeout(2500) },
    );
    if (!response.ok) return [];
    const json = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    return json.models?.map((model) => model.name) ?? [];
  } catch {
    return [];
  }
}

export async function streamCoachMessage(input: {
  repository: HabitRepository;
  window: BrowserWindow;
  sessionId?: string;
  message: string;
  quickAction?: string;
}): Promise<{
  sessionId: string;
  turnId: string;
  assistantMessage?: ChatMessage;
}> {
  const session = input.repository.getOrCreateSession(input.sessionId);
  const turnId = randomUUID();
  const prompt = buildUserPrompt(input.message, input.quickAction);
  sendCoachStatus(
    input.window,
    session.id,
    turnId,
    "received",
    "Message received.",
  );
  sendCoachStatus(
    input.window,
    session.id,
    turnId,
    "preparing_context",
    "Preparing your habit context.",
  );
  const context = input.repository.buildCoachContext(prompt);
  const explicitMutation = isExplicitMutationRequest(prompt);
  const deterministicActions = explicitMutation
    ? extractDeterministicCoachActions(prompt, context)
    : [];
  input.repository.addChatMessage({
    sessionId: session.id,
    role: "user",
    content: prompt,
    contextJson: JSON.stringify(context),
  });
  const history = input.repository.listChatMessages(session.id);

  const controller = new AbortController();
  activeStreams.set(session.id, controller);
  input.window.webContents.send("coach:token", {
    sessionId: session.id,
    turnId,
    token: "",
  });

  try {
    const streamedContent = await streamOllama({
      repository: input.repository,
      context,
      history,
      signal: controller.signal,
      onStatus: (status, message) =>
        sendCoachStatus(input.window, session.id, turnId, status, message),
      onToken: (token) =>
        input.window.webContents.send("coach:token", {
          sessionId: session.id,
          turnId,
          token,
        }),
    });
    const parsed = parseCoachActionResponse(streamedContent);
    const candidateActions = explicitMutation
      ? [...deterministicActions, ...parsed.actions]
      : [];
    const actionResults =
      candidateActions.length > 0
        ? (sendCoachStatus(
            input.window,
            session.id,
            turnId,
            "preparing_context",
            "Applying requested habit changes.",
          ),
          applyCoachActions({
            repository: input.repository,
            context,
            actions: candidateActions,
          }))
        : [];
    const content = appendActionSummary(
      parsed.visibleContent,
      actionResults,
      explicitMutation ? parsed.parseErrors : [],
    );
    const assistantMessage = input.repository.addChatMessage({
      sessionId: session.id,
      role: "assistant",
      content,
      contextJson: null,
    });
    sendCoachStatus(
      input.window,
      session.id,
      turnId,
      "done",
      "Coach response complete.",
    );
    input.window.webContents.send("coach:done", {
      sessionId: session.id,
      turnId,
      message: assistantMessage,
    });
    return { sessionId: session.id, turnId, assistantMessage };
  } catch (error) {
    if (deterministicActions.length > 0 && !controller.signal.aborted) {
      sendCoachStatus(
        input.window,
        session.id,
        turnId,
        "preparing_context",
        "Applying clear app command without local chat.",
      );
      const actionResults = applyCoachActions({
        repository: input.repository,
        context,
        actions: deterministicActions,
      });
      const content = appendActionSummary(
        "I applied the clear app changes. Local chat failed, but the command was specific enough to run safely.",
        actionResults,
      );
      const assistantMessage = input.repository.addChatMessage({
        sessionId: session.id,
        role: "assistant",
        content,
        contextJson: null,
      });
      sendCoachStatus(
        input.window,
        session.id,
        turnId,
        "done",
        "App changes applied.",
      );
      input.window.webContents.send("coach:done", {
        sessionId: session.id,
        turnId,
        message: assistantMessage,
      });
      return { sessionId: session.id, turnId, assistantMessage };
    }
    const message = error instanceof Error ? error.message : "Unknown AI error";
    sendCoachStatus(input.window, session.id, turnId, "error", message);
    input.window.webContents.send("coach:error", {
      sessionId: session.id,
      turnId,
      message,
    });
    throw error;
  } finally {
    activeStreams.delete(session.id);
  }
}

export function cancelCoachStream(sessionId?: string): void {
  if (sessionId) {
    activeStreams.get(sessionId)?.abort();
    activeStreams.delete(sessionId);
    return;
  }
  for (const controller of activeStreams.values()) controller.abort();
  activeStreams.clear();
}

async function streamOllama(input: {
  repository: HabitRepository;
  context: CoachContext;
  history: ChatMessage[];
  signal: AbortSignal;
  onStatus: (status: CoachStatus, message?: string) => void;
  onToken: (token: string) => void;
}): Promise<string> {
  const settings = input.repository.getAiSettings();
  input.onStatus("selecting_model", "Checking installed Ollama models.");
  const installedModels = await listInstalledModels(input.repository);
  const selection = chooseCoachModel(settings, installedModels);
  if (!selection.model) {
    throw new Error(
      "No Ollama model is installed. Pull one with `ollama pull llama3.2:3b`, then select it in Settings.",
    );
  }
  if (selection.installed && selection.model !== settings.activeModel) {
    input.repository.setAiModel({ activeModel: selection.model });
  }

  input.onStatus(
    "contacting_model",
    selection.installed
      ? `Contacting ${selection.model}.`
      : `Trying ${selection.model}, but it was not confirmed in Ollama.`,
  );
  const response = await fetch(
    `${normalizeOllamaBaseUrl(settings.ollamaBaseUrl)}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({
        model: selection.model,
        stream: true,
        options: {
          temperature: 0.72,
          top_p: 0.9,
          repeat_penalty: 1.12,
        },
        messages: buildCoachModelMessages(input.context, input.history),
      }),
    },
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Ollama error: ${response.status}${detail ? ` - ${detail.slice(0, 180)}` : ""}`,
    );
  }

  input.onStatus("streaming", "Receiving tokens from the local model.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines.filter(Boolean)) {
      let json: {
        message?: { content?: string };
        error?: string;
        done?: boolean;
      };
      try {
        json = JSON.parse(line) as {
          message?: { content?: string };
          error?: string;
          done?: boolean;
        };
      } catch {
        throw new Error(
          `Ollama returned malformed stream data: ${line.slice(0, 120)}`,
        );
      }
      if (json.error) throw new Error(`Ollama error: ${json.error}`);
      const token = json.message?.content ?? "";
      if (token) {
        full += token;
        input.onToken(token);
      }
    }
  }

  if (!full.trim()) {
    throw new Error(
      "Ollama returned an empty response. Check the selected model in Settings, then try again.",
    );
  }
  return full;
}

function sendCoachStatus(
  window: BrowserWindow,
  sessionId: string,
  turnId: string,
  status: CoachStatus,
  message?: string,
): void {
  window.webContents.send("coach:status", {
    sessionId,
    turnId,
    status,
    message,
  });
}

export function buildCoachModelMessages(
  context: CoachContext,
  history: ChatMessage[],
): CoachModelMessage[] {
  const recentHistory = history
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .slice(-10)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  const messages: CoachModelMessage[] = [
    { role: "system", content: COACH_SYSTEM_PROMPT },
    { role: "system", content: buildCompactContextPrompt(context) },
    ...recentHistory,
  ];

  if (
    !recentHistory.some(
      (message) =>
        message.role === "user" && message.content === context.userQuestion,
    )
  ) {
    messages.push({ role: "user", content: context.userQuestion });
  }

  return messages;
}

function buildCompactContextPrompt(context: CoachContext): string {
  const completedHabits = context.today.habits
    .filter(
      (habit) => habit.status === "completed" || habit.status === "minimum",
    )
    .map(
      (habit) =>
        `${habit.name}${habit.status === "minimum" ? " (minimum)" : ""}`,
    )
    .slice(0, 12);
  const openTodos = context.today.todos
    .filter((todo) => todo.status !== "done")
    .map((todo) => `${todo.id} "${todo.title}" [${todo.status}]`)
    .slice(0, 10);
  const plannedBlocks = context.today.plannedBlocks
    .map((block) => `${block.startTime}-${block.endTime} ${block.title}`)
    .slice(0, 8);
  const weekBlocks = context.weekPlanner.blocks
    .map(
      (block) =>
        `${block.id} ${block.date} ${block.startTime}-${block.endTime} "${block.title}" [${block.category}]`,
    )
    .slice(0, 24);
  const weekOpenTodos = context.weekPlanner.openTodos
    .map((todo) => `${todo.id} ${todo.date} "${todo.title}" [${todo.priority}]`)
    .slice(0, 16);
  const profile = context.userProfileSummary.slice(0, 1200);
  const habitCatalog = context.today.habits
    .map((habit) => `${habit.habitId} "${habit.name}" [${habit.status}]`)
    .slice(0, 40);
  const todayBlockCatalog = context.today.plannedBlocks
    .map(
      (block) =>
        `${block.id} ${block.date} ${block.startTime}-${block.endTime} "${block.title}" [${block.category}]`,
    )
    .slice(0, 16);

  return [
    "Use this app context only when it helps answer the latest user message.",
    "The checked-habit summary omits missing habit names. Do not infer or list missing habits unless the user explicitly asks for that audit.",
    "The habit catalog is for ID matching and user-requested actions only. Do not turn it into an unsolicited missing-habit report.",
    `Latest user message: ${context.userQuestion}`,
    `User profile summary: ${profile || "missing"}`,
    `Today: ${context.today.date}`,
    `Habit catalog for actions: ${habitCatalog.length ? habitCatalog.join("; ") : "none"}`,
    `Checked habits today: ${completedHabits.length ? completedHabits.join(", ") : "none checked yet"}`,
    `Open to-dos: ${openTodos.length ? openTodos.join("; ") : "none"}`,
    `Planner blocks: ${plannedBlocks.length ? plannedBlocks.join("; ") : "none"}`,
    `Today schedule block IDs: ${todayBlockCatalog.length ? todayBlockCatalog.join("; ") : "none"}`,
    `Week schedule blocks: ${weekBlocks.length ? weekBlocks.join("; ") : "none"}`,
    `Week open to-dos: ${weekOpenTodos.length ? weekOpenTodos.join("; ") : "none"}`,
    `Week: completion ${context.currentWeek.completionRate}%, burnout risk ${context.currentWeek.burnoutRisk}`,
    `Month: completion ${context.currentMonth.overallCompletionPercentage}%`,
  ].join("\n");
}

export function chooseCoachModel(
  settings: Pick<
    AiSettings,
    "activeModel" | "defaultModel" | "fallbackModel" | "deepReviewModel"
  >,
  installedModels: string[],
): {
  model: string;
  installed: boolean;
  source:
    | "active"
    | "default"
    | "fallback"
    | "deep_review"
    | "first_installed"
    | "missing_active"
    | "none";
} {
  const candidates = [
    ["active", settings.activeModel],
    ["default", settings.defaultModel],
    ["fallback", settings.fallbackModel],
    ["deep_review", settings.deepReviewModel],
  ] as const;

  for (const [source, requested] of candidates) {
    const installed = findInstalledModel(requested, installedModels);
    if (installed) return { model: installed, installed: true, source };
  }

  if (installedModels[0])
    return {
      model: installedModels[0],
      installed: true,
      source: "first_installed",
    };
  if (settings.activeModel)
    return {
      model: settings.activeModel,
      installed: false,
      source: "missing_active",
    };
  return { model: "", installed: false, source: "none" };
}

function normalizeOllamaBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function findInstalledModel(
  requested: string | null | undefined,
  installedModels: string[],
): string | null {
  if (!requested) return null;
  return (
    installedModels.find((model) => model === requested) ??
    installedModels.find((model) => model === `${requested}:latest`) ??
    installedModels.find(
      (model) => model.replace(/:latest$/, "") === requested,
    ) ??
    null
  );
}

function buildUserPrompt(message: string, quickAction?: string): string {
  if (!quickAction) return message;
  const templates: Record<string, string> = {
    "Review today":
      "Review today from actual data. Name 1 win, 1 bottleneck, and 1 concrete next action. Keep it short.",
    "Plan tomorrow":
      "Plan tomorrow realistically using unfinished to-dos, planner availability, sleep target, and the main project. Do not create a maximal plan.",
    "Fill planner":
      "Fill the planner with realistic schedule blocks using actual to-dos, habits, fixed commitments, sleep, and burnout risk. Apply safe schedule changes now and avoid duplicates.",
    "Check schedule":
      "Check my current week schedule. Find conflicts, overloaded days, missing recovery, sleep risk, and one practical fix. Keep it short.",
    "Prepare schedule":
      "Prepare and apply a realistic schedule for the rest of this week using open to-dos, habits, fixed commitments, sleep, recovery, and burnout risk. Avoid duplicates.",
    "Fix focus":
      "Help me fix focus today. Give 1-3 practical changes and one next action.",
    "Reduce burnout":
      "Reduce burnout risk. Lower load first, protect sleep and key responsibilities, and recommend talking to a trusted person if the pattern looks serious.",
    "Review my week":
      "Review my week from actual metrics. Find patterns and suggest the smallest high-leverage adjustment.",
  };
  return templates[quickAction] ?? `${quickAction}: ${message}`;
}
