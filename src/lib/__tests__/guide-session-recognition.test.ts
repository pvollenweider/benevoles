import { describe, it, expect } from "vitest"
import { readDocUnits } from "../doc-units"

// #1096: the event page only knows a volunteer once the browser holds their personal link: after
// an invitation sign-up (the API returns it), or after opening /my/<token> once. A sign-up from
// the public link with a new address returns no token (#285), so the guide must not promise that
// the page recognises everyone who signed up from that browser.
const unit = readDocUnits().find((u) => u.slug === "revenir-sur-la-page-d-inscription")!

describe("Revenir sur la page d'inscription", () => {
  it("does not promise an automatic recognition after any sign-up", () => {
    expect(unit).toBeDefined()
    expect(unit.body).not.toMatch(/session est reconnue automatiquement/)
  })

  it("says when the page recognises you, and what to do after a public-link sign-up", () => {
    expect(unit.body).toMatch(/ouvert au moins une fois ton \[lien personnel\]/)
    expect(unit.body).toMatch(/depuis l'invitation de l'organisation/)
    expect(unit.body).toMatch(/Après une inscription par le lien public de l'événement, elle ne te reconnaît pas encore/)
  })
})
