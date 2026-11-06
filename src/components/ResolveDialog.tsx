import { ArrowRight, CircleCheck, ExternalLink, FlaskConical, Loader2, TriangleAlert } from "lucide-react"
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useData } from "@/hooks/useData"
import { useJira } from "@/hooks/useJira"
import { JIRA_PRIORITIES, UPDATE_FIELD_FOR, type ResolveResult } from "@/lib/api/contract"
import { DEFAULT_RESOLUTIONS } from "@/lib/api/mock-jira"
import type { TicketHealth } from "@/lib/health/checks"
import { formatSuggestion, suggestionsFor } from "@/lib/health/hints"
import { teamOf } from "@/lib/health/list"
import { FLOW_LABELS } from "@/lib/health/requiredFields"
import { jiraIssueUrl } from "@/lib/jira/adapter"
import { EMPTY_FORM, buildUpdate, type FormErrors, type ResolveForm } from "@/lib/resolutions/form"
import { UPDATE_LABEL } from "@/lib/resolutions/format"
import { isResolvable, type ResolvableField } from "@/lib/resolutions/types"
import { ConnectJiraForm } from "./ConnectJiraForm"
import { FixNote } from "./FixNote"
import { IssueKeyLink } from "./JiraLink"
import { LabelsInput } from "./LabelsInput"
import { ResolveField } from "./ResolveField"
import { StoryPointsInput } from "./StoryPointsInput"

export type ResolveSuccess = Extract<ResolveResult, { ok: true }>

type Props = {
  /** The ticket being resolved, as it is now (live), or null when closed. */
  health: TicketHealth | null
  onOpenChange: (open: boolean) => void
  /** After Jira accepted every change: close, or move on to the next ticket. */
  onResolved: (result: ResolveSuccess, next: boolean) => void
  /** Where this ticket is in the list, for "Update & next". Null when it's the last. */
  next: { key: string; position: number; total: number } | null
}

const FORM_ID = "resolve-form"

/** Fill a ticket's missing fields in Jira, as you. */
export function ResolveDialog({ health, onOpenChange, onResolved, next }: Props) {
  return (
    <Dialog open={health !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* Keyed so each ticket starts with an empty form. */}
        {health && <ResolvePanel key={health.issue.key} health={health} onResolved={onResolved} next={next} />}
      </DialogContent>
    </Dialog>
  )
}

