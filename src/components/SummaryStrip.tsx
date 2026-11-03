import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { Summary } from "@/lib/health/list"
import { SEVERITIES } from "@/lib/health/requiredFields"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"

/** Small stat tiles for the current filter. Numbers stay in text colour; severity is carried by icon and label. */
export function SummaryStrip({ summary, resolved }: { summary: Summary; resolved: { full: number; partial: number } }) {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-[1fr_1.5fr_1fr_1fr]" role="group" aria-label="Summary for the current filter">
      <Tile label="Tickets needing updates">
        <span className="text-2xl font-semibold tabular-nums">{summary.needing}</span>
        <span className="ml-1.5 text-sm text-muted-foreground tabular-nums">of {summary.total}</span>
      </Tile>
      <Tile label="By severity">
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
      <Tile label="Resolved locally">
        <span className="text-2xl font-semibold tabular-nums">{resolved.full}</span>
        <span className="ml-1.5 text-sm text-muted-foreground tabular-nums">
          resolved{resolved.partial > 0 && ` · ${resolved.partial} partly`}
        </span>
      </Tile>
    </div>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="flex flex-wrap items-baseline">{children}</p>
      </CardContent>
    </Card>
  )
}
