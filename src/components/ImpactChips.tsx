import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DASHBOARD_VIEW_IDS, affectedViews, type DashboardView, type DashboardViewId } from "@/lib/health/impact"
import { cn } from "@/lib/utils"

const CHIP = "inline-flex items-center rounded-md border bg-secondary/60 px-1.5 py-0.5 text-xs text-secondary-foreground whitespace-nowrap"

type Props = {
  affects: DashboardViewId[]
  /** Show at most this many, then "+N". Omit to show all. */
  max?: number
  /** Add the Jira Dashboard page to each chip ("Velocity · Teams"). */
  withPage?: boolean
  className?: string
}

/** The Jira Dashboard views a ticket's gaps degrade; each says why on hover. */
export function ImpactChips({ affects, max, withPage = false, className }: Props) {
  if (affects.length === 0) return null
  // A missing team degrades every view: say so once.
  if (DASHBOARD_VIEW_IDS.every((id) => affects.includes(id))) {
    return (
      <span className={cn("flex flex-wrap gap-1", className)}>
        <ViewChip label="All team views" tip="Without a team, the ticket drops out of every team-filtered view." />
      </span>
    )
  }
  const views = affectedViews(affects)
  const shown = max === undefined ? views : views.slice(0, max)
  const hidden = views.slice(shown.length)
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((v) => (
        <ViewChip key={v.id} label={withPage ? `${v.label} · ${v.page}` : v.label} tip={tipFor(v)} />
      ))}
      {hidden.length > 0 && <ViewChip label={`+${hidden.length}`} tip={hidden.map((v) => v.label).join(", ")} aria={`${hidden.length} more: ${hidden.map((v) => v.label).join(", ")}`} />}
    </span>
  )
}

const tipFor = (v: DashboardView) => `${v.uses} (Jira Dashboard: ${v.page})`

function ViewChip({ label, tip, aria }: { label: string; tip: string; aria?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={CHIP} aria-label={aria ?? `${label}: ${tip}`}>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  )
}
