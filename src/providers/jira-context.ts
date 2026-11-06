import { createContext } from "react"
import type { ConnectRequest, JiraConnection, ResolveRequest, ResolveResult, ServerConfig } from "@/lib/api/contract"

export type JiraContextValue = {
  /** Null while loading, or when the server couldn't be reached. */
  config: ServerConfig | null
  /** Who this browser writes to Jira as; null when not connected. */
  connection: JiraConnection | null
  /** The first check of config and connection is done. */
  ready: boolean
  /** Rejects with an `Error` whose message says what to fix. */
  connect: (request: ConnectRequest) => Promise<JiraConnection>
  disconnect: () => Promise<void>
  resolve: (issueKey: string, request: ResolveRequest) => Promise<ResolveResult>
}

export const JiraContext = createContext<JiraContextValue | null>(null)
