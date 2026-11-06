import { ChevronRight, CircleCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useData } from "@/hooks/useData"
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
import type { RowProps } from "./TicketRow"
import { TypeIcon } from "./TypeIcon"

/** One ticket on a narrow screen: the table row's content, stacked. */
export function TicketCard({ health, mark, expanded, onToggle, fixes, onResolve }: RowProps) {
  const { dataset } = useData()
  const { issue, gaps, severity } = health
  const url = jiraIssueUrl(dataset.meta, issue.key)
  const detailId = `card-detail-${issue.key}`
  const leaving = mark === "fixed" || mark === "moved"
  const fixedNow = mark === "fixed" || gaps.length === 0

  return (
    <li
      className={cn("space-y-2 p-4 transition-[opacity,background-color] duration-500", expanded && "bg-muted/30", liveMarkClass(mark))}
      onClick={(e) => ignoreInteractive(e, onToggle)}
      data-mark={mark}
    >
      <div className="flex items-center gap-2">
        <TypeIcon type={issue.type} />
        <IssueKeyLink issueKey={issue.key} url={url} />
        <LiveMarkBadge mark={mark} />
        {fixedNow ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-brand" aria-hidden />
            Fixed
          </span>
        ) : (
          severity && <SeverityBadge severity={severity} className="ml-auto" />
        )}
        <JiraLink issueKey={issue.key} url={url} />
      </div>
      <p className="line-clamp-3 text-sm">{issue.summary}</p>
      <TicketMeta health={health} />
      {fixedNow ? (
        fixes?.length ? <FixNote fixes={fixes} /> : <p className="text-xs text-muted-foreground">Nothing missing any more.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {gaps.map((g) => (
            <MissingFieldChip key={g.field} gap={g} />
          ))}
        </div>
      )}
      {mark === "moved" && <p className="text-xs text-muted-foreground">No longer in this view.</p>}
      {!fixedNow && <ImpactChips affects={health.affects} max={3} />}
      <div className="flex items-center gap-2">
        {!fixedNow && !leaving && (
          <Button size="sm" className="h-8" onClick={onResolve} aria-label={`Resolve ${issue.key}`}>
            Resolve
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
        >
          <ChevronRight className={cn("transition-transform", expanded && "rotate-90")} />
          {expanded ? "Hide details" : "Details"}
        </Button>
      </div>
      {expanded && (
        <div id={detailId}>
          <TicketDetail health={health} />
        </div>
      )}
    </li>
  )
}
