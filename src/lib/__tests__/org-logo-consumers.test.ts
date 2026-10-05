import { describe, it, expect } from "vitest"
import { renderBadges, type BadgeData } from "../print-badges"
import { renderSheet, type SheetData } from "../print-sheets"
import { toPublicEvent, type PublicEventRow } from "../public-event"
import { render } from "../notifications/templates"
import { EMAIL_CARD_OPEN, withOrgLogo } from "../notifications/templates/shared"
import type { NotificationPayload } from "../notifications/types"

// Where the organization's logo (#300) shows: always beside the organization's name, never alone.

const logo = { src: "/api/public/organizations/org-1/logo?v=0123456789abcdef", width: 512, height: 256 }

describe("printed sheets and badges", () => {
  const sheet: SheetData = { eventTitle: "Fête", organizationName: "Club du Rhône", printedAt: "01.07.26 10:00", shifts: [], leaders: [] }

  it("puts the logo in the sheet header, decorative and grey, the name still written", () => {
    const html = renderSheet("phones", { ...sheet, logo })
    expect(html).toContain(`<img class="org-logo" src="${logo.src.replaceAll("&", "&amp;")}" alt="" width="112" height="56">`)
    expect(html).toContain("filter: grayscale(1)")
    expect(html).toContain("Club du Rhône")
    expect(renderSheet("phones", sheet)).not.toContain("<img")
  })

  const badges: BadgeData = {
    eventTitle: "Fête",
    organizationName: "Club du Rhône",
    shifts: [{ id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "18:00", endTime: "23:00", capacity: 2, registrations: [{ id: "v1", firstName: "Alice", lastName: "M", email: null, phone: null }] }],
  }

  it("puts the logo on each badge, beside the band with the organization's name", () => {
    const html = renderBadges({ ...badges, logo })
    expect(html).toContain('<li class="badge has-logo">')
    expect(html).toMatch(/<img class="logo" src="[^"]+" alt="" width="\d+" height="\d+">/)
    expect(html).toContain("Club du Rhône · Fête")
    expect(renderBadges(badges)).not.toContain("<img")
  })

  it("greys the logo when the badges are printed in black and white", () => {
    expect(renderBadges({ ...badges, logo }, { role: null, volunteer: null, lastName: true, shifts: true, color: "none" })).toContain('<main class="mono">')
    expect(renderBadges({ ...badges, logo })).toContain("<main>")
  })
})

describe("public event payload", () => {
  const row = {
    id: "e", organizationId: "org-1", slug: "fete", title: "Fête", description: null, location: null, startDate: new Date(), endDate: new Date(),
    publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [], pages: [], shifts: [],
    organization: { name: "Org", slug: "org", volunteerCharter: null, timeZone: null, logo: { hash: "0123456789abcdef" + "0".repeat(48), width: 300, height: 100 } },
  } as unknown as PublicEventRow

  it("carries the logo's URL and size, never its bytes", () => {
    expect(toPublicEvent(row).organizationLogo).toEqual({ src: "/api/public/organizations/org-1/logo?v=0123456789abcdef", width: 300, height: 100 })
    const none = { ...row, organization: { ...row.organization, logo: null } } as unknown as PublicEventRow
    expect(toPublicEvent(none).organizationLogo).toBeNull()
  })
})

describe("emails", () => {
  const payload = {
    kind: "registration_link_resend",
    recipient: { email: "alice@example.org", name: "Alice" },
    data: { volunteerName: "Alice Martin", eventTitle: "Fête", orgSlug: "org", editToken: "tok" },
  } as unknown as NotificationPayload

  it("adds the hosted logo at the top of the card, with the organization's name as alt", () => {
    const plain = render(payload)
    const branded = render(payload, { organizationName: "Club du Rhône", logo, baseUrl: "https://club.benevol.app" })
    expect(plain.html).not.toContain("<img")
    expect(branded.html).toContain(`${EMAIL_CARD_OPEN}\n<div style="margin:0 0 24px"><img src="https://club.benevol.app${logo.src}" alt="Club du Rhône"`)
    // The text version and the subject don't change.
    expect(branded.text).toBe(plain.text)
    expect(branded.subject).toBe(plain.subject)
    expect(render(payload, { organizationName: "Club", logo: null, baseUrl: "https://x" }).html).toBe(plain.html)
  })

  it("leaves an email without the card untouched", () => {
    expect(withOrgLogo("<p>hi</p>", "<img>")).toBe("<p>hi</p>")
    expect(withOrgLogo(`${EMAIL_CARD_OPEN}x`, null)).toBe(`${EMAIL_CARD_OPEN}x`)
  })
})
