import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useData } from "@/hooks/useData"
import { useRequiredFields } from "@/hooks/useRequiredFields"
import { useResolutions } from "@/hooks/useResolutions"
import { checkDataset, checkIssue } from "@/lib/health/checks"
import { fixListMarkdown } from "@/lib/health/fixList"
import { DEFAULT_FILTERS, applyFilters, groupTickets, summarise, type Filters, type GroupBy } from "@/lib/health/list"
import { applyResolutions } from "@/lib/resolutions/overlay"
import type { Resolution } from "@/lib/resolutions/types"
import { resolvedCounts, resolvedRows } from "@/lib/resolutions/view"
import { CopyFallbackDialog } from "./CopyFallbackDialog"
import { LoadProblemsDialog } from "./LoadProblemsDialog"
import { PageActions } from "./PageActions"
import { PageHeader } from "./PageHeader"
import { RequiredFieldsPanel } from "./RequiredFieldsPanel"
import { ResolveDialog } from "./ResolveDialog"
import { SummaryStrip } from "./SummaryStrip"
import { TicketFilters } from "./TicketFilters"
import { TicketList } from "./TicketList"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The app's one view: every ticket missing required information, what that affects, and where to fix it. */
export function TicketsToFixPage() {
  const { dataset, origin, loadFromFile, resetToSample } = useData()
  const { rules } = useRequiredFields()
  const { resolutions, byIssue, save, undo, undoIssue, clear, restore } = useResolutions()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [showResolved, setShowResolved] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [loadFailure, setLoadFailure] = useState<{ fileName: string; problems: string[] } | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null)

  // Checks run on the data with local resolutions laid over it; the loaded data itself never changes.
  const baseHealth = useMemo(() => checkDataset(dataset, rules), [dataset, rules])
  const overlaid = useMemo(() => applyResolutions(dataset, resolutions), [dataset, resolutions])
  const health = useMemo(() => checkDataset(overlaid, rules), [overlaid, rules])
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
    const left = checkIssue({ ...current.get(key)!.issue, ...resolution.values }, rules).gaps.length
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

  const onLoadFile = async (file: File) => {
    const result = await loadFromFile(file)
    if (!result.ok) setLoadFailure({ fileName: file.name, problems: result.problems })
  }

  const onCopyFixList = async () => {
    const text = fixListMarkdown({ rows: view.rows, filters, dataset })
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Fix list copied: ${plural(view.rows.length, "ticket", "tickets")}`, { description: "Markdown, grouped by assignee." })
    } catch {
      setCopyFallback(text)
    }
  }

  return (
    <div className="@container flex flex-col gap-4">
      <PageHeader
        title="Tickets to fix"
        description="Tickets missing information the Jira Dashboard needs, what each gap affects, and where to fix it."
        actions={
          <PageActions
            onOpenRequiredFields={() => setPanelOpen(true)}
            onLoadFile={onLoadFile}
            onResetToSample={origin.kind === "upload" ? resetToSample : null}
            onCopyFixList={onCopyFixList}
            ticketCount={view.rows.length}
            resolvedCount={resolutions.length}
            onClearResolutions={onClear}
          />
        }
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
      <RequiredFieldsPanel open={panelOpen} onOpenChange={setPanelOpen} />
      <LoadProblemsDialog failure={loadFailure} onClose={() => setLoadFailure(null)} />
      <CopyFallbackDialog text={copyFallback} onClose={() => setCopyFallback(null)} />
    </div>
  )
}
