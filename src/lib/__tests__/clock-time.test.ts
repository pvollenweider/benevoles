import { describe, it, expect } from "vitest"
import { clockTime, fmt, fmtRange } from "../gantt-utils"
import { fmtHour } from "../registrations-list"
import { render } from "../notifications/templates"

// Hours past midnight stored as 24:00, 25:30, 26:00 (legacy data, on the shift's date) were
// shown as « 24h–26h » in the admin shift picker, emails and exports (user report): the clock
// is read modulo 24 everywhere a time is displayed.
describe("times past midnight read modulo 24", () => {
  it("clockTime wraps the hour and keeps normal times", () => {
    expect(clockTime("24:00")).toBe("00:00")
    expect(clockTime("25:30")).toBe("01:30")
    expect(clockTime("26:00")).toBe("02:00")
    expect(clockTime("09:15")).toBe("09:15")
    expect(clockTime("")).toBe("")
  })

  it("every list formatter agrees", () => {
    expect(fmtHour("24:00")).toBe("0h")
    expect(fmtHour("25:30")).toBe("1h30")
    expect(fmtHour("10:00")).toBe("10h")
    expect(fmt("26:00")).toBe("02h")
    expect(fmtRange("24:00", "26:00")).toBe("00:00–02:00")
  })

  it("emails show the wall clock", () => {
    const { text, html } = render({
      kind: "registration_confirmation",
      recipient: { email: "a@b.c" },
      data: { volunteerName: "Quentin G", eventTitle: "Fête", shifts: [{ label: "Buvette", date: "25.09.2026", startTime: "24:00", endTime: "26:00" }], editToken: "t", orgSlug: "o" },
    })
    expect(text).toContain("00:00–02:00")
    expect(text).not.toContain("24:00")
    expect(html).not.toContain("26:00")
  })
})
