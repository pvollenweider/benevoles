/**
 * Length, count and range limits on the organisers' fields: a value over its limit answers 400
 * before anything is read or written. The limits are defined once (text-limits.ts, signup-limits.ts,
 * staffing.ts) and the cases below are built from those constants, never from copies of the numbers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  MEMBER_NAME_MAX, MEMBER_PHONE_MAX, MEMBER_TAG_MAX, MEMBER_TAGS_MAX, SHOW_SCHEDULE_MAX, SHOW_TIME_MAX,
} from "@/lib/text-limits"
import { SIGNUP_COMMENT_MAX, SIGNUP_ID_MAX } from "@/lib/signup-limits"
import { SHIFT_PLACES_MAX } from "@/lib/staffing"

const state = vi.hoisted(() => ({ calls: [] as string[] }))
const client = vi.hoisted(() => {
  const model = (name: string) => new Proxy({}, {
    get: (_m, op) => () => { state.calls.push(`${name}.${String(op)}`); return Promise.resolve(null) },
  })
  const c: unknown = new Proxy({}, {
    get: (_t, name) => {
      if (name === "then") return undefined
      if (name === "$extends") return () => c
      if (name === "$transaction" || name === "$queryRaw" || name === "$executeRaw") return () => { state.calls.push(String(name)); return Promise.resolve(null) }
      return model(String(name))
    },
  })
  return c
})
vi.mock("@/lib/prisma", () => ({ prisma: client }))
vi.mock("@/lib/auth-guard", () => {
  const ok = () => Promise.resolve({
    session: { user: { id: "adm-1", name: "Luc Berset", email: "luc.berset@example.org", role: "admin", organizationId: "org-a" } },
    organizationId: "org-a",
    db: client,
    access: "organizer" as const,
    grant: null,
  })
  return { requireOrgSession: ok, requireSuperAdmin: ok, requireFrontDeskOrOrganizer: ok }
})
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("@/lib/notifications", () => ({ sendNotification: () => Promise.resolve({ ok: true }) }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: () => Promise.resolve([]), deliverAfterResponse: () => {} }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

const anyParams = () => ({ params: Promise.resolve(new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : "x") })) })
async function send(route: string, method: string, body: unknown): Promise<number | "threw"> {
  const mod = await import(`@/app/api/${route}/route`)
  const req = new Request(`http://localhost/api/${route}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  try { return (await mod[method](req, anyParams())).status } catch { return "threw" }
}

const text = (n: number) => "a".repeat(n)

type Case = [label: string, route: string, method: string, body: Record<string, unknown>]
const refused = (cases: Case[]) => cases

const registration = { eventId: "evt-1", shiftId: "shf-1", firstName: "Ana", lastName: "Roth", email: "ana.roth@example.org" }
const member = { firstName: "Ana", lastName: "Roth" }
const event = { title: "Fête du village", startDate: "2027-06-12", endDate: "2027-06-14" }
const shift = { eventId: "evt-1", roleName: "Bar", label: "Matin", date: "2027-06-12", startTime: "09:00", endTime: "12:00", capacity: SHIFT_PLACES_MAX * 2 }
const show = { name: "Concert", date: "2027-06-12", startTime: "20:00", endTime: "22:00" }

const REFUSED = refused([
  ["admin registration: first name over the member cap", "admin/registrations", "POST", { ...registration, firstName: text(MEMBER_NAME_MAX + 1) }],
  ["admin registration: 200 000-character first name", "admin/registrations", "POST", { ...registration, firstName: text(200_000) }],
  ["admin registration: last name over the member cap", "admin/registrations", "POST", { ...registration, lastName: text(MEMBER_NAME_MAX + 1) }],
  ["admin registration: phone over the member cap", "admin/registrations", "POST", { ...registration, phone: text(MEMBER_PHONE_MAX + 1) }],
  ["admin registration: comment over the sign-up cap", "admin/registrations", "POST", { ...registration, comment: text(SIGNUP_COMMENT_MAX + 1) }],
  ["admin registration: event id over the id cap", "admin/registrations", "POST", { ...registration, eventId: text(SIGNUP_ID_MAX + 1) }],
  ["admin registration: shift id over the id cap", "admin/registrations", "POST", { ...registration, shiftId: text(SIGNUP_ID_MAX + 1) }],
  ["admin registration: a shift id of the list over the id cap", "admin/registrations", "POST", { ...registration, shiftId: undefined, shiftIds: [text(SIGNUP_ID_MAX + 1)] }],
  ["admin registration: member id over the id cap", "admin/registrations", "POST", { ...registration, volunteerId: text(SIGNUP_ID_MAX + 1) }],

  ["new member: too many tags", "admin/members", "POST", { ...member, tags: Array.from({ length: MEMBER_TAGS_MAX + 1 }, (_, i) => `t${i}`) }],
  ["new member: a tag too long", "admin/members", "POST", { ...member, tags: [text(MEMBER_TAG_MAX + 1)] }],
  ["new member: first name over the cap", "admin/members", "POST", { ...member, firstName: text(MEMBER_NAME_MAX + 1) }],
  ["new member: phone over the cap", "admin/members", "POST", { ...member, phone: text(MEMBER_PHONE_MAX + 1) }],
  ["member: too many tags", "admin/members/[id]", "PATCH", { tags: Array.from({ length: MEMBER_TAGS_MAX + 1 }, (_, i) => `t${i}`) }],
  ["member: a tag too long", "admin/members/[id]", "PATCH", { tags: [text(MEMBER_TAG_MAX + 1)] }],
  ["member: last name over the cap", "admin/members/[id]", "PATCH", { lastName: text(MEMBER_NAME_MAX + 1) }],

  ["new event: too many shows", "admin/events", "POST", { ...event, showSchedule: Array.from({ length: SHOW_SCHEDULE_MAX + 1 }, () => show) }],
  ["new event: a show time too long", "admin/events", "POST", { ...event, showSchedule: [{ ...show, startTime: text(SHOW_TIME_MAX + 1) }] }],
  ["event: too many shows", "admin/events/[id]", "PATCH", { showSchedule: Array.from({ length: SHOW_SCHEDULE_MAX + 1 }, () => show) }],
  ["event: a show time too long", "admin/events/[id]", "PATCH", { showSchedule: [{ ...show, endTime: text(10_000) }] }],

  ["role: minimum with a fraction", "admin/events/[id]/roles/[roleName]", "PATCH", { minVolunteers: 1.5 }],
  ["role: minimum of 0", "admin/events/[id]/roles/[roleName]", "PATCH", { minVolunteers: 0 }],
  ["role: negative minimum", "admin/events/[id]/roles/[roleName]", "PATCH", { minVolunteers: -3 }],
  ["role: minimum over the bound", "admin/events/[id]/roles/[roleName]", "PATCH", { minVolunteers: SHIFT_PLACES_MAX + 1 }],
  ["new shift: minimum with a fraction", "admin/shifts", "POST", { ...shift, minVolunteers: 2.5 }],
  ["new shift: minimum of 0", "admin/shifts", "POST", { ...shift, minVolunteers: 0 }],
  ["new shift: minimum over the bound", "admin/shifts", "POST", { ...shift, minVolunteers: SHIFT_PLACES_MAX + 1 }],
  ["shift: minimum with a fraction", "admin/shifts/[id]", "PATCH", { minVolunteers: 2.5 }],
  ["shift: minimum over the bound", "admin/shifts/[id]", "PATCH", { minVolunteers: SHIFT_PLACES_MAX + 1, capacity: SHIFT_PLACES_MAX * 2 }],
])

describe("fields with a length, count or range limit", () => {
  beforeEach(() => { state.calls.length = 0 })

  it.each(REFUSED)("%s answers 400 and touches nothing", async (_label, route, method, body) => {
    expect(await send(route, method, body)).toBe(400)
    expect(state.calls).toEqual([])
  })

  it.each([
    ["admin registration at every cap", "admin/registrations", "POST", { ...registration, firstName: text(MEMBER_NAME_MAX), lastName: text(MEMBER_NAME_MAX), phone: text(MEMBER_PHONE_MAX), comment: text(SIGNUP_COMMENT_MAX), eventId: text(SIGNUP_ID_MAX) }],
    ["member with the most tags", "admin/members", "POST", { ...member, tags: Array.from({ length: MEMBER_TAGS_MAX }, () => text(MEMBER_TAG_MAX)) }],
    ["event with the most shows", "admin/events", "POST", { ...event, showSchedule: Array.from({ length: SHOW_SCHEDULE_MAX }, () => show) }],
    ["role minimum at the bound", "admin/events/[id]/roles/[roleName]", "PATCH", { minVolunteers: SHIFT_PLACES_MAX }],
    ["shift minimum of 1", "admin/shifts", "POST", { ...shift, minVolunteers: 1 }],
  ] as Case[])("%s is not refused for its size", async (_label, route, method, body) => {
    expect(await send(route, method, body)).not.toBe(400)
  })
})
