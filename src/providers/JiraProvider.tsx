import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import type { ConnectRequest, JiraConnection, ResolveRequest, ServerConfig } from "@/lib/api/contract"
import type { JiraGateway } from "./data-source"
import { JiraContext } from "./jira-context"

/** The person's Jira connection and Resolve, through the backend (never straight from the browser to Jira). */
export function JiraProvider({ gateway, children }: { gateway: JiraGateway; children: ReactNode }) {
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [connection, setConnection] = useState<JiraConnection | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([gateway.config(), gateway.connection()]).then(([c, conn]) => {
      if (cancelled) return
      if (c.status === "fulfilled") setConfig(c.value)
      if (conn.status === "fulfilled") setConnection(conn.value)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [gateway])

  const connect = useCallback(
    async (request: ConnectRequest) => {
      const conn = await gateway.connect(request)
      setConnection(conn)
      // The server may not have answered earlier (e.g. it was starting).
      if (!config) gateway.config().then(setConfig, () => {})
      return conn
    },
    [gateway, config],
  )

  const disconnect = useCallback(async () => {
    await gateway.disconnect()
    setConnection(null)
  }, [gateway])

  const resolve = useCallback(
    async (issueKey: string, request: ResolveRequest) => {
      const result = await gateway.resolve(issueKey, request)
      if (!result.ok && result.code === "not-connected") setConnection(null)
      return result
    },
    [gateway],
  )

  const value = useMemo(() => ({ config, connection, ready, connect, disconnect, resolve }), [config, connection, ready, connect, disconnect, resolve])
  return <JiraContext.Provider value={value}>{children}</JiraContext.Provider>
}
