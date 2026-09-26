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
