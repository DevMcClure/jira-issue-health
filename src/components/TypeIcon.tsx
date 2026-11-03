import { Bookmark, Bug, FlaskConical, ListTree, SquareCheck, Zap, type LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const TYPE_ICON: Record<string, LucideIcon> = {
  Story: Bookmark,
  Bug: Bug,
  Task: SquareCheck,
  "Sub-task": ListTree,
  Epic: Zap,
  Spike: FlaskConical,
}

/** The Jira Dashboard's issue type icons. */
export function TypeIcon({ type, withTooltip = true, className }: { type: string; withTooltip?: boolean; className?: string }) {
  const Icon = TYPE_ICON[type] ?? SquareCheck
  const icon = <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-label={type} role="img" />
  if (!withTooltip) return icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{type}</TooltipContent>
    </Tooltip>
  )
}
