import { CircleCheck, CircleUserRound, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useData } from "@/hooks/useData"
import type { Fix } from "@/lib/api/contract"
import { UNASSIGNED, type GroupBy, type TicketGroup } from "@/lib/health/list"
import type { ListRow } from "@/lib/health/live-rows"
import { SEVERITIES, type Severity } from "@/lib/health/requiredFields"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"
import { TicketCard } from "./TicketCard"
import { TicketRow } from "./TicketRow"

export type RowGroup = Omit<TicketGroup, "rows"> & {
  rows: ListRow[]
  /** The "Fixed with Resolve" group shown by "Show fixed". */
  fixed?: boolean
}

type Props = {
  groups: RowGroup[]
  groupBy: GroupBy
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
  fixes: ReadonlyMap<string, Fix[]>
  onResolve: (key: string) => void
  /** Filters other than the defaults are on (the empty state offers a reset). */
  filtered: boolean
  onResetFilters: () => void
}

/** The tickets to fix: a table on wide containers, cards on narrow ones, optionally grouped. */
export function TicketList({ groups, groupBy, expanded, onToggle, fixes, onResolve, filtered, onResetFilters }: Props) {
  const rowProps = (row: ListRow) => {
    const key = row.health.issue.key
    return {
      health: row.health,
      mark: row.mark,
      expanded: expanded.has(key),
      onToggle: () => onToggle(key),
      fixes: fixes.get(key),
      onResolve: () => onResolve(key),
    }
  }

  if (groups.every((g) => g.rows.length === 0)) return <EmptyState filtered={filtered} onResetFilters={onResetFilters} />

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={groupBy === "none" && !group.fixed ? "Tickets to fix" : `${group.label}: ${group.rows.length} tickets`}>
          {(groupBy !== "none" || group.fixed) && <GroupHeading group={group} />}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="hidden @4xl:block">
              <Table className="table-fixed">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10" />
                    <TableHead className="w-[38%]">Ticket</TableHead>
                    <TableHead className="w-[25%]">Missing</TableHead>
                    <TableHead>Affects</TableHead>
                    <TableHead className="w-28">Severity</TableHead>
                    <TableHead className="w-32">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TicketRow key={row.health.issue.key} {...rowProps(row)} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y @4xl:hidden">
              {group.rows.map((row) => (
                <TicketCard key={row.health.issue.key} {...rowProps(row)} />
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

function GroupHeading({ group }: { group: RowGroup }) {
  const meta = group.severity ? SEVERITY_META[group.severity] : null
  const Icon = group.fixed ? CircleCheck : (meta?.icon ?? CircleUserRound)
  const unassigned = group.key === UNASSIGNED
  const counts = new Map<Severity, number>()
  for (const r of group.rows) if (r.health.severity) counts.set(r.health.severity, (counts.get(r.health.severity) ?? 0) + 1)

  return (
    <h2 className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
      <Icon
        className={cn("size-4", group.fixed ? "text-brand" : (meta?.iconClass ?? (unassigned ? "text-severity-critical" : "text-muted-foreground")))}
        aria-hidden
      />
      {group.label}
      {meta && <span className="sr-only">({meta.label.toLowerCase()})</span>}
      <span className="font-normal text-muted-foreground tabular-nums">
        · {group.rows.length} {group.rows.length === 1 ? "ticket" : "tickets"}
      </span>
      {!group.severity && counts.size > 1 && (
        <span className="flex items-center gap-2 font-normal text-muted-foreground">
          {SEVERITIES.filter((s) => counts.has(s)).map((s) => {
            const { icon: SIcon, iconClass, label } = SEVERITY_META[s]
            return (
              <span key={s} className="inline-flex items-center gap-1 text-xs tabular-nums">
                <SIcon className={cn("size-3.5", iconClass)} aria-hidden />
                {counts.get(s)}
                <span className="sr-only">{label.toLowerCase()}</span>
              </span>
            )
          })}
        </span>
      )}
    </h2>
  )
}

/** Nothing to fix: worth celebrating when it's the whole view; a nudge when filters hide everything. */
function EmptyState({ filtered, onResetFilters }: { filtered: boolean; onResetFilters: () => void }) {
  const { mode } = useData()
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {filtered ? (
        <CircleCheck className="size-9 text-status-done" aria-hidden />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-brand/10">
          <PartyPopper className="size-6 text-brand" aria-hidden />
        </span>
      )}
      <div className="space-y-1">
        <p className="font-medium">{filtered ? "Nothing to fix for these filters" : "All clear: nothing to fix"}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {filtered
            ? "Every ticket that matches has the information the Jira Dashboard needs."
            : "Every ticket in active sprints has what the Jira Dashboard needs."}{" "}
          {mode === "api" && "New gaps appear here as soon as they show up in Jira."}
        </p>
      </div>
      {filtered && (
        <Button variant="outline" size="sm" onClick={onResetFilters}>
          Reset filters
        </Button>
      )}
    </Card>
  )
}
