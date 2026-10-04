// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"

// The real helpers (confirmation, admin notification, sector leaders) run; only what they read is mocked.
const m = vi.hoisted(() => ({
  env: { ADMIN_NOTIFICATION_EMAIL: undefined as string | undefined },
  orgFindUnique: vi.fn(),
  adminFindMany: vi.fn(),
  leaderFindMany: vi.fn(),
}))
vi.mock("@/lib/env", () => ({ env: m.env }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: m.orgFindUnique },
    adminUser: { findMany: m.adminFindMany },
    sectorLeader: { findMany: m.leaderFindMany },
  },
}))

import { buildSignupNotifications, type SignupNotificationInput } from "@/lib/signup-notifications"

const event = {
  id: "ev1",
  title: "Fête du village",
  organizationId: "org1",
  organization: { slug: "village" },
  confirmationMessage: "Merci !",
  latitude: 46.5,
  longitude: 6.6,
}
const shift = (id: string, roleName: string, extra: object = {}) => ({
  id,
  label: `Créneau ${id}`,
  roleName,
  date: new Date("2026-07-14T00:00:00Z"),
  startTime: "10:00",
  endTime: "12:00",
  locationDetails: null,
  contactName: null,
  contactPhone: null,
  instructions: null,
  latitude: null,
  longitude: null,
  ...extra,
})
const volunteer = { id: "vol-1", email: "ana@example.org", firstName: "Ana", lastName: "Rossi" }
const reg = (id: string, shiftId: string, status: string, waitingPosition: number | null = null) => ({ id, shiftId, status, waitingPosition })

function input(over: Partial<SignupNotificationInput> = {}): SignupNotificationInput {
  const shifts = over.shifts ?? [shift("s1", "Bar")]
  return {
    event,
    shifts,
    volunteer,
    registrations: shifts.map((s, i) => reg(`r${i + 1}`, s.id, "active")),
    tokens: new Map(shifts.map((s) => [s.id, `tok-${s.id}`])),
    ...over,
  }
}

beforeEach(() => {
  m.env.ADMIN_NOTIFICATION_EMAIL = undefined
  m.orgFindUnique.mockReset().mockResolvedValue({ notificationSettings: null })
  m.adminFindMany.mockReset().mockResolvedValue([{ email: "admin@example.org", name: "Admin Org" }])
  m.leaderFindMany.mockReset().mockResolvedValue([])
})

