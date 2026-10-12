import { describe, it, expect, vi, beforeEach } from "vitest"

// Last-minute withdrawals (#946): less than 24 hours before the start, the organisers and the
// role's sector leaders are told at once, not after the 5-minute grouping (#869), in an email
// worded « Désistement de dernière minute » with the shift's start.

const findUniqueOrg = vi.hoisted(() => vi.fn())
const findManyAdmin = vi.hoisted(() => vi.fn())
const findManyLeader = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: findUniqueOrg },
    adminUser: { findMany: findManyAdmin },
    sectorLeader: { findMany: findManyLeader },
  },
}))
vi.mock("@/lib/token-vault", () => ({ linkToken: { reveal: (l: { email: string }) => `tok-${l.email}` } }))
const enqueueNotifications = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({
  enqueueNotifications,
  collectNotifications: () => {
    const payloads: { kind: string; recipient: { email?: string; name?: string }; data: unknown }[] = []
    return { payloads, send: async (p: typeof payloads[number]) => { payloads.push(p); return { ok: true } } }
  },
}))
const queueDigestItem = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/digest", () => ({ queueDigestItem, digestDelayMs: (ms: number) => ms }))

import { queueWithdrawalNotifications } from "../withdrawal-notifications"
import { renderWithdrawalAdminDigest, renderSectorLeaderWithdrawalDigest } from "../notifications/templates/withdrawal-digest"

const input = {
  registrationId: "r1",
  event: { id: "e1", title: "Fête d'été", organizationId: "org-1", organization: { slug: "org" } },
  shift: { id: "s1", roleName: "Bar", label: "Bar du soir", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "22:00" },
  volunteerName: "Chloé Roy",
  message: null,
  waitlistTookSpot: false,
  placesMissing: 1,
  timeZone: "Europe/Zurich",
}

describe("queueWithdrawalNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUniqueOrg.mockResolvedValue({ notificationSettings: null })
    findManyAdmin.mockResolvedValue([{ email: "Admin@org.ch", name: "Admin Org" }])
    findManyLeader.mockResolvedValue([{ email: "leader@org.ch", name: "Léa Leader", roleName: "Bar" }])
    enqueueNotifications.mockResolvedValue(["o1", "o2"])
    queueDigestItem.mockResolvedValue(null)
  })

  it("sends a late withdrawal at once, never through the digest, worded with the shift's start", async () => {
    const ids = await queueWithdrawalNotifications({ ...input, late: true })
    expect(ids).toEqual(["o1", "o2"])
    expect(queueDigestItem).not.toHaveBeenCalled()
    const payloads = enqueueNotifications.mock.calls[0][0]
    expect(payloads.map((p: { kind: string }) => p.kind)).toEqual(["registration_cancelled", "sector_leader_withdrawal"])
    expect(payloads.map((p: { dedupeKey: string }) => p.dedupeKey)).toEqual(["registration_cancelled:late:r1:admin@org.ch", "sector_leader_withdrawal:late:r1:leader@org.ch"])
    for (const p of payloads) expect(p.data).toMatchObject({ late: true, startsAt: "samedi 4 juillet à 18:00" })
  })

  it("keeps the 5-minute grouping for other withdrawals", async () => {
    await queueWithdrawalNotifications({ ...input, late: false })
    expect(enqueueNotifications).not.toHaveBeenCalled()
    expect(queueDigestItem).toHaveBeenCalledTimes(2)
    expect(queueDigestItem.mock.calls[0][0].item).not.toHaveProperty("late")
  })

  it("sends nothing when the organisation switched withdrawal emails off", async () => {
    findUniqueOrg.mockResolvedValue({ notificationSettings: { withdrawalAdminEmail: false } })
    expect(await queueWithdrawalNotifications({ ...input, late: true })).toEqual([])
    expect(enqueueNotifications).not.toHaveBeenCalled()
  })
})

describe("last-minute withdrawal emails", () => {
  const data = {
    eventId: "evt-1", eventTitle: "Fête", volunteerName: "Aline Exemple", shiftId: "s-1", shiftLabel: "Bar", roleName: "Bar",
    shiftDate: "04/07/2026", startTime: "18:00", endTime: "22:00", placesMissing: 1, waitlistTookSpot: false, message: null,
    late: true, startsAt: "samedi 4 juillet à 18:00",
    leaderName: "Léa Leader", orgSlug: "org", token: "tok",
  }

  it("tells the organisers « Désistement de dernière minute », the start and « Trouver un remplaçant »", () => {
    const mail = renderWithdrawalAdminDigest({ kind: "registration_cancelled", recipient: { email: "a@x.org" }, data })
    expect(mail.subject).toBe("Désistement de dernière minute — Fête")
    expect(mail.text).toContain("Désistement de dernière minute : le créneau commence le samedi 4 juillet à 18:00.")
    expect(mail.html).toContain("Trouver un remplaçant")
  })

  it("no replacement button when the waitlist took the place", () => {
    const mail = renderWithdrawalAdminDigest({ kind: "registration_cancelled", recipient: { email: "a@x.org" }, data: { ...data, waitlistTookSpot: true } })
    expect(mail.subject).toBe("Désistement de dernière minute — Fête")
    expect(mail.html).not.toContain("Trouver un remplaçant")
  })

  it("tells the sector leader, who has no admin access, that the organisers are on it", () => {
    const mail = renderSectorLeaderWithdrawalDigest({ kind: "sector_leader_withdrawal", recipient: { email: "l@x.org" }, data })
    expect(mail.subject).toBe("Désistement de dernière minute — Bar")
    expect(mail.text).toContain("le créneau commence le samedi 4 juillet à 18:00")
    expect(mail.text).toContain("Pour remplacer cette personne : l'organisation est prévenue en même temps.")
  })

  it("an ordinary withdrawal keeps its words", () => {
    const mail = renderWithdrawalAdminDigest({ kind: "registration_cancelled", recipient: { email: "a@x.org" }, data: { ...data, late: undefined, startsAt: undefined } })
    expect(mail.subject).toBe("Désistement — Fête")
    expect(mail.text).not.toContain("dernière minute")
  })
})
