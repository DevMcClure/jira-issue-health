import { describe, expect, it } from "vitest"
import { dataLineLabel } from "./data-line"

describe("dataLineLabel", () => {
  const trawled = "2026-11-03T08:15:00Z"

  it("shows only the time when it was trawled today", () => {
    expect(dataLineLabel({ kind: "sample" }, trawled, new Date("2026-11-03T12:00:00Z"))).toBe("Data: sample · trawled 08:15")
  })

  it("adds the date otherwise", () => {
    expect(dataLineLabel({ kind: "sample" }, trawled, new Date("2026-11-05T12:00:00Z"))).toBe("Data: sample · trawled 3 Nov, 08:15")
  })

  it("names a loaded file", () => {
    const origin = { kind: "upload" as const, fileName: "export.json", loadedAt: trawled }
    expect(dataLineLabel(origin, trawled, new Date(trawled))).toBe("Data: export.json · trawled 08:15")
  })
})
