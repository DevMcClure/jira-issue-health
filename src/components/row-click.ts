import type { MouseEvent } from "react"

/** Clicking anywhere on a row expands it, except on its links, buttons and focusable chips. */
export function ignoreInteractive(e: MouseEvent, run: () => void) {
  if ((e.target as HTMLElement).closest("a, button, [tabindex]")) return
  run()
}
