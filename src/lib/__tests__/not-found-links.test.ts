import { describe, it, expect } from "vitest"
import { notFoundLinks } from "../not-found-links"

const SITE = "https://www.benevol.app"

describe("notFoundLinks", () => {
  it("on the apex: back to the home, then the main pages of the site", () => {
    const { primary, note, links } = notFoundLinks(null, "www.benevol.app", SITE)
    expect(primary).toEqual({ href: "/", label: "Retour à l'accueil" })
    expect(note).toBeNull()
    expect(links.map((l) => [l.label, l.href])).toEqual([
      ["Fonctionnalités", "/fonctionnalites"],
      ["Documentation", "/doc"],
      ["Guide bénévole", "/doc/benevole"],
      ["Guide des organisateurs", "/doc/admin"],
      ["Tutoriels vidéo", "/videos"],
      ["Espace organisateur", "/admin/login"],
    ])
  })

  it("on an organization's host: back to its events, at the root of that host", () => {
    const { primary, note, links } = notFoundLinks({ slug: "festival" }, "festival.benevol.app", SITE)
    expect(primary).toEqual({ href: "/", label: "Voir les événements" })
    expect(note).toMatch(/e-mail de confirmation/)
    expect(links.map((l) => l.href)).toEqual(["/doc/benevole", "/doc", "/videos", "/admin/login"])
  })

  it("an organization without its subdomain (localhost, ?org=) keeps it in the link", () => {
    expect(notFoundLinks({ slug: "la fête" }, "localhost:3000", SITE).primary.href).toBe("/?org=la%20f%C3%AAte")
    // A system subdomain is not an organization's host either.
    expect(notFoundLinks({ slug: "default" }, "www.benevol.app", SITE).primary.href).toBe("/?org=default")
  })

  it("never says « tu » nor « vous »: volunteers and organizers both land here", () => {
    const all = [notFoundLinks(null, "benevol.app", SITE), notFoundLinks({ slug: "a" }, "a.benevol.app", SITE)]
    const text = all.flatMap(({ primary, note, links }) => [primary.label, note ?? "", ...links.flatMap((l) => [l.label, l.description])]).join(" ")
    expect(text).not.toMatch(/\b(tu|te|toi|ton|ta|tes|vous|votre|vos)\b|\bt'/i)
  })

  // Regression: on the subdomain of no organisation, « Retour à l'accueil » led back to the same
  // host, itself a 404. Every link now leads to the main site.
  it("on the subdomain of no organisation, every link leads to the main site", () => {
    const { primary, links } = notFoundLinks(null, "zzzz-nope.benevol.app", SITE)
    expect(primary.href).toBe("https://www.benevol.app/")
    for (const link of links) expect(link.href, link.label).toMatch(/^https:\/\/www\.benevol\.app\//)
  })

  it("keeps relative links on the main site itself and locally", () => {
    for (const host of ["www.benevol.app", "benevol.app", "localhost:3000"]) {
      const { primary, links } = notFoundLinks(null, host, SITE)
      expect(primary.href, host).toBe("/")
      expect(links.every((l) => l.href.startsWith("/")), host).toBe(true)
    }
  })
})
