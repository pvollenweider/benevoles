import { describe, it, expect } from "vitest"
import { directoryRegistrations } from "../pdf-export-gantt"

// The PDF's contact list shows only people on the printed planning, never a pending request (#484).
describe("directoryRegistrations", () => {
  const regs = ["active", "requested", "waiting", "offered"].map((status) => ({ status }))
  it("confirmed and printed waitlist, never requests", () => {
    expect(directoryRegistrations(regs, true).map((r) => r.status)).toEqual(["active", "waiting", "offered"])
    expect(directoryRegistrations(regs, false).map((r) => r.status)).toEqual(["active"])
  })
})
