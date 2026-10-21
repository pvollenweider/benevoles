import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"
import { DUPLICATE_SIGNUP_MESSAGE } from "@/lib/signup-eligibility"
import { SIGNUP_COMMENT_MAX, SIGNUP_PHONE_MAX } from "@/lib/signup-limits"

// Public sign-up with someone else's email (#285): nothing proves the submitter owns the
// address, so for an existing volunteer the response must not reveal a management token and
// the profile must not be rewritten. A brand-new address or a valid member invite is proof.

const m = vi.hoisted(() => ({
  volFindFirst: vi.fn(),
  volCreate: vi.fn(),
  txVolCreateMany: vi.fn(),
  txVolFindFirstOrThrow: vi.fn(),
  volUpdate: vi.fn(),
  inviteFindFirst: vi.fn(),
  regFindMany: vi.fn(),
  regFindFirst: vi.fn(),
  txRegFindMany: vi.fn(),
  txCreate: vi.fn(),
  txQueryRaw: vi.fn(),
  sendNotification: vi.fn(),
  enqueueNotifications: vi.fn(),
  deliverAfterResponse: vi.fn(),
  sendConfirmationEmail: vi.fn(),
  rosterFindUnique: vi.fn(),
  rosterUpsert: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: (...args: unknown[]) => m.txQueryRaw(...args),
    shift: { findMany: vi.fn().mockResolvedValue([]) }, // no role limit (#466)
    // A new volunteer is created inside the registration transaction (#309).
    volunteer: { createMany: m.txVolCreateMany, findFirstOrThrow: m.txVolFindFirstOrThrow },
    charterVersion: { upsert: vi.fn() },
    rosterConsent: { findUnique: m.rosterFindUnique, upsert: m.rosterUpsert },
    registration: {
      findMany: m.txRegFindMany,
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
      create: m.txCreate,
    },
  }
  return {
    prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) }, // no custom question (#483)
      event: {
        findFirst: vi.fn().mockResolvedValue({
          id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a" }, confirmationMessage: null,
        }),
      },
      shift: {
        findMany: vi.fn().mockResolvedValue([
          { id: "shift-2", label: "Bar", roleName: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], date: new Date("2030-06-01T00:00:00Z"), startTime: "14:00", endTime: "16:00" },
        ]),
      },
      volunteer: { findFirst: m.volFindFirst, create: m.volCreate, update: m.volUpdate, findFirstOrThrow: vi.fn() },
      memberInvite: { findFirst: m.inviteFindFirst, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      registration: { findMany: m.regFindMany, findFirst: m.regFindFirst, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  }
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: m.sendConfirmationEmail, sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => {
    const payloads: unknown[] = []
    return { payloads, send: async (p: unknown) => { payloads.push(p); return { ok: true } } }
  },
  enqueueNotifications: m.enqueueNotifications,
  deliverAfterResponse: m.deliverAfterResponse,
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: m.sendNotification }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))

const victim = { id: "vol-victim", firstName: "Real", lastName: "Owner", email: "owner@x.com", phone: "0790000000" }

// The route generates the token and stores only its hash (+ encrypted copy, #290): the token in
// the response must be the one whose hash was written.
function expectTokenStored(token: unknown) {
  expect(typeof token).toBe("string")
  expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ editTokenHash: hashToken(token as string) }),
  }))
}

function post(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
    body: JSON.stringify({
      eventId: "evt-1", shiftIds: ["shift-2"], firstName: "Mallory", lastName: "X", email: "owner@x.com",
      phone: "0791111111", consent: true, charterAccepted: true, ...extra,
    }),
  })
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.enqueueNotifications.mockResolvedValue(["row-1"])
  m.regFindMany.mockResolvedValue([])
  m.txRegFindMany.mockResolvedValue([])
  m.txCreate.mockResolvedValue({ id: "reg-new", shiftId: "shift-2", status: "active", waitingPosition: null })
  m.sendNotification.mockResolvedValue({ ok: true })
  m.txQueryRaw.mockResolvedValue([{ id: "locked", erasedAt: null }]) // #516: a locked match, not erased
  m.rosterFindUnique.mockResolvedValue(null)
})

