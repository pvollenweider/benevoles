import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

// The public privacy policy names every provider that receives data (#485), and claims a data
// processing agreement only where one exists: the off-site backup copy is on an individual
// Dropbox plan, stored in the US, without one.
const page = readFileSync(join(process.cwd(), "src/app/legal/privacy/page.tsx"), "utf8")

describe("privacy policy sub-processors", () => {
  it("lists the hosting, email, error tracking and the off-site backup copy", () => {
    for (const name of ["OVH", "Gandi", "Sentry", "Dropbox"]) expect(page, name).toContain(name)
    expect(page).toContain("États-Unis")
  })

  it("no longer claims a processing agreement for every provider", () => {
    expect(page).not.toContain("Chaque sous-traitant est lié par un accord")
    expect(page).toContain("sans accord de traitement spécifique")
  })
})
