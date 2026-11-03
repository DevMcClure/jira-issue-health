import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useData } from "@/hooks/useData"
import { useResolutions } from "@/hooks/useResolutions"
import { checkDataset, checkIssue } from "@/lib/health/checks"
import { DEFAULT_FILTERS, applyFilters, groupTickets, summarise, type Filters, type GroupBy } from "@/lib/health/list"
import { applyResolutions } from "@/lib/resolutions/overlay"
import type { Resolution } from "@/lib/resolutions/types"
import { resolvedCounts, resolvedRows } from "@/lib/resolutions/view"
import { PageActions } from "./PageActions"
import { PageHeader } from "./PageHeader"
import { ResolveDialog } from "./ResolveDialog"
import { SummaryStrip } from "./SummaryStrip"
import { TicketFilters } from "./TicketFilters"
import { TicketList } from "./TicketList"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The app's one view: every ticket missing required information, what that affects, and where to fix it. */
export function TicketsToFixPage() {
  const { dataset } = useData()
  const { resolutions, byIssue, save, undo, undoIssue, clear, restore } = useResolutions()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [showResolved, setShowResolved] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)

  // Checks run on the data with local resolutions laid over it; the loaded data itself never changes.
  const baseHealth = useMemo(() => checkDataset(dataset), [dataset])
  const overlaid = useMemo(() => applyResolutions(dataset, resolutions), [dataset, resolutions])
  const health = useMemo(() => checkDataset(overlaid), [overlaid])
  const current = useMemo(() => new Map(health.map((h) => [h.issue.key, h])), [health])

  const view = useMemo(() => applyFilters(health, filters, overlaid), [health, filters, overlaid])
  const summary = useMemo(() => summarise(view), [view])
  const resolvedInput = useMemo(
    () => ({ baseHealth, baseDataset: dataset, current, byIssue, filters }),
    [baseHealth, dataset, current, byIssue, filters],
  )
  const resolved = useMemo(() => resolvedCounts(resolvedInput), [resolvedInput])
  const rows = useMemo(
    () => (showResolved ? [...view.rows, ...resolvedRows(resolvedInput)] : view.rows),
    [showResolved, view, resolvedInput],
  )
  const groups = useMemo(() => groupTickets(rows, groupBy, dataset), [rows, groupBy, dataset])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const onSave = (resolution: Resolution) => {
    const key = resolution.issueKey
    const kept = save(resolution)
    setResolvingKey(null)
    const left = checkIssue({ ...current.get(key)!.issue, ...resolution.values }).gaps.length
    toast.success(left ? `${key} partly resolved locally` : `${key} resolved locally`, {
      description: [
        left ? `${plural(left, "gap", "gaps")} left.` : "Saved in this browser only; nothing was sent to Jira.",
        kept ? "" : "Your browser won't keep it after a refresh.",
      ]
        .join(" ")
        .trim(),
      action: { label: "Undo", onClick: () => undo(resolution) },
    })
  }

  const onUndoIssue = (key: string) => {
    const removed = byIssue.get(key) ?? []
    undoIssue(key)
    toast(`Local changes to ${key} undone`, { action: { label: "Redo", onClick: () => restore(removed) } })
  }

  const onClear = () => {
    const removed = clear()
    toast(`Cleared ${plural(removed.length, "local resolution", "local resolutions")}`, {
      action: { label: "Undo", onClick: () => restore(removed) },
    })
  }

  return (
    <div className="@container flex flex-col gap-4">
      <PageHeader
        title="Tickets to fix"
        description="Tickets missing information the Jira Dashboard needs, what each gap affects, and where to fix it."
        actions={<PageActions resolvedCount={resolutions.length} onClearResolutions={onClear} />}
      />
      <TicketFilters
        filters={filters}
        onChange={setFilters}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        showResolved={showResolved}
        onShowResolvedChange={setShowResolved}
        resolvedCount={resolved.full}
      />
      <SummaryStrip summary={summary} resolved={resolved} />
      <TicketList
        groups={groups}
        groupBy={groupBy}
        expanded={expanded}
        onToggle={toggle}
        fixes={byIssue}
        onResolve={setResolvingKey}
        onUndo={onUndoIssue}
      />
      <ResolveDialog
        health={resolvingKey ? (current.get(resolvingKey) ?? null) : null}
        onOpenChange={(open) => !open && setResolvingKey(null)}
        onSave={onSave}
      />
    </div>
  )
}
