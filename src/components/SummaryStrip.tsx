import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { Summary } from "@/lib/health/list"
import { SEVERITIES } from "@/lib/health/requiredFields"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"

/** Small stat tiles for the current filter. Numbers stay in text colour; severity is carried by icon and label. */
type Props = {
  summary: Summary
  /** Tickets in this view fixed with Resolve in the past week, and by how many people. */
  fixedThisWeek: { tickets: number; people: number }
}

export function SummaryStrip({ summary, fixedThisWeek }: Props) {
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-3 @5xl:grid-cols-[1fr_1.5fr_1fr_1fr]" role="group" aria-label="Summary for the current filter">
      <Tile label="Tickets needing updates">
        <span className="text-2xl font-semibold tabular-nums">{summary.needing}</span>
        <span className="ml-1.5 text-sm text-muted-foreground tabular-nums">of {summary.total}</span>
      </Tile>
      <Tile label="By severity" className="col-span-2 @5xl:col-span-1">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {SEVERITIES.map((s) => {
            const { label, icon: Icon, iconClass } = SEVERITY_META[s]
            return (
              <span key={s} className="inline-flex items-center gap-1.5 text-sm">
                <Icon className={cn("size-4 self-center", iconClass)} aria-hidden />
                <span className="text-2xl font-semibold tabular-nums">{summary.bySeverity[s]}</span>
                <span className="text-muted-foreground">{label}</span>
              </span>
            )
          })}
        </span>
      </Tile>
      <Tile label="Most common gap">
        {summary.topField ? (
          <>
            <span className="text-xl font-semibold">{summary.topField.label}</span>
            <span className="ml-1.5 text-sm text-muted-foreground tabular-nums">
              {summary.topField.count} {summary.topField.count === 1 ? "ticket" : "tickets"}
            </span>
          </>
        ) : (
          <span className="text-xl font-semibold text-muted-foreground">None</span>
        )}
      </Tile>
      <Tile label="Fixed with Resolve this week">
        <span className="text-2xl font-semibold tabular-nums">{fixedThisWeek.tickets}</span>
        <span className="ml-1.5 text-sm text-muted-foreground tabular-nums">
          {fixedThisWeek.tickets === 1 ? "ticket" : "tickets"}
          {fixedThisWeek.people > 0 && ` · ${fixedThisWeek.people} ${fixedThisWeek.people === 1 ? "person" : "people"}`}
        </span>
      </Tile>
    </div>
  )
}

function Tile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-0 py-3", className)}>
      <CardContent className="space-y-1 px-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="flex flex-wrap items-baseline">{children}</p>
      </CardContent>
    </Card>
  )
}
