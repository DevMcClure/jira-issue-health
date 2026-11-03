import { useCallback, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_CONFIG, loadConfig, rulesFromConfig, saveConfig, type RequiredFieldsConfig } from "@/lib/health/config"
import { RequiredFieldsContext } from "./required-fields-context"

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** What counts as required, editable in the side panel and remembered in this browser. */
export function RequiredFieldsProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<RequiredFieldsConfig>(() => loadConfig(storage()))
  const setConfig = useCallback((next: RequiredFieldsConfig) => {
    setConfigState(next)
    saveConfig(storage(), next)
  }, [])
  const resetConfig = useCallback(() => setConfig(DEFAULT_CONFIG), [setConfig])
  const value = useMemo(() => ({ config, rules: rulesFromConfig(config), setConfig, resetConfig }), [config, setConfig, resetConfig])
  return <RequiredFieldsContext.Provider value={value}>{children}</RequiredFieldsContext.Provider>
}
