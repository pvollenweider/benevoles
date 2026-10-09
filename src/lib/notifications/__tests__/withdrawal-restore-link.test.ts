import { describe, it, expect } from "vitest"
import { render } from "../templates"

// The organisers' withdrawal email links to « Annulations récentes » (#809) while the spot is free.

const payload = (waitlistTookSpot: boolean) => ({
  kind: "registration_cancelled" as const,
  recipient: { email: "admin@org.ch" },
  data: {
    eventId: "e1", eventTitle: "Fête", volunteerName: "Chloé Roy", shiftId: "s1", shiftLabel: "Bar", roleName: "Bar",
    shiftDate: "04.07.2026", startTime: "10:00", endTime: "12:00", placesMissing: 1, waitlistTookSpot, message: null,
  },
})

describe("withdrawal email to the organisers", () => {
  it("links to the recent cancellations when the spot is still free", () => {
    const email = render(payload(false))
    expect(email.text).toContain("/admin/events/e1/registrations#annulations")
    expect(email.html).toContain(">Rétablir l'inscription</a>")
  })

  it("offers no restore once the waitlist took the spot", () => {
    const email = render(payload(true))
    expect(email.text).not.toContain("#annulations")
    expect(email.html).not.toContain("Rétablir")
  })
})
