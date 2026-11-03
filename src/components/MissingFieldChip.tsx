import { Check, Minus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { FieldGap } from "@/lib/health/checks"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"

const CHIP = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap"

/** A missing required field: dashed outline in the severity colour, with its icon, and why it matters on hover. */
export function MissingFieldChip({ gap }: { gap: FieldGap }) {
  const { label, icon: Icon, iconClass, borderClass } = SEVERITY_META[gap.severity]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(CHIP, "border border-dashed bg-background/40 font-medium", borderClass)}
          aria-label={`${gap.label} missing, ${label.toLowerCase()}. ${gap.why}`}
        >
          <Icon className={cn("size-3.5 shrink-0", iconClass)} aria-hidden />
          {gap.label}
          <span className="font-normal text-muted-foreground">· missing</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{gap.why}</TooltipContent>
    </Tooltip>
  )
}

/** A required field that's filled in, or not required yet: muted, so the gaps stand out. */
export function PresentFieldChip({ label, required = true }: { label: string; required?: boolean }) {
  const Icon = required ? Check : Minus
  return (
    <span className={cn(CHIP, "border border-transparent bg-muted text-muted-foreground")}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
      <span className="sr-only">{required ? " present" : " not required yet"}</span>
    </span>
  )
}
