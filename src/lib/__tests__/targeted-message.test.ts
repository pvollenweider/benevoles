import { describe, it, expect } from "vitest"
import { audienceFromQuery, audienceLabel, countDeclinedExcluded, messageSchema, selectInvitedWithoutShift, selectRecipients, type RecipientRegistration } from "../targeted-message"

const reg = (id: string, over: Partial<RecipientRegistration> & { volunteerId: string; shiftId: string }): RecipientRegistration => ({
  status: "active",
  volunteer: { firstName: "V" + id, lastName: "L", email: `${id}@x.ch` },
  shift: { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00" },
  ...over,
})

const regs = [
  reg("a1", { volunteerId: "alice", shiftId: "bar1" }),
  reg("a2", { volunteerId: "alice", shiftId: "bar2", shift: { roleName: "Bar", label: "Bar soir", date: "2026-07-04", startTime: "18:00", endTime: "20:00" } }),
  reg("b1", { volunteerId: "bob", shiftId: "acc1", shift: { roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "12:00" } }),
  reg("c1", { volunteerId: "carla", shiftId: "bar1", status: "waiting" }),
  reg("d1", { volunteerId: "dan", shiftId: "bar1", status: "offered" }),
  reg("e1", { volunteerId: "eve", shiftId: "bar1", status: "cancelled" }),
  reg("f1", { volunteerId: "fred", shiftId: "bar1", volunteer: { firstName: "Fred", lastName: "L", email: null } }),
]

describe("selectRecipients", () => {
  it("event: every confirmed volunteer once, with all their shifts; no email, cancelled and waitlist left out", () => {
    const r = selectRecipients(regs, { kind: "event" })
    expect(r.map((x) => x.volunteerId)).toEqual(["alice", "bob"])
    expect(r[0].registrations.map((x) => x.shiftId)).toEqual(["bar1", "bar2"])
  })

  it("role and shift narrow to confirmed people of that role or shift", () => {
    expect(selectRecipients(regs, { kind: "role", roleName: "Accueil" }).map((x) => x.volunteerId)).toEqual(["bob"])
    expect(selectRecipients(regs, { kind: "shift", shiftId: "bar2" }).map((x) => x.volunteerId)).toEqual(["alice"])
    expect(selectRecipients(regs, { kind: "shift", shiftId: "bar2" })[0].registrations).toHaveLength(1)
  })

  it("waitlist: people waiting or offered a spot, not the confirmed ones", () => {
    expect(selectRecipients(regs, { kind: "waitlist" }).map((x) => x.volunteerId)).toEqual(["carla", "dan"])
  })
})

describe("messageSchema", () => {
  it("requires a trimmed subject and message within limits", () => {
    expect(messageSchema.safeParse({ audience: { kind: "event" }, subject: "  ", message: "x" }).success).toBe(false)
    expect(messageSchema.safeParse({ audience: { kind: "event" }, subject: "Info", message: "y".repeat(2001) }).success).toBe(false)
    expect(messageSchema.safeParse({ audience: { kind: "shift" }, subject: "Info", message: "x" }).success).toBe(false)
    const ok = messageSchema.safeParse({ audience: { kind: "role", roleName: "Bar" }, subject: " Info ", message: " Venez tôt ", dryRun: true })
    expect(ok.success && ok.data.subject).toBe("Info")
  })
})

describe("selectInvitedWithoutShift — declines excluded (#558)", () => {
  const invite = (volunteerId: string, over: Partial<{ sentAt: Date; declinedAt: Date | null; volunteer: { email: string | null } }> = {}) => ({
    volunteerId,
    sentAt: new Date("2026-01-01"),
    declinedAt: null,
    volunteer: { email: `${volunteerId}@x.ch` },
    ...over,
  })

  it("leaves out people who declined, keeps the others without a confirmed shift", () => {
    const invites = [
      invite("alice"),
      invite("bob", { declinedAt: new Date("2026-01-02") }),
      invite("carla"),
    ]
    const result = selectInvitedWithoutShift(invites, [])
    expect(result.map((r) => r.volunteerId)).toEqual(["alice", "carla"])
  })

  it("a declined invite with a later active registration (change of mind by an admin) is still excluded by the decline alone, but registered people are excluded first regardless", () => {
    const invites = [invite("bob", { declinedAt: new Date("2026-01-02") })]
    const result = selectInvitedWithoutShift(invites, [{ volunteerId: "bob", status: "active" }])
    expect(result).toHaveLength(0)
  })

  it("countDeclinedExcluded counts only declined people without an active registration", () => {
    const invites = [
      invite("alice"),
      invite("bob", { declinedAt: new Date("2026-01-02") }),
      invite("dan", { declinedAt: new Date("2026-01-02") }),
    ]
    expect(countDeclinedExcluded(invites, [{ volunteerId: "dan", status: "active" }])).toBe(1)
  })
})

describe("wording and query", () => {
  it("labels each audience", () => {
    expect(audienceLabel({ kind: "event" })).toBe("tous les bénévoles inscrits")
    expect(audienceLabel({ kind: "role", roleName: "Bar" })).toBe("les bénévoles du poste « Bar »")
    expect(audienceLabel({ kind: "shift", shiftId: "s1" }, "Bar 10:00–12:00")).toBe("les bénévoles du créneau Bar 10:00–12:00")
    expect(audienceLabel({ kind: "waitlist" })).toBe("les personnes en liste d'attente")
  })
  it("reads the audience from the page's query string", () => {
    expect(audienceFromQuery({ shift: "s1", role: "Bar" })).toEqual({ kind: "shift", shiftId: "s1" })
    expect(audienceFromQuery({ role: "Bar" })).toEqual({ kind: "role", roleName: "Bar" })
    expect(audienceFromQuery({ audience: "waitlist" })).toEqual({ kind: "waitlist" })
    expect(audienceFromQuery({})).toEqual({ kind: "event" })
  })
})
