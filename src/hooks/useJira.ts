import { useContext } from "react"
import { JiraContext } from "@/providers/jira-context"

export function useJira() {
  const ctx = useContext(JiraContext)
  if (!ctx) throw new Error("useJira must be used inside <JiraProvider>")
  return ctx
}
