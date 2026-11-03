import { AlertCircle, CircleUserRound, Layers, ListX, Search, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData } from "@/hooks/useData"
import { DEFAULT_FILTERS, UNASSIGNED, isDefaultFilters, teamOf, type Filters, type GroupBy, type SprintFilter } from "@/lib/health/list"
import { DEFAULT_REQUIRED_FIELDS, SEVERITIES, type FieldId, type Severity } from "@/lib/health/requiredFields"
import { ISSUE_TYPES } from "@/lib/jira/types"
import { cn } from "@/lib/utils"
import { FilterPopover } from "./FilterPopover"
import { SEVERITY_META } from "./severity"
import { TypeIcon } from "./TypeIcon"

type Props = {
  filters: Filters
  onChange: (next: Filters) => void
  groupBy: GroupBy
  onGroupByChange: (next: GroupBy) => void
}

const SPRINT_STATE_LABEL = { active: "active", future: "next", closed: "closed" } as const

const sprintToValue = (s: SprintFilter) => (typeof s === "number" ? `sprint:${s}` : s)
const valueToSprint = (v: string): SprintFilter => (v.startsWith("sprint:") ? Number(v.slice(7)) : (v as SprintFilter))

/** Search, filters and group-by above the list. */
export function TicketFilters({ filters, onChange, groupBy, onGroupByChange }: Props) {
  const { dataset } = useData()
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  const teams = filters.teamIds.length ? dataset.teams.filter((t) => filters.teamIds.includes(t.id)) : dataset.teams
  const types = [...new Set([...ISSUE_TYPES, ...dataset.issues.map((i) => i.type)])]
  const people = [...dataset.people].sort((a, b) => a.displayName.localeCompare(b.displayName))

  const setTeams = (teamIds: string[]) => {
    // A sprint from a team that's no longer shown would empty the list.
    const sprint = filters.sprint
    const sprintTeam = typeof sprint === "number" ? dataset.sprintById.get(sprint)?.teamId : null
    const keepSprint = !sprintTeam || teamIds.length === 0 || teamIds.includes(sprintTeam)
    set({ teamIds, sprint: keepSprint ? sprint : "active" })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search key or summary…"
          className="h-8 w-52 pl-8 @3xl:w-60"
          aria-label="Search tickets by key or summary"
        />
      </div>

      <Select value={sprintToValue(filters.sprint)} onValueChange={(v) => set({ sprint: valueToSprint(v) })}>
        <SelectTrigger size="sm" className="h-8 w-auto min-w-40" aria-label="Sprint">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active sprints</SelectItem>
          <SelectItem value="backlog">Backlog (no sprint)</SelectItem>
          <SelectItem value="all">All tickets</SelectItem>
          {teams.map((team) => {
            const sprints = dataset.sprints.filter((s) => s.teamId === team.id)
            if (!sprints.length) return null
            return (
              <SelectGroup key={team.id}>
                <SelectSeparator />
                <SelectLabel>{team.name}</SelectLabel>
                {sprints.map((s) => (
                  <SelectItem key={s.id} value={sprintToValue(s.id)}>
                    {s.name} <span className="text-muted-foreground">· {SPRINT_STATE_LABEL[s.state]}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          })}
        </SelectContent>
      </Select>

      <FilterPopover
        title="Team"
        icon={Users}
        align="start"
        options={dataset.teams.map((t) => ({ value: t.id, label: t.name }))}
        selected={filters.teamIds}
        onChange={setTeams}
      />
      <FilterPopover
        title="Assignee"
        icon={CircleUserRound}
        align="start"
        options={[
          { value: UNASSIGNED, label: "Unassigned" },
          ...people
            .filter((p) => !filters.teamIds.length || dataset.issues.some((i) => i.assigneeId === p.id && filters.teamIds.includes(teamOf(i, dataset) ?? "")))
            .map((p) => ({ value: p.id, label: p.displayName })),
        ]}
        selected={filters.assigneeIds}
        onChange={(assigneeIds) => set({ assigneeIds })}
      />
      <FilterPopover
        title="Type"
        icon={Layers}
        align="start"
        options={types.map((t) => ({ value: t, label: t, icon: <TypeIcon type={t} withTooltip={false} /> }))}
        selected={filters.types}
        onChange={(types) => set({ types })}
      />
      <FilterPopover
        title="Severity"
        icon={AlertCircle}
        align="start"
        options={SEVERITIES.map((s) => {
          const { label, icon: Icon, iconClass } = SEVERITY_META[s]
          return { value: s, label, icon: <Icon className={cn("size-4", iconClass)} aria-hidden /> }
        })}
        selected={filters.severities}
        onChange={(v) => set({ severities: v as Severity[] })}
      />
      <FilterPopover
        title="Missing"
        icon={ListX}
        align="start"
        options={DEFAULT_REQUIRED_FIELDS.map((r) => ({ value: r.field, label: r.label }))}
        selected={filters.fields}
        onChange={(v) => set({ fields: v as FieldId[] })}
      />
      {!isDefaultFilters(filters) && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange(DEFAULT_FILTERS)}>
          Reset
          <X />
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground" id="group-by-label">
          Group by
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={groupBy}
          onValueChange={(v) => v && onGroupByChange(v as GroupBy)}
          aria-labelledby="group-by-label"
        >
          <ToggleGroupItem value="none" className="px-2.5">
            None
          </ToggleGroupItem>
          <ToggleGroupItem value="assignee" className="px-2.5">
            Assignee
          </ToggleGroupItem>
          <ToggleGroupItem value="field" className="px-2.5">
            Missing field
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
