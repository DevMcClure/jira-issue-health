import { useData } from "@/hooks/useData"
import { dataLineLabel } from "@/providers/data-line"

/** Where the data comes from and when it was trawled, in the Jira Dashboard's style. */
export function DataLine() {
  const { origin, dataset } = useData()
  const label = dataLineLabel(origin, dataset.meta.generatedAt)
  return (
    <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden" title={label}>
      {label}
    </p>
  )
}
