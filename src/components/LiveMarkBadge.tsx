import type { RowMark } from "@/lib/health/live-rows"
import { LIVE_MARK_LABEL } from "./live-mark"

/** A short word next to the key, so a live change isn't carried by colour alone. */
export function LiveMarkBadge({ mark }: { mark: RowMark | undefined }) {
  const label = mark && LIVE_MARK_LABEL[mark]
  if (!label) return null
  return (
    <span className="rounded-sm border px-1 py-px text-[10px] leading-none font-medium tracking-wide text-muted-foreground uppercase motion-safe:animate-in motion-safe:fade-in">
      {label}
    </span>
  )
}
