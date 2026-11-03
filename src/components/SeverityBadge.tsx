import type { Severity } from "@/lib/health/requiredFields"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"

/** Icon plus label; the label stays in text colour so it reads in both themes. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { label, icon: Icon, iconClass } = SEVERITY_META[severity]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", className)}>
      <Icon className={cn("size-4 shrink-0", iconClass)} aria-hidden />
      {label}
    </span>
  )
}
