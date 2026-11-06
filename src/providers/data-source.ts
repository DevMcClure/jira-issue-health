/**
 * Where the app's data comes from, and how Resolve reaches Jira. Providers only
 * talk to these interfaces; `src/backend` picks the implementation:
 *   - api:  the Jira Health server (MongoDB data, live events, real Jira writes)
 *   - demo: everything in this browser (bundled sample or a loaded file, a mock Jira, a simulated feed)
 */
import type { ConnectRequest, Fix, JiraConnection, ResolveRequest, ResolveResult, ServerConfig } from "@/lib/api/contract"
import type { JiraDataset } from "@/lib/jira/types"

export type DataOrigin =
  | { kind: "sample" }
  | { kind: "upload"; fileName: string; loadedAt: string }
  /** The Jira Health server. */
  | { kind: "live" }

export type LoadedData = {
  dataset: JiraDataset
  origin: DataOrigin
  /** Changes whenever the data does. */
  revision: string
  /** Recent fixes (made through Resolve, or seen arriving from Jira). */
  fixes: Fix[]
}

export type LiveState = "connecting" | "live" | "reconnecting" | "offline"

export type LiveStatus = {
  state: LiveState
  /** When the data last changed or was confirmed current. */
  checkedAt: string | null
  /** The demo's stand-in feed rather than a real server. */
  simulated: boolean
}

export type DataUpdate = { kind: "data"; data: LoadedData } | { kind: "status"; status: LiveStatus }

/** The parts of a `File` a source needs (so tests don't need a DOM). */
export type FileLike = Pick<File, "name" | "text">

/** Rejects with this when the server needs a Jira connection before it shares data. */
export class NeedsConnectionError extends Error {
  constructor() {
    super("Connect your Jira account to see the data.")
    this.name = "NeedsConnectionError"
  }
}

export interface DataSource {
  load(): Promise<LoadedData>
  /** Fetch again now. */
  refresh(): Promise<LoadedData>
  /** Fresh data whenever it changes, and the connection's state. Returns a function that stops. */
  subscribe(listener: (update: DataUpdate) => void): () => void
  /** Only where data can come from a file the person loads (the demo). */
  files?: {
    /**
     * Parse a file and make it the current data. Rejects with `JiraExportError` or
     * `SyntaxError` on bad input, leaving the current data alone. `remembered` is
     * false when it couldn't be kept for the next visit (e.g. too large).
     */
    loadFile(file: FileLike): Promise<{ data: LoadedData; remembered: boolean }>
    /** Forget any loaded file and return the sample. */
    reset(): Promise<LoadedData>
  }
}

export interface JiraGateway {
  config(): Promise<ServerConfig>
  /** Who this browser is connected to Jira as, if anyone. */
  connection(): Promise<JiraConnection | null>
  /** Rejects with an `Error` whose message says what to fix. */
  connect(request: ConnectRequest): Promise<JiraConnection>
  disconnect(): Promise<void>
  resolve(issueKey: string, request: ResolveRequest): Promise<ResolveResult>
}

/** Controls only the in-browser demo has. */
export type DemoControls = {
  /** Whether the stand-in feed makes changes "in Jira" every minute or so. */
  simulation: { enabled(): boolean; setEnabled(on: boolean): void }
  /** Forget every change made in the demo. */
  reset(): Promise<void>
}

export type Backend = {
  mode: "api" | "demo"
  data: DataSource
  jira: JiraGateway
  demo?: DemoControls
}
