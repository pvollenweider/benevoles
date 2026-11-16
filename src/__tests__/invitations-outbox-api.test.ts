import { describe, it, expect, vi, beforeEach } from "vitest"

// #1105: member invitations, invitation reminders and the manual reminder go through the outbox
// (held over a sending limit instead of failing), with one dedupe key per claim, the organisation
// on each payload, the bulk send-limit category, and no double send on a double click. The
// regression: 150 people reminded at once, the extra ones over 120 per minute failed for good.

vi.mock("@/lib/env", () => ({ env: {} }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))

type Payload = { kind: string; dedupeKey?: string; organizationId?: string | null; volunteerId?: string | null; recipient: { email?: string | null }; data: Record<string, unknown> }
const enqueued: (Payload & { status?: string })[] = []
/** The outbox delivered every queued row (otherwise they are still pending). */
const deliverAll = () => { for (const p of enqueued) p.status = "sent" }
const enqueueNotifications = vi.hoisted(() => vi.fn())
const deliverAfterResponse = vi.hoisted(() => vi.fn())
// #1101: the batch routes queue through enqueueBatch, same contract plus the batch record.
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications, enqueueBatch: enqueueNotifications, deliverAfterResponse, openPayload: (p: unknown) => p }))

const sendNotification = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification }))

vi.mock("@/lib/token-vault", () => ({
  linkToken: {
    data: (token: string) => ({ tokenHash: `h-${token}`, tokenEnc: `enc-${token}`, tokenLegacy: null }),
    select: { tokenEnc: true, tokenLegacy: true },
    reveal: (r: { tokenEnc: string }) => r.tokenEnc.replace(/^enc-/, ""),
  },
  registrationToken: { reveal: (r: { volunteerId: string }) => `edit-${r.volunteerId}` },
}))

import { sendCategory } from "@/lib/notifications/send-limits"

const H = 60 * 60 * 1000
const event = {
  id: "evt-1", organizationId: "org-a", title: "Festival", slug: "festival", location: "Lausanne",
  startDate: new Date("2030-06-01T00:00:00Z"), reminderMessage: "À bientôt", reminderSentAt: null as Date | null,
  organization: { name: "Org", slug: "org" },
}

type Invite = { id: string; eventId: string; volunteerId: string; tokenEnc: string; sentAt: Date; lastRemindedAt: Date | null; declinedAt: Date | null }
type Volunteer = { id: string; firstName: string; lastName: string; email: string | null; active: boolean }

