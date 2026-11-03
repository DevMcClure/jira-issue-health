import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { useData } from "@/hooks/useData"
import type { TicketHealth } from "@/lib/health/checks"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import { cn } from "@/lib/utils"
import { ImpactChips } from "./ImpactChips"
import { IssueKeyLink, JiraLink } from "./JiraLink"
import { MissingFieldChip } from "./MissingFieldChip"
import { ignoreInteractive } from "./row-click"
import { SeverityBadge } from "./SeverityBadge"
import { TicketDetail } from "./TicketDetail"
import { TicketMeta } from "./TicketMeta"
import { TypeIcon } from "./TypeIcon"

type Props = {
  health: TicketHealth
  expanded: boolean
  onToggle: () => void
}

/** One ticket in the wide table, with its detail underneath when expanded. */
export function TicketRow({ health, expanded, onToggle }: Props) {
  const { dataset } = useData()
  const { issue, gaps, severity } = health
  const url = jiraIssueUrl(dataset.meta, issue.key)
  const detailId = `detail-${issue.key}`

  return (
    <>
      <TableRow
        className={cn("cursor-pointer", expanded && "border-b-0 bg-muted/30")}
        onClick={(e) => ignoreInteractive(e, onToggle)}
        data-state={expanded ? "selected" : undefined}
      >
        <TableCell className="w-8 pr-0 align-top">
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
        <TableCell className="min-w-64 py-3 align-top whitespace-normal">
          <div className="flex items-center gap-2">
            <TypeIcon type={issue.type} />
            <IssueKeyLink issueKey={issue.key} url={url} />
          </div>
          <p className="mt-1 text-sm">{issue.summary}</p>
          <TicketMeta health={health} className="mt-2" />
        </TableCell>
        <TableCell className="py-3 align-top whitespace-normal">
          <div className="flex flex-wrap gap-1">
            {gaps.map((g) => (
              <MissingFieldChip key={g.field} gap={g} />
            ))}
          </div>
        </TableCell>
        <TableCell className="py-3 align-top whitespace-normal">
          <ImpactChips affects={health.affects} max={2} />
        </TableCell>
        <TableCell className="py-3 align-top">{severity && <SeverityBadge severity={severity} />}</TableCell>
        <TableCell className="w-10 py-2 align-top">
          <JiraLink issueKey={issue.key} url={url} />
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