describe("POST /api/public/registrations — ownership of the email (#285)", () => {
  it("existing volunteer, no proof: registers, but returns no token and leaves the profile untouched", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.editToken).toBeNull()
    expect(data.linkSentByEmail).toBe(true)
    expect(m.volUpdate).not.toHaveBeenCalled()
  })

  it("existing volunteer with a valid member invite: token returned and profile updated", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ inviteToken: "inv-tok" }))
    expect(res.status).toBe(201)
    expectTokenStored((await res.json()).editToken)
    expect(m.inviteFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashToken("inv-tok"), eventId: "evt-1", volunteerId: "vol-victim" },
    }))
    expect(m.volUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vol-victim" } }))
  })

  it("an invite of another volunteer is not proof", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/registrations/route")
    const data = await (await POST(post({ inviteToken: "someone-elses" }))).json()
    expect(data.editToken).toBeNull()
    expect(m.volUpdate).not.toHaveBeenCalled()
  })

  it("existing volunteer, no proof: the submitted phone is kept on the registration (profile untouched)", async () => {
    m.volFindFirst.mockResolvedValue({ ...victim, phone: null })
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ phone: " 079 222 33 44 " }))).status).toBe(201)
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: "079 222 33 44" }),
    }))
    expect(m.volUpdate).not.toHaveBeenCalled()
  })

  it("sign-up notifications go through the outbox, not sent inline (#293)", async () => {
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 1 }); m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ email: "new@x.com" }))).status).toBe(201)
    // The confirmation email helper gets the outbox collector as its `send`.
    expect(m.sendConfirmationEmail).toHaveBeenCalledWith(expect.anything(), expect.any(Function))
    expect(m.sendNotification).not.toHaveBeenCalled()
    // Stored with the transaction's client, alongside the registrations (#352), delivered after.
    expect(m.enqueueNotifications).toHaveBeenCalledOnce()
    const [, db] = m.enqueueNotifications.mock.calls[0]
    expect(db).toHaveProperty("registration.create", m.txCreate)
    expect(m.deliverAfterResponse).toHaveBeenCalledWith(["row-1"])
  })

  it("a failure storing the notifications fails the whole sign-up: no registration without them (#352)", async () => {
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 1 }); m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
    m.enqueueNotifications.mockRejectedValue(new Error("outbox insert failed"))
    const { POST } = await import("@/app/api/public/registrations/route")
    await expect(POST(post({ email: "new@x.com" }))).rejects.toThrow("outbox insert failed")
    expect(m.deliverAfterResponse).not.toHaveBeenCalled()
  })

  it("a new volunteer is only created inside the registration transaction (no orphan if it fails, #309)", async () => {
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 1 })
    m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
    m.txRegFindMany.mockResolvedValue([{ shift: { label: "Accueil", date: new Date("2030-06-01T00:00:00Z"), startTime: "15:00", endTime: "17:00" } }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ email: "new@x.com" }))
    expect(res.status).toBe(409) // failed inside the transaction → rolled back with the volunteer
    expect(m.volCreate).not.toHaveBeenCalled()
    expect(m.txVolCreateMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
  })

  it("an address created concurrently by another sign-up isn't proof of ownership", async () => {
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 0 }) // the other request inserted it first
    m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-other" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ email: "new@x.com" }))
    expect(res.status).toBe(201)
    expect((await res.json()).editToken).toBeNull()
  })

  it("brand-new address: registered, but the link goes by email only, not on screen (#312)", async () => {
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 1 }); m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ email: "new@x.com" }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.editToken).toBeNull()
    expect(data.linkSentByEmail).toBe(true)
  })

  // A live registration as the duplicate check loads it (linkTargetInclude), in a given status.
  const existingReg = (volunteerId: string, status: string) => ({
    id: `reg-${volunteerId}`, eventId: "evt-1", volunteerId, status,
    editTokenHash: "h", editTokenLegacy: "victims-tok", editTokenEnc: null,
    volunteer: { firstName: "Real", lastName: "Owner", email: "owner@x.com" },
    event: { id: "evt-1", title: "Festival", organizationId: "org-a", organization: { slug: "a" } },
  })

  async function duplicateAnswer(volunteerId: string, status: string) {
    m.volFindFirst.mockResolvedValue({ ...victim, id: volunteerId })
    m.regFindMany.mockResolvedValueOnce([{ id: `reg-${volunteerId}` }])
    m.regFindFirst.mockResolvedValue(existingReg(volunteerId, status))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    return { status: res.status, body: await res.json() }
  }

  it("already registered: 409 without the existing token, which is emailed to the owner instead", async () => {
    const { status, body } = await duplicateAnswer("vol-dup-active", "active")
    expect(status).toBe(409)
    expect(JSON.stringify(body)).not.toContain("victims-tok")
    expect(body).toEqual({ error: DUPLICATE_SIGNUP_MESSAGE, duplicate: true })
    expect(m.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: "registration_link_resend",
      volunteerId: "vol-dup-active",
      recipient: expect.objectContaining({ email: "owner@x.com" }),
      data: expect.objectContaining({ editToken: "victims-tok" }),
    }))
    expect(m.volUpdate).not.toHaveBeenCalled()
  })

  // #1047: the answer doesn't tell a stranger which state a known address is in.
  it("one and the same answer for an active, requested, waitlisted or offered registration, each emailed its link", async () => {
    const answers = []
    for (const st of ["active", "requested", "waiting", "offered"]) {
      m.sendNotification.mockClear()
      answers.push(await duplicateAnswer(`vol-dup-${st}`, st))
      expect(m.sendNotification).toHaveBeenCalledTimes(1)
    }
    for (const a of answers) expect(a).toEqual({ status: 409, body: { error: DUPLICATE_SIGNUP_MESSAGE, duplicate: true } })
  })

  it("the same answer when the link email is throttled, fails or throws", async () => {
    // Fourth try within the hour for the same volunteer: throttled, nothing sent.
    const first = await duplicateAnswer("vol-dup-throttle", "active")
    await duplicateAnswer("vol-dup-throttle", "active")
    await duplicateAnswer("vol-dup-throttle", "active")
    m.sendNotification.mockClear()
    const throttled = await duplicateAnswer("vol-dup-throttle", "active")
    expect(m.sendNotification).not.toHaveBeenCalled()
    expect(throttled).toEqual(first)

    m.sendNotification.mockResolvedValueOnce({ ok: false, reason: "smtp down" })
    expect(await duplicateAnswer("vol-dup-mailfail", "active")).toEqual(first)
    m.sendNotification.mockRejectedValueOnce(new Error("smtp crash"))
    expect(await duplicateAnswer("vol-dup-mailthrow", "waiting")).toEqual(first)
  })

  // The personal page shows when the link was last emailed: never for a send that failed.
  it("records the link email only once it actually went out", async () => {
    const { prisma } = await import("@/lib/prisma")
    const updateMany = vi.mocked(prisma.registration.updateMany)
    updateMany.mockClear()
    m.sendNotification.mockResolvedValueOnce({ ok: false, reason: "smtp down" })
    await duplicateAnswer("vol-dup-stamp-fail", "active")
    expect(updateMany).not.toHaveBeenCalled()
    await duplicateAnswer("vol-dup-stamp-ok", "active")
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { linkEmailedAt: expect.any(Date) } }))
  })

  // #1047: free text is bounded, shown to organisers and exported to CSV.
  it("refuses an over-long phone or comment before any lookup, accepts the limits themselves", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const phone = await POST(post({ phone: "1".repeat(SIGNUP_PHONE_MAX + 1) }))
    expect(phone.status).toBe(400)
    expect(await phone.json()).toEqual({ error: expect.stringContaining("Le téléphone ne peut pas dépasser 50 caractères"), field: "phone" })
    const comment = await POST(post({ comment: "x".repeat(SIGNUP_COMMENT_MAX + 1) }))
    expect(await comment.json()).toEqual({ error: expect.stringContaining("Le commentaire ne peut pas dépasser 2000 caractères"), field: "comment" })
    for (const extra of [{ inviteToken: "t".repeat(201) }, { eventId: "e".repeat(101) }]) {
      const res = await POST(post(extra))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain(Object.keys(extra)[0])
    }
    expect(m.volFindFirst).not.toHaveBeenCalled()
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 1 }); m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-long" })
    const ok = await POST(post({ email: "long@x.com", phone: "1".repeat(SIGNUP_PHONE_MAX), comment: "x".repeat(SIGNUP_COMMENT_MAX) }))
    expect(ok.status).toBe(201)
  })

  it("overlap with an existing registration: 409 without any token", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.regFindMany
      .mockResolvedValueOnce([]) // no duplicate on the same shift
      .mockResolvedValueOnce([{ editTokenLegacy: "victims-tok", editTokenEnc: null, shift: { label: "Accueil", date: new Date("2030-06-01T00:00:00Z"), startTime: "15:00", endTime: "17:00" } }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).not.toContain("victims-tok")
  })

  it("overlap created concurrently is caught under the volunteer lock", async () => {
    m.volFindFirst.mockResolvedValue(null)
    m.txVolCreateMany.mockResolvedValue({ count: 1 }); m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
    // Nothing before the lock, but a concurrent request registered an overlapping shift meanwhile.
    m.txRegFindMany.mockResolvedValue([{ shift: { label: "Accueil", date: new Date("2030-06-01T00:00:00Z"), startTime: "15:00", endTime: "17:00" } }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ email: "new@x.com" }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("chevauche")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("a match erased between the lookup and the lock (#516) counts as no match: a new record, nothing written on the erased one", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" }) // even a valid invite of the erased record proves nothing now
    m.txQueryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.join("?").includes("erasedAt") && values[0] === "vol-victim" ? [{ id: "vol-victim", erasedAt: new Date() }] : [])
    m.txVolCreateMany.mockResolvedValue({ count: 1 })
    m.txVolFindFirstOrThrow.mockResolvedValue({ id: "vol-new" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ inviteToken: "inv-tok", comment: "mon mot" }))
    expect(res.status).toBe(201)
    expect(m.txVolCreateMany).toHaveBeenCalled()
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ volunteerId: "vol-new", comment: "mon mot" }) }))
    expect(m.txCreate).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ volunteerId: "vol-victim" }) }))
    expect(m.volUpdate).not.toHaveBeenCalled()
  })
})

