// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * General emails carry the organisation-wide personal link (#1429, lot B): one « Mes inscriptions »
 * button, its scope sentence, and no event personal link. Event-specific action emails keep their
 * own link. Also verifies that the lazy issue happens once per volunteer for a batch of emails.
 */

import { describe, it, expect, vi } from "vitest"
import { render } from "../templates"
import { ORG_EMAIL_SCOPE_SENTENCE } from "../../org-personal-page"
import { attachOrgLinks, isOrgLinkEmail } from "../../org-link-email"
import type { NotificationPayload } from "../types"

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://www.benevol.app"
})

const recipient = { email: "julie@example.com", name: "Julie Martin" }
const org = { orgSlug: "rhone", orgToken: "org-tok", organizationName: "Rhône Rocks" }
const scope = ORG_EMAIL_SCOPE_SENTENCE("Rhône Rocks")
const shift = { label: "Accueil", date: "samedi 12 juillet", startTime: "09:00", endTime: "12:30" }

const reminder = {
  volunteerName: "Julie Martin",
  eventTitle: "Festival du Rhône",
  shifts: [{ ...shift, roleName: "Accueil" }],
  editToken: "event-tok",
  hoursUntil: 3,
  ...org,
}

const general: [string, NotificationPayload][] = [
  ["registration_confirmation", {
    kind: "registration_confirmation",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shifts: [shift], editToken: "event-tok", ...org },
  }],
  ["registration_confirmation (grouped)", {
    kind: "registration_confirmation",
    recipient,
    data: { addedShifts: true, volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shifts: [shift], editToken: "event-tok", ...org },
  }],
  ["registration_added_by_organizer", {
    kind: "registration_added_by_organizer",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", organizerName: "Marc", shifts: [{ ...shift, roleName: "Accueil" }], editToken: "event-tok", ...org },
  }],
  ["registration_restored", {
    kind: "registration_restored",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", status: "active", shift: { ...shift, roleName: "Accueil" }, editToken: "event-tok", ...org },
  }],
  ["registration_removed", {
    kind: "registration_removed",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", eventSlug: "festival", shifts: [{ ...shift, roleName: "Accueil" }], editToken: "event-tok", ...org },
  }],
  ["reminder_j2", { kind: "reminder_j2", recipient, data: reminder }],
  ["reminder_j1", { kind: "reminder_j1", recipient, data: reminder }],
  ["reminder_dd", { kind: "reminder_dd", recipient, data: reminder }],
  ["reminder_rule", { kind: "reminder_rule", recipient, data: { ...reminder, ruleHours: 24 } }],
  ["manual_reminder", {
    kind: "manual_reminder",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", customMessage: "N'oublie pas ton gilet.", shifts: [{ ...shift, roleName: "Accueil" }], editToken: "event-tok", ...org },
  }],
  ["targeted_message", {
    kind: "targeted_message",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", subject: "Parking", message: "Entrée par la rue Basse.", shifts: [{ ...shift, roleName: "Accueil" }], editToken: "event-tok", ...org },
  }],
  ["shift_modified", {
    kind: "shift_modified",
    recipient,
    data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shiftLabel: "Accueil", oldDate: "samedi 12 juillet", newDate: "dimanche 13 juillet", oldStart: "09:00", newStart: "10:00", oldEnd: "12:00", newEnd: "13:00", editToken: "event-tok", ...org },
  }],
]

