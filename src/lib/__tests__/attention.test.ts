import { describe, it, expect } from "vitest"
import { attentionItems, type AttentionEvent } from "../attention"

// « Ce qui demande votre attention » (#372): what an admin should act on, from the data.

const now = new Date("2030-06-10T10:00:00Z")
const day = (offset: number) => new Date(Date.UTC(2030, 5, 10 + offset))

const ev = (over: Partial<AttentionEvent> = {}): AttentionEvent => ({
  id: "e1", title: "Fête", startDate: day(30), endDate: day(31),
  shifts: [], leaderRoles: [], overdueMilestones: 0, unansweredInvites: 0, ...over,
})
const ids = (items: ReturnType<typeof attentionItems>) => items.map((i) => i.id)

describe("attentionItems", () => {
  it("nothing for a quiet event", () => {
    expect(attentionItems({ now, events: [ev()], offers: [] })).toEqual([])
  })

  it("flags under-filled shifts of the next 7 days, urgent within 2 days", () => {
    const soon = ev({ shifts: [
      { date: day(1), capacity: 4, active: 1, roleName: "Bar" },
      { date: day(5), capacity: 2, active: 2, roleName: "Bar" }, // full: ignored
      { date: day(20), capacity: 3, active: 0, roleName: "Bar" }, // too far: ignored
    ] })
    const [item] = attentionItems({ now, events: [soon], offers: [] })
    expect(item).toMatchObject({ id: "underfilled:e1", severity: "high", href: "/admin/events/e1/shifts" })
    expect(item.message).toBe("1 créneau des 7 prochains jours n'est pas complet (3 places libres).")

    const later = ev({ shifts: [{ date: day(5), capacity: 2, active: 0, roleName: "Bar" }] })
    expect(attentionItems({ now, events: [later], offers: [] })[0].severity).toBe("medium")
  })

  it("flags waitlist offers expiring within 12 hours, not later or already expired ones", () => {
    const offers = [
      { eventId: "e1", expiresAt: new Date("2030-06-10T15:00:00Z") },
      { eventId: "e1", expiresAt: new Date("2030-06-11T15:00:00Z") },
      { eventId: "e1", expiresAt: new Date("2030-06-10T09:00:00Z") },
    ]
    const [item] = attentionItems({ now, events: [ev()], offers })
    expect(item.id).toBe("offers:e1")
    expect(item.message).toContain("1 place proposée")
  })

  it("flags overdue milestones as urgent and unused invitations", () => {
    const items = attentionItems({ now, events: [ev({ overdueMilestones: 2, unansweredInvites: 3 })], offers: [] })
    expect(ids(items)).toEqual(["milestones:e1", "invites:e1"])
    expect(items[0].message).toBe("2 jalons sont en retard.")
    expect(items[1].href).toBe("/admin/events/e1/message?audience=invited")
    expect(items[1].message).toMatch(/aucun créneau confirmé/)
  })

  it("flags roles without a leader only once the event uses sector leaders", () => {
    const shifts = [
      { date: day(30), capacity: 1, active: 1, roleName: "Bar" },
      { date: day(30), capacity: 1, active: 1, roleName: "Accueil" },
    ]
    expect(attentionItems({ now, events: [ev({ shifts })], offers: [] })).toEqual([])
    const [item] = attentionItems({ now, events: [ev({ shifts, leaderRoles: ["Bar"] })], offers: [] })
    expect(item).toMatchObject({ id: "leaders:e1", severity: "low" })
    expect(item.message).toContain("Accueil")
  })

  it("mentions an event starting within a week", () => {
    const [item] = attentionItems({ now, events: [ev({ startDate: day(3), endDate: day(4) })], offers: [] })
    expect(item.message).toBe("L'événement commence dans 3 jours.")
    expect(attentionItems({ now, events: [ev({ startDate: day(0), endDate: day(1) })], offers: [] })[0].message)
      .toBe("L'événement commence aujourd'hui.")
  })

  it("suggests archiving an ended event, and nothing else about it", () => {
    const ended = ev({ startDate: day(-5), endDate: day(-3), overdueMilestones: 1 })
    expect(ids(attentionItems({ now, events: [ended], offers: [] }))).toEqual(["ended:e1"])
  })

  it("sorts urgent first", () => {
    const items = attentionItems({
      now,
      events: [
        ev({ id: "a", startDate: day(3), endDate: day(4) }),
        ev({ id: "b", overdueMilestones: 1 }),
      ],
      offers: [],
    })
    expect(items.map((i) => i.severity)).toEqual(["high", "low"])
  })

  it("flags volunteers with a high workload, linking to the registrations (#465)", () => {
    const items = attentionItems({ now, events: [ev({ overloadedVolunteers: 2 })], offers: [] })
    const item = items.find((i) => i.id === "workload:e1")
    expect(item).toMatchObject({ severity: "medium", href: "/admin/events/e1/registrations" })
    expect(item?.message).toBe("2 bénévoles ont une charge élevée : plus de 8 h dans la journée, ou plus de 6 h d'affilée sans vraie pause.")
    expect(ids(attentionItems({ now, events: [ev({ overloadedVolunteers: 0 })], offers: [] }))).not.toContain("workload:e1")
  })

  it("flags addresses to verify, org-wide, linking to the filtered members list (#599)", () => {
    const items = attentionItems({ now, events: [], offers: [], addressesToVerifyCount: 1 })
    expect(items).toEqual([{
      id: "addresses-to-verify", severity: "medium", eventTitle: "Membres",
      message: "1 membre a une adresse à vérifier : un message important (confirmation, proposition de liste d'attente ou rappel) a été refusé définitivement par le serveur destinataire.",
      action: "Voir les membres concernés", href: "/admin/members?verify=1",
    }])
  })

  it("says nothing about addresses when the count is zero or absent", () => {
    expect(ids(attentionItems({ now, events: [], offers: [], addressesToVerifyCount: 0 }))).not.toContain("addresses-to-verify")
    expect(ids(attentionItems({ now, events: [], offers: [] }))).not.toContain("addresses-to-verify")
  })
})
