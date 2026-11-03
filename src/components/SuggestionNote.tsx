import { Lightbulb } from "lucide-react"
import { useData } from "@/hooks/useData"
import type { FieldGap } from "@/lib/health/checks"
import { SUGGESTED_FIELDS, formatSuggestion, type Suggestion } from "@/lib/health/hints"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import type { Issue } from "@/lib/jira/types"

const SHOWN_KEYS = 5

/** A suggested value for one gap, with its evidence; or why there isn't one. Nothing is applied from here. */
export function SuggestionNote({ issue, gap, suggestion }: { issue: Issue; gap: FieldGap; suggestion: Suggestion | undefined }) {
  const { dataset } = useData()
  if (!SUGGESTED_FIELDS.includes(gap.field)) return null

  if (!suggestion) {
    const reason =
      gap.field === "assigneeId"
        ? issue.epicKey
          ? "fewer than 3 assigned tickets share its epic."
          : "it has no epic to find who's working on it."
        : "fewer than 3 similar tickets have this field filled in."
    return <p className="text-xs text-muted-foreground">No suggestion: {reason}</p>
  }

  const shown = suggestion.basedOn.slice(0, SHOWN_KEYS)
  const more = suggestion.basedOn.length - shown.length
  return (
    <div className="rounded-md border bg-background/60 px-3 py-2 text-sm">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <Lightbulb className="size-4 shrink-0 text-brand" aria-hidden />
        <span className="text-muted-foreground">Suggested:</span>
        <span className="font-medium">{formatSuggestion(suggestion, dataset)}</span>
      </p>
      <p className="mt-0.5 text-muted-foreground">{suggestion.evidence}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Based on{" "}
        {shown.map((key, i) => {
          const url = jiraIssueUrl(dataset.meta, key)
          return (
            <span key={key}>
              {i > 0 && ", "}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="font-mono underline-offset-4 hover:underline">
                  {key}
                </a>
              ) : (
                <span className="font-mono">{key}</span>
              )}
            </span>
          )
        })}
        {more > 0 && ` and ${more} more`}.
      </p>
    </div>
  )
}
