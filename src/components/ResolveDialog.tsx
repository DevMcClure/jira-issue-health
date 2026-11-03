import { ExternalLink, Info } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useData } from "@/hooks/useData"
import type { TicketHealth } from "@/lib/health/checks"
import { formatSuggestion, suggestionsFor } from "@/lib/health/hints"
import { teamOf } from "@/lib/health/list"
import { FLOW_LABELS } from "@/lib/health/requiredFields"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import { EMPTY_FORM, buildResolution, type FormErrors, type ResolveForm } from "@/lib/resolutions/form"
import { RESOLVABLE_FIELDS, type Resolution, type ResolvableField } from "@/lib/resolutions/types"
import { DatePickerField } from "./DatePickerField"
import { IssueKeyLink } from "./JiraLink"
import { LabelsInput } from "./LabelsInput"
import { ResolveField } from "./ResolveField"
import { StoryPointsInput } from "./StoryPointsInput"

const PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"]

type Props = {
  /** The ticket being resolved (with any earlier local fixes applied), or null when closed. */
  health: TicketHealth | null
  onOpenChange: (open: boolean) => void
  onSave: (resolution: Resolution) => void
}

/** Mock Resolve: enter the missing values, saved in this browser only. */
export function ResolveDialog({ health, onOpenChange, onSave }: Props) {
  return (
    <Dialog open={health !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* Keyed so each ticket starts with an empty form. */}
        {health && <ResolveForm key={health.issue.key} health={health} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  )
}

function ResolveForm({ health, onSave }: { health: TicketHealth; onSave: (r: Resolution) => void }) {
  const { dataset } = useData()
  const { issue, gaps } = health
  const [form, setForm] = useState<ResolveForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const set = (patch: Partial<ResolveForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors({})
  }

  const url = jiraIssueUrl(dataset.meta, issue.key)
  const resolvable = gaps.filter((g) => (RESOLVABLE_FIELDS as readonly string[]).includes(g.field))
  const fields = resolvable.map((g) => g.field as ResolvableField)
  const teamGap = gaps.find((g) => g.field === "teamId")
  const suggestions = useMemo(
    () => suggestionsFor(issue, gaps.map((g) => g.field), dataset),
    [issue, gaps, dataset],
  )

  const team = teamOf(issue, dataset)
  const options = useMemo(() => {
    const teamIssues = dataset.issues.filter((i) => teamOf(i, dataset) === team)
    const memberIds = team ? (dataset.teamById.get(team)?.memberIds ?? []) : []
    const people = (memberIds.length ? memberIds.map((id) => dataset.personById.get(id)!).filter(Boolean) : dataset.people).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    )
    const epics = dataset.epics.filter((e) => !team || teamOf(e, dataset) === team)
    const sprints = dataset.sprints.filter((s) => (!team || s.teamId === team) && s.state !== "closed")
    const priorities = [...new Set([...PRIORITIES, ...dataset.issues.map((i) => i.priority).filter((p): p is string => p !== null)])]
    const labelCounts = new Map<string, number>()
    for (const i of teamIssues) for (const l of i.labels) labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1)
    const commonLabels = [
      ...FLOW_LABELS,
      ...[...labelCounts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l),
    ].filter((l, idx, all) => all.indexOf(l) === idx)
    return { people, epics, sprints, priorities, commonLabels }
  }, [dataset, team])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = buildResolution({ issue, fields, form, suggestions })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    onSave(result.resolution)
  }

  const id = (field: string) => `resolve-${issue.key}-${field}`
  const suggestionFor = (field: ResolvableField, apply: (value: never) => void) => {
    const s = suggestions[field]
    if (!s) return {}
    if (s.field === "assigneeId") {
      const name = (pid: string) => dataset.personById.get(pid)?.displayName ?? pid
      return {
        suggestions: [s.value, ...s.alternatives].map((pid) => ({ label: name(pid), apply: () => apply(pid as never) })),
        evidence: s.evidence,
      }
    }
    return { suggestions: [{ label: formatSuggestion(s, dataset), apply: () => apply(s.value as never) }], evidence: s.evidence }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          Resolve <IssueKeyLink issueKey={issue.key} url={url} />
        </DialogTitle>
        <DialogDescription>{issue.summary}</DialogDescription>
      </DialogHeader>

      <p className="flex gap-2 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        Proof of concept: this saves in your browser only. Nothing is sent to Jira.
      </p>

      {resolvable.map((gap) => {
        const field = gap.field as ResolvableField
        const common = { gap, htmlFor: id(field), error: errors[field] }
        switch (field) {
          case "storyPoints":
            return (
              <ResolveField key={field} {...common} {...suggestionFor(field, (v: number) => set({ storyPoints: String(v) }))}>
                <StoryPointsInput id={id(field)} value={form.storyPoints} onChange={(v) => set({ storyPoints: v })} invalid={!!errors.storyPoints} />
              </ResolveField>
            )
          case "assigneeId":
            return (
              <ResolveField key={field} {...common} {...suggestionFor(field, (v: string) => set({ assigneeId: v }))}>
                <Select value={form.assigneeId} onValueChange={(v) => set({ assigneeId: v })}>
                  <SelectTrigger id={id(field)} size="sm" className="w-64">
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ResolveField>
            )
          case "epicKey":
            return (
              <ResolveField key={field} {...common} {...suggestionFor(field, (v: string) => set({ epicKey: v }))}>
                <Select value={form.epicKey} onValueChange={(v) => set({ epicKey: v })}>
                  <SelectTrigger id={id(field)} size="sm" className="w-full max-w-sm">
                    <SelectValue placeholder="Choose an epic" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.epics.map((e) => (
                      <SelectItem key={e.key} value={e.key}>
                        <span className="font-mono">{e.key}</span> {e.summary}
                        {e.statusCategory === "done" && <span className="text-muted-foreground"> (done)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ResolveField>
            )
          case "sprintIds":
            return (
              <ResolveField key={field} {...common}>
                <Select value={form.sprintId} onValueChange={(v) => set({ sprintId: v })}>
                  <SelectTrigger id={id(field)} size="sm" className="w-64">
                    <SelectValue placeholder="Choose a sprint" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.sprints.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} <span className="text-muted-foreground">· {s.state === "active" ? "active" : "next"}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ResolveField>
            )
          case "priority":
            return (
              <ResolveField key={field} {...common} {...suggestionFor(field, (v: string) => set({ priority: v }))}>
                <Select value={form.priority} onValueChange={(v) => set({ priority: v })}>
                  <SelectTrigger id={id(field)} size="sm" className="w-48">
                    <SelectValue placeholder="Choose a priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.priorities.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ResolveField>
            )
          case "labels":
            return (
              <ResolveField key={field} {...common} {...suggestionFor(field, (v: string[]) => set({ labels: v }))}>
                <LabelsInput
                  id={id(field)}
                  value={form.labels ?? issue.labels}
                  onChange={(labels) => set({ labels })}
                  common={options.commonLabels}
                />
              </ResolveField>
            )
          case "resolved":
            return (
              <ResolveField key={field} {...common}>
                <DatePickerField id={id(field)} value={form.resolved} onChange={(d) => set({ resolved: d })} min={issue.created.slice(0, 10)} />
              </ResolveField>
            )
        }
      })}

      {teamGap && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Team</span> is also missing. It can't be set here: open the ticket in Jira to set it.
        </p>
      )}

      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {url ? (
          <Button type="button" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open in Jira instead
            </a>
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={resolvable.length === 0}>
            Save locally
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
