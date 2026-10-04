import { describe, it, expect } from "vitest"
import { render } from "../templates"
import type { NotificationPayload } from "../types"

describe("render — HTML wrapper", () => {
  it("sets an explicit text-align:left on the card, not just the outer table cell (regression)", () => {
    // The outer <td align="center"> only centers the CARD on the page — that HTML attribute
    // becomes CSS text-align:center, which is an *inherited* property. Without an explicit
    // override on the card itself, every unstyled heading/paragraph inside (headings and
    // paragraphs in markdown.ts's renderer don't set their own text-align) silently inherited
    // "center" too, instead of reading left-aligned like normal body text — reported by a user
    // as "very bad layout" on the product-update broadcast email.
    const payload: NotificationPayload = {
      kind: "product_update",
      recipient: { email: "admin@example.com", name: "Test" },
      data: { subject: "Nouveautés", content: "# Titre\n\nUn paragraphe.", unsubscribeUrl: "https://example.com/unsub" },
    }
    const { html } = render(payload)
    expect(html).toContain("text-align:left")
    // The card's own declaration must come before any content — confirms it's on the card div,
    // not just reused from the (still present, and correct) centered footer link below it.
    const cardIndex = html.indexOf("text-align:left")
    const contentIndex = html.indexOf("<h1")
    expect(cardIndex).toBeGreaterThan(-1)
    expect(cardIndex).toBeLessThan(contentIndex)
  })
})

describe("render — registration_link_resend", () => {
  it("includes the volunteer's own /my/[editToken] link", () => {
    const payload: NotificationPayload = {
      kind: "registration_link_resend",
      recipient: { email: "v@example.com", name: "Julie Martin" },
      data: { volunteerName: "Julie Martin", eventTitle: "Festival du Rhône", orgSlug: "rhone", editToken: "tok-123" },
    }
    const { subject, html, text } = render(payload)
    expect(subject).toContain("Festival du Rhône")
    expect(html).toContain("tok-123")
    expect(text).toContain("tok-123")
    expect(html).toContain("Julie")
  })
})

describe("render — registration_confirmation message variables", () => {
  it("fills {prénom}, {créneau}, {date} and {heure} in the organizer's message instead of sending them raw (regression)", () => {
    const payload: NotificationPayload = {
      kind: "registration_confirmation",
      recipient: { email: "julie@example.org", name: "Julie Martin" },
      data: {
        volunteerName: "Julie Martin",
        eventTitle: "Festival",
        shifts: [{ label: "Accueil", date: "10/10/2026", startTime: "08:00", endTime: "12:00" }],
        editToken: "edit-tok",
        confirmationMessage: "Merci {prenom} ! {{créneau}} le {date} à {heure}. <b>",
      },
    }
    const { text, html } = render(payload)
    expect(text).toContain("Merci Julie ! Accueil le samedi 10 octobre à 08:00.")
    expect(html).toContain("Merci Julie ! Accueil le samedi 10 octobre à 08:00.")
    expect(html).not.toContain("<b>")
    expect(text).not.toContain("{prenom}")
  })
})

describe("render — registration_confirmation message formatting", () => {
  it("renders the organizer's Markdown in the HTML part, as the hint promises (regression: literal ** in the email)", () => {
    const payload: NotificationPayload = {
      kind: "registration_confirmation",
      recipient: { email: "julie@example.org", name: "Julie Martin" },
      data: {
        volunteerName: "Julie Martin",
        eventTitle: "Festival",
        shifts: [{ label: "Accueil", date: "10/10/2026", startTime: "08:00", endTime: "12:00" }],
        editToken: "edit-tok",
        confirmationMessage: "**Gilet** fourni\n\n- eau\n- casquette",
      },
    }
    const { html } = render(payload)
    expect(html).toMatch(/<strong[^>]*>Gilet<\/strong>/)
    expect(html).toMatch(/<li[^>]*>eau<\/li>/)
    expect(html).not.toContain("**Gilet**")
  })
})
