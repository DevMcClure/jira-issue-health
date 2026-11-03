import { JiraExportError } from "@/lib/jira/adapter"

/** Readable problems from a failed load: zod paths for a bad shape, the parser's message for bad JSON. */
export function problemsFrom(err: unknown): string[] {
  if (err instanceof JiraExportError) return err.problems
  if (err instanceof SyntaxError) return [`Not valid JSON: ${err.message}`]
  return [err instanceof Error ? err.message : String(err)]
}

/** The first few problems on one line, for a toast. */
export const summariseProblems = (problems: string[]) =>
  problems.slice(0, 3).join(" · ") + (problems.length > 3 ? ` (+${problems.length - 3} more)` : "")