describe("buildSignupNotifications", () => {
  it("confirms active places with the shift info and the first registration's token", async () => {
    const shifts = [shift("s1", "Bar", { locationDetails: "Entrée B" }), shift("s2", "Caisse")]
    const out = await buildSignupNotifications(input({ shifts }))

    const confirmation = out.find((p) => p.kind === "registration_confirmation")!
    expect(confirmation.recipient).toEqual({ email: "ana@example.org", name: "Ana Rossi" })
    expect(confirmation.data).toEqual({
      volunteerName: "Ana Rossi",
      eventTitle: "Fête du village",
      shifts: [
        {
          label: "Créneau s1", roleName: "Bar", date: "14/07/2026", startTime: "10:00", endTime: "12:00",
          // A shift without its own coordinates takes the event's (#191).
          locationDetails: "Entrée B", contactName: null, contactPhone: null, instructions: null, latitude: 46.5, longitude: 6.6,
        },
        {
          label: "Créneau s2", roleName: "Caisse", date: "14/07/2026", startTime: "10:00", endTime: "12:00",
          locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: 46.5, longitude: 6.6,
        },
      ],
      editToken: "tok-s1",
      orgSlug: "village",
      confirmationMessage: "Merci !",
    })
    expect(out.some((p) => p.kind === "registration_requested")).toBe(false)
  })

  it("acknowledges a request instead of confirming a place (#484)", async () => {
    const shifts = [shift("s1", "Bar")]
    const out = await buildSignupNotifications(input({ shifts, registrations: [reg("r1", "s1", "requested")] }))

    expect(out.map((p) => p.kind)).toEqual(["registration_requested", "admin_notification"])
    expect(out[0].data).toEqual({
      volunteerName: "Ana Rossi",
      eventTitle: "Fête du village",
      shifts: [{ label: "Créneau s1", date: "14/07/2026", startTime: "10:00", endTime: "12:00" }],
      editToken: "tok-s1",
      orgSlug: "village",
    })
  })

  it("omits a missing confirmation message rather than sending null", async () => {
    const out = await buildSignupNotifications(input({ event: { ...event, confirmationMessage: null } }))
    expect(out[0].data).toMatchObject({ confirmationMessage: undefined })
  })

  it("notifies the organization's active admins of every shift asked for", async () => {
    const shifts = [shift("s1", "Bar"), shift("s2", "Caisse")]
    const out = await buildSignupNotifications(input({ shifts, registrations: [reg("r1", "s1", "active"), reg("r2", "s2", "requested")] }))

    const admin = out.filter((p) => p.kind === "admin_notification")
    expect(admin).toHaveLength(1)
    expect(admin[0].recipient).toEqual({ email: "admin@example.org", name: "Admin Org" })
    expect(admin[0].data).toEqual({
      eventTitle: "Fête du village",
      volunteerName: "Ana Rossi",
      volunteerEmail: "ana@example.org",
      shifts: [
        { label: "Créneau s1", roleName: "Bar", date: "14/07/2026", startTime: "10:00", endTime: "12:00" },
        { label: "Créneau s2", roleName: "Caisse", date: "14/07/2026", startTime: "10:00", endTime: "12:00" },
      ],
    })
    expect(m.adminFindMany).toHaveBeenCalledWith({ where: { organizationId: "org1", isActive: true }, select: { email: true, name: true } })
  })

  it("sends no admin notification when the organization switched it off (#381)", async () => {
    m.orgFindUnique.mockResolvedValue({ notificationSettings: { signupAdminEmail: false } })
    const out = await buildSignupNotifications(input())
    expect(out.map((p) => p.kind)).toEqual(["registration_confirmation"])
    expect(m.adminFindMany).not.toHaveBeenCalled()
  })

  it("falls back to ADMIN_NOTIFICATION_EMAIL only when the organization has no active admin", async () => {
    m.adminFindMany.mockResolvedValue([])
    m.env.ADMIN_NOTIFICATION_EMAIL = "ops@example.org"
    const out = await buildSignupNotifications(input())
    expect(out.find((p) => p.kind === "admin_notification")!.recipient).toEqual({ email: "ops@example.org", name: "Admin" })

    m.env.ADMIN_NOTIFICATION_EMAIL = undefined
    const none = await buildSignupNotifications(input())
    expect(none.some((p) => p.kind === "admin_notification")).toBe(false)
  })

  it("tells sector leaders of placed and waitlisted sign-ups, not of requests", async () => {
    m.leaderFindMany.mockImplementation(async ({ where }: { where: { roleName: string } }) => [
      { email: `lead-${where.roleName}@example.org`, name: `Lead ${where.roleName}`, roleName: where.roleName, tokenEnc: null, tokenLegacy: `ltok-${where.roleName}` },
    ])
    const shifts = [shift("s1", "Bar"), shift("s2", "Caisse"), shift("s3", "Accueil")]
    const out = await buildSignupNotifications(input({
      shifts,
      registrations: [reg("r1", "s1", "active"), reg("r2", "s2", "requested"), reg("r3", "s3", "waiting", 2)],
    }))

    const leaders = out.filter((p) => p.kind === "sector_leader_new_signup")
    expect(leaders.map((p) => p.recipient.email)).toEqual(["lead-Bar@example.org", "lead-Accueil@example.org"])
    expect(leaders[0].data).toMatchObject({ eventTitle: "Fête du village", volunteerName: "Ana Rossi", shiftLabel: "Créneau s1", orgSlug: "village", token: "ltok-Bar" })
    expect(m.leaderFindMany).toHaveBeenCalledWith({ where: { eventId: "ev1", roleName: "Bar" } })
  })

  it("confirms each waitlisted shift with its position", async () => {
    const shifts = [shift("s1", "Bar"), shift("s2", "Caisse")]
    const out = await buildSignupNotifications(input({ shifts, registrations: [reg("r1", "s1", "waiting", 3), reg("r2", "s2", "waiting", null)] }))

    const waitlist = out.filter((p) => p.kind === "waitlist_confirmation")
    expect(waitlist).toHaveLength(2)
    expect(waitlist[0].data).toEqual({
      volunteerName: "Ana Rossi",
      eventTitle: "Fête du village",
      shiftLabel: "Créneau s1",
      shiftDate: new Date("2026-07-14T00:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      shiftStart: "10:00",
      shiftEnd: "12:00",
      waitingPosition: 3,
      orgSlug: "village",
    })
    // No position stored: shown as first.
    expect(waitlist[1].data).toMatchObject({ shiftLabel: "Créneau s2", waitingPosition: 1 })
    expect(out.some((p) => p.kind === "registration_confirmation")).toBe(false)
  })

  it("keeps the order and keys every payload on the first registration and its recipient (#315)", async () => {
    m.leaderFindMany.mockImplementation(async ({ where }: { where: { roleName: string } }) => [
      { email: `lead-${where.roleName}@example.org`, name: "Lead", roleName: where.roleName, tokenEnc: null, tokenLegacy: "lt" },
    ])
    const shifts = [shift("s1", "Bar"), shift("s2", "Caisse"), shift("s3", "Accueil")]
    const out = await buildSignupNotifications(input({
      shifts,
      registrations: [reg("r1", "s1", "active"), reg("r2", "s2", "requested"), reg("r3", "s3", "waiting", 1)],
    }))

    expect(out.map((p) => p.kind)).toEqual([
      "registration_confirmation",
      "registration_requested",
      "admin_notification",
      "sector_leader_new_signup",
      "sector_leader_new_signup",
      "waitlist_confirmation",
    ])
    expect(out.map((p) => p.dedupeKey)).toEqual([
      "registration_confirmation:r1:ana@example.org",
      "registration_requested:r1:ana@example.org",
      "admin_notification:r1:admin@example.org",
      "sector_leader_new_signup:r1:lead-Bar@example.org",
      "sector_leader_new_signup:r1:lead-Accueil@example.org",
      "waitlist_confirmation:r1:ana@example.org",
    ])
  })
})
