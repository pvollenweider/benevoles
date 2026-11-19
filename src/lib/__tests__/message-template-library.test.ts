import { describe, it, expect } from "vitest"
import { LIBRARY_CATEGORIES, TEMPLATE_CATEGORIES } from "../message-template-category"
import { LIBRARY_AUDIENCE_LABELS, LIBRARY_TEMPLATES, libraryByCategory, type LibraryTemplate } from "../message-template-library"
import { templateProblems, templateSchema, variablesIn, VARIABLES } from "../message-template"
import { renderLibraryPreview, splitPlaceholders } from "../message-template-preview"

// The ready-made library (#1414).
const byId = (id: string): LibraryTemplate => {
  const template = LIBRARY_TEMPLATES.find((entry) => entry.id === id)
  if (!template) throw new Error(`unknown library template: ${id}`)
  return template
}

describe("message template library", () => {
  it("holds 50 templates with unique ids and names", () => {
    expect(LIBRARY_TEMPLATES).toHaveLength(50)
    expect(new Set(LIBRARY_TEMPLATES.map((t) => t.id)).size).toBe(50)
    expect(new Set(LIBRARY_TEMPLATES.map((t) => t.name)).size).toBe(50)
  })

  it("uses only the eleven library categories, with the announced counts", () => {
    for (const template of LIBRARY_TEMPLATES) expect(LIBRARY_CATEGORIES).toContain(template.category)
    const counts = Object.fromEntries(LIBRARY_CATEGORIES.map((category) => [category, LIBRARY_TEMPLATES.filter((t) => t.category === category).length]))
    expect(counts).toEqual({
      "Recruter et compléter": 4,
      "Accueil": 5,
      "Infos pratiques": 7,
      "Tenue et matériel": 6,
      "Cadre": 4,
      "Planning": 4,
      "Météo et imprévus": 5,
      "Jour J": 4,
      "Ressources": 2,
      "Après": 7,
      "Activités régulières": 2,
    })
  })

  it("groups by category in the library's order", () => {
    const groups = libraryByCategory()
    expect(groups.map((g) => g.category)).toEqual([...LIBRARY_CATEGORIES])
    expect(groups.reduce((n, g) => n + g.templates.length, 0)).toBe(50)
  })

  it("has a known audience for every template", () => {
    for (const template of LIBRARY_TEMPLATES) expect(Object.keys(LIBRARY_AUDIENCE_LABELS)).toContain(template.audience)
    expect(LIBRARY_CATEGORIES.every((category) => (TEMPLATE_CATEGORIES as readonly string[]).includes(category))).toBe(true)
  })

  it("passes the variable rules for its suggested audience, and uses only known variables", () => {
    for (const template of LIBRARY_TEMPLATES) {
      expect(templateProblems(template.subject, template.audience), `${template.id} subject`).toEqual([])
      expect(templateProblems(template.body, template.audience), `${template.id} body`).toEqual([])
      for (const variable of [...variablesIn(template.subject), ...variablesIn(template.body)]) {
        expect(Object.keys(VARIABLES), `${template.id} uses ${variable}`).toContain(variable)
      }
      // No other braces that could be read as a variable.
      const braces = `${template.subject}\n${template.body}`.replace(/\{\{|\}\}|\{[^{}\n]{1,30}\}/g, "")
      expect(braces, `${template.id} has a stray brace`).not.toMatch(/[{}]/)
    }
  })

  it("fits the template schema (name, subject and body lengths)", () => {
    for (const template of LIBRARY_TEMPLATES) {
      const parsed = templateSchema.safeParse({ name: template.name, category: template.category, subject: template.subject, body: template.body })
      expect(parsed.success, `${template.id}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true)
    }
  })

  it("marks the facts to complete with [à compléter : …], never an invented detail", () => {
    const withPlaceholder = LIBRARY_TEMPLATES.filter((t) => /\[à compléter : [^\]]+\]/.test(t.body))
    expect(withPlaceholder.length).toBeGreaterThan(30)
    for (const template of LIBRARY_TEMPLATES) {
      // Any bracket left in a body is a documented placeholder, not a raw instruction.
      for (const match of template.body.matchAll(/\[[^\]]*\]/g)) expect(match[0]).toMatch(/^\[à compléter : .+\]$/)
    }
  })

  it("does not repeat the personal link or the shifts (they are appended at send time)", () => {
    for (const template of LIBRARY_TEMPLATES) {
      expect(template.body).not.toMatch(/https?:\/\//)
      expect(template.body).not.toMatch(/\/(my|inscription)\//)
      expect(template.body).not.toMatch(/tes créneaux concernés/i)
    }
  })
})

describe("library preview", () => {
  it("renders the same targeted email with sample values and marks the placeholders", () => {
    const preview = renderLibraryPreview(byId("alerte-meteo-pluie"), "Fête du quartier asbl", "https://fete.benevol.app")
    expect(preview.subject).toContain("Pluie annoncée")
    expect(preview.subject).toContain("Fête du quartier")
    expect(preview.html).toContain("Hello Léa")
    expect(preview.html).toContain("Fête du quartier asbl")
    expect(preview.html).toContain("Buvette")
    expect(preview.html).toContain("Gérer mes inscriptions")
    expect(preview.html).toContain("https://fete.benevol.app/my/apercu")
    expect(preview.html).toContain("<mark")
    expect(preview.html).toContain("[à compléter : tente, abri, boissons chaudes…]")
    expect(preview.text).toContain("Gérer tes inscriptions")
  })

  it("uses the invitation link, not the personal one, for the invited audience", () => {
    const preview = renderLibraryPreview(byId("invite-pas-encore-inscrit"), "Fête du quartier asbl", "https://fete.benevol.app")
    expect(preview.html).toContain("Choisir mes créneaux")
    expect(preview.html).not.toContain("Gérer mes inscriptions")
    expect(preview.html).toContain("https://fete.benevol.app/inscription?invitation=apercu")
  })

  it("splits a text around each placeholder for a text renderer", () => {
    expect(splitPlaceholders("On se retrouve à [à compléter : entrée] demain.")).toEqual([
      { text: "On se retrouve à ", placeholder: false },
      { text: "[à compléter : entrée]", placeholder: true },
      { text: " demain.", placeholder: false },
    ])
    expect(splitPlaceholders("Rien à compléter ici.")).toEqual([{ text: "Rien à compléter ici.", placeholder: false }])
  })
})
