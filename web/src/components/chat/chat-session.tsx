import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ThreadHistoryAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { useMemo, useRef } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadStoredMessages, upsertStoredMessage } from "@/lib/thread-db";

function messageText(message: ThreadMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

type TextPart = { type: "text"; text: string };
type ReasoningPart = { type: "reasoning"; text: string };
type ToolPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
};
type ContentPart = TextPart | ReasoningPart | ToolPart;
type ChatEvent = { content?: ContentPart[]; text?: string; done?: boolean; error?: string };

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((entry) => entry.startsWith("data: "));
      if (!line) continue;
      yield JSON.parse(line.slice(6)) as ChatEvent;
    }
    if (done) return;
  }
}

const readOnlyAdapter: ChatModelAdapter = {
  async *run() {
    throw new Error("This chat is read-only");
  },
};

function createHistoryAdapter(sessionId: string): ThreadHistoryAdapter {
  return {
    scopeId: sessionId,
    load: () => loadStoredMessages(sessionId),
    append: (item) => upsertStoredMessage(sessionId, item),
    update: (item) => upsertStoredMessage(sessionId, item),
  };
}

function createAdapter(sessionId: string, onFirstMessage: (text: string) => void): ChatModelAdapter {
  let titled = false;
  return {
    async *run({ messages, abortSignal }) {
      const user = [...messages].reverse().find((message) => message.role === "user");
      const message = user ? messageText(user) : "";
      if (!titled && message) {
        titled = true;
        onFirstMessage(message);
      }
      const response = await fetch("/api/session/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId, message }),
        signal: abortSignal,
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Chat failed");
      }
      if (!response.body) throw new Error("Chat failed");

      let content: ContentPart[] = [];
      for await (const event of readEvents(response.body)) {
        if (event.error) throw new Error(event.error);
        if (event.content) content = event.content;
        else if (typeof event.text === "string") content = [{ type: "text", text: event.text }];
        if (content.length === 0) continue;
        yield { content: content as ChatModelRunResult["content"] };
      }
    },
  };
}

export function ChatSession({
  sessionId,
  readOnly,
  onFirstMessage,
}: {
  sessionId: string;
  readOnly: boolean;
  onFirstMessage: (text: string) => void;
}) {
  const onFirstMessageRef = useRef(onFirstMessage);
  onFirstMessageRef.current = onFirstMessage;
  const adapter = useMemo(
    () => (readOnly ? readOnlyAdapter : createAdapter(sessionId, (text) => onFirstMessageRef.current(text))),
    [readOnly, sessionId],
  );
  const history = useMemo(() => createHistoryAdapter(sessionId), [sessionId]);
  const runtimeOptions = useMemo(() => ({ adapters: { history } }), [history]);
  const runtime = useLocalRuntime(adapter, runtimeOptions);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <Thread readOnly={readOnly} />
      </TooltipProvider>
    </AssistantRuntimeProvider>
  );
}
