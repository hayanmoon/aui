import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import type { ChatThread } from "@/components/chat/types";
import { NewChatButton } from "@/components/sidebar/new-chat-button";
import { SidebarAccount } from "@/components/sidebar/sidebar-account";
import { ThreadList } from "@/components/sidebar/thread-list";
import { cn } from "@/lib/utils";
import { PanelLeftIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

export function Sidebar({
  username,
  threads,
  activeId,
  pending,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onSignOut,
  children,
}: {
  username: string;
  threads: ChatThread[];
  activeId: string | null;
  pending: boolean;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-12" : "w-64",
        )}
      >
        <div className="flex h-12 shrink-0 items-center px-2">
          <TooltipIconButton
            tooltip={collapsed ? "Show sidebar" : "Hide sidebar"}
            side="right"
            variant="ghost"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={() => setCollapsed((value) => !value)}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <PanelLeftIcon className="size-4" />
          </TooltipIconButton>
        </div>
        <div className={cn("flex min-h-0 flex-1 flex-col", collapsed ? "px-2" : "px-2 pb-2")}>
          <NewChatButton collapsed={collapsed} pending={pending} onClick={onNewChat} />
          <div className={cn("flex min-h-0 flex-1 flex-col", collapsed && "pointer-events-none invisible")}>
            <ThreadList
              threads={threads}
              activeId={activeId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
            />
          </div>
        </div>
        <SidebarAccount username={username} collapsed={collapsed} onSignOut={onSignOut} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
