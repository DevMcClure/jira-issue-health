import { CircleCheck, CircleUserRound } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UNASSIGNED, type GroupBy, type TicketGroup } from "@/lib/health/list"
import type { Resolution } from "@/lib/resolutions/types"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"
import { TicketCard } from "./TicketCard"
import { TicketRow } from "./TicketRow"

type Props = {
  groups: TicketGroup[]
  groupBy: GroupBy
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
  fixes: Map<string, Resolution[]>
  onResolve: (key: string) => void
  onUndo: (key: string) => void
}

/** The tickets to fix: a table on wide containers, cards on narrow ones, optionally grouped. */
export function TicketList({ groups, groupBy, expanded, onToggle, fixes, onResolve, onUndo }: Props) {
  const rowProps = (key: string) => ({
    expanded: expanded.has(key),
    onToggle: () => onToggle(key),
    fixes: fixes.get(key),
    onResolve: () => onResolve(key),
    onUndo: () => onUndo(key),
  })
  if (groups.every((g) => g.rows.length === 0)) {
    return (
      <Card className="flex flex-col items-center gap-2 py-16 text-center">
        <CircleCheck className="size-8 text-status-done" aria-hidden />
        <p className="font-medium">No tickets are missing required information for this filter.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={groupBy === "none" ? "Tickets to fix" : `${group.label}: ${group.rows.length} tickets`}>
          {groupBy !== "none" && <GroupHeading group={group} />}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="hidden @4xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead className="w-[34%]">Ticket</TableHead>
                    <TableHead className="w-[26%]">Missing fields</TableHead>
                    <TableHead className="w-[22%]">Affects</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="w-32">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((h) => (
                    <TicketRow key={h.issue.key} health={h} {...rowProps(h.issue.key)} />
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y @4xl:hidden">
              {group.rows.map((h) => (
                <TicketCard key={h.issue.key} health={h} {...rowProps(h.issue.key)} />
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}

function GroupHeading({ group }: { group: TicketGroup }) {
  const meta = group.severity ? SEVERITY_META[group.severity] : null
  const Icon = meta?.icon ?? CircleUserRound
  const unassigned = group.key === UNASSIGNED
  return (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
      <Icon className={cn("size-4", meta?.iconClass ?? (unassigned ? "text-severity-critical" : "text-muted-foreground"))} aria-hidden />
      {group.label}
      {meta && <span className="sr-only">({meta.label.toLowerCase()})</span>}
      <span className="font-normal text-muted-foreground tabular-nums">
        · {group.rows.length} {group.rows.length === 1 ? "ticket" : "tickets"}
      </span>
    </h2>
  )
}
