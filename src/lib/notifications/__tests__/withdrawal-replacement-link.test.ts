import { describe, it, expect } from "vitest"
import { renderWithdrawalAdminNotice } from "../templates/administration"

// #869: after a withdrawal that leaves a place empty with nobody waiting, the organisers' email
// leads straight to the members free for that shift.
const base = {
  eventId: "evt-1", eventTitle: "Fête", volunteerName: "Aline Exemple", shiftId: "s-1", shiftLabel: "Bar", roleName: "Bar",
  shiftDate: "04/07/2026", startTime: "10:00", endTime: "12:00", placesMissing: 1, waitlistTookSpot: false, message: null,
}
const render = (data: Partial<typeof base>) => renderWithdrawalAdminNotice({ kind: "registration_cancelled", recipient: { email: "a@x.org" }, data: { ...base, ...data } })

describe("withdrawal email to the organisers", () => {
  it("offers « Trouver un remplaçant » for the shift when a place is missing", () => {
    const mail = render({})
    expect(mail.html).toContain("Trouver un remplaçant")
    expect(mail.text).toContain("/admin/events/evt-1/staffing/search?shift=s-1")
  })

  it("does not when the waitlist took the place, or nothing is missing", () => {
    for (const data of [{ waitlistTookSpot: true }, { placesMissing: 0 }]) {
      const mail = render(data)
      expect(mail.html).not.toContain("Trouver un remplaçant")
      expect(mail.text).not.toContain("staffing/search")
    }
  })
})
