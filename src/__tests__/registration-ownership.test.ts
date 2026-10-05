import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

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
}))

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: (...args: unknown[]) => m.txQueryRaw(...args),
    shift: { findMany: vi.fn().mockResolvedValue([]) }, // no role limit (#466)
    // A new volunteer is created inside the registration transaction (#309).
    volunteer: { createMany: m.txVolCreateMany, findFirstOrThrow: m.txVolFindFirstOrThrow },
    charterVersion: { upsert: vi.fn() },
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

  it("throttled after failed sends: doesn't claim the link was emailed", async () => {
    m.volFindFirst.mockResolvedValue({ ...victim, id: "vol-throttle-fail" })
    m.regFindFirst.mockResolvedValue({
      editTokenLegacy: "victims-tok", editTokenEnc: null,
      volunteer: { firstName: "Real", lastName: "Owner", email: "owner@x.com" },
      event: { title: "Festival", organization: { slug: "a" } },
    })
    m.sendNotification.mockResolvedValue({ ok: false, reason: "smtp down" })
    const { POST } = await import("@/app/api/public/registrations/route")
    for (let i = 0; i < 3; i++) {
      m.regFindMany.mockResolvedValueOnce([{ id: "reg-existing" }])
      await POST(post())
    }
    m.regFindMany.mockResolvedValueOnce([{ id: "reg-existing" }])
    const { error } = await (await POST(post())).json()
    expect(m.sendNotification).toHaveBeenCalledTimes(3) // 4th attempt throttled
    expect(error).not.toContain("a été envoyé")
  })

  it("throttled after a successful send: says the link was emailed", async () => {
    m.volFindFirst.mockResolvedValue({ ...victim, id: "vol-throttle-ok" })
    m.regFindFirst.mockResolvedValue({
      editTokenLegacy: "victims-tok", editTokenEnc: null,
      volunteer: { firstName: "Real", lastName: "Owner", email: "owner@x.com" },
      event: { title: "Festival", organization: { slug: "a" } },
    })
    const { POST } = await import("@/app/api/public/registrations/route")
    for (let i = 0; i < 3; i++) {
      m.regFindMany.mockResolvedValueOnce([{ id: "reg-existing" }])
      await POST(post())
    }
    m.regFindMany.mockResolvedValueOnce([{ id: "reg-existing" }])
    const { error } = await (await POST(post())).json()
    expect(m.sendNotification).toHaveBeenCalledTimes(3)
    expect(error).toContain("envoyé à ton adresse email")
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

  it("already registered: 409 without the existing token, which is emailed to the owner instead", async () => {
    m.volFindFirst.mockResolvedValue(victim)
    m.regFindMany.mockResolvedValueOnce([{ id: "reg-existing" }])
    m.regFindFirst.mockResolvedValue({
      editTokenLegacy: "victims-tok", editTokenEnc: null,
      volunteer: { firstName: "Real", lastName: "Owner", email: "owner@x.com" },
      event: { title: "Festival", organization: { slug: "a" } },
    })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain("victims-tok")
    expect(body.error).toContain("envoyé à ton adresse email")
    expect(m.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: "registration_link_resend",
      recipient: expect.objectContaining({ email: "owner@x.com" }),
      data: expect.objectContaining({ editToken: "victims-tok" }),
    }))
    expect(m.volUpdate).not.toHaveBeenCalled()
  })

  it("duplicate of a waitlisted/offered registration only: no email, and the message doesn't claim one", async () => {
    m.volFindFirst.mockResolvedValue({ ...victim, id: "vol-waiting" })
    m.regFindMany.mockResolvedValueOnce([{ id: "reg-waiting" }])
    m.regFindFirst.mockResolvedValue(null) // no *active* registration: /my link doesn't exist
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error).toContain("liste d'attente")
    expect(error).not.toContain("a été envoyé")
    expect(m.sendNotification).not.toHaveBeenCalled()
  })

  it("duplicate when the link email fails: the message doesn't claim it was sent", async () => {
    m.volFindFirst.mockResolvedValue({ ...victim, id: "vol-mailfail" })
    m.regFindMany.mockResolvedValueOnce([{ id: "reg-existing" }])
    m.regFindFirst.mockResolvedValue({
      editTokenLegacy: "victims-tok", editTokenEnc: null,
      volunteer: { firstName: "Real", lastName: "Owner", email: "owner@x.com" },
      event: { title: "Festival", organization: { slug: "a" } },
    })
    m.sendNotification.mockResolvedValue({ ok: false, reason: "smtp down" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const { error } = await (await POST(post())).json()
    expect(error).not.toContain("a été envoyé")
    expect(error).toContain("email de confirmation")
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
