import { useEffect, useRef, useState } from "react";
import type { ChatThread } from "@/components/chat/types";
import { ThreadActionsMenu } from "@/components/sidebar/thread-actions-menu";
import { cn } from "@/lib/utils";

export function ThreadListItem({
  thread,
  selected,
  onSelect,
  onRename,
  onDelete,
}: {
  thread: ChatThread;
  selected: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.select();
  }, [renaming]);

  const commit = () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === thread.title) {
      setDraft(thread.title);
      return;
    }
    onRename(next);
  };

  const cancel = () => {
    setDraft(thread.title);
    setRenaming(false);
  };

  return (
    <div
      data-selected={selected ? "" : undefined}
      className={cn(
        "group relative flex h-8 items-center rounded-md",
        selected ? "bg-sidebar-accent" : "hover:bg-sidebar-accent",
      )}
    >
      {renaming ? (
        <input
          ref={inputRef}
          aria-label="Rename chat"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-md bg-background px-2 text-sm outline-none ring-1 ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 pe-8 text-left text-sm"
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", selected ? "bg-sky-500" : "bg-transparent")} />
          <span className="truncate">{thread.title}</span>
        </button>
      )}
      {renaming ? null : (
        <ThreadActionsMenu
          selected={selected}
          readOnly={thread.readOnly}
          onRename={() => {
            if (thread.readOnly) return;
            setDraft(thread.title);
            setRenaming(true);
          }}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
