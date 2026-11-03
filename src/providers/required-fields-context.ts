import { createContext } from "react"
import type { RequiredFieldsConfig } from "@/lib/health/config"
import type { RequiredField } from "@/lib/health/requiredFields"

export type RequiredFieldsContextValue = {
  config: RequiredFieldsConfig
  /** The rules the checks use: the defaults with this config's types and severities. */
  rules: RequiredField[]
  setConfig: (next: RequiredFieldsConfig) => void
  resetConfig: () => void
}

export const RequiredFieldsContext = createContext<RequiredFieldsContextValue | null>(null)
