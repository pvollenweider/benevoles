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

describe("render — registration_confirmation message variables are literal text (#1046)", () => {
  const confirm = (volunteerName: string, confirmationMessage: string) => render({
    kind: "registration_confirmation",
    recipient: { email: "v@example.org", name: volunteerName },
    data: {
      volunteerName,
      eventTitle: "Festival",
      shifts: [{ label: "Accueil", date: "10/10/2026", startTime: "08:00", endTime: "12:00" }],
      editToken: "edit-tok",
      confirmationMessage,
    },
  })

  it("does not turn a first name written as a link, a bare URL or an image into a link or an image", () => {
    for (const name of ["[Payer](https://evil.example)", "https://evil.example/login", "www.evil.example", "![x](https://evil.example/p.png)"]) {
      const { html, text } = confirm(name, "Merci {prénom} !")
      expect(html, name).not.toContain("evil.example\"")
      expect(html, name).not.toMatch(/<a [^>]*href="[^"]*evil/)
      expect(html, name).not.toMatch(/<img [^>]*evil/)
      // The plain-text part keeps the plain substitution.
      expect(text, name).toContain(`Merci ${name} !`)
    }
  })

  it("keeps the organizer's own link working", () => {
    const { html } = confirm("Julie Martin", "[Plan d'accès](https://example.org/plan) pour {prénom}")
    expect(html).toMatch(/<a href="https:\/\/example\.org\/plan"[^>]*>Plan d.accès<\/a> pour Julie/)
  })
})

// #1096: the volunteer's first two emails point to the guide page that explains the next step,
// as words on a text link (not a bare address), and as « label : address » in the text part.
describe("render — guide link in the volunteer's emails", () => {
  it("the confirmation links to « Ma page personnelle »", () => {
    const { html, text } = render({
      kind: "registration_confirmation",
      recipient: { email: "v@example.com", name: "Julie Martin" },
      data: { volunteerName: "Julie Martin", eventTitle: "Festival", orgSlug: "rhone", editToken: "tok-1", shifts: [{ label: "Bar", date: "10/10/2030", startTime: "10:00", endTime: "12:00" }] },
    })
    expect(html).toMatch(/<a href="https?:\/\/[^"]+\/doc\/ma-page-personnelle"[^>]*>Comment fonctionne ta page personnelle<\/a>/)
    expect(text).toMatch(/Comment fonctionne ta page personnelle :\nhttps?:\/\/\S+\/doc\/ma-page-personnelle\n/)
    // The management link stays the email's main action, before the guide.
    expect(html.indexOf("/my/tok-1")).toBeLessThan(html.indexOf("/doc/ma-page-personnelle"))
  })

  it("the member invitation links to « S'inscrire »", () => {
    const { html, text } = render({
      kind: "member_invite",
      recipient: { email: "v@example.com", name: "Julie Martin" },
      data: { memberName: "Julie Martin", organizationName: "Asso", eventTitle: "Festival", eventDate: "10 octobre 2030", eventLocation: null, orgSlug: "rhone", eventSlug: "festival", message: null, token: "inv-1" },
    })
    expect(html).toMatch(/<a href="https?:\/\/[^"]+\/doc\/s-inscrire"[^>]*>Comment s'inscrire, pas à pas<\/a>/)
    expect(text).toMatch(/Comment s'inscrire, pas à pas :\nhttps?:\/\/\S+\/doc\/s-inscrire/)
    expect(html.search(/inv-1/)).toBeLessThan(html.indexOf("/doc/s-inscrire"))
  })
})
