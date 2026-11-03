import { useContext } from "react"
import { ResolutionsContext } from "@/providers/resolutions-context"

export function useResolutions() {
  const ctx = useContext(ResolutionsContext)
  if (!ctx) throw new Error("useResolutions must be used inside <ResolutionsProvider>")
  return ctx
}
