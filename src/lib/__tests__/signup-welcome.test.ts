import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"
import { WELCOME_DOC_LINKS, WELCOME_HELP_SLUG, welcomeDocLinks } from "../signup-welcome"
import { render } from "../notifications/templates"

const guide = (slug: string) => readFileSync(path.join(process.cwd(), "guide", `${slug}.md`), "utf8")

describe("welcome email after a confirmed sign-up", () => {
  it.each(WELCOME_DOC_LINKS.map((l) => [l.slug, l.label]))("points to an organisers' guide page under its own title (%s)", (slug, label) => {
    const source = guide(slug)
    expect(source).toMatch(/^roles: \[[^\]]*admin[^\]]*\]$/m)
    expect(source).toMatch(new RegExp(`^# ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"))
  })

  it("points to an existing help page", () => {
    expect(guide(WELCOME_HELP_SLUG)).toMatch(/^# Aide et retours$/m)
  })

  it("builds absolute /doc addresses, quickstart first", () => {
    expect(welcomeDocLinks("https://example.org")[0]).toEqual({ label: "Créer son premier événement", url: "https://example.org/doc/creer-son-premier-evenement" })
  })

  it("keeps the password link and lists every guide link, in text and HTML", () => {
    const email = render({ kind: "signup_account_link", recipient: { email: "a@b.c" }, data: { inviteUrl: "https://example.org/invite/x", days: 7 } })
    expect(email.text).toContain("https://example.org/invite/x")
    expect(email.html).toContain("https://example.org/invite/x")
    for (const l of WELCOME_DOC_LINKS) {
      expect(email.text).toContain(`/doc/${l.slug}`)
      expect(email.html).toContain(`/doc/${l.slug}`)
    }
  })
})
