import { describe, expect, it } from "vitest";
import {
  appendAssistantToken,
  ensureAssistantMessage,
} from "../../src/renderer/src/coach/thread";

describe("coach thread helpers", () => {
  it("streams separate turns into separate assistant bubbles", () => {
    const firstTurn = appendAssistantToken([], "turn-1", "First");
    const continuedFirstTurn = appendAssistantToken(
      firstTurn,
      "turn-1",
      " answer",
    );
    const secondTurn = appendAssistantToken(
      continuedFirstTurn,
      "turn-2",
      "Second answer",
    );

    expect(secondTurn).toEqual([
      { id: "assistant-turn-1", role: "assistant", content: "First answer" },
      { id: "assistant-turn-2", role: "assistant", content: "Second answer" },
    ]);
  });

  it("replaces streamed raw content with the final sanitized assistant message", () => {
    const streamed = appendAssistantToken(
      [],
      "turn-1",
      'Done.\nHABIT_OS_ACTIONS=[{"type":"habit.check"}]',
    );

    expect(ensureAssistantMessage(streamed, "turn-1", "Done.")).toEqual([
      { id: "assistant-turn-1", role: "assistant", content: "Done." },
    ]);
  });
});
