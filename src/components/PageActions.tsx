import { Eraser, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  resolvedCount: number
  onClearResolutions: () => void
}

/** The page's header actions. */
export function PageActions({ resolvedCount, onClearResolutions }: Props) {
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Local changes (this browser)</DropdownMenuLabel>
          <DropdownMenuItem disabled={resolvedCount === 0} onSelect={onClearResolutions}>
            <Eraser />
            Clear local resolutions
            {resolvedCount > 0 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{resolvedCount}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
