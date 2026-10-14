import { describe, it, expect } from "vitest"
import {
  EVENT_PAGE_LABEL, ORG_HOME_LABEL, SIGN_UP_MORE_LABEL,
  bottomLink, emptyPageLink, signUpUrl, volunteerGroupCode,
} from "../personal-page-links"

const TZ = "Europe/Zurich"
const NOW = new Date("2026-07-01T10:00:00Z")
const URL_LOCAL = "http://localhost:3000/fete?org=asso-a"
const URL_PROD = "https://asso-a.benevol.app/fete"
const open = { publicStatus: "published", registrationsOpen: true, endDate: "2026-07-04T00:00:00.000Z" }
const input = (event: Partial<typeof open> & Record<string, unknown> = {}, more: { groupCode?: string | null; now?: Date; eventUrl?: string } = {}) => ({
  event: { ...open, ...event },
  eventUrl: more.eventUrl ?? URL_PROD,
  groupCode: more.groupCode ?? null,
  now: more.now ?? NOW,
  timeZone: TZ,
})

// « S'inscrire à d'autres créneaux » on the personal page (#988).
describe("signUpUrl", () => {
  it("is the event's public page while sign-ups are open", () => {
    expect(signUpUrl(input())).toBe(URL_PROD)
  })

  it("keeps the organisation locally (?org=, #982)", () => {
    expect(signUpUrl(input({}, { eventUrl: URL_LOCAL }))).toBe(URL_LOCAL)
  })

  it("keeps the volunteer's group link, and the organisation with it", () => {
    expect(signUpUrl(input({}, { groupCode: "abcd2345" }))).toBe(`${URL_PROD}?groupe=abcd2345`)
    const local = new URL(signUpUrl(input({}, { eventUrl: URL_LOCAL, groupCode: "abcd2345" }))!)
    expect(local.pathname).toBe("/fete")
    expect(Object.fromEntries(local.searchParams)).toEqual({ org: "asso-a", groupe: "abcd2345" })
  })

  it("is null when sign-ups are closed by the switch", () => {
    expect(signUpUrl(input({ registrationsOpen: false }))).toBeNull()
  })

  it("is null before the window opens and once it has closed", () => {
    expect(signUpUrl(input({ registrationOpensAt: "2026-07-02T08:00:00Z" } as never))).toBeNull()
    expect(signUpUrl(input({ registrationClosesAt: "2026-07-01T09:00:00Z" } as never))).toBeNull()
    expect(signUpUrl(input({ registrationClosesAt: "2026-07-01T12:00:00Z" } as never))).toBe(URL_PROD)
  })

  it("is null for an archived or draft event", () => {
    expect(signUpUrl(input({ publicStatus: "archived" }))).toBeNull()
    expect(signUpUrl(input({ publicStatus: "draft" }))).toBeNull()
  })

  it("is null once the event's last day is over in the organisation's zone, not before", () => {
    // Last day 4 July: still open that whole day, Zurich time.
    expect(signUpUrl(input({}, { now: new Date("2026-07-04T21:30:00Z") }))).toBe(URL_PROD)
    // 00:30 on 5 July in Zurich (22:30 UTC on the 4th): over.
    expect(signUpUrl(input({}, { now: new Date("2026-07-04T22:30:00Z") }))).toBeNull()
  })
})

describe("volunteerGroupCode", () => {
  const reg = (id: string, createdAt: string, code?: string) => ({ id, createdAt, groupLink: code ? { code } : null })

  it("is the group link of the registration that opened the page", () => {
    expect(volunteerGroupCode([reg("a", "2026-06-01", "pompiers"), reg("b", "2026-06-02", "foot2345")], "a")).toBe("pompiers")
  })

  it("else the most recent registration that came through one", () => {
    expect(volunteerGroupCode([reg("a", "2026-06-03"), reg("b", "2026-06-01", "old23456"), reg("c", "2026-06-02", "new23456")], "a")).toBe("new23456")
  })

  it("is null without a group link (main link, or a deleted group link)", () => {
    expect(volunteerGroupCode([reg("a", "2026-06-01"), reg("b", "2026-06-02")], "a")).toBeNull()
    expect(volunteerGroupCode([], "a")).toBeNull()
  })
})

describe("bottomLink and emptyPageLink", () => {
  const orgHomeUrl = "https://asso-a.benevol.app"

  it("no bottom link while the sign-up link is shown: it goes to the same page", () => {
    expect(bottomLink({ signUpUrl: URL_PROD, eventPageUrl: URL_PROD, orgHomeUrl })).toBeNull()
  })

  it("the event page when sign-ups are closed but the event is published", () => {
    expect(bottomLink({ signUpUrl: null, eventPageUrl: URL_PROD, orgHomeUrl })).toEqual({ href: URL_PROD, label: EVENT_PAGE_LABEL })
  })

  it("the organisation's home once the event is no longer published", () => {
    expect(bottomLink({ signUpUrl: null, eventPageUrl: null, orgHomeUrl })).toEqual({ href: orgHomeUrl, label: ORG_HOME_LABEL })
  })

  it("after the last withdrawal: sign up again while possible, else the same fallback", () => {
    expect(emptyPageLink({ signUpUrl: URL_PROD, eventPageUrl: URL_PROD, orgHomeUrl })).toEqual({ href: URL_PROD, label: SIGN_UP_MORE_LABEL })
    expect(emptyPageLink({ signUpUrl: null, eventPageUrl: URL_PROD, orgHomeUrl }).label).toBe(EVENT_PAGE_LABEL)
    expect(emptyPageLink({ signUpUrl: null, eventPageUrl: null, orgHomeUrl }).label).toBe(ORG_HOME_LABEL)
  })
})
