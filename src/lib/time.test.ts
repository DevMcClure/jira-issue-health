import { describe, expect, it } from "vitest"
import { ago } from "./time"

describe("ago", () => {
  const now = new Date("2026-11-04T10:00:00Z")
  it("reads naturally for recent times and falls back to the clock", () => {
    expect(ago("2026-11-04T09:59:30Z", now)).toBe("just now")
    expect(ago("2026-11-04T09:56:00Z", now)).toBe("4 min ago")
    expect(ago("2026-11-04T08:00:00Z", now)).toBe("2 h ago")
    expect(ago("2026-11-04T01:30:00Z", now)).toBe("01:30")
    expect(ago("2026-11-02T01:30:00Z", now)).toBe("2 Nov, 01:30")
  })
})
