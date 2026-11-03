import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react"
import type { Severity } from "@/lib/health/requiredFields"

/** Severity is never colour alone: each has an icon and a label. Colour goes on icons and outlines only. */
export const SEVERITY_META: Record<Severity, { label: string; icon: LucideIcon; iconClass: string; borderClass: string }> = {
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    iconClass: "text-severity-critical",
    borderClass: "border-severity-critical",
  },
  warning: {
    label: "Warning",
    icon: TriangleAlert,
    iconClass: "text-severity-warning",
    borderClass: "border-severity-warning",
  },
  info: {
    label: "Info",
    icon: Info,
    iconClass: "text-severity-info",
    borderClass: "border-severity-info",
  },
}
