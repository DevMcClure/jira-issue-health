import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useRequiredFields } from "@/hooks/useRequiredFields"
import { isDefaultConfig, setRequired, setSeverity } from "@/lib/health/config"
import { DEFAULT_REQUIRED_FIELDS, SEVERITIES, type Severity } from "@/lib/health/requiredFields"
import { ISSUE_TYPES } from "@/lib/jira/types"
import { cn } from "@/lib/utils"
import { SEVERITY_META } from "./severity"

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

/** What counts as "required": fields × issue types, with a severity per field. Changes apply live. */
export function RequiredFieldsPanel({ open, onOpenChange }: Props) {
  const { config, setConfig, resetConfig } = useRequiredFields()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Required fields</SheetTitle>
          <SheetDescription>
            Tick the issue types each field is required for. Changes apply to the list straight away and are remembered in
            this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Required fields by issue type</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-2 font-medium">
                  Field
                </th>
                {ISSUE_TYPES.map((t) => (
                  <th key={t} scope="col" className="px-1 py-2 text-center font-medium">
                    {t}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-2 font-medium">
                  Severity
                </th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_REQUIRED_FIELDS.map((rule) => {
                const fc = config.fields[rule.field]
                return (
                  <tr key={rule.field} className="border-b align-top last:border-0">
                    <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                      <span className="font-medium">{rule.label}</span>
                      <span className="block text-xs text-muted-foreground">{rule.whenLabel}</span>
                    </th>
                    {ISSUE_TYPES.map((t) => (
                      <td key={t} className="px-1 py-2.5 text-center">
                        <Checkbox
                          checked={fc.requiredFor.includes(t)}
                          onCheckedChange={(v) => setConfig(setRequired(config, rule.field, t, v === true))}
                          aria-label={`${rule.label} required for ${t}`}
                        />
                      </td>
                    ))}
                    <td className="py-1.5 pl-2">
                      <Select value={fc.severity} onValueChange={(v) => setConfig(setSeverity(config, rule.field, v as Severity))}>
                        <SelectTrigger size="sm" className="h-8 w-32" aria-label={`${rule.label} severity`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITIES.map((s) => {
                            const { label, icon: Icon, iconClass } = SEVERITY_META[s]
                            return (
                              <SelectItem key={s} value={s}>
                                <Icon className={cn("size-4", iconClass)} aria-hidden />
                                {label}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <SheetFooter className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            The "only when" conditions are fixed for now. Later this could become its own view; for the proof of concept it
            stays here.
          </p>
          <Button variant="outline" size="sm" onClick={resetConfig} disabled={isDefaultConfig(config)}>
            <RotateCcw />
            Reset to defaults
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
