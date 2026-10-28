import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Shift swaps from a personal link (#1174): /api/public/registrations/[token]/swaps. The link's
 * holder is the actor; a request of another event and a registration of someone else answer as
 * unknown; nothing works before the capability is shipped; publications and offers are capped per
 * person; every action is a POST bound to the request's revision (the commands themselves are
 * tested on Postgres, src/__integration__/shift-swaps.int.test.ts).
 */

const prismaMock = vi.hoisted(() => ({
  registration: { findFirst: vi.fn() },
  shiftSwapRequest: { findFirst: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const limits = vi.hoisted(() => ({ blocked: false, use: true, miss: vi.fn(), proposal: true }))
vi.mock("@/lib/token-rate-limit", () => ({
  tokenLookupsBlocked: async () => limits.blocked,
  recordTokenMiss: limits.miss,
  tokenUseAllowed: async () => limits.use,
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ ok: limits.proposal, retryAfter: 60 })) }))

const shipped = vi.hoisted(() => ({ value: true }))
vi.mock("@/lib/shift-swap-gate", () => ({ swapsShipped: () => shipped.value }))
vi.mock("@/lib/shift-swap-data", () => ({
  loadVolunteerSwapView: vi.fn(async () => ({ enabled: true, publishable: [{ registrationId: "reg-1", deadline: "2030-07-04T08:00:00.000Z" }], mine: [], offers: [] })),
}))

const commands = vi.hoisted(() => ({
  publishSwapRequest: vi.fn(async () => ({ ok: true, requestId: "swap-1", status: "open" })),
  offerSwap: vi.fn(async () => ({ ok: true, requestId: "swap-1", status: "offered" })),
  confirmSwap: vi.fn(async () => ({ ok: false, httpStatus: 409, error: "Cet échange a déjà été effectué.", status: "applied" })),
  declineSwapOffer: vi.fn(async () => ({ ok: true, requestId: "swap-1", status: "open" })),
  withdrawSwapOffer: vi.fn(async () => ({ ok: true, requestId: "swap-1", status: "open" })),
  withdrawSwapRequest: vi.fn(async () => ({ ok: true, requestId: "swap-1", status: "withdrawn" })),
}))
vi.mock("@/lib/shift-swap-server", () => ({ ...commands, SWAP_NOT_FOUND: "Demande d'échange introuvable.", SWAP_UNAVAILABLE: "Les échanges de créneaux ne sont pas disponibles pour cet événement." }))

import { GET, POST } from "@/app/api/public/registrations/[token]/swaps/route"
import { rateLimit } from "@/lib/rate-limit"

const HOLDER = { volunteerId: "vol-1", eventId: "evt-1", volunteer: { erasedAt: null, mergedIntoId: null }, event: { organization: { active: true, suspendedAt: null } } }
const params = { params: Promise.resolve({ token: "tok-1" }) }
const post = (body: unknown) => POST(new Request("http://localhost/api/public/registrations/tok-1/swaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), params)
const get = () => GET(new Request("http://localhost/api/public/registrations/tok-1/swaps"), params)

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(limits, { blocked: false, use: true, proposal: true })
  shipped.value = true
  prismaMock.registration.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    // The link's lookup, then « is this registration mine, on my event ».
    if ("editTokenHash" in args.where || "OR" in args.where) return HOLDER
    return args.where.volunteerId === "vol-1" && args.where.eventId === "evt-1" && args.where.id === "reg-1" ? { id: "reg-1" } : null
  })
  prismaMock.shiftSwapRequest.findFirst.mockImplementation(async (args: { where: { id: string; eventId: string } }) => (args.where.eventId === "evt-1" && args.where.id === "swap-1" ? { id: "swap-1" } : null))
})

