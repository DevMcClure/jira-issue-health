import { ChevronRight, CircleCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { useData } from "@/hooks/useData"
import type { Fix } from "@/lib/api/contract"
import type { TicketHealth } from "@/lib/health/checks"
import type { RowMark } from "@/lib/health/live-rows"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import { cn } from "@/lib/utils"
import { FixNote } from "./FixNote"
import { ImpactChips } from "./ImpactChips"
import { IssueKeyLink, JiraLink } from "./JiraLink"
import { liveMarkClass } from "./live-mark"
import { LiveMarkBadge } from "./LiveMarkBadge"
import { MissingFieldChip } from "./MissingFieldChip"
import { ignoreInteractive } from "./row-click"
import { SeverityBadge } from "./SeverityBadge"
import { TicketDetail } from "./TicketDetail"
import { TicketMeta } from "./TicketMeta"
import { TypeIcon } from "./TypeIcon"

export type RowProps = {
  health: TicketHealth
  /** A live change to show for a moment. */
  mark?: RowMark
  expanded: boolean
  onToggle: () => void
  /** Fixes for this ticket, oldest first. */
  fixes: Fix[] | undefined
  onResolve: () => void
}

/** One ticket in the wide table, with its detail underneath when expanded. */
export function TicketRow({ health, mark, expanded, onToggle, fixes, onResolve }: RowProps) {
  const { dataset } = useData()
  const { issue, gaps, severity } = health
  const url = jiraIssueUrl(dataset.meta, issue.key)
  const detailId = `detail-${issue.key}`
  const leaving = mark === "fixed" || mark === "moved"
  const fixedNow = mark === "fixed" || gaps.length === 0

  return (
    <>
      <TableRow
        className={cn("cursor-pointer transition-[opacity,background-color] duration-500", expanded && "border-b-0 bg-muted/30", liveMarkClass(mark))}
        onClick={(e) => ignoreInteractive(e, onToggle)}
        data-state={expanded ? "selected" : undefined}
        data-mark={mark}
      >
        <TableCell className="w-10 pr-0 align-top">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${issue.key}`}
          >
            <ChevronRight className={cn("transition-transform", expanded && "rotate-90")} />
          </Button>
        </TableCell>
        <TableCell className="py-2.5 align-top whitespace-normal">
          <div className="flex items-center gap-2">
            <TypeIcon type={issue.type} />
            <IssueKeyLink issueKey={issue.key} url={url} />
            <LiveMarkBadge mark={mark} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm" title={issue.summary}>
            {issue.summary}
          </p>
          <TicketMeta health={health} className="mt-1.5" />
        </TableCell>
        <TableCell className="py-2.5 align-top whitespace-normal">
          {mark === "fixed" || gaps.length === 0 ? (
            fixes?.length ? (
              <FixNote fixes={fixes} />
            ) : (
              <span className="text-xs text-muted-foreground">Nothing missing any more.</span>
            )
          ) : (
            <div className="flex flex-wrap gap-1">
              {gaps.map((g) => (
                <MissingFieldChip key={g.field} gap={g} />
              ))}
            </div>
          )}
          {mark === "moved" && <p className="mt-1 text-xs text-muted-foreground">No longer in this view.</p>}
        </TableCell>
        <TableCell className="py-2.5 align-top whitespace-normal">
          {fixedNow ? <span className="text-muted-foreground">–</span> : <ImpactChips affects={health.affects} max={2} />}
        </TableCell>
        <TableCell className="py-2.5 align-top">
          {fixedNow ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-brand" aria-hidden />
              Fixed
            </span>
          ) : (
            severity && <SeverityBadge severity={severity} />
          )}
        </TableCell>
        <TableCell className="py-2 align-top">
          <div className="flex items-center justify-end gap-1">
            {!fixedNow && !leaving && (
              <Button size="sm" className="h-8" onClick={onResolve} aria-label={`Resolve ${issue.key}`}>
                Resolve
              </Button>
            )}
            <JiraLink issueKey={issue.key} url={url} />
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell />
          <TableCell colSpan={5} id={detailId} className="pt-0 pb-4 whitespace-normal">
            <TicketDetail health={health} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
