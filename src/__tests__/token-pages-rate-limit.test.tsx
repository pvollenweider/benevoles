// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TOKEN_MISS_LIMIT } from "@/lib/token-rate-limit"

// The pages a personal link opens (sign-up confirmation, waitlist offer, « Je ne peux pas ») count
// unknown links like their JSON APIs (src/lib/token-page-guard.ts): after 20 unknown links from one
// connection, they answer « Trop de tentatives » without looking anything up, valid link or not.

// Next memoizes `cache()` per request; React's client build does not. One « view » here is one
// scope: generateMetadata and the page of the same view share it, the next view starts afresh.
const request = vi.hoisted(() => ({ memo: new Map<unknown, Map<string, unknown>>(), headers: new Headers() }))
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A): R => {
    let byArgs = request.memo.get(fn)
    if (!byArgs) request.memo.set(fn, (byArgs = new Map()))
    const key = JSON.stringify(args)
    if (!byArgs.has(key)) byArgs.set(key, fn(...args))
    return byArgs.get(key) as R
  }
  return { ...actual, cache, default: { ...actual, cache } }
})
vi.mock("next/headers", () => ({ headers: async () => request.headers }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))

const db = vi.hoisted(() => ({
  registrationFindFirst: vi.fn(),
  confirmationFindUnique: vi.fn(),
  inviteFindUnique: vi.fn(),
  shiftFindUnique: vi.fn(),
  shiftFindMany: vi.fn(),
  declineFindUnique: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: { findFirst: db.registrationFindFirst },
    signupConfirmation: { findUnique: db.confirmationFindUnique },
    memberInvite: { findUnique: db.inviteFindUnique },
    shift: { findUnique: db.shiftFindUnique, findMany: db.shiftFindMany },
    shiftDecline: { findUnique: db.declineFindUnique },
  },
}))

const OPEN_ORG = { name: "Asso", slug: "asso", timeZone: "Europe/Zurich", active: true, suspendedAt: null }
const FUTURE = new Date("2031-07-04T00:00:00Z")
const offer = {
  status: "offered", waitingExpiresAt: new Date("2031-07-01T10:00:00Z"),
  shift: { label: "Bar", date: FUTURE, startTime: "10:00", endTime: "12:00", requiresApproval: false },
  event: { title: "Fête du village", organization: OPEN_ORG },
}
const confirmation = {
  id: "conf-1", eventId: "evt-1", volunteerId: "vol-1", email: "lea.muller@example.ch", firstName: "Léa", lastName: "Müller",
  phone: null, birthDate: null, comment: null, expiresAt: new Date("2031-07-01T10:00:00Z"), confirmedAt: null,
  cancelledAt: null, cancelReason: null, resultActive: null, resultRequested: null, resultWaiting: null,
  waitlistShiftIds: [],
  event: { id: "evt-1", title: "Fête du village", slug: "fete", publicStatus: "published", organization: OPEN_ORG },
  registrations: [{ id: "reg-1", shiftId: "s1", status: "unconfirmed" }],
}
const declineLink = {
  volunteerId: "vol-1", eventId: "evt-1", volunteer: { active: true },
  event: { id: "evt-1", slug: "fete", title: "Fête du village", organizationId: "org-a", organization: OPEN_ORG },
}
const declineShift = {
  id: "shift1", eventId: "evt-1", roleName: "Bar", label: "Bar", date: FUTURE, startTime: "10:00", endTime: "12:00",
  status: "open", capacity: 3, registrations: [],
}

let ipSeq = 0
const freshIp = () => `10.42.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`

type PageModule = {
  default: (props: { params: Promise<Record<string, string>> }) => Promise<ReactElement>
  generateMetadata: (props: { params: Promise<Record<string, string>> }) => Promise<{ title?: unknown }> | { title?: unknown }
}

/** One page view from `ip`: its title and its server HTML. */
async function open(mod: PageModule, params: Record<string, string>, ip: string) {
  request.memo = new Map()
  request.headers = new Headers({ "x-forwarded-for": ip })
  const meta = await mod.generateMetadata({ params: Promise.resolve(params) })
  const html = renderToStaticMarkup(await mod.default({ params: Promise.resolve(params) }))
  return { title: String(meta.title), html }
}

/** One view from `ip` that reads only its title (generateMetadata). */
async function titleOf(mod: PageModule, params: Record<string, string>, ip: string) {
  request.memo = new Map()
  request.headers = new Headers({ "x-forwarded-for": ip })
  return String((await mod.generateMetadata({ params: Promise.resolve(params) })).title)
}

const pages = {
  waitlist: () => import("@/app/waitlist/[token]/confirm/page") as unknown as Promise<PageModule>,
  confirmation: () => import("@/app/confirmation/[token]/page") as unknown as Promise<PageModule>,
  decline: () => import("@/app/ne-peux-pas/[kind]/[token]/[shiftId]/page") as unknown as Promise<PageModule>,
}

/** Spends the connection's unknown links on the waitlist page. */
async function spendMisses(ip: string) {
  const waitlist = await pages.waitlist()
  db.registrationFindFirst.mockResolvedValue(null)
  for (let i = 0; i < TOKEN_MISS_LIMIT; i++) {
    expect(await titleOf(waitlist, { token: `unknown${i}` }, ip)).toBe("Lien expiré ou invalide")
  }
  db.registrationFindFirst.mockResolvedValue(offer)
}

/** All lookups of the three pages, to assert none happened. */
const lookups = () => Object.values(db).reduce((n, fn) => n + fn.mock.calls.length, 0)

