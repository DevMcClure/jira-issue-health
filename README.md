# Jira Health

A proof of concept that lists the Jira tickets missing information the **Jira Dashboard** needs, says what each gap affects, and lets you fix them in Jira.

It's a sister app to the Jira Dashboard and reads the same Jira Trawler data. The dashboard shows how sprints, PIs and teams are progressing; Jira Health shows which tickets are making that picture wrong. A missing story point shrinks velocity, an unassigned ticket in progress drops out of everyone's load, a Done ticket with no resolved date has no cycle time.

## What you can do

- See every ticket missing a required field, with the gap highlighted, the dashboard views it affects, and a link to the ticket in Jira.
- Filter by team, sprint, assignee, type, severity or missing field, and group by assignee to see who to chase.
- Watch the list update live: tickets fixed in Jira (or by a colleague) are marked **Fixed** and leave the list, new gaps are marked **New**.
- **Resolve** a ticket: fill in the missing fields, with suggested values from similar tickets, and they're written to Jira as you. **Update & next** moves straight on to the next ticket.
- Change which fields count as required in the **Required fields** panel.
- **Copy fix list** as Markdown, grouped by assignee, to paste into a channel before stand-up.

## Two ways to run

| | Demo (GitHub Pages) | Live |
| --- | --- | --- |
| Data | Built-in sample, or a Trawler file you load (read in your browser, never uploaded) | MongoDB, through the Jira Health server |
| Updates | A stand-in feed fixes a ticket "in Jira" every minute or so (can be turned off) | Pushed to the browser as soon as MongoDB changes |
| Resolve | A mock Jira in your browser, with a one-click demo account. Nothing real changes | Written to Jira as you, with your own token |

`VITE_DATA_MODE` picks one: `demo` (the default, and what GitHub Pages runs) or `api`.

## Run it locally

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev          # the demo, at http://localhost:5173
pnpm test         # unit tests (web and server)
pnpm lint         # ESLint
pnpm build        # type-check and build the web app into dist/
```

### With the server

Copy `.env.example` to `.env` (git-ignored) and set at least `MONGO_URI`, `MONGO_DB_NAME` and `TOKEN_ENCRYPTION_KEY`. Then, in two terminals:

```bash
pnpm dev:server   # the API on :8787 (add SEED_MOCK=true to fill an empty database with the sample)
pnpm dev:live     # the web app on :5173, talking to the server through Vite's proxy
```

No MongoDB to hand? `DATA_STORE=memory` serves the sample data from memory (development only). `JIRA_MODE=mock` (the default) uses a built-in mock Jira that accepts any token except one starting with `bad`.

For production: `pnpm build:server` bundles the server into `dist-server/index.js`; run it with `pnpm start:server` (Node 22, reads `.env`) behind HTTPS. Build the web app with `VITE_DATA_MODE=api` and `VITE_API_BASE_URL` pointing at the server, and add the web app's origin to `CORS_ORIGIN`. If the web app is on a different site from the API, set `COOKIE_SAMESITE=none`.

## Architecture

```
Browser ──── /api (cookies) ────▶ Jira Health server ──▶ MongoDB   (issue data, fixes, sessions)
   ▲                                      │
   └──── server-sent events ◀─────────────┤
                                          └──▶ Jira REST API (as each person, with their token)
