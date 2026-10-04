import { describe, it, expect, vi, beforeEach } from "vitest"

// Notifications of a withdrawal (#559): admins (same recipients/fallback as sendAdminNotification,
// #381) and the role's sector leaders (same lookup as notifySectorLeadersOfSignup, #186), gated by
// one setting; each payload has a dedupe key per registration (#315).

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
// collectNotifications is a trivial in-memory collector, but outbox.ts also imports
// sendNotification (the real SMTP channel, which needs a validated env) at module scope: mocked
// here so this unit test of buildWithdrawalNotifications never needs DATABASE_URL/AUTH_SECRET.
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: { kind: string; recipient: { email?: string; name?: string }; data: unknown }[] = []
    return { payloads, send: async (p: typeof payloads[number]) => { payloads.push(p); return { ok: true } } }
  },
}))

import { buildWithdrawalNotifications } from "../withdrawal-notifications"

const event = { id: "e1", title: "Fête d'été", organizationId: "org-1", organization: { slug: "org" } }
const shift = { id: "s1", roleName: "Bar", label: "Bar du soir", date: new Date("2026-07-04"), startTime: "18:00", endTime: "22:00" }

const baseInput = {
  registrationId: "r1",
  event,
  shift,
  volunteerName: "Chloé Roy",
  message: null as string | null,
  waitlistTookSpot: false,
  placesMissing: 1,
}

describe("buildWithdrawalNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUniqueOrg.mockResolvedValue({ notificationSettings: null }) // default: on
    findManyAdmin.mockResolvedValue([{ email: "admin@org.ch", name: "Admin Org" }])
    findManyLeader.mockResolvedValue([{ email: "leader@org.ch", name: "Léa Leader", roleName: "Bar" }])
  })

  it("sends nothing when the organization switched the setting off", async () => {
    findUniqueOrg.mockResolvedValue({ notificationSettings: { withdrawalAdminEmail: false } })
    const payloads = await buildWithdrawalNotifications(baseInput)
    expect(payloads).toEqual([])
    expect(findManyAdmin).not.toHaveBeenCalled()
    expect(findManyLeader).not.toHaveBeenCalled()
  })

  it("notifies every active admin and the role's sector leaders when on (default)", async () => {
    const payloads = await buildWithdrawalNotifications(baseInput)
    const kinds = payloads.map((p) => p.kind)
    expect(kinds).toEqual(["registration_cancelled", "sector_leader_withdrawal"])
    expect(payloads[0].recipient).toEqual({ email: "admin@org.ch", name: "Admin Org" })
    expect(payloads[1].recipient).toEqual({ email: "leader@org.ch", name: "Léa Leader" })
  })

  it("falls back to ADMIN_NOTIFICATION_EMAIL only when the org has no active admin", async () => {
    findManyAdmin.mockResolvedValue([])
    const previous = process.env.ADMIN_NOTIFICATION_EMAIL
    process.env.ADMIN_NOTIFICATION_EMAIL = "fallback@benevol.app"
    try {
      const payloads = await buildWithdrawalNotifications(baseInput)
      expect(payloads.find((p) => p.kind === "registration_cancelled")?.recipient.email).toBe("fallback@benevol.app")
    } finally {
      process.env.ADMIN_NOTIFICATION_EMAIL = previous
    }
  })

  it("queries sector leaders by this event and this shift's role only", async () => {
    await buildWithdrawalNotifications(baseInput)
    expect(findManyLeader).toHaveBeenCalledWith({ where: { eventId: "e1", roleName: "Bar" } })
  })

  it("one dedupe key per registration, kind and recipient (#315)", async () => {
    const payloads = await buildWithdrawalNotifications(baseInput)
    expect(payloads[0].dedupeKey).toBe("registration_cancelled:r1:admin@org.ch")
    expect(payloads[1].dedupeKey).toBe("sector_leader_withdrawal:r1:leader@org.ch")
  })

  it("carries the optional message, the missing-places count and whether the waitlist took the spot", async () => {
    const payloads = await buildWithdrawalNotifications({ ...baseInput, message: "Paul peut me remplacer", waitlistTookSpot: true, placesMissing: 0 })
    expect(payloads[0].data).toMatchObject({ message: "Paul peut me remplacer", waitlistTookSpot: true, placesMissing: 0 })
    expect(payloads[1].data).toMatchObject({ message: "Paul peut me remplacer", waitlistTookSpot: true, placesMissing: 0 })
  })

  it("no sector leader for this role: only the admin notifications", async () => {
    findManyLeader.mockResolvedValue([])
    const payloads = await buildWithdrawalNotifications(baseInput)
    expect(payloads.map((p) => p.kind)).toEqual(["registration_cancelled"])
  })
})
