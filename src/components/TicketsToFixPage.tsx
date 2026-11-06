import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useData } from "@/hooks/useData"
import { useLiveRows } from "@/hooks/useLiveRows"
import { useRequiredFields } from "@/hooks/useRequiredFields"
import { checkDataset } from "@/lib/health/checks"
import { fixListMarkdown } from "@/lib/health/fixList"
import { DEFAULT_FILTERS, applyFilters, groupTickets, isDefaultFilters, summarise, type Filters, type GroupBy } from "@/lib/health/list"
import type { ListRow } from "@/lib/health/live-rows"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import { describeUpdate } from "@/lib/resolutions/format"
import { fixedRows, fixesByIssue } from "@/lib/resolutions/view"
import { CopyFallbackDialog } from "./CopyFallbackDialog"
import { liveSummary } from "./live-mark"
import { LoadProblemsDialog } from "./LoadProblemsDialog"
import { PageActions } from "./PageActions"
import { PageHeader } from "./PageHeader"
import { RequiredFieldsPanel } from "./RequiredFieldsPanel"
import { ResolveDialog, type ResolveSuccess } from "./ResolveDialog"
import { SummaryStrip } from "./SummaryStrip"
import { TicketFilters } from "./TicketFilters"
import { TicketList, type RowGroup } from "./TicketList"

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const FIXED_WINDOW_MS = 7 * 86_400_000

/** The app's one view: every ticket missing required information, what that affects, and fixing it in Jira. */
export function TicketsToFixPage() {
  const { dataset, revision, fixes, loadFromFile, resetToSample } = useData()
  const { rules } = useRequiredFields()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [showFixed, setShowFixed] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** The ticket in the Resolve dialog, and the list order when it opened (for "Update & next"). */
  const [resolving, setResolving] = useState<{ key: string; queue: string[] } | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [loadFailure, setLoadFailure] = useState<{ fileName: string; problems: string[] } | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null)

  const health = useMemo(() => checkDataset(dataset, rules), [dataset, rules])
  const current = useMemo(() => new Map(health.map((h) => [h.issue.key, h])), [health])
  const view = useMemo(() => applyFilters(health, filters, dataset), [health, filters, dataset])
  const summary = useMemo(() => summarise(view), [view])
  const byIssue = useMemo(() => fixesByIssue(fixes), [fixes])

  const liveRows = useLiveRows(view.rows, revision, current)
  const fixed = useMemo(() => fixedRows({ health, byIssue, filters, dataset }), [health, byIssue, filters, dataset])
  const fixedThisWeek = useMemo(() => {
    const since = Date.parse(dataset.meta.generatedAt) - FIXED_WINDOW_MS
    const inView = new Set(view.scope.map((h) => h.issue.key))
    const recent = fixes.filter((f) => f.via === "app" && Date.parse(f.at) >= since && inView.has(f.issueKey))
    return { tickets: new Set(recent.map((f) => f.issueKey)).size, people: new Set(recent.map((f) => f.by.id)).size }
  }, [fixes, view.scope, dataset.meta.generatedAt])

  const groups = useMemo((): RowGroup[] => {
    const byKey = new Map(liveRows.map((r) => [r.health.issue.key, r]))
    const listed = groupTickets(
      liveRows.map((r) => r.health),
      groupBy,
      dataset,
    ).map((g) => ({ ...g, rows: g.rows.map((h) => byKey.get(h.issue.key)!) }))
    const shownFixed = fixed.filter((h) => !byKey.has(h.issue.key))
    if (!showFixed || shownFixed.length === 0) return listed
    const fixedGroup: RowGroup = { key: "__fixed__", label: "Fixed with Resolve", rows: shownFixed.map((h): ListRow => ({ health: h })), fixed: true }
    return [...listed, fixedGroup]
  }, [liveRows, groupBy, dataset, fixed, showFixed])

  /** Tickets that can be resolved, in the order shown. */
  const order = useMemo(
    () => groups.flatMap((g) => (g.fixed ? [] : g.rows)).filter((r) => r.mark !== "fixed" && r.mark !== "moved").map((r) => r.health.issue.key),
    [groups],
  )
  const uniqueOrder = useMemo(() => [...new Set(order)], [order])

  const next = useMemo(() => {
    if (!resolving) return null
    const { key, queue } = resolving
    const at = queue.indexOf(key)
    const after = queue.slice(at + 1).find((k) => (current.get(k)?.gaps.length ?? 0) > 0)
    return after ? { key: after, position: at + 1, total: queue.length } : null
  }, [resolving, current])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const nextSet = new Set(prev)
      if (!nextSet.delete(key)) nextSet.add(key)
      return nextSet
    })

  const onResolved = (result: ResolveSuccess, goNext: boolean) => {
    const key = result.fix.issueKey
    const url = jiraIssueUrl(dataset.meta, key)
    toast.success(`${key} updated in Jira`, {
      description: describeUpdate(result.fix.update, dataset).join(" · "),
      action: url ? { label: "Open", onClick: () => window.open(url, "_blank", "noreferrer") } : undefined,
    })
    setResolving(goNext && next ? { key: next.key, queue: resolving!.queue } : null)
  }

  const onLoadFile = async (file: File) => {
    if (!loadFromFile) return
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
        description="Tickets missing information the Jira Dashboard needs, what each gap affects, and a way to fix it in Jira."
        actions={
          <PageActions
            onOpenRequiredFields={() => setPanelOpen(true)}
            onLoadFile={loadFromFile ? onLoadFile : null}
            onResetToSample={resetToSample}
            onCopyFixList={onCopyFixList}
            ticketCount={view.rows.length}
          />
        }
      />
      <SummaryStrip summary={summary} fixedThisWeek={fixedThisWeek} />
      <TicketFilters
        filters={filters}
        onChange={setFilters}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        showFixed={showFixed}
        onShowFixedChange={setShowFixed}
        fixedCount={fixed.length}
        shown={view.rows.length}
        total={view.scope.length}
      />
      <p className="sr-only" aria-live="polite">
        {liveSummary(liveRows.map((r) => r.mark))}
      </p>
      <TicketList
        groups={groups}
        groupBy={groupBy}
        expanded={expanded}
        onToggle={toggle}
        fixes={byIssue}
        onResolve={(key) => setResolving({ key, queue: uniqueOrder })}
        filtered={!isDefaultFilters(filters)}
        onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      />
      <ResolveDialog
        health={resolving ? (current.get(resolving.key) ?? null) : null}
        onOpenChange={(open) => !open && setResolving(null)}
        onResolved={onResolved}
        next={next}
      />
      <RequiredFieldsPanel open={panelOpen} onOpenChange={setPanelOpen} />
      <LoadProblemsDialog failure={loadFailure} onClose={() => setLoadFailure(null)} />
      <CopyFallbackDialog text={copyFallback} onClose={() => setCopyFallback(null)} />
    </div>
  )
}