/** A tiny in-memory stand-in for the scoped client, with the claim's conditional update semantics. */
function fakeDb(volunteers: Volunteer[], invites: Invite[], opts: { registeredEmails?: string[]; reminderSentAt?: Date | null } = {}) {
  const ev = { ...event, reminderSentAt: opts.reminderSentAt ?? null }
  const vById = new Map(volunteers.map((v) => [v.id, v]))
  const lastBefore = (i: Invite, cutoff: Date) => i.sentAt < cutoff && (i.lastRemindedAt === null || i.lastRemindedAt < cutoff)
  type ClaimWhere = { id?: { in?: string[]; notIn?: string[] }; volunteerId?: { in: string[] }; sentAt: { lt: Date } }
  const db = {
    event: {
      findFirst: vi.fn(async () => ev),
      updateMany: vi.fn(async ({ where, data }: { where: { OR: [unknown, { reminderSentAt: { lt: Date } }] }; data: { reminderSentAt: Date } }) => {
        const cutoff = where.OR[1].reminderSentAt.lt
        if (ev.reminderSentAt && ev.reminderSentAt >= cutoff) return { count: 0 }
        ev.reminderSentAt = data.reminderSentAt
        return { count: 1 }
      }),
    },
    volunteer: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => volunteers.filter((v) => where.id.in.includes(v.id) && v.active)) },
    memberInvite: {
      findMany: vi.fn(async (args?: { where?: { volunteerId?: { in: string[] } } }) =>
        invites.filter((i) => !args?.where?.volunteerId || args.where.volunteerId.in.includes(i.volunteerId)).map((i) => ({ ...i, volunteer: vById.get(i.volunteerId)! }))),
      createManyAndReturn: vi.fn(async ({ data }: { data: { eventId: string; volunteerId: string; tokenEnc: string }[] }) => {
        const out: { id: string; volunteerId: string }[] = []
        for (const d of data) {
          if (invites.some((i) => i.volunteerId === d.volunteerId)) continue
          const row = { id: `inv-${d.volunteerId}`, eventId: d.eventId, volunteerId: d.volunteerId, tokenEnc: d.tokenEnc, sentAt: new Date(), lastRemindedAt: null, declinedAt: null }
          invites.push(row)
          out.push({ id: row.id, volunteerId: row.volunteerId })
        }
        return out
      }),
      updateManyAndReturn: vi.fn(async ({ where, data }: { where: ClaimWhere; data: { lastRemindedAt: Date } }) => {
        const cutoff = where.sentAt.lt
        const rows = invites.filter((i) =>
          (!where.id?.in || where.id.in.includes(i.id)) && !(where.id?.notIn ?? []).includes(i.id) &&
          (!where.volunteerId || where.volunteerId.in.includes(i.volunteerId)) && lastBefore(i, cutoff))
        for (const r of rows) r.lastRemindedAt = data.lastRemindedAt
        return rows.map((r) => ({ id: r.id, volunteerId: r.volunteerId, tokenEnc: r.tokenEnc, tokenLegacy: null }))
      }),
    },
    notificationOutbox: {
      findMany: vi.fn(async ({ where }: { where: { status: { in: string[] }; dedupeKey: { startsWith: string } } }) =>
        enqueued.filter((p) => where.status.in.includes(p.status ?? "pending") && p.dedupeKey?.startsWith(where.dedupeKey.startsWith)).map((p) => ({ dedupeKey: p.dedupeKey!, payload: p }))),
      count: vi.fn(async ({ where }: { where: { status: { in: string[] }; dedupeKey: { startsWith: string } } }) =>
        enqueued.filter((p) => where.status.in.includes(p.status ?? "pending") && p.dedupeKey?.startsWith(where.dedupeKey.startsWith)).length),
    },
    registration: {
      findMany: vi.fn(async ({ select, include }: { select?: unknown; include?: unknown }) => {
        if (include) return regs(volunteers)
        void select
        return (opts.registeredEmails ?? []).map((email) => ({ volunteer: { email } }))
      }),
    },
    locks: [] as string[][],
    async $executeRaw(_q: TemplateStringsArray, keys: string[]) { db.locks.push(keys); return 1 },
    transactionOptions: [] as unknown[],
    async $transaction<T>(fn: (tx: unknown) => Promise<T>, options?: unknown): Promise<T> { db.transactionOptions.push(options); return fn(db) },
  }
  return db
}

function regs(volunteers: Volunteer[]) {
  return volunteers.map((v) => ({
    volunteerId: v.id,
    volunteer: v,
    shift: { label: "Accueil", roleName: "Accueil", date: new Date("2030-06-01T00:00:00Z"), startTime: "09:00", endTime: "12:00" },
  }))
}

const members = (n: number): Volunteer[] => Array.from({ length: n }, (_, i) => ({ id: `vol-${i}`, firstName: `M${i}`, lastName: "L", email: `m${i}@example.org`, active: true }))
const invitesFor = (vs: Volunteer[], over: Partial<Invite> = {}): Invite[] => vs.map((v) => ({ id: `inv-${v.id}`, eventId: "evt-1", volunteerId: v.id, tokenEnc: `enc-tok-${v.id}`, sentAt: new Date(Date.now() - 72 * H), lastRemindedAt: null, declinedAt: null, ...over }))

