/**
 * Writes to a real Jira (Data Center/Server or Cloud) over its REST API, as the
 * person whose credentials are given:
 *   - fields:  PUT  /rest/api/2/issue/{key}          (story points, assignee, priority, epic, labels, resolution)
 *   - sprint:  POST /rest/agile/1.0/sprint/{id}/issue (Jira Software's way to add an issue to a sprint)
 * The sprint is only added once the field edit has gone through, so a refused
 * edit changes nothing. Jira's own error messages are passed back per field.
 */
import { HEALTH_FIELD_FOR, labelChanges, updateFields, type FieldErrors, type JiraUpdate, type JiraUser, type UpdateField } from "../../src/lib/api/contract"
import type { Issue } from "../../src/lib/jira/types"
import { JiraAuthError, JiraUnreachableError, type JiraClient, type JiraCredentials, type WriteOutcome } from "./client"

export type RestClientOptions = {
  /** e.g. https://jira.example.com, without a trailing slash. */
  baseUrl: string
  flavour: "datacenter" | "cloud"
  fields: {
    /** The story points custom field id, e.g. customfield_10016. */
    storyPoints: string
    /** Data Center's Epic Link custom field id. Cloud sets the parent instead. */
    epicLink?: string
  }
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

type JiraErrorBody = { errorMessages?: string[]; errors?: Record<string, string> }

const authorization = (c: JiraCredentials) =>
  c.kind === "pat" ? `Bearer ${c.token}` : `Basic ${Buffer.from(`${c.email}:${c.token}`).toString("base64")}`

export function createJiraRestClient({ baseUrl, flavour, fields, timeoutMs, fetch = globalThis.fetch }: RestClientOptions): JiraClient {
  const root = baseUrl.replace(/\/+$/, "")
  const epicField = flavour === "cloud" ? "parent" : fields.epicLink!

  /** Jira's field id → the update field it belongs to (for mapping errors back). */
  const ownerOf: Record<string, UpdateField> = {
    [fields.storyPoints]: "storyPoints",
    assignee: "assigneeId",
    priority: "priority",
    [epicField]: "epicKey",
    labels: "labels",
    resolution: "resolution",
  }

  async function call(credentials: JiraCredentials, method: string, path: string, body?: unknown) {
    let res: Response
    try {
      res = await fetch(`${root}${path}`, {
        method,
        headers: {
          Authorization: authorization(credentials),
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          // Jira DC's XSRF check; harmless elsewhere.
          "X-Atlassian-Token": "no-check",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
      })
    } catch {
      throw new JiraUnreachableError()
    }
    const text = await res.text().catch(() => "")
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // Not JSON (a login page, a proxy error): keep the status only.
    }
    return { status: res.status, json }
  }

  /** Jira's messages for a refused edit, keyed by the missing field they concern. */
  function errorsFrom(body: unknown, fallbackField?: UpdateField): FieldErrors {
    const { errorMessages = [], errors = {} } = (body ?? {}) as JiraErrorBody
    const out: FieldErrors = {}
    for (const [jiraField, message] of Object.entries(errors)) {
      const owner = ownerOf[jiraField] ?? fallbackField
      const key = owner ? HEALTH_FIELD_FOR[owner] : "form"
      out[key] = out[key] ? `${out[key]} ${message}` : message
    }
    const general = errorMessages.filter(Boolean).join(" ")
    if (general) {
      const key = fallbackField ? HEALTH_FIELD_FOR[fallbackField] : "form"
      out[key] = out[key] ? `${out[key]} ${general}` : general
    }
    return out
  }

  function failureFor(status: number, key: string): WriteOutcome["failure"] | null {
    if (status === 401) return { code: "not-connected", message: "Jira no longer accepts your token. Connect again to continue." }
    if (status === 403) return { code: "forbidden", message: `Your Jira account doesn't have permission to edit ${key}.` }
    if (status === 404) return { code: "not-found", message: `${key} no longer exists in Jira, or you can't see it.` }
    if (status >= 500 || (status >= 300 && status < 400)) return { code: "jira-unreachable", message: `Jira answered with an error (${status}). Try again in a moment.` }
    return null
  }

  function editBody(issue: Issue, update: JiraUpdate) {
    const set: Record<string, unknown> = {}
    const ops: Record<string, unknown[]> = {}
    if (update.storyPoints !== undefined) set[fields.storyPoints] = update.storyPoints
    if (update.assigneeId !== undefined) set.assignee = flavour === "cloud" ? { accountId: update.assigneeId } : { name: update.assigneeId }
    if (update.priority !== undefined) set.priority = { name: update.priority }
    if (update.epicKey !== undefined) set[epicField] = flavour === "cloud" ? { key: update.epicKey } : update.epicKey
    if (update.resolution !== undefined) set.resolution = { name: update.resolution }
    if (update.labels !== undefined) {
      // Add and remove rather than replace, so labels added meanwhile in Jira are kept.
      const { add, remove } = labelChanges(issue.labels, update.labels)
      ops.labels = [...add.map((l) => ({ add: l })), ...remove.map((l) => ({ remove: l }))]
      if (ops.labels.length === 0) delete ops.labels
    }
    return { set, ops }
  }

  return {
    kind: "rest",

    async whoAmI(credentials): Promise<JiraUser> {
      const { status, json } = await call(credentials, "GET", "/rest/api/2/myself")
      if (status === 401 || status === 403) throw new JiraAuthError()
      if (status !== 200 || !json) throw new JiraUnreachableError(`Jira answered with an error (${status}).`)
      const me = json as { accountId?: string; name?: string; key?: string; displayName?: string }
      const id = me.accountId ?? me.name ?? me.key
      if (!id) throw new JiraUnreachableError("Jira's answer didn't say who you are.")
      return { id, displayName: me.displayName ?? id }
    },

    async update(credentials, issue, update): Promise<WriteOutcome> {
      const key = encodeURIComponent(issue.key)
      const all = updateFields(update)
      const editFields = all.filter((f) => f !== "sprintId")
      const written: UpdateField[] = []
      const fieldErrors: FieldErrors = {}

      if (editFields.length) {
        const { set, ops } = editBody(issue, update)
        const body = { ...(Object.keys(set).length ? { fields: set } : {}), ...(Object.keys(ops).length ? { update: ops } : {}) }
        if (Object.keys(body).length) {
          const { status, json } = await call(credentials, "PUT", `/rest/api/2/issue/${key}`, body)
          const failure = failureFor(status, issue.key)
          if (failure) return { written, fieldErrors: {}, failure }
          if (status !== 204 && status !== 200) {
            // Refused: nothing in the edit was saved, and the sprint isn't attempted.
            return { written, fieldErrors: errorsFrom(json, editFields.length === 1 ? editFields[0] : undefined) }
          }
        }
        written.push(...editFields)
      }

      if (update.sprintId !== undefined) {
        const { status, json } = await call(credentials, "POST", `/rest/agile/1.0/sprint/${update.sprintId}/issue`, { issues: [issue.key] })
        if (status === 204 || status === 200) {
          written.push("sprintId")
        } else {
          const failure = failureFor(status, issue.key)
          if (failure && written.length === 0) return { written, fieldErrors: {}, failure }
          fieldErrors.sprintIds = failure?.message ?? errorsFrom(json, "sprintId").sprintIds ?? `Jira didn't add it to the sprint (${status}).`
        }
      }

      return { written, fieldErrors }
    },
  }
}
