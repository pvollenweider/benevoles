import { describe, it, expect } from "vitest"
import { notFoundLinks } from "../not-found-links"

describe("notFoundLinks", () => {
  it("on the apex: back to the home, then the main pages of the site", () => {
    const { primary, note, links } = notFoundLinks(null, "www.benevol.app")
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
    const { primary, note, links } = notFoundLinks({ slug: "festival" }, "festival.benevol.app")
    expect(primary).toEqual({ href: "/", label: "Voir les événements" })
    expect(note).toMatch(/e-mail de confirmation/)
    expect(links.map((l) => l.href)).toEqual(["/doc/benevole", "/doc", "/videos", "/admin/login"])
  })

  it("an organization without its subdomain (localhost, ?org=) keeps it in the link", () => {
    expect(notFoundLinks({ slug: "la fête" }, "localhost:3000").primary.href).toBe("/?org=la%20f%C3%AAte")
    // A system subdomain is not an organization's host either.
    expect(notFoundLinks({ slug: "default" }, "www.benevol.app").primary.href).toBe("/?org=default")
  })

  it("never says « tu » nor « vous »: volunteers and organizers both land here", () => {
    const all = [notFoundLinks(null, "benevol.app"), notFoundLinks({ slug: "a" }, "a.benevol.app")]
    const text = all.flatMap(({ primary, note, links }) => [primary.label, note ?? "", ...links.flatMap((l) => [l.label, l.description])]).join(" ")
    expect(text).not.toMatch(/\b(tu|te|toi|ton|ta|tes|vous|votre|vos)\b|\bt'/i)
  })
})