// The shift roster's box (#1068): typing someone's address never makes their name visible.
describe("POST /api/public/registrations — shift roster choice (#1068)", () => {
  const rosterEvent = { id: "evt-1", organizationId: "org-a", title: "Festival", organization: { slug: "a" }, confirmationMessage: null, shiftRosterEnabled: true, startDate: new Date("2030-06-01T00:00:00Z") }
  async function withRosterEvent(on: boolean) {
    const { prisma } = await import("@/lib/prisma")
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce({ ...rosterEvent, shiftRosterEnabled: on } as never)
  }
  const stored = () => m.rosterUpsert.mock.calls.map(([a]) => a.update.status)

  it("existing volunteer, no proof, box ticked: kept pending, never visible", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    await withRosterEvent(true)
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ rosterNameVisible: true }))).status).toBe(201)
    expect(stored()).toEqual(["pending"])
    expect(m.rosterUpsert.mock.calls[0][0].update.source).toBe("signup")
  })

  it("no proof suspends an earlier acceptance, and never overrides a refusal", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.rosterFindUnique.mockResolvedValue({ status: "visible", noticeVersion: "2026-10-21" })
    await withRosterEvent(true)
    const { POST } = await import("@/app/api/public/registrations/route")
    await POST(post())
    expect(stored()).toEqual(["pending"])
    m.rosterUpsert.mockReset()
    m.rosterFindUnique.mockResolvedValue({ status: "hidden", noticeVersion: "2026-10-21" })
    await withRosterEvent(true)
    await POST(post({ rosterNameVisible: true }))
    expect(m.rosterUpsert).not.toHaveBeenCalled()
  })

  it("with a valid member invite, the box makes the name visible at once", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    await withRosterEvent(true)
    const { POST } = await import("@/app/api/public/registrations/route")
    await POST(post({ inviteToken: "inv-tok", rosterNameVisible: true }))
    expect(stored()).toEqual(["visible"])
    expect(m.rosterUpsert.mock.calls[0][0].update.source).toBe("signup_verified")
  })

  it("stores the version of the text the form showed: the current one only when the form says so", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    const { POST } = await import("@/app/api/public/registrations/route")
    await withRosterEvent(true)
    await POST(post({ inviteToken: "inv-tok", rosterNameVisible: true, rosterNoticeVersion: "2026-10-21.2" }))
    expect(m.rosterUpsert.mock.calls[0][0].update).toMatchObject({ status: "visible", noticeVersion: "2026-10-21.2" })
    // A page loaded before the current text (no version, or another one): the first text's narrower audience.
    for (const version of [undefined, "2099-01-01"]) {
      m.rosterUpsert.mockReset()
      await withRosterEvent(true)
      await POST(post({ inviteToken: "inv-tok", rosterNameVisible: true, rosterNoticeVersion: version }))
      expect(m.rosterUpsert.mock.calls[0][0].update).toMatchObject({ status: "visible", noticeVersion: "2026-10-21" })
    }
  })

  it("a sign-up without a new choice never widens a first-text acceptance", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    m.rosterFindUnique.mockResolvedValue({ status: "visible", noticeVersion: "2026-10-21" })
    await withRosterEvent(true)
    const { POST } = await import("@/app/api/public/registrations/route")
    await POST(post({ inviteToken: "inv-tok", rosterNoticeVersion: "2026-10-21.2" }))
    expect(m.rosterUpsert).not.toHaveBeenCalled()
  })

  it("the box counts for nothing on an event without the roster, and nothing is stored unticked", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1" })
    await withRosterEvent(false)
    const { POST } = await import("@/app/api/public/registrations/route")
    await POST(post({ inviteToken: "inv-tok", rosterNameVisible: true }))
    await withRosterEvent(true)
    await POST(post({ inviteToken: "inv-tok" }))
    expect(m.rosterUpsert).not.toHaveBeenCalled()
  })
})
