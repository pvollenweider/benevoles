import { describe, it, expect } from "vitest"
import { publicEventInclude, publicEventPayload, toPublicEvent, type PublicEventRow } from "../public-event"

// #1324: the postes an information page is attached to are for confirmed volunteers reached with
// a personal or leader link, and for emails. They must never reach a public payload: the public
// page, its API, the sign-up page, the embedded page, the group links or the page itself.

const event = {
  id: "evt-1",
  slug: "fete",
  title: "Fête",
  organizationId: "org-1",
  organization: { name: "Association", slug: "asso", volunteerCharter: null, hasOrgInsurance: false, timeZone: "Europe/Zurich", logo: null },
  description: null,
  location: null,
  latitude: null,
  longitude: null,
  startDate: new Date("2026-07-04T00:00:00Z"),
  endDate: new Date("2026-07-05T00:00:00Z"),
  publicInstructions: null,
  confirmationMessage: null,
  requirePhone: false,
  requireEmailConfirmation: false,
  shiftRosterEnabled: false,
  registrationsOpen: true,
  registrationOpensAt: null,
  registrationClosesAt: null,
  accentColorKey: null,
  showSchedule: [],
  workloadProtectionEnabled: false,
  workloadPolicy: null,
  questions: [],
  shifts: [],
  // A wider query could carry the attachment; the public shaping must still drop it.
  pages: [
    { slug: "caisse", title: "Tenir la caisse", displayOrder: 0, roleNames: ["Caisse", "Poste secret"] },
    { slug: "acces", title: "Accès", displayOrder: 1, roleNames: [] },
  ],
} as unknown as PublicEventRow

describe("public event payload and page attachments (#1324)", () => {
  it("includes no attachment and no poste name in the public payload", () => {
    const payload = JSON.stringify(publicEventPayload(event))
    expect(payload).not.toContain("roleNames")
    expect(payload).not.toContain("Poste secret")
    expect(payload).not.toContain("Caisse")
  })

  it("names only the public fields of a page: slug and title", () => {
    const publicEvent = toPublicEvent(event) as { pages: Record<string, unknown>[] }
    expect(publicEvent.pages).toEqual([
      { slug: "caisse", title: "Tenir la caisse" },
      { slug: "acces", title: "Accès" },
    ])
    for (const page of publicEvent.pages) expect(Object.keys(page).sort()).toEqual(["slug", "title"])
  })

  it("selects only slug and title in the shared public query", () => {
    expect(publicEventInclude.pages.select).toEqual({ slug: true, title: true })
  })
})
