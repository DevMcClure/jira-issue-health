import { Lightbulb } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { FieldGap } from "@/lib/health/checks"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"

type Props = {
  gap: FieldGap
  /** The control's id, for the label. */
  htmlFor: string
  children: ReactNode
  /** "Use suggestion" buttons: each sets the control; never applied silently. */
  suggestions?: { label: string; apply: () => void }[]
  evidence?: string
  error?: string
  /** A note on how the field is set, under the control. */
  hint?: string
}

/** One missing field in the Resolve dialog: label, why it matters, the control, and any suggestion with its evidence. */
export function ResolveField({ gap, htmlFor, children, suggestions, evidence, error, hint }: Props) {
  const { icon: Icon, iconClass, label } = SEVERITY_META[gap.severity]
  const errorId = `${htmlFor}-error`
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <Label htmlFor={htmlFor} className="gap-1.5">
          <Icon className={cn("size-4", iconClass)} aria-hidden />
          {gap.label}
          <span className="sr-only">({label.toLowerCase()})</span>
        </Label>
        <p className="text-xs text-muted-foreground">{gap.why}</p>
      </div>
      <div aria-describedby={error ? errorId : undefined}>{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-1 rounded-md border bg-muted/40 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Lightbulb className="size-4 text-brand" aria-hidden />
            {suggestions.map((s, i) => (
              <Button key={s.label} type="button" variant={i === 0 ? "secondary" : "ghost"} size="sm" className="h-7" onClick={s.apply}>
                {i === 0 ? `Use suggestion: ${s.label}` : `or ${s.label}`}
              </Button>
            ))}
          </div>
          {evidence && <p className="text-xs text-muted-foreground">{evidence}</p>}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
