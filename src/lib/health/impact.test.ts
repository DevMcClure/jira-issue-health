import { describe, expect, it } from "vitest"
import { DASHBOARD_VIEWS, DASHBOARD_VIEW_IDS, affectedViews } from "./impact"

describe("dashboard views", () => {
  it("describes every view", () => {
    for (const id of DASHBOARD_VIEW_IDS) {
      expect(DASHBOARD_VIEWS[id].id).toBe(id)
      expect(DASHBOARD_VIEWS[id].uses).toMatch(/\.$/)
    }
  })

  it("lists affected views once each, in a fixed order", () => {
    expect(affectedViews(["throughput", "velocity", "throughput"]).map((v) => v.label)).toEqual(["Velocity", "Throughput"])
  })
})