describe("personal-link pages: failed-lookup limit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.registrationFindFirst.mockResolvedValue(offer)
    db.confirmationFindUnique.mockResolvedValue(confirmation)
    db.inviteFindUnique.mockResolvedValue(declineLink)
    db.shiftFindUnique.mockResolvedValue(declineShift)
    db.shiftFindMany.mockResolvedValue([])
    db.declineFindUnique.mockResolvedValue(null)
  })

  it("after 20 unknown links, a valid link on each page shows « Trop de tentatives » and looks nothing up", async () => {
    const ip = freshIp()
    await spendMisses(ip)
    vi.clearAllMocks()
    db.registrationFindFirst.mockResolvedValue(offer)
    db.confirmationFindUnique.mockResolvedValue(confirmation)
    db.inviteFindUnique.mockResolvedValue(declineLink)

    const waitlist = await open(await pages.waitlist(), { token: "realoffer" }, ip)
    expect(waitlist.title).toBe("Trop de tentatives")
    expect(waitlist.html).toContain("<h1")
    expect(waitlist.html).toContain(">Trop de tentatives</h1>")
    expect(waitlist.html).not.toContain("Fête du village")

    const conf = await open(await pages.confirmation(), { token: "realconfirmation" }, ip)
    expect(conf.title).toBe("Trop de tentatives")
    expect(conf.html).toContain(">Trop de tentatives</h1>")

    const decline = await open(await pages.decline(), { kind: "invitation", token: "realinvite", shiftId: "shift1" }, ip)
    expect(decline.title).toMatch(/^Trop de tentatives — /)
    expect(decline.html).toContain(">Trop de tentatives</h1>")
    expect(decline.html).not.toContain("Bar")

    expect(lookups()).toBe(0)
  })

  it("a different connection is not affected", async () => {
    await spendMisses(freshIp())
    const other = freshIp()
    expect(await titleOf(await pages.waitlist(), { token: "realoffer" }, other)).toBe("Place proposée")
    expect(await titleOf(await pages.confirmation(), { token: "realconfirmation" }, other)).toBe("Confirme ton inscription")
    expect(await titleOf(await pages.decline(), { kind: "invitation", token: "realinvite", shiftId: "shift1" }, other)).toMatch(/^Je ne peux pas — /)
  })

  it("a valid link never counts as a miss, on any of the three pages", async () => {
    const ip = freshIp()
    for (let i = 0; i < TOKEN_MISS_LIMIT + 5; i++) {
      expect(await titleOf(await pages.waitlist(), { token: "realoffer" }, ip)).toBe("Place proposée")
      expect(await titleOf(await pages.confirmation(), { token: "realconfirmation" }, ip)).toBe("Confirme ton inscription")
      expect(await titleOf(await pages.decline(), { kind: "invitation", token: "realinvite", shiftId: "shift1" }, ip)).toMatch(/^Je ne peux pas — /)
    }
  })

  it("counts one miss per view, though the title and the page both read the link", async () => {
    const ip = freshIp()
    db.registrationFindFirst.mockResolvedValue(null)
    const waitlist = await pages.waitlist()
    // 20 full views (title and page) of unknown links: the 20th is still answered normally.
    for (let i = 0; i < TOKEN_MISS_LIMIT; i++) {
      const view = await open(waitlist, { token: `unknown${i}` }, ip)
      expect(view.title).toBe("Lien expiré ou invalide")
    }
    expect(db.registrationFindFirst).toHaveBeenCalledTimes(TOKEN_MISS_LIMIT)
    expect((await open(waitlist, { token: "unknown-next" }, ip)).title).toBe("Trop de tentatives")
  })

  it("each page counts its unknown links: confirmation and « Je ne peux pas » too", async () => {
    const ip = freshIp()
    db.confirmationFindUnique.mockResolvedValue(null)
    for (let i = 0; i < 10; i++) await open(await pages.confirmation(), { token: `nope${i}` }, ip)
    db.inviteFindUnique.mockResolvedValue(null)
    for (let i = 0; i < 9; i++) await open(await pages.decline(), { kind: "invitation", token: `nope${i}`, shiftId: "shift1" }, ip)
    // A malformed link counts like an unknown one.
    await open(await pages.decline(), { kind: "invitation", token: "not a token", shiftId: "shift1" }, ip)
    expect(await titleOf(await pages.waitlist(), { token: "realoffer" }, ip)).toBe("Trop de tentatives")
  })

  it("while blocked, a valid, an unknown and a malformed link give the same page", async () => {
    const ip = freshIp()
    await spendMisses(ip)
    vi.clearAllMocks()
    db.registrationFindFirst.mockResolvedValue(offer)

    const waitlist = await pages.waitlist()
    const w = [await open(waitlist, { token: "realoffer" }, ip), await open(waitlist, { token: "unknownx" }, ip), await open(waitlist, { token: "bad token/../x" }, ip)]
    expect(new Set(w.map((v) => v.title + v.html)).size).toBe(1)

    const confirmationPage = await pages.confirmation()
    const c = [await open(confirmationPage, { token: "realconfirmation" }, ip), await open(confirmationPage, { token: "unknownx" }, ip), await open(confirmationPage, { token: "%%%" }, ip)]
    expect(new Set(c.map((v) => v.title + v.html)).size).toBe(1)

    const decline = await pages.decline()
    const d = [
      await open(decline, { kind: "invitation", token: "realinvite", shiftId: "shift1" }, ip),
      await open(decline, { kind: "inscription", token: "unknownx", shiftId: "shift2" }, ip),
      await open(decline, { kind: "other", token: "bad token", shiftId: "../x" }, ip),
    ]
    expect(new Set(d.map((v) => v.title + v.html)).size).toBe(1)

    // The three pages show the same notice in the same card.
    expect(w[0].html).toBe(c[0].html)
    expect(w[0].html).toBe(d[0].html.replace("w-full max-w-md", "max-w-md w-full"))
    expect(lookups()).toBe(0)
  })
})