function setup(db: ReturnType<typeof fakeDb>) {
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
}
const post = (path: string, body: unknown = {}) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  enqueued.length = 0
  enqueueNotifications.mockImplementation(async (payloads: Payload[]) => {
    // Same contract as the real outbox: a key already stored is skipped, no address is not stored.
    const ids: string[] = []
    for (const p of payloads) {
      if (!p.recipient.email) continue
      if (p.dedupeKey && enqueued.some((e) => e.dedupeKey === p.dedupeKey)) continue
      enqueued.push(p)
      ids.push(`row-${enqueued.length}`)
    }
    return ids
  })
})

describe("POST /api/admin/events/[id]/invitations/remind (#1105)", () => {
  it("regression: 150 invitees are all queued, none sent directly, no failure in the answer", async () => {
    const vs = members(150)
    setup(fakeDb(vs, invitesFor(vs)))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const res = await POST(post("/api/admin/events/evt-1/invitations/remind"), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ queued: 150, sent: 150, declinedSkipped: 0, recentlySkipped: 0 })
    expect(body).not.toHaveProperty("failed")
    expect(sendNotification).not.toHaveBeenCalled()
    expect(enqueued).toHaveLength(150)
    expect(deliverAfterResponse).toHaveBeenCalledWith(expect.arrayContaining(["row-1", "row-150"]))
  })

  it("queues the invite email with its token, the organisation, a per-claim dedupe key, in the bulk category", async () => {
    const vs = members(1)
    setup(fakeDb(vs, invitesFor(vs)))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    await POST(post("/api/admin/events/evt-1/invitations/remind", { message: "Venez !" }), params)
    const [p] = enqueued
    expect(p).toMatchObject({ kind: "member_invite", organizationId: "org-a", volunteerId: "vol-0", recipient: { email: "m0@example.org" } })
    expect(p.data).toMatchObject({ token: "tok-vol-0", eventSlug: "festival", orgSlug: "org", message: "Venez !" })
    expect(p.dedupeKey).toMatch(/^member_invite:inv-vol-0:\d+$/)
    expect(sendCategory("member_invite")).toBe("bulk")
    expect(enqueueNotifications).toHaveBeenCalledWith(expect.any(Array), expect.anything(), { organizationId: "org-a", batch: expect.objectContaining({ kind: "invite_reminder", eventId: expect.any(String) }) })
  })

  it("a second reminder right after (double click) emails no one twice and says why", async () => {
    const vs = members(3)
    setup(fakeDb(vs, invitesFor(vs)))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const first = await (await POST(post("/api/admin/events/evt-1/invitations/remind"), params)).json()
    const second = await (await POST(post("/api/admin/events/evt-1/invitations/remind"), params)).json()
    expect(first).toMatchObject({ queued: 3, recentlySkipped: 0 })
    expect(second).toMatchObject({ queued: 0, recentlySkipped: 3 })
    expect(enqueued).toHaveLength(3)
  })

  it("skips invited or reminded less than 48 hours ago, and reminds again just past the window", async () => {
    const vs = members(4)
    const inv = invitesFor(vs)
    inv[0].sentAt = new Date(Date.now() - 47 * H) // invited 47 h ago
    inv[1].lastRemindedAt = new Date(Date.now() - 47 * H) // reminded 47 h ago
    inv[2].lastRemindedAt = new Date(Date.now() - 49 * H) // reminded 49 h ago
    setup(fakeDb(vs, inv))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations/remind"), params)).json()
    expect(body).toMatchObject({ queued: 2, recentlySkipped: 2 })
    expect(enqueued.map((p) => p.volunteerId).sort()).toEqual(["vol-2", "vol-3"])
    expect(inv[2].lastRemindedAt!.getTime()).toBeGreaterThan(Date.now() - 1000)
  })

  it("skips someone whose earlier invitation email still waits in the outbox, even past 48 hours", async () => {
    const vs = members(2)
    setup(fakeDb(vs, invitesFor(vs)))
    enqueued.push({ kind: "member_invite", dedupeKey: "member_invite:inv-vol-0:1", recipient: { email: "m0@example.org" }, data: {}, status: "pending" })
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations/remind"), params)).json()
    expect(body).toMatchObject({ queued: 1, recentlySkipped: 1 })
    expect(enqueued.filter((p) => p.volunteerId === "vol-0")).toHaveLength(0)
  })

  it("reminds someone whose pending email was queued for an address since corrected (that one is cancelled at delivery)", async () => {
    const vs = members(1)
    setup(fakeDb(vs, invitesFor(vs)))
    enqueued.push({ kind: "member_invite", dedupeKey: "member_invite:inv-vol-0:1", recipient: { email: "typo@example.org" }, data: {}, status: "pending" })
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations/remind"), params)).json()
    expect(body).toMatchObject({ queued: 1, recentlySkipped: 0 })
    expect(enqueued.at(-1)!.recipient.email).toBe("m0@example.org")
  })

  it("keeps leaving out registered and declined members (#558)", async () => {
    const vs = members(3)
    const inv = invitesFor(vs)
    inv[1].declinedAt = new Date()
    setup(fakeDb(vs, inv, { registeredEmails: ["m0@example.org"] }))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations/remind"), params)).json()
    expect(body).toMatchObject({ queued: 1, declinedSkipped: 1, recentlySkipped: 0 })
    expect(enqueued.map((p) => p.volunteerId)).toEqual(["vol-2"])
  })

  it("logs one entry per batch with its count, and none when nothing was queued", async () => {
    const vs = members(5)
    setup(fakeDb(vs, invitesFor(vs)))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    await POST(post("/api/admin/events/evt-1/invitations/remind"), params)
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "memberinvite.reminded", entityType: "Event", entityId: "evt-1", changes: { recipients: { from: null, to: 5 } } })
    logEvent.mockClear()
    await POST(post("/api/admin/events/evt-1/invitations/remind"), params)
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/events/[id]/invitations (#1105)", () => {
  it("regression: 150 new invitations are queued, none sent directly, logged one by one", async () => {
    const vs = members(150)
    setup(fakeDb(vs, []))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/route")
    const res = await POST(post("/api/admin/events/evt-1/invitations", { volunteerIds: vs.map((v) => v.id) }), params)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ invitedNew: 150, skippedExisting: 0, emailsQueued: 150, emailsSent: 150, recentlySkipped: 0, membersWithoutEmail: 0 })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(enqueued.every((p) => p.kind === "member_invite" && p.organizationId === "org-a" && /^member_invite:inv-vol-\d+:\d+$/.test(p.dedupeKey!))).toBe(true)
    // The clear token goes in the (sealed) payload only, the stored row has the hash and the encrypted copy.
    expect(enqueued[0].data.token).toMatch(/^[0-9a-f]{48}$/)
    expect(logEvent.mock.calls.filter((c) => c[0].action === "memberinvite.sent")).toHaveLength(150)
  })

  it("re-sends to someone invited earlier, as before, and records the re-send", async () => {
    const vs = members(1)
    const inv = invitesFor(vs)
    setup(fakeDb(vs, inv))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations", { volunteerIds: ["vol-0"] }), params)).json()
    expect(body).toMatchObject({ invitedNew: 0, skippedExisting: 1, emailsQueued: 1, recentlySkipped: 0 })
    expect(enqueued[0].data.token).toBe("tok-vol-0")
    expect(inv[0].lastRemindedAt).not.toBeNull()
    // #1101 regression: a re-sent invitation left no event log entry; now one per batch, with its count.
    const resent = logEvent.mock.calls.filter((c) => c[0].action === "memberinvite.resent")
    expect(resent).toHaveLength(1)
    expect(resent[0][0]).toMatchObject({ entityType: "Event", changes: { recipients: { from: null, to: 1 } } })
  })

  it("does not re-send an invitation whose previous email still waits in the outbox", async () => {
    const vs = members(1)
    setup(fakeDb(vs, invitesFor(vs)))
    enqueued.push({ kind: "member_invite", dedupeKey: "member_invite:inv-vol-0:1", recipient: { email: "m0@example.org" }, data: {}, status: "sending" })
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations", { volunteerIds: ["vol-0"] }), params)).json()
    expect(body).toMatchObject({ emailsQueued: 0, recentlySkipped: 1 })
  })

  it("a double click invites and emails each person once", async () => {
    const vs = members(2)
    setup(fakeDb(vs, []))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/route")
    await POST(post("/api/admin/events/evt-1/invitations", { volunteerIds: ["vol-0", "vol-1"] }), params)
    const second = await (await POST(post("/api/admin/events/evt-1/invitations", { volunteerIds: ["vol-0", "vol-1"] }), params)).json()
    expect(second).toMatchObject({ invitedNew: 0, skippedExisting: 2, emailsQueued: 0, recentlySkipped: 2 })
    expect(enqueued).toHaveLength(2)
  })

  it("creates the invitation of a member without an address, with no email and no claim", async () => {
    const vs = [{ id: "vol-x", firstName: "X", lastName: "L", email: null, active: true }]
    setup(fakeDb(vs, []))
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/route")
    const body = await (await POST(post("/api/admin/events/evt-1/invitations", { volunteerIds: ["vol-x"] }), params)).json()
    expect(body).toMatchObject({ invitedNew: 1, emailsQueued: 0, membersWithoutEmail: 1, recentlySkipped: 0 })
  })
})

