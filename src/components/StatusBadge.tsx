import { Badge } from "@/components/ui/badge"
import { statusColorVar } from "@/lib/jira/status"
import type { StatusCategory } from "@/lib/jira/types"
import { cn } from "@/lib/utils"

/** Outline badge with a leading dot in the status colour, as in the Jira Dashboard. */
export function StatusBadge({ status, category, className }: { status: string; category: StatusCategory; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal whitespace-nowrap", className)}>
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ backgroundColor: `var(${statusColorVar(status, category)})` }}
      />
      {status}
    </Badge>
  )
}
