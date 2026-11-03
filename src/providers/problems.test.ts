import { describe, expect, it } from "vitest"
import { JiraExportError } from "@/lib/jira/adapter"
import { problemsFrom, summariseProblems } from "./problems"

describe("problemsFrom", () => {
  it("lists a bad export's problems", () => {
    expect(problemsFrom(new JiraExportError(["issues: required"]))).toEqual(["issues: required"])
  })

  it("explains invalid JSON", () => {
    expect(problemsFrom(new SyntaxError("Unexpected end"))).toEqual(["Not valid JSON: Unexpected end"])
  })

  it("summarises more than three problems", () => {
    expect(summariseProblems(["a", "b", "c", "d", "e"])).toBe("a · b · c (+2 more)")
  })
})
