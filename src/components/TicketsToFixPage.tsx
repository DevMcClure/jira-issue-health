import { useMemo, useState } from "react"
import { useData } from "@/hooks/useData"
import { checkDataset } from "@/lib/health/checks"
import { DEFAULT_FILTERS, applyFilters, groupTickets, summarise, type Filters, type GroupBy } from "@/lib/health/list"
import { PageHeader } from "./PageHeader"
import { SummaryStrip } from "./SummaryStrip"
import { TicketFilters } from "./TicketFilters"
import { TicketList } from "./TicketList"

/** The app's one view: every ticket missing required information, what that affects, and where to fix it. */
export function TicketsToFixPage() {
  const { dataset } = useData()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const health = useMemo(() => checkDataset(dataset), [dataset])
  const view = useMemo(() => applyFilters(health, filters, dataset), [health, filters, dataset])
  const summary = useMemo(() => summarise(view), [view])
  const groups = useMemo(() => groupTickets(view.rows, groupBy, dataset), [view, groupBy, dataset])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <div className="@container flex flex-col gap-4">
      <PageHeader
        title="Tickets to fix"
        description="Tickets missing information the Jira Dashboard needs, what each gap affects, and where to fix it."
      />
      <TicketFilters filters={filters} onChange={setFilters} groupBy={groupBy} onGroupByChange={setGroupBy} />
      <SummaryStrip summary={summary} />
      <TicketList groups={groups} groupBy={groupBy} expanded={expanded} onToggle={toggle} />
    </div>
  )
}
