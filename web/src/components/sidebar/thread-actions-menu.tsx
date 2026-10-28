import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";

export function ThreadActionsMenu({
  selected,
  readOnly,
  onRename,
  onDelete,
}: {
  selected: boolean;
  readOnly: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Chat actions"
            className={cn(
              "absolute end-1 top-1/2 -translate-y-1/2 group-hover:opacity-100 group-focus-within:opacity-100 aria-expanded:opacity-100",
              selected ? "opacity-100" : "opacity-0",
            )}
          />
        }
      >
        <MoreHorizontalIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="right" align="start" sideOffset={6} className="z-50">
          <Menu.Popup className="min-w-32 rounded-xl border bg-popover p-1.5 text-sm text-popover-foreground shadow-md outline-none">
            {readOnly ? null : (
              <Menu.Item
                className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none select-none data-highlighted:bg-accent"
                onClick={onRename}
              >
                <PencilIcon className="size-4" />
                Rename
              </Menu.Item>
            )}
            <Menu.Item
              className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-destructive outline-none select-none data-highlighted:bg-destructive/10"
              onClick={onDelete}
            >
              <TrashIcon className="size-4" />
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
