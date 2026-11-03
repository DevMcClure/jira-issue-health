import { useContext } from "react"
import { DataContext } from "@/providers/data-context"

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error("useData must be used inside <DataProvider>")
  return ctx
}
