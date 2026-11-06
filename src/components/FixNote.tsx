import { CircleCheck } from "lucide-react"
import { useData } from "@/hooks/useData"
import { useNow } from "@/hooks/useNow"
import type { Fix } from "@/lib/api/contract"
import { describeUpdate } from "@/lib/resolutions/format"
import { ago } from "@/lib/time"
import { cn } from "@/lib/utils"

/** Who fixed a ticket, when, and what they set: "Fixed in Jira by Jamal Wright · 2 min ago". */
export function FixNote({ fixes, className }: { fixes: Fix[]; className?: string }) {
  const { dataset } = useData()
  const now = useNow()
  const last = fixes.at(-1)
  if (!last) return null
  const lines = fixes.flatMap((f) => describeUpdate(f.update, dataset))
  return (
    <div className={cn("space-y-0.5 text-xs", className)}>
      <p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <CircleCheck className="size-3.5 text-brand" aria-hidden />
        <span className="font-medium">{last.via === "app" ? "Fixed with Resolve" : "Fixed in Jira"}</span>
        <span className="text-muted-foreground">
          by {last.by.displayName} · {ago(last.at, now)}
        </span>
      </p>
      <ul className="text-muted-foreground">
        {[...new Set(lines)].map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}
