import { CircleUserRound, Timer } from "lucide-react"
import { useData } from "@/hooks/useData"
import type { TicketHealth } from "@/lib/health/checks"
import { currentSprint } from "@/lib/health/list"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"
import { StatusBadge } from "./StatusBadge"

/** Status, assignee and sprint, under the summary. "Unassigned" / "No sprint" are highlighted when they're gaps. */
export function TicketMeta({ health, className }: { health: TicketHealth; className?: string }) {
  const { dataset } = useData()
  const { issue, gaps } = health
  const gapOf = (field: string) => gaps.find((g) => g.field === field)
  const sprint = currentSprint(issue, dataset)
  const assignee = issue.assigneeId ? (dataset.personById.get(issue.assigneeId)?.displayName ?? issue.assigneeId) : null

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <StatusBadge status={issue.status} category={issue.statusCategory} />
      <Flagged gap={assignee ? undefined : gapOf("assigneeId")} icon={CircleUserRound}>
        {assignee ?? "Unassigned"}
      </Flagged>
      <Flagged gap={sprint ? undefined : gapOf("sprintIds")} icon={Timer}>
        {sprint?.name ?? "No sprint"}
      </Flagged>
    </div>
  )
}

function Flagged({
  gap,
  icon: Icon,
  children,
}: {
  gap: { severity: keyof typeof SEVERITY_META } | undefined
  icon: typeof Timer
  children: string
}) {
  if (!gap) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Icon className="size-3.5" aria-hidden />
        {children}
      </span>
    )
  }
  const meta = SEVERITY_META[gap.severity]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-px font-medium whitespace-nowrap text-foreground",
        meta.borderClass,
      )}
    >
      <meta.icon className={cn("size-3.5", meta.iconClass)} aria-hidden />
      {children}
    </span>
  )
}