describe("GET /api/public/registrations/[token]/swaps (#1174)", () => {
  it("shows the holder's own view, privately", async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    expect(await res.json()).toMatchObject({ enabled: true, publishable: [{ registrationId: "reg-1" }] })
  })

  it("an unknown link is a miss, counted per IP", async () => {
    prismaMock.registration.findFirst.mockResolvedValueOnce(null)
    expect((await get()).status).toBe(404)
    expect(limits.miss).toHaveBeenCalled()
  })

  it("shows nothing before the capability is shipped, or to an erased record", async () => {
    shipped.value = false
    expect(await (await get()).json()).toEqual({ enabled: false, scope: "poste", publishable: [], mine: [], offers: [], ownShifts: {} })
  })

  it("answers 403 while the organisation is closed", async () => {
    prismaMock.registration.findFirst.mockResolvedValueOnce({ ...HOLDER, event: { organization: { active: false, suspendedAt: null } } })
    expect((await get()).status).toBe(403)
  })
})

describe("POST /api/public/registrations/[token]/swaps (#1174)", () => {
  it("publishes one of the holder's registrations, as the holder", async () => {
    const res = await post({ action: "publish", registrationId: "reg-1" })
    expect(res.status).toBe(200)
    expect(commands.publishSwapRequest).toHaveBeenCalledWith(expect.anything(), { registrationId: "reg-1", volunteerId: "vol-1" })
  })

  it("refuses someone else's registration, or another event's, as unknown", async () => {
    expect((await post({ action: "publish", registrationId: "reg-other" })).status).toBe(404)
    expect((await post({ action: "offer", requestId: "swap-1", registrationId: "reg-other" })).status).toBe(404)
    expect(commands.publishSwapRequest).not.toHaveBeenCalled()
    expect(commands.offerSwap).not.toHaveBeenCalled()
  })

  it("refuses a request of another event as unknown (cross-event, cross-organisation)", async () => {
    const res = await post({ action: "confirm", requestId: "swap-of-org-b", revision: 1 })
    expect(res.status).toBe(404)
    expect(prismaMock.shiftSwapRequest.findFirst).toHaveBeenCalledWith({ where: { id: "swap-of-org-b", eventId: "evt-1" }, select: { id: true } })
    expect(commands.confirmSwap).not.toHaveBeenCalled()
  })

  it("passes the revision the page showed, and answers a replay with the current state", async () => {
    const res = await post({ action: "confirm", requestId: "swap-1", revision: 3 })
    expect(commands.confirmSwap).toHaveBeenCalledWith(expect.anything(), { requestId: "swap-1", volunteerId: "vol-1", revision: 3 })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ status: "applied", error: "Cet échange a déjà été effectué." })
  })

  it("dispatches decline, offer withdrawal and request withdrawal", async () => {
    await post({ action: "decline", requestId: "swap-1", revision: 2 })
    await post({ action: "withdraw_offer", requestId: "swap-1", revision: 2 })
    await post({ action: "withdraw", requestId: "swap-1" })
    expect(commands.declineSwapOffer).toHaveBeenCalledWith(expect.anything(), { requestId: "swap-1", volunteerId: "vol-1", revision: 2 })
    expect(commands.withdrawSwapOffer).toHaveBeenCalledWith(expect.anything(), { requestId: "swap-1", volunteerId: "vol-1", revision: 2 })
    expect(commands.withdrawSwapRequest).toHaveBeenCalledWith(expect.anything(), { requestId: "swap-1", volunteerId: "vol-1" })
  })

  it("refuses an unknown action, a missing revision and a GET-like body", async () => {
    expect((await post({ action: "apply", requestId: "swap-1" })).status).toBe(400)
    expect((await post({ action: "confirm", requestId: "swap-1" })).status).toBe(400)
  })

  it("caps publications and offers per person, not the other actions", async () => {
    limits.proposal = false
    expect((await post({ action: "publish", registrationId: "reg-1" })).status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith("vol-1", "swap-proposal", 10, 24 * 60 * 60 * 1000)
    expect((await post({ action: "withdraw", requestId: "swap-1" })).status).toBe(200)
  })

  it("is limited per link, and does nothing before the capability is shipped", async () => {
    limits.use = false
    expect((await post({ action: "withdraw", requestId: "swap-1" })).status).toBe(429)
    limits.use = true
    shipped.value = false
    expect((await post({ action: "withdraw", requestId: "swap-1" })).status).toBe(403)
    expect(commands.withdrawSwapRequest).not.toHaveBeenCalled()
  })
})
