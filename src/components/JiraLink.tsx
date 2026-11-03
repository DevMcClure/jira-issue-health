import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** "Open in Jira": a plain link in a new tab. Nothing is sent to Jira. */
export function JiraLink({ issueKey, url }: { issueKey: string; url: string | null }) {
  if (!url) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${issueKey} in Jira`}>
            <ExternalLink />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open in Jira</TooltipContent>
    </Tooltip>
  )
}

/** The ticket key, linking to Jira when the export has a base URL. */
export function IssueKeyLink({ issueKey, url }: { issueKey: string; url: string | null }) {
  const cls = "font-mono text-sm font-medium whitespace-nowrap"
  if (!url) return <span className={cls}>{issueKey}</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${cls} underline-offset-4 hover:underline`}>
      {issueKey}
    </a>
  )
}