describe("general emails carry the organisation-wide link (#1429, lot B)", () => {
  it.each(general)("%s: one « Mes inscriptions » button, its scope, no event link", (_name, payload) => {
    const out = render(payload)
    expect(out.html).toContain("https://rhone.benevol.app/mes-inscriptions/org-tok")
    expect(out.text).toContain("https://rhone.benevol.app/mes-inscriptions/org-tok")
    expect(out.html).toContain(scope)
    expect(out.text).toContain(scope)
    expect(out.html).toContain(">Mes inscriptions</a>")
    expect(out.html).not.toContain("/my/event-tok")
    expect(out.text).not.toContain("/my/event-tok")
  })

  it("keeps the event personal link when the payload has no organisation token (previews, older rows)", () => {
    const out = render({
      kind: "registration_confirmation",
      recipient,
      data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shifts: [shift], editToken: "event-tok", orgSlug: "rhone" },
    })
    expect(out.html).toContain("/my/event-tok")
    expect(out.html).toContain("Gérer mes inscriptions")
    expect(out.html).not.toContain("/mes-inscriptions/")
  })

  it("leaves event-specific action links as they are, even if an org token is present", () => {
    const requested = render({
      kind: "registration_requested",
      recipient,
      data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shifts: [shift], editToken: "event-tok", ...org },
    })
    expect(requested.html).toContain("/my/event-tok")
    expect(requested.html).toContain("Suivre ma demande")
    expect(requested.html).not.toContain("/mes-inscriptions/")
    expect(requested.text).not.toContain(scope)

    const offered = render({
      kind: "waitlist_offered",
      recipient,
      data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", shiftLabel: "Accueil", shiftDate: "samedi 12 juillet", shiftStart: "09:00", shiftEnd: "12:30", confirmUrl: "https://rhone.benevol.app/confirmation/tok", expiresAt: "demain 18:00", ...org },
    })
    expect(offered.html).toContain("Confirmer ma participation")
    expect(offered.html).not.toContain("/mes-inscriptions/")

    const swap = render({
      kind: "shift_swap_offered",
      recipient,
      data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", otherName: "Léa", gives: { ...shift, roleName: "Accueil" }, receives: { ...shift, roleName: "Bar" }, deadline: "demain 18:00", editToken: "event-tok", ...org },
    })
    expect(swap.html).toContain("/my/event-tok#echanges")
    expect(swap.html).not.toContain("/mes-inscriptions/")
    expect(swap.text).not.toContain(scope)
  })
})

