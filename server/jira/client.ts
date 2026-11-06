/**
 * How the server talks to Jira. Routes only see this interface: the REST client
 * against a real Jira, or the mock for development and tests.
 */
import type { FieldErrors, JiraUpdate, JiraUser, ResolveFailureCode, UpdateField } from "../../src/lib/api/contract"
import type { Issue, JiraDataset } from "../../src/lib/jira/types"

/** A person's own Jira credentials. Only ever held by the server, encrypted at rest. */
export type JiraCredentials = { kind: "pat"; token: string } | { kind: "basic"; email: string; token: string }

/** Jira didn't accept the credentials (expired, revoked or wrong). */
export class JiraAuthError extends Error {
  constructor(message = "Jira didn't accept that token. Check it hasn't expired and try again.") {
    super(message)
    this.name = "JiraAuthError"
  }
}

/** Jira couldn't be reached or didn't answer in time. */
export class JiraUnreachableError extends Error {
  constructor(message = "Couldn't reach Jira. Try again in a moment.") {
    super(message)
    this.name = "JiraUnreachableError"
  }
}

export type WriteOutcome = {
  /** Fields Jira accepted. */
  written: UpdateField[]
  /** Fields Jira refused, with its message. */
  fieldErrors: FieldErrors
  /** Set when the write failed as a whole (not because of a field). */
  failure?: { code: Exclude<ResolveFailureCode, "conflict" | "invalid">; message: string }
}

export interface JiraClient {
  readonly kind: "rest" | "mock"
  /** Who the credentials belong to. Throws `JiraAuthError` or `JiraUnreachableError`. */
  whoAmI(credentials: JiraCredentials): Promise<JiraUser>
  /** Write the update to one issue as the person. `issue` is its current state; `ctx` the data it belongs to. */
  update(credentials: JiraCredentials, issue: Issue, update: JiraUpdate, ctx: JiraDataset): Promise<WriteOutcome>
}
