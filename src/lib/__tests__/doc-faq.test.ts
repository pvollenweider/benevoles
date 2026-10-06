import { describe, it, expect } from "vitest"
import { DOC_FAQ, docFaqHref } from "../doc-faq"
import { DOC_ROLES, readDocUnits } from "../doc-units"
import { docUnitHeadingIds } from "../public-content"

// The « Questions fréquentes » block at the top of /doc/admin and /doc/benevole.

describe("DOC_FAQ", () => {
  const units = readDocUnits()

  for (const role of DOC_ROLES) {
    describe(role, () => {
      it("has four questions, each asked once, each a question with no forbidden separator", () => {
        const questions = DOC_FAQ[role].map((item) => item.question)
        expect(questions).toHaveLength(4)
        expect(new Set(questions).size).toBe(4)
        for (const q of questions) {
          // A non-breaking space before « ? » and « : », as French typography wants it.
          expect(q).toMatch(/\u00a0\?$/)
          expect(q).not.toMatch(/ [?:]/)
          expect(q).not.toMatch(/[·—]/)
        }
      })

      it.each(DOC_FAQ[role].map((item) => [item.question, item] as const))("« %s » leads to a unit for this role, and to its heading", (_, item) => {
        const unit = units.find((u) => u.slug === item.unit)
        expect(unit, item.unit).toBeDefined()
        expect(unit!.roles).toContain(role)
        if (item.heading) expect(docUnitHeadingIds(unit!)).toContain(item.heading)
      })

      it("never names a question like a unit (one link name, one place on the page)", () => {
        const titles = new Set(units.map((u) => u.title))
        for (const item of DOC_FAQ[role]) expect(titles.has(item.question)).toBe(false)
      })
    })
  }

  it("links to the unit, with the heading's fragment when there is one", () => {
    expect(docFaqHref({ question: "Q ?", unit: "rappels", heading: "rappels-automatiques" })).toBe("/doc/rappels#rappels-automatiques")
    expect(docFaqHref({ question: "Q ?", unit: "rappels" })).toBe("/doc/rappels")
  })
})