```

- **`src/lib/`**: pure logic shared by the web app and the server (the data contract, required-field checks, suggestions, the API contract). No React and no Node.
- **`server/`**: Fastify + MongoDB. Every setting comes from the environment (`server/env.ts`) and is checked at startup.
- **`src/backend/`**: the web app's two backends behind one interface: `http-backend.ts` (the server) and `demo-backend.ts` (everything in the browser, same API shapes).

### Live data

The server reads the issue data from MongoDB and serves it to the browser with a content hash as its revision. It notices changes with a MongoDB change stream (a replica set or Atlas), or by polling every `LIVE_POLL_SECONDS` on a standalone MongoDB. Whatever made the change (the issue feed, an ingest, or a Resolve), every open browser hears about it over `GET /api/events` and refetches.

Data can arrive two ways: something else writes to MongoDB (the live feed), or a Trawler export is posted to `POST /api/ingest` with the `INGEST_TOKEN`.

### Data contract in MongoDB

One document per thing, in the database named by `MONGO_DB_NAME`; `_id` is the natural id. Field names and values are the Trawler contract's, the same one the Jira Dashboard reads.

| Collection | `_id` | Fields |
| --- | --- | --- |
| `meta` | `"current"` | `source`, `version`, `generatedAt`, `jiraBaseUrl` |
| `teams` | team id | `name`, `projectKey`, `memberIds` |
| `people` | person id (Jira user name on Data Center, account id on Cloud) | `displayName` |
| `sprints` | sprint id (number) | `name`, `teamId`, `state`, `startDate`, `endDate`, `completeDate` |
| `issues` | issue key | `summary`, `type`, `status`, `statusCategory`, `priority`, `assigneeId`, `teamId`, `sprintIds`, `storyPoints`, `labels`, `epicKey`, `parentKey`, `created`, `resolved`, `changelog` |

The server also keeps `fixes` (what was fixed with Resolve, by whom and when) and `jira_sessions`. A document that doesn't fit the contract is left out and logged; it doesn't take the rest of the data down. If the live database uses a different shape, only `server/store/mapping.ts` needs to change.

### Resolve and Jira

- Each person connects their own Jira account once: a **personal access token** on Data Center/Server, or **email + API token** on Cloud (`JIRA_FLAVOUR`). Edits show in Jira's history as them, and Jira's own permissions apply.
- The token is checked with Jira, then kept on the server encrypted (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) under a random session id that only an httpOnly cookie holds. The browser never stores it.
- Fields are written with `PUT /rest/api/2/issue/{key}`; a sprint is added through Jira Software's `POST /rest/agile/1.0/sprint/{id}/issue`, only after the field edit has gone through. Labels are sent as additions and removals, so labels added in Jira meanwhile are kept. A missing resolved date is fixed by setting a resolution: Jira records the date itself.
- Before writing, the server checks nothing was filled in since the dialog opened, and won't overwrite it. Jira's refusals come back per field.
- Set `JIRA_FIELD_STORY_POINTS` (and on Data Center `JIRA_FIELD_EPIC_LINK`) to your Jira's custom field ids.

### Security

- No secrets in the repo: `.env*` (except `.env.example`), keys, certificates, credentials and real exports are git-ignored, and CI fails if a `.env` file is committed.
- State-changing requests need an `X-Requested-With: jira-health` header, and CORS only allows `CORS_ORIGIN`, so other sites can't use someone's session. Connecting and resolving are rate-limited.
- `DATA_ACCESS=connected` makes the data readable only by people connected to Jira; the default (`open`) suits a server only reachable on an internal network.

## Load your own data (demo)

Use **Load Trawler file** and pick a Jira Trawler export: its JSON output, its audit `.log`, or the Jira Dashboard's contract format. The file is read in your browser and never uploaded. **Reset to sample data** goes back to the built-in mock data.

The sample data is generated and fictional (`pnpm mock` regenerates it). Real exports don't belong in this repository.

## Tests

`pnpm test` runs everything, including the server against an in-memory store and a fake Jira. The MongoDB store's tests run only when `MONGO_TEST_URI` is set, e.g. `MONGO_TEST_URI=mongodb://localhost:27017 pnpm test server`; they use a throwaway database and drop it afterwards.

## Deployment

Every push to `main` runs lint, type-check, tests and both builds, then publishes the demo to GitHub Pages at `/<repo-name>/`. Set the repository variable `VITE_DASHBOARD_URL` to link the product switcher to your Jira Dashboard. The server isn't deployed by this workflow.
