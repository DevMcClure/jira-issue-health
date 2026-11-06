/**
 * A stand-in Jira for development and tests (JIRA_MODE=mock). It accepts any
 * token except ones starting with "bad", and refuses the values a real Jira would
 * (unknown people, epics or sprints; closed sprints) with Jira's own messages.
 */
import { createHash } from "node:crypto"
import { updateFields } from "../../src/lib/api/contract"
import { mockJiraErrors } from "../../src/lib/api/mock-jira"
import { JiraAuthError, type JiraClient } from "./client"

export function createMockJiraClient({ resolutions, delayMs = 0 }: { resolutions: string[]; delayMs?: number }): JiraClient {
  const wait = () => new Promise((r) => setTimeout(r, delayMs))
  return {
    kind: "mock",

    async whoAmI(credentials) {
      await wait()
      if (credentials.token.startsWith("bad")) throw new JiraAuthError()
      const name = credentials.kind === "basic" ? credentials.email.split("@")[0] : "mock-user"
      // A stable id per token, so two people connecting look like two people.
      const id = `${name}-${createHash("sha256").update(credentials.token).digest("hex").slice(0, 6)}`
      return { id, displayName: credentials.kind === "basic" ? name : "Mock Jira user" }
    },

    async update(_credentials, issue, update, ctx) {
      await wait()
      const fieldErrors = mockJiraErrors(issue, update, ctx, resolutions)
      if (Object.keys(fieldErrors).length) return { written: [], fieldErrors }
      return { written: updateFields(update), fieldErrors: {} }
    },
  }
}
