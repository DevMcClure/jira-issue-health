/**
 * The Jira Dashboard's views that depend on complete tickets. Ids follow the
 * project brief; `page` is where the view lives in the Jira Dashboard's nav.
 */

export const DASHBOARD_VIEW_IDS = [
  "sprint-burndown",
  "velocity",
  "commitment",
  "scope-change",
  "cycle-time",
  "throughput",
  "work-item-age",
  "flow-distribution",
  "load",
  "people",
  "epic-progress",
  "pi-objectives",
  "predictability",
  "priority",
] as const

export type DashboardViewId = (typeof DASHBOARD_VIEW_IDS)[number]

export type DashboardView = {
  id: DashboardViewId
  /** Chip text. */
  label: string
  /** The Jira Dashboard page it's on. */
  page: string
  /** One sentence on what the view reads, for the chip's tooltip. */
  uses: string
}

export const DASHBOARD_VIEWS: Record<DashboardViewId, DashboardView> = {
  "sprint-burndown": {
    id: "sprint-burndown",
    label: "Burndown",
    page: "Overview",
    uses: "Burns down the sprint's story points day by day, so unestimated or unplanned work never shows.",
  },
  velocity: {
    id: "velocity",
    label: "Velocity",
    page: "Teams",
    uses: "Sums the story points each sprint completed; an unestimated ticket counts as zero.",
  },
  commitment: {
    id: "commitment",
    label: "Commitment",
    page: "Sprints",
    uses: "Compares the points a sprint committed to with the points it finished.",
  },
  "scope-change": {
    id: "scope-change",
    label: "Scope change",
    page: "Health",
    uses: "Tracks work added to or removed from a sprint after it started.",
  },
  "cycle-time": {
    id: "cycle-time",
    label: "Cycle time",
    page: "Flow",
    uses: "Measures from first In Progress to the resolved date.",
  },
  throughput: {
    id: "throughput",
    label: "Throughput",
    page: "Flow",
    uses: "Counts finished items per week by their resolved date.",
  },
  "work-item-age": {
    id: "work-item-age",
    label: "Work item age",
    page: "Flow",
    uses: "Shows how long each in-progress item has been open and who holds it.",
  },
  "flow-distribution": {
    id: "flow-distribution",
    label: "Flow distribution",
    page: "Flow",
    uses: "Splits work by flow type (value, quality, defect, accelerator); Spikes need a tech-debt or risk label.",
  },
  load: {
    id: "load",
    label: "Load",
    page: "People",
    uses: "Shows each person's open work and points; unassigned work belongs to nobody.",
  },
  people: {
    id: "people",
    label: "People",
    page: "People",
    uses: "Lists what each team member is working on and has finished.",
  },
  "epic-progress": {
    id: "epic-progress",
    label: "Epic progress",
    page: "PI",
    uses: "Rolls each epic's progress up from the tickets linked to it.",
  },
  "pi-objectives": {
    id: "pi-objectives",
    label: "PI objectives",
    page: "Objectives",
    uses: "Tracks each objective through its epics' tickets.",
  },
  predictability: {
    id: "predictability",
    label: "Predictability",
    page: "Flow",
    uses: "Compares planned with delivered points across sprints.",
  },
  priority: {
    id: "priority",
    label: "Priority breakdown",
    page: "Issues",
    uses: "Groups open work by priority.",
  },
}

/** A ticket's affected views, without duplicates, in the order above. */
export function affectedViews(ids: Iterable<DashboardViewId>): DashboardView[] {
  const wanted = new Set(ids)
  return DASHBOARD_VIEW_IDS.filter((id) => wanted.has(id)).map((id) => DASHBOARD_VIEWS[id])
}
