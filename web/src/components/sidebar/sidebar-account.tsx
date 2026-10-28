import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { LogOutIcon } from "lucide-react";

export function SidebarAccount({
  username,
  collapsed,
  onSignOut,
}: {
  username: string;
  collapsed: boolean;
  onSignOut: () => void;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center border-t border-sidebar-border py-2",
        collapsed ? "justify-center px-2" : "gap-2 px-3",
      )}
    >
      {collapsed ? null : <span className="min-w-0 flex-1 truncate text-sm">{username}</span>}
      <TooltipIconButton
        tooltip="Sign out"
        side={collapsed ? "right" : "top"}
        aria-label="Sign out"
        onClick={onSignOut}
        className="text-muted-foreground hover:text-foreground"
      >
        <LogOutIcon className="size-3.5" />
      </TooltipIconButton>
    </div>
  );
}
