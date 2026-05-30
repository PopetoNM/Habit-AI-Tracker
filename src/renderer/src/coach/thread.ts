export type CoachThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function appendAssistantToken(
  messages: CoachThreadMessage[],
  turnId: string,
  token: string,
): CoachThreadMessage[] {
  const assistantId = `assistant-${turnId}`;
  const existing = messages.find((message) => message.id === assistantId);
  if (!existing)
    return [
      ...messages,
      { id: assistantId, role: "assistant", content: token },
    ];
  return messages.map((message) =>
    message.id === assistantId
      ? { ...message, content: `${message.content}${token}` }
      : message,
  );
}

export function ensureAssistantMessage(
  messages: CoachThreadMessage[],
  turnId: string,
  content: string,
): CoachThreadMessage[] {
  const assistantId = `assistant-${turnId}`;
  const existing = messages.find((message) => message.id === assistantId);
  if (existing)
    return messages.map((message) =>
      message.id === assistantId ? { ...message, content } : message,
    );
  return [...messages, { id: assistantId, role: "assistant", content }];
}
