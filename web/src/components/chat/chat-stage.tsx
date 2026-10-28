import type { ChatThread } from "@/components/chat/types";
import { ChatSession } from "@/components/chat/chat-session";

export function ChatStage({
  threads,
  activeId,
  error,
  onFirstMessage,
}: {
  threads: ChatThread[];
  activeId: string | null;
  error: string | null;
  onFirstMessage: (id: string, text: string) => void;
}) {
  return (
    <>
      {error ? <p className="px-4 py-2 text-sm text-destructive">{error}</p> : null}
      <div className="relative min-h-0 flex-1">
        {threads.map((thread) => (
          <div key={thread.id} className={thread.id === activeId ? "absolute inset-0" : "hidden"}>
            <ChatSession
              sessionId={thread.id}
              readOnly={thread.readOnly}
              onFirstMessage={(text) => onFirstMessage(thread.id, text)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
