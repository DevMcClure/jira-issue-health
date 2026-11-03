import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useData } from "@/hooks/useData"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import { cn } from "@/lib/utils"
import { ImpactChips } from "./ImpactChips"
import { IssueKeyLink, JiraLink } from "./JiraLink"
import { MissingFieldChip } from "./MissingFieldChip"
import { ResolvedNote } from "./ResolvedNote"
import { ignoreInteractive } from "./row-click"
import { SeverityBadge } from "./SeverityBadge"
import { TicketDetail } from "./TicketDetail"
import { TicketMeta } from "./TicketMeta"
import type { RowProps } from "./TicketRow"
import { TypeIcon } from "./TypeIcon"

/** One ticket on a narrow screen: the table row's content, stacked. */
export function TicketCard({ health, expanded, onToggle, fixes, onResolve, onUndo }: RowProps) {
  const { dataset } = useData()
  const { issue, gaps, severity } = health
  const url = jiraIssueUrl(dataset.meta, issue.key)
  const detailId = `card-detail-${issue.key}`
  const resolved = gaps.length === 0

  return (
    <li className={cn("space-y-2 p-4", expanded && "bg-muted/30")} onClick={(e) => ignoreInteractive(e, onToggle)}>
      <div className="flex items-center gap-2">
        <TypeIcon type={issue.type} />
        <IssueKeyLink issueKey={issue.key} url={url} />
        {severity && <SeverityBadge severity={severity} className="ml-auto" />}
        <JiraLink issueKey={issue.key} url={url} />
      </div>
      <p className="text-sm">{issue.summary}</p>
      <TicketMeta health={health} />
      <div className="flex flex-wrap gap-1">
        {gaps.map((g) => (
          <MissingFieldChip key={g.field} gap={g} />
        ))}
      </div>
      {fixes && <ResolvedNote issueKey={issue.key} resolutions={fixes} full={resolved} onUndo={onUndo} />}
      {!resolved && <ImpactChips affects={health.affects} max={3} />}
      <div className="flex items-center gap-2">
      {!resolved && (
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