describe("POST /api/admin/events/[id]/send-reminder (#1105)", () => {
  it("regression: 150 registered volunteers are all queued, none sent directly", async () => {
    const db = fakeDb(members(150), [])
    setup(db)
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    const res = await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 150, sent: 150, totalVolunteers: 150 })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(enqueued[0]).toMatchObject({ kind: "manual_reminder", organizationId: "org-a", volunteerId: "vol-0", data: { editToken: "edit-vol-0", customMessage: "À bientôt" } })
    expect(enqueued[0].dedupeKey).toMatch(/^manual_reminder:evt-1:vol-0:\d+$/)
    expect(sendCategory("manual_reminder")).toBe("bulk")
  })

  it("refuses a second reminder less than 5 minutes later, without queueing anything", async () => {
    const db = fakeDb(members(2), [])
    setup(db)
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    deliverAll()
    const res = await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Ce rappel a déjà été lancé il y a moins de 5 minutes. Il n'est pas renvoyé, pour que personne ne le reçoive deux fois.")
    expect(enqueued).toHaveLength(2)
  })

  it("refuses a new reminder while the previous one still waits in the outbox, whatever its age", async () => {
    const db = fakeDb(members(2), [], { reminderSentAt: new Date(Date.now() - 6 * 60 * 1000) })
    setup(db)
    enqueued.push({ kind: "manual_reminder", dedupeKey: "manual_reminder:evt-1:vol-0:1", recipient: { email: "m0@example.org" }, data: {}, status: "pending" })
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    const res = await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/^Le rappel précédent n'est pas encore parti en entier/)
    expect(enqueued).toHaveLength(1)
    expect(db.event.updateMany).not.toHaveBeenCalled()
  })

  it("takes the « Renvoyer » locks of each person's reminder before checking for a copy", async () => {
    const db = fakeDb(members(2), [])
    setup(db)
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    expect(db.locks).toEqual([["manual_reminder:evt-1:vol-0:", "manual_reminder:evt-1:vol-1:"]])
  })

  it("gives the transaction room for a long list (Prisma's 5 s default is too short)", async () => {
    const db = fakeDb(members(2), [])
    setup(db)
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    expect(db.transactionOptions[0]).toMatchObject({ timeout: 60_000 })
  })

  it("sends again once the 5 minutes are over", async () => {
    const db = fakeDb(members(2), [], { reminderSentAt: new Date(Date.now() - 6 * 60 * 1000) })
    setup(db)
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    const res = await POST(post("/api/admin/events/evt-1/send-reminder"), params)
    expect(res.status).toBe(200)
    expect(enqueued).toHaveLength(2)
  })
})
