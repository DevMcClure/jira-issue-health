import { Check, Minus, X } from "lucide-react"
import { useMemo } from "react"
import { useData } from "@/hooks/useData"
import type { TicketHealth } from "@/lib/health/checks"
import { suggestionsFor } from "@/lib/health/hints"
import { cn } from "@/lib/utils"
import { ImpactChips } from "./ImpactChips"
import { SeverityBadge } from "./SeverityBadge"
import { SEVERITY_META } from "./severity"
import { SuggestionNote } from "./SuggestionNote"

/** The expanded row: every required field for the ticket's type, and for each gap why it matters, what it affects and a suggested value. */
export function TicketDetail({ health }: { health: TicketHealth }) {
  const { dataset } = useData()
  const { issue, fields, gaps } = health
  // Only computed for expanded rows.
  const suggestions = useMemo(() => suggestionsFor(issue, gaps.map((g) => g.field), dataset), [issue, gaps, dataset])
  return (
    <div className="grid gap-6 py-2 @3xl:grid-cols-[minmax(14rem,1fr)_2fr]">
      <section aria-label={`Required fields for ${issue.key}`}>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Required for a {issue.type}</h3>
        <ul className="space-y-1.5 text-sm">
          {fields.map((f) => {
            const gap = gaps.find((g) => g.field === f.field)
            return (
              <li key={f.field} className="flex items-start gap-2">
                {f.state === "missing" && gap ? (
                  <X className={cn("mt-0.5 size-4 shrink-0", SEVERITY_META[gap.severity].iconClass)} aria-hidden />
                ) : f.state === "present" ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-status-done" aria-hidden />
                ) : (
                  <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className={cn(f.state === "missing" ? "font-medium" : "text-muted-foreground")}>
                  {f.label}
                  <span className="text-muted-foreground">
                    {" · "}
                    {f.state === "missing" ? "missing" : f.state === "present" ? "present" : `not required (${f.whenLabel})`}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label={`What to fix on ${issue.key}`} className="space-y-4">
        <h3 className="text-xs font-medium text-muted-foreground">What to fix</h3>
        {gaps.length === 0 && <p className="text-sm text-muted-foreground">Nothing left to fix: every required field is filled in.</p>}
        {gaps.map((gap) => (
          <div key={gap.field} className="space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {gap.label}
              <SeverityBadge severity={gap.severity} className="text-xs font-normal text-muted-foreground" />
            </p>
            <p className="text-sm text-muted-foreground">{gap.why}</p>
            <ImpactChips affects={gap.affects} withPage />
            <SuggestionNote issue={issue} gap={gap} suggestion={suggestions[gap.field]} />
          </div>
        ))}
      </section>
    </div>
  )
}
