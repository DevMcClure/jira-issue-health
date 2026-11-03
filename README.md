# Jira Health

A proof of concept that lists the Jira tickets missing information the **Jira Dashboard** needs, says what each gap affects, and lets you fix them.

It's a sister app to the Jira Dashboard and reads the same Jira Trawler export. The dashboard shows how sprints, PIs and teams are progressing; Jira Health shows which tickets are making that picture wrong. A missing story point shrinks velocity, an unassigned ticket in progress drops out of everyone's load, a Done ticket with no resolved date has no cycle time.

## What you can do

- See every ticket missing a required field, with the gap highlighted, the dashboard views it affects, and a link to the ticket in Jira.
- Filter by team, sprint, assignee, type, severity or missing field, and group by assignee to see who to chase.
- Expand a ticket for a suggested value from similar tickets, always with its evidence.
- **Resolve** a ticket by entering the missing values. **This is a mock:** values are saved in your browser only and nothing is sent to Jira. "Open in Jira" is a plain link.
- Change which fields count as required in the **Required fields** panel.
- **Copy fix list** as Markdown, grouped by assignee, to paste into a channel before stand-up.

## Load your own data

Use **Load Trawler file** and pick a Jira Trawler export: its JSON output, its audit `.log`, or the Jira Dashboard's contract format. The file is read in your browser and never uploaded. **Reset to sample data** goes back to the built-in mock data.

The sample data is generated and fictional (`pnpm mock` regenerates it). Real exports don't belong in this repository.

## Run it locally

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests
pnpm lint       # ESLint
pnpm build      # type-check and build into dist/
```

Optional settings go in a `.env` file (see `.env.example`): `VITE_DASHBOARD_URL` for the product switcher's link to the Jira Dashboard, and `VITE_BASE_PATH` for the sub-path the app is served from.

## Deployment

Every push to `main` runs lint, type-check, tests and build, then publishes to GitHub Pages at `/<repo-name>/`. Set the repository variable `VITE_DASHBOARD_URL` to link the product switcher to your Jira Dashboard.
