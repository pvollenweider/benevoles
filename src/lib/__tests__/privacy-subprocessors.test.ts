import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

// The public privacy policy names every provider that receives data (#485), and claims a data
// processing agreement only where one exists. The off-site copy moved to Infomaniak Swiss Backup
// (#524) and Dropbox is no longer a provider (#697): it stays named only as the former recipient
// whose old copies (US, no agreement) are being deleted, so the policy stays honest about them.
const page = readFileSync(join(process.cwd(), "src/app/legal/privacy/page.tsx"), "utf8")

describe("privacy policy sub-processors", () => {
  it("lists the hosting, email, error tracking and the off-site backup copy", () => {
    for (const name of ["OVH", "Gandi", "Sentry", "Infomaniak"]) expect(page, name).toContain(name)
    expect(page).toContain("Swiss Backup")
  })

  it("names Dropbox only as the former recipient whose copies are being deleted (#697)", () => {
    expect(page).toContain("Jusqu&apos;au 5 octobre 2026, cette")
    expect(page).toContain("Dropbox ne")
    expect(page).toContain("reçoit plus aucune copie")
    expect(page).toContain("en cours de suppression")
    expect(page).not.toMatch(/Nous\s+supprimerons ces anciennes copies/)
  })

  it("does not claim the Swiss Backup processing agreement before it is confirmed", () => {
    expect(page).toContain("Swiss Backup est en cours de vérification")
  })

  it("no longer claims a processing agreement for every provider", () => {
    expect(page).not.toContain("Chaque sous-traitant est lié par un accord")
    expect(page).toContain("sans accord de traitement spécifique")
  })
})