describe("the organisation link's lead line and plain-text order (#1429, lot B)", () => {
  const button = ">Mes inscriptions</a>"
  const url = "https://rhone.benevol.app/mes-inscriptions/org-tok"
  const j2Open = "Un empêchement ? Préviens-nous le plus vite possible depuis ta page « Mes inscriptions »."
  const j2Closed = "Un empêchement ? Vois qui prévenir sur ta page « Mes inscriptions »."
  const lastMinute = "Un empêchement de dernière minute ? Préviens-nous vite depuis ta page « Mes inscriptions »."

  it.each(["reminder_j2", "reminder_rule"] as const)("%s puts the cancellation lead before the button", (kind) => {
    const out = render({ kind, recipient, data: { ...reminder, ...(kind === "reminder_rule" ? { ruleHours: 24 } : {}) } } as NotificationPayload)
    expect(out.html).toContain(j2Open)
    expect(out.html.indexOf(j2Open)).toBeLessThan(out.html.indexOf(button))
    // The plain text reads lead, then URL, then the scope sentence.
    expect(out.text.indexOf(j2Open)).toBeLessThan(out.text.indexOf(url))
    expect(out.text.indexOf(url)).toBeLessThan(out.text.indexOf(scope))
  })

  it("reminder_j2 uses the closed lead when the cancellation deadline passed", () => {
    const out = render({ kind: "reminder_j2", recipient, data: { ...reminder, cancelClosed: true } } as NotificationPayload)
    expect(out.html).toContain(j2Closed)
    expect(out.html.indexOf(j2Closed)).toBeLessThan(out.html.indexOf(button))
    expect(out.text).toContain(j2Closed)
  })

  it.each(["reminder_j1", "reminder_dd"] as const)("%s puts the last-minute lead before the button", (kind) => {
    const out = render({ kind, recipient, data: reminder } as NotificationPayload)
    expect(out.html).toContain(lastMinute)
    expect(out.html.indexOf(lastMinute)).toBeLessThan(out.html.indexOf(button))
    // The same-day plain text used to carry the bare URL: the lead now comes first.
    expect(out.text.indexOf(lastMinute)).toBeLessThan(out.text.indexOf(url))
    expect(out.text.indexOf(url)).toBeLessThan(out.text.indexOf(scope))
  })

  it.each([
    ["manual_reminder", { ...reminder, customMessage: "Message" }],
    ["targeted_message", { ...reminder, subject: "Sujet", message: "Message" }],
  ] as const)("%s puts the URL on its own line, then the scope", (kind, data) => {
    const out = render({ kind, recipient, data } as NotificationPayload)
    expect(out.text).toContain(`Ta page « Mes inscriptions » :\n${url}\n${scope}`)
  })

  it.each(["registration_restored", "registration_added_by_organizer"] as const)("%s names the page and its cancellation scope", (kind) => {
    const data = kind === "registration_restored"
      ? { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", status: "active", shift: { ...shift, roleName: "Accueil" }, editToken: "event-tok", ...org }
      : { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", organizerName: "Marc", shifts: [{ ...shift, roleName: "Accueil" }], editToken: "event-tok", ...org }
    const out = render({ kind, recipient, data } as NotificationPayload)
    expect(out.text).toContain("Ta page « Mes inscriptions » :")
    expect(out.text).toContain("Annule-le depuis ta page « Mes inscriptions », ou réponds à cet email.")
    expect(out.text).not.toContain("ton lien personnel")
  })

  it("keeps the old wording when there is no organisation token", () => {
    const out = render({
      kind: "registration_restored",
      recipient,
      data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", status: "active", shift: { ...shift, roleName: "Accueil" }, editToken: "event-tok" },
    })
    expect(out.text).toContain("Ton lien personnel pour gérer tes inscriptions :")
    expect(out.text).toContain("Annule-le depuis ton lien personnel, ou réponds à cet email.")
  })
})

describe("attachOrgLinks: one lazy issue per volunteer", () => {
  function fakeDb() {
    const calls = { findFirst: 0, updateMany: 0 }
    let row: { orgLinkTokenHash: string | null; orgLinkTokenEnc: string | null; orgLinkTokenLegacy: string | null; orgLinkIssuedAt: Date | null } = {
      orgLinkTokenHash: null,
      orgLinkTokenEnc: null,
      orgLinkTokenLegacy: null,
      orgLinkIssuedAt: null,
    }
    const db = {
      volunteer: {
        findFirst: async (args: { select: Record<string, unknown> }) => {
          calls.findFirst++
          if ("organization" in args.select) return { organization: { name: "Rhône Rocks" } }
          return row
        },
        updateMany: async (args: { data: typeof row }) => {
          calls.updateMany++
          row = { ...row, ...args.data }
          return { count: 1 }
        },
      },
    }
    return { db, calls }
  }

  const confirmation = (eventTitle: string): NotificationPayload => ({
    kind: "registration_confirmation",
    recipient,
    volunteerId: "vol-1",
    organizationId: "org-1",
    data: { volunteerName: "Julie Martin", eventTitle, shifts: [shift], editToken: "event-tok", orgSlug: "rhone" },
  })

  it("issues one token for two general emails of the same volunteer in one batch", async () => {
    const { db, calls } = fakeDb()
    const payloads = await attachOrgLinks([confirmation("Festival"), confirmation("Festival (ajout)")], db)
    expect(calls.updateMany).toBe(1)
    expect(payloads[0].data.orgToken).toBe(payloads[1].data.orgToken)
    expect(payloads[0].data.organizationName).toBe("Rhône Rocks")
    expect(payloads[1].data.organizationName).toBe("Rhône Rocks")
  })

  it("reuses an existing token without writing", async () => {
    const { db, calls } = fakeDb()
    const first = await attachOrgLinks([confirmation("Festival")], db)
    const second = await attachOrgLinks([confirmation("Festival (ajout)")], db)
    expect(calls.updateMany).toBe(1)
    expect(second[0].data.orgToken).toBe(first[0].data.orgToken)
  })

  it("does not touch event-specific emails or payloads without a member", async () => {
    const { db, calls } = fakeDb()
    const swap: NotificationPayload = {
      kind: "shift_swap_offered",
      recipient,
      volunteerId: "vol-1",
      organizationId: "org-1",
      data: { volunteerName: "Julie Martin", eventTitle: "Festival", shift: shift, editToken: "event-tok" },
    }
    const anonymous: NotificationPayload = { ...confirmation("Festival"), volunteerId: undefined }
    expect(isOrgLinkEmail(swap)).toBe(false)
    expect(isOrgLinkEmail(anonymous)).toBe(false)
    const payloads = await attachOrgLinks([swap, anonymous], db)
    expect(calls.updateMany).toBe(0)
    expect(payloads[0].data.orgToken).toBeUndefined()
  })
})
