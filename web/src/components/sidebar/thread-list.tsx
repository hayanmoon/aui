import type { ChatThread } from "@/components/chat/types";
import { ThreadListItem } from "@/components/sidebar/thread-list-item";
import { MessagesSquareIcon } from "lucide-react";

export function ThreadList({
  threads,
  activeId,
  onSelect,
  onRename,
  onDelete,
}: {
  threads: ChatThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
      <div className="mb-0.5 flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
        <MessagesSquareIcon className="size-3.5" />
        <span>CHATS</span>
        <span className="ml-auto tabular-nums">{threads.length}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {threads.map((thread) => (
          <ThreadListItem
            key={thread.id}
            thread={thread}
            selected={thread.id === activeId}
            onSelect={() => onSelect(thread.id)}
            onRename={(title) => onRename(thread.id, title)}
            onDelete={() => onDelete(thread.id)}
          />
        ))}
      </div>
    </div>
  );
}
