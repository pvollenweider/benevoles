import { describe, it, expect } from "vitest"
import { render } from "../notifications/templates"
import { EMERGENCY_NOTE } from "../shift-info"

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
        shifts: [{ label: "Buvette", roleName: "Bar", date: "samedi 14 juin", startTime: "14:00", endTime: "18:00", locationDetails: "Salle des fêtes" }],
        editToken: "tok",
      },
    })
    expect(out.subject).toContain("J-2")
    expect(out.text).toContain("Salle des fêtes")
    expect(out.text).toContain("14:00")
    expect(out.text).toContain("/my/tok")
  })

  it("renders reminder J-2 for several shifts of the same day, in time order (#672)", () => {
    const out = render({
      kind: "reminder_j2",
      recipient: { email: "a@x.com" },
      data: {
        volunteerName: "Alice",
        eventTitle: "Concert",
        organizationName: "Asso",
        shifts: [
          { label: "Buvette", roleName: "Bar", date: "samedi 14 juin", startTime: "09:00", endTime: "12:00" },
          { label: "Montage", roleName: "Logistique", date: "samedi 14 juin", startTime: "14:00", endTime: "18:00" },
        ],
        editToken: "tok",
      },
    })
    expect(out.subject).toContain("J-2")
    expect(out.text).toContain("09:00")
    expect(out.text).toContain("14:00")
    expect(out.text.indexOf("09:00")).toBeLessThan(out.text.indexOf("14:00"))
    expect(out.text).toContain("Bar")
    expect(out.text).toContain("Logistique")
  })

  it("renders reminder day-of with hoursUntil", () => {
    const out = render({
      kind: "reminder_dd",
      recipient: { email: "a@x.com" },
      data: {
        volunteerName: "Alice",
        eventTitle: "Concert",
        organizationName: "Asso",
        shifts: [{ label: "Buvette", roleName: "Bar", date: "samedi 14 juin", startTime: "14:00", endTime: "18:00", locationDetails: null }],
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

// Practical info per shift (#397) in the volunteer emails.
describe("notification templates — shift practical info", () => {
  const info = { locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079 000 00 00", instructions: "Venir 10 min <avant>." }

  it("lists place, contact and instructions under each confirmed shift, escaped", () => {
    const out = render({
      kind: "registration_confirmation",
      recipient: { email: "a@x.ch", name: "Alice" },
      data: { volunteerName: "Alice", eventTitle: "Fête", editToken: "tok", shifts: [{ label: "Bar", date: "samedi", startTime: "10:00", endTime: "12:00", ...info }] },
    })
    expect(out.text).toContain("Lieu : Entrée B")
    expect(out.text).toContain("Contact pour ce créneau : Léa, 079 000 00 00")
    expect(out.text).toContain("À savoir : Venir 10 min <avant>.")
    expect(out.html).toContain('Contact pour ce créneau : Léa, <a href="tel:0790000000">079 000 00 00</a>')
    expect(out.html).toContain("Venir 10 min &lt;avant&gt;.")
    expect(out.html).not.toContain("<avant>")
  })

  it("says nothing extra for a shift without info", () => {
    const out = render({
      kind: "registration_confirmation",
      recipient: { email: "a@x.ch", name: "Alice" },
      data: { volunteerName: "Alice", eventTitle: "Fête", editToken: "tok", shifts: [{ label: "Bar", date: "samedi", startTime: "10:00", endTime: "12:00" }] },
    })
    expect(out.text).not.toContain("Lieu :")
    expect(out.html).not.toContain("Contact")
  })

  it.each(["reminder_j2", "reminder_j1", "reminder_dd"] as const)("%s carries the contact and instructions", (kind) => {
    const out = render({
      kind,
      recipient: { email: "a@x.ch", name: "Alice" },
      data: {
        volunteerName: "Alice", eventTitle: "Fête", organizationName: "Org",
        shifts: [{
          label: "Bar", roleName: "Bar", date: "samedi 4 juillet", startTime: "10:00", endTime: "12:00", locationDetails: "Entrée B",
          contactName: "Léa", contactPhone: "079 000 00 00", instructions: "Gilet fourni",
        }],
        editToken: "tok", hoursUntil: 3,
      },
    })
    expect(out.text).toContain("Contact pour ce créneau : Léa, 079 000 00 00")
    expect(out.text).toContain("À savoir : Gilet fourni")
    expect(out.html).toContain("À savoir : Gilet fourni")
    expect(out.text).not.toContain("urgence")
  })

  // Day-of contact (#560): the fallback of a shift without a contact, with the emergency note once.
  it.each(["reminder_j2", "reminder_j1", "reminder_dd"] as const)("%s names the sector leaders (#560)", (kind) => {
    const out = render({
      kind,
      recipient: { email: "a@x.ch", name: "Alice" },
      data: {
        volunteerName: "Alice", eventTitle: "Fête", organizationName: "Org", editToken: "tok", hoursUntil: 3,
        shifts: [{ label: "Bar", roleName: "Bar", date: "samedi 4 juillet", startTime: "10:00", endTime: "12:00", sectorLeaderNames: ["Paul Martin"] }],
      },
    })
    expect(out.text).toContain("Responsable du poste : Paul Martin")
    expect(out.html).toContain("Responsable du poste : Paul Martin")
  })

  it.each(["reminder_j2", "reminder_j1", "reminder_dd"] as const)("%s shows the day-of contact and the emergency note once", (kind) => {
    const shift = (startTime: string, endTime: string) => ({
      label: "Bar", roleName: "Bar", date: "samedi 4 juillet", startTime, endTime, dayContactName: "Coordination", dayContactPhone: "079 111 11 11",
    })
    for (const shifts of [[shift("10:00", "12:00")], [shift("10:00", "12:00"), shift("14:00", "16:00")]]) {
      const out = render({
        kind,
        recipient: { email: "a@x.ch", name: "Alice" },
        data: { volunteerName: "Alice", eventTitle: "Fête", organizationName: "Org", shifts, editToken: "tok", hoursUntil: 3 },
      })
      expect(out.text).toContain("Contact le jour J : Coordination, 079 111 11 11")
      expect(out.html).toContain('Contact le jour J : Coordination, <a href="tel:0791111111">079 111 11 11</a>')
      expect(out.text.split(EMERGENCY_NOTE).length - 1).toBe(1)
      expect(out.html.split(EMERGENCY_NOTE).length - 1).toBe(1)
      expect(out.html).toContain("font-weight:600")
    }
  })
})

// Targeted message (#396).
describe("notification templates — targeted_message", () => {
  it("puts the admin's subject and message first, then the volunteer's shifts, escaped", () => {
    const out = render({
      kind: "targeted_message",
      recipient: { email: "a@x.ch", name: "Alice" },
      data: {
        volunteerName: "Alice", organizationName: "Org", eventTitle: "Fête", subject: "Parking", message: "Entrée par la rue <Basse>.",
        shifts: [{ label: "Bar", date: "samedi 4 juillet", startTime: "10:00", endTime: "12:00" }], editToken: "tok",
      },
    })
    expect(out.subject).toBe("Parking — Fête")
    expect(out.text).toContain("Entrée par la rue <Basse>.")
    expect(out.text).toContain("Tes créneaux concernés")
    expect(out.html).toContain("Entrée par la rue &lt;Basse&gt;.")
    expect(out.html).toContain("/my/tok")
  })

  it("has no shift list and no personal link for the waitlist", () => {
    const out = render({
      kind: "targeted_message",
      recipient: { email: "a@x.ch", name: "Alice" },
      data: { volunteerName: "Alice", organizationName: "Org", eventTitle: "Fête", subject: "Place", message: "Une place se libère peut-être.", shifts: [] },
    })
    expect(out.text).not.toContain("créneaux concernés")
    expect(out.html).not.toContain("créneaux concernés")
    expect(out.text).not.toContain("Gérer tes inscriptions")
    expect(out.html).not.toContain("Gérer mes inscriptions")
  })
})
