import { describe, it, expect } from "vitest"
import { render } from "../notifications/templates"

describe("notification templates — render()", () => {
  it("renders a registration confirmation with editToken in the link", () => {
    const out = render({
      kind: "registration_confirmation",
      recipient: { email: "alice@example.com", name: "Alice" },
      data: {
        volunteerName: "Alice",
        eventTitle: "Concert d'été",
        shifts: [{ label: "Bar", date: "samedi 14 juin", startTime: "14:00", endTime: "18:00" }],
        editToken: "tok-abc",
      },
    })
    expect(out.subject).toContain("Concert d'été")
    expect(out.html).toContain("/my/tok-abc")
    expect(out.text).toContain("/my/tok-abc")
    expect(out.text).toContain("Alice")
  })

  it("escapes HTML special chars in volunteer name", () => {
    const out = render({
      kind: "registration_confirmation",
      recipient: { email: "x@y.com", name: "X" },
      data: {
        volunteerName: "<script>alert(1)</script>",
        eventTitle: "Test",
        shifts: [],
        editToken: "tok",
      },
    })
    expect(out.html).not.toContain("<script>alert(1)</script>")
    expect(out.html).toContain("&lt;script&gt;")
  })

  it("escapes HTML in member invite custom message", () => {
    const out = render({
      kind: "member_invite",
      recipient: { email: "m@x.com", name: "M" },
      data: {
        memberName: "Marie",
        organizationName: "École",
        eventTitle: "Spectacle",
        eventDate: "14 juin",
        eventLocation: "Salle A",
        orgSlug: "ecole",
        eventSlug: "spectacle",
        message: '<img src=x onerror="alert(1)">',
        token: "t1",
      },
    })
    expect(out.html).not.toContain('onerror="alert')
    expect(out.html).toContain("&lt;img")
  })

  it("renders reminder J-2 with shift details", () => {
    const out = render({
      kind: "reminder_j2",
      recipient: { email: "a@x.com" },
      data: {
        volunteerName: "Alice",
        eventTitle: "Concert",
        organizationName: "Asso",
        shiftLabel: "Buvette",
        shiftRoleName: "Bar",
        shiftDate: "samedi 14 juin",
        shiftStart: "14:00",
        shiftEnd: "18:00",
        shiftLocation: "Salle des fêtes",
        editToken: "tok",
      },
    })
    expect(out.subject).toContain("J-2")
    expect(out.text).toContain("Salle des fêtes")
    expect(out.text).toContain("14:00")
    expect(out.text).toContain("/my/tok")
  })

  it("renders reminder day-of with hoursUntil", () => {
    const out = render({
      kind: "reminder_dd",
      recipient: { email: "a@x.com" },
      data: {
        volunteerName: "Alice",
        eventTitle: "Concert",
        organizationName: "Asso",
        shiftLabel: "Buvette",
        shiftRoleName: "Bar",
        shiftDate: "samedi 14 juin",
        shiftStart: "14:00",
        shiftEnd: "18:00",
        shiftLocation: null,
        editToken: "tok",
        hoursUntil: 3,
      },
    })
    expect(out.subject).toContain("aujourd'hui")
    expect(out.html).toContain("dans 3h")
  })

  it("renders manual reminder with custom message + multiple shifts", () => {
    const out = render({
      kind: "manual_reminder",
      recipient: { email: "v@x.com" },
      data: {
        volunteerName: "Bob",
        organizationName: "Asso",
        eventTitle: "Concert",
        customMessage: "Tenue noire SVP, RDV entrée artistes.",
        shifts: [
          { label: "Bar", date: "samedi 14", startTime: "14:00", endTime: "18:00", roleName: "Bar" },
          { label: "Démontage", date: "samedi 14", startTime: "22:00", endTime: "00:00", roleName: "Démontage" },
        ],
        editToken: "tok",
      },
    })
    expect(out.text).toContain("Tenue noire")
    expect(out.text).toContain("Bar")
    expect(out.text).toContain("Démontage")
    expect(out.subject).toContain("Rappel")
  })

  it("renders shift modified with old vs new schedule", () => {
    const out = render({
      kind: "shift_modified",
      recipient: { email: "v@x.com" },
      data: {
        volunteerName: "Bob",
        eventTitle: "Concert",
        shiftLabel: "Bar",
        oldDate: "samedi 14",
        newDate: "dimanche 15",
        oldStart: "14:00",
        newStart: "15:00",
        oldEnd: "18:00",
        newEnd: "19:00",
        editToken: "tok",
      },
    })
    expect(out.html).toContain("samedi 14")
    expect(out.html).toContain("dimanche 15")
    expect(out.html).toContain("15:00")
    expect(out.subject).toContain("changement")
  })

  it("renders shift cancelled with link back to event", () => {
    const out = render({
      kind: "shift_cancelled",
      recipient: { email: "v@x.com" },
      data: {
        volunteerName: "Bob",
        eventTitle: "Concert",
        orgSlug: "asso",
        eventSlug: "concert-2026",
        shiftLabel: "Bar",
        shiftDate: "samedi 14",
      },
    })
    expect(out.html).toContain("concert-2026")
    expect(out.subject).toContain("annulé")
  })
})
