import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

export function NewChatButton({
  collapsed,
  pending,
  onClick,
}: {
  collapsed: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md text-sm hover:bg-sidebar-accent disabled:opacity-50",
        collapsed ? "w-8 justify-center" : "w-full gap-2 px-2",
      )}
    >
      <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className={cn("truncate", collapsed && "sr-only")}>New chat</span>
    </button>
  );
}
