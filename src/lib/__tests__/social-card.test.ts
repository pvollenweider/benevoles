import { describe, it, expect } from "vitest"
import { SOCIAL_CARD_FOOTER, socialCardFor, socialCardPaths, socialCardTitleSize } from "../social-card"
import { PUBLIC_PAGES } from "../doc-pages"
import { loadDocUnits, type DocUnit } from "../doc-units"

const unit = { slug: "liste-d-attente", title: "Liste d'attente", roles: ["admin", "benevole"], group: "regles", summary: "Résumé." } as DocUnit

describe("socialCardFor", () => {
  it("shows a unit's group, title, summary and audience", () => {
    expect(socialCardFor("/doc/liste-d-attente", [unit])).toEqual({
      eyebrow: "Documentation, Règles d'inscription",
      title: "Liste d'attente",
      detail: "Résumé.",
      footer: "Pour les organisateurs et les bénévoles",
    })
  })

  it("shows a public page's section, title and summary", () => {
    expect(socialCardFor("/doc/admin", [])).toMatchObject({ eyebrow: "Documentation", title: "Guide administrateur", footer: SOCIAL_CARD_FOOTER })
    expect(socialCardFor("/legal/privacy", [])).toMatchObject({ eyebrow: "Informations légales", title: "Politique de confidentialité" })
    expect(socialCardFor("/fonctionnalites", [])).toMatchObject({ eyebrow: "Présentation" })
  })

  it("has no card for an unknown page, or a unit path outside /doc", () => {
    expect(socialCardFor("/doc/nope", [unit])).toBeNull()
    expect(socialCardFor("/liste-d-attente", [unit])).toBeNull()
  })

  it("never writes an em dash or a middle dot (copy rules)", () => {
    const units = loadDocUnits()
    for (const p of socialCardPaths(units)) expect(JSON.stringify(socialCardFor(p, units)), p).not.toMatch(/[—·]/)
  })
})

describe("socialCardPaths", () => {
  it("lists every public page and every unit, the paths prerendered at build", () => {
    const units = loadDocUnits()
    const paths = socialCardPaths(units)
    expect(paths).toEqual([...PUBLIC_PAGES.map((p) => p.path), ...units.map((u) => `/doc/${u.slug}`)])
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe("socialCardTitleSize", () => {
  it("shrinks as the title grows, readable on a phone's preview", () => {
    expect(socialCardTitleSize("Rappels")).toBe(76)
    expect(socialCardTitleSize("Effacer ou supprimer un membre")).toBe(64)
    expect(socialCardTitleSize("x".repeat(70))).toBe(54)
  })
})
