import { CircleCheck, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useData } from "@/hooks/useData"
import { describeValues } from "@/lib/resolutions/format"
import { mergedValues } from "@/lib/resolutions/overlay"
import type { Resolution } from "@/lib/resolutions/types"
import { cn } from "@/lib/utils"

type Props = {
  issueKey: string
  resolutions: Resolution[]
  /** Fully resolved (no gaps left) or only partly. */
  full: boolean
  onUndo: () => void
  className?: string
}

/** What was entered locally for a ticket, with Undo. Clearly local: nothing was sent to Jira. */
export function ResolvedNote({ issueKey, resolutions, full, onUndo, className }: Props) {
  const { dataset } = useData()
  const lines = describeValues(mergedValues(resolutions), dataset)
  return (
    <div className={cn("space-y-1 text-xs", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md border border-brand/50 bg-brand/10 px-1.5 py-0.5 font-medium">
          <CircleCheck className="size-3.5 text-brand" aria-hidden />
          {full ? "Resolved locally" : "Partly resolved locally"}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={onUndo} aria-label={`Undo local changes to ${issueKey}`}>
          <Undo2 className="size-3.5" />
          Undo
        </Button>
      </div>
      <ul className="text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}
