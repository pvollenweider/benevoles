import { describe, it, expect } from "vitest"
import { siteNameFromPage, titleWithSiteName } from "../document-title"

const page = (content: string | null) => ({
  querySelector: (selector: string) =>
    selector === 'meta[name="application-name"]' && content !== null ? ({ getAttribute: () => content } as unknown as Element) : null,
})

describe("tab titles with the instance's name (#1340)", () => {
  it("reads the name the root layout writes into the page", () => {
    expect(siteNameFromPage(page("benevol.app"))).toBe("benevol.app")
    expect(titleWithSiteName("Lien introuvable", page("Bénévoles de Montvert"))).toBe("Lien introuvable — Bénévoles de Montvert")
  })

  it("leaves the title alone when the page does not carry a name", () => {
    expect(titleWithSiteName("Lien introuvable", page(null))).toBe("Lien introuvable")
    expect(titleWithSiteName("Lien introuvable", page("  "))).toBe("Lien introuvable")
  })
})

describe("no old product name in the visible texts (#1340)", () => {
  it("is gone from the email templates, the sender and the tab titles", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const root = path.join(__dirname, "..", "..", "..")
    for (const f of [
      "NOTICE",
      "src/app/layout.tsx",
      "src/lib/notifications/channels/email.ts",
      "src/lib/notifications/templates/administration.ts",
      "src/lib/notifications/templates/invitations.ts",
      "src/app/disponibilites/[token]/page.tsx",
      "src/app/leader/[token]/page.tsx",
      "src/app/ne-peux-pas/[kind]/[token]/[shiftId]/page.tsx",
      "src/components/public/OrgUnavailableNotice.tsx",
    ]) {
      const src = fs.readFileSync(path.join(root, f), "utf-8")
      expect(src, f).not.toMatch(/sur Bénévoles|L'équipe Bénévoles|de Bénévoles est|— Bénévoles|title: "Bénévoles"|^Bénévoles$|Bénévoles </m)
    }
  })
})