function ResolvePanel({ health, onResolved, next }: { health: TicketHealth } & Pick<Props, "onResolved" | "next">) {
  const { dataset, mode, fixes } = useData()
  const { connection, config, resolve } = useJira()
  const { issue, gaps } = health
  const [form, setForm] = useState<ResolveForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<"save" | "next" | null>(null)
  const set = (patch: Partial<ResolveForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors({})
    setFailure(null)
  }

  const url = jiraIssueUrl(dataset.meta, issue.key)
  const resolvable = gaps.filter((g) => isResolvable(g.field))
  const fields = resolvable.map((g) => g.field as ResolvableField)
  const teamGap = gaps.find((g) => g.field === "teamId")
  const suggestions = useMemo(() => suggestionsFor(issue, gaps.map((g) => g.field), dataset), [issue, gaps, dataset])

  const team = teamOf(issue, dataset)
  const options = useMemo(() => {
    const teamIssues = dataset.issues.filter((i) => teamOf(i, dataset) === team)
    const memberIds = team ? (dataset.teamById.get(team)?.memberIds ?? []) : []
    const people = (memberIds.length ? memberIds.map((id) => dataset.personById.get(id)!).filter(Boolean) : dataset.people).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    )
    const epics = dataset.epics.filter((e) => !team || teamOf(e, dataset) === team)
    const sprints = dataset.sprints.filter((s) => (!team || s.teamId === team) && s.state !== "closed")
    const priorities = [...new Set([...JIRA_PRIORITIES, ...dataset.issues.map((i) => i.priority).filter((p): p is string => p !== null)])]
    const labelCounts = new Map<string, number>()
    for (const i of teamIssues) for (const l of i.labels) labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1)
    const commonLabels = [...FLOW_LABELS, ...[...labelCounts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)].filter(
      (l, idx, all) => all.indexOf(l) === idx,
    )
    return { people, epics, sprints, priorities, commonLabels }
  }, [dataset, team])
  const resolutions = config?.jira.resolutions ?? DEFAULT_RESOLUTIONS

  const submit = async (goNext: boolean) => {
    if (pending) return
    const built = buildUpdate({ issue, fields, form, suggestions })
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    if (!connection) {
      setFailure("Connect Jira above to save these changes.")
      return
    }
    setPending(goNext ? "next" : "save")
    const result = await resolve(issue.key, { update: built.update, usedSuggestion: built.usedSuggestion })
    setPending(null)
    if (!result.ok) {
      setErrors(result.fieldErrors)
      setFailure(result.message)
      return
    }
    if (Object.keys(result.fieldErrors).length) {
      // Some fields went through; keep the dialog open on the rest (they're still missing).
      setErrors(result.fieldErrors)
      setFailure(`Saved ${result.written.length === 1 ? "one change" : `${result.written.length} changes`} in Jira; Jira refused the rest.`)
      return
    }
    onResolved(result, goNext && next !== null)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    void submit(submitter?.dataset.next === "true")
  }
  // ⌘/Ctrl+Enter saves from anywhere in the form.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit(false)
    }
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

  // Messages for fields no longer shown (e.g. someone else filled one in meanwhile).
  const otherErrors = (Object.entries(errors) as [ResolvableField | "form", string][]).filter(
    ([field]) => field !== "form" && !fields.includes(field as ResolvableField),
  )
  const issueFixes = fixes.filter((f) => f.issueKey === issue.key)
  const busy = pending !== null

  return (
    <div className="space-y-5" onKeyDown={onKeyDown}>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5">
            Resolve <IssueKeyLink issueKey={issue.key} url={url} />
          </span>
          {next && <span className="text-xs font-normal text-muted-foreground tabular-nums">{next.position} of {next.total}</span>}
        </DialogTitle>
        <DialogDescription>{issue.summary}</DialogDescription>
      </DialogHeader>

      {mode === "demo" || config?.jira.writer === "mock" ? (
        <p className="flex gap-2 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-xs">
          <FlaskConical className="size-4 shrink-0 text-brand" aria-hidden />
          {mode === "demo"
            ? "Demo: Jira is simulated in your browser. It accepts and refuses changes like Jira would, but nothing real is changed."
            : "This server uses a mock Jira (JIRA_MODE=mock): nothing real is changed."}
        </p>
      ) : null}

      {!connection && resolvable.length > 0 && (
        <section aria-labelledby="connect-heading" className="space-y-2 rounded-md border bg-muted/40 p-3">
          <h3 id="connect-heading" className="text-sm font-medium">
            Connect Jira to save changes
          </h3>
          <ConnectJiraForm />
        </section>
      )}

      {gaps.length === 0 ? (
        <div className="space-y-3 rounded-md border px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="size-4 text-brand" aria-hidden />
            Nothing is missing any more.
          </p>
          {issueFixes.length > 0 && <FixNote fixes={issueFixes} />}
        </div>
      ) : (
        <form id={FORM_ID} onSubmit={onSubmit} className="space-y-5" noValidate>
          <fieldset disabled={busy} className="space-y-5">
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
                        <SelectTrigger id={id(field)} size="sm" className="w-64" aria-invalid={!!errors.assigneeId || undefined}>
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
                        <SelectTrigger id={id(field)} size="sm" className="w-full max-w-sm" aria-invalid={!!errors.epicKey || undefined}>
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
                        <SelectTrigger id={id(field)} size="sm" className="w-64" aria-invalid={!!errors.sprintIds || undefined}>
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
                        <SelectTrigger id={id(field)} size="sm" className="w-48" aria-invalid={!!errors.priority || undefined}>
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
                      <LabelsInput id={id(field)} value={form.labels ?? issue.labels} onChange={(labels) => set({ labels })} common={options.commonLabels} />
                    </ResolveField>
                  )
                case "resolved":
                  return (
                    <ResolveField key={field} {...common} hint="Jira records the resolved date when the resolution is set.">
                      <Select value={form.resolution} onValueChange={(v) => set({ resolution: v })}>
                        <SelectTrigger id={id(field)} size="sm" className="w-48" aria-invalid={!!errors.resolved || undefined}>
                          <SelectValue placeholder="Choose a resolution" />
                        </SelectTrigger>
                        <SelectContent>
                          {resolutions.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </ResolveField>
                  )
              }
            })}
          </fieldset>

          {teamGap && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Team</span> is also missing. It can't be set here: open the ticket in Jira to set it.
            </p>
          )}
        </form>
      )}

      {(failure || errors.form || otherErrors.length > 0) && (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span>{failure ?? errors.form}</span>
          </p>
          {failure && errors.form && <p className="pl-6 text-muted-foreground">{errors.form}</p>}
          {otherErrors.length > 0 && (
            <ul className="pl-6 text-muted-foreground">
              {otherErrors.map(([field, message]) => (
                <li key={field}>
                  {UPDATE_LABEL[UPDATE_FIELD_FOR[field as ResolvableField]]}: {message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {url ? (
          <Button type="button" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open in Jira
            </a>
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {gaps.length === 0 ? "Close" : "Cancel"}
            </Button>
          </DialogClose>
          {gaps.length > 0 && next && (
            <Button type="submit" form={FORM_ID} variant="outline" data-next="true" disabled={busy || resolvable.length === 0 || !connection}>
              {pending === "next" && <Loader2 className="animate-spin" />}
              Update & next
              <ArrowRight />
            </Button>
          )}
          {gaps.length > 0 && (
            <Button type="submit" form={FORM_ID} disabled={busy || resolvable.length === 0 || !connection} title="⌘/Ctrl + Enter">
              {pending === "save" && <Loader2 className="animate-spin" />}
              {pending === "save" ? "Updating Jira…" : "Update in Jira"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </div>
  )
}
