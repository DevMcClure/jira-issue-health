import { useContext } from "react"
import { RequiredFieldsContext } from "@/providers/required-fields-context"

export function useRequiredFields() {
  const ctx = useContext(RequiredFieldsContext)
  if (!ctx) throw new Error("useRequiredFields must be used inside <RequiredFieldsProvider>")
  return ctx
}
