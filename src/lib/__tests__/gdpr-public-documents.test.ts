import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { publicPage } from "../doc-pages"
import { slugifyHeading } from "../heading-anchors"

// The processing agreement and the sub-processor list are public (#485): they were drafted in
// docs/rgpd/ and published from the repo root. No draft marker, ticket number or internal path may
// leak into them, and every provider they name must be backed by docs/rgpd/sous-traitants.md, the
// dated source of the facts (and the reverse: none of its current providers is left out).
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")
const AGREEMENT = "content/legal/ACCORD-SOUS-TRAITANCE.md"
const LIST = "content/legal/SOUS-TRAITANTS.md"

describe("public GDPR documents", () => {
  it("are declared as public pages under /legal", () => {
    expect(publicPage("/legal/sous-traitance").source).toBe(AGREEMENT)
    expect(publicPage("/legal/sous-traitants").source).toBe(LIST)
  })

  it.each([AGREEMENT, LIST])("%s has no draft marker, placeholder, ticket number or internal path", (file) => {
    const md = read(file)
    expect(md).not.toMatch(/brouillon/i)
    expect(md).not.toMatch(/à relire/i)
    expect(md).not.toMatch(/à (?:confirmer|compléter|décider|fixer)/i)
    expect(md).not.toMatch(/TODO|FIXME/)
    expect(md).not.toMatch(/(?:^|[\s(])#\d+/m)
    expect(md).not.toMatch(/\[(?:x|date|\.\.\.|à [^\]]*)\]/i)
    expect(md).not.toMatch(/\b(?:docs|src|k8s|scripts)\//)
    expect(md).not.toMatch(/[·—]/)
  })

  it.each([[AGREEMENT, "21 octobre 2026"], [LIST, "6 octobre 2026"]])("%s carries its version date and the contact address", (file, date) => {
    const md = read(file)
    expect(md).toContain(`Version du ${date}.`)
    expect(md).toContain("contact@benevol.app")
  })

  // « Qui est inscrit » (#1068): the agreement describes the disclosure between volunteers.
  it("the agreement's Annex I covers the names shown to confirmed volunteers and invited members", () => {
    const md = read(AGREEMENT)
    expect(md).toContain("aux bénévoles confirmés de l'événement et aux membres que vous y invitez")
    expect(md).toContain("activé par défaut pour vos nouveaux événements")
  })

  it("the list links to an existing section of the agreement", () => {
    const anchors = [...read(LIST).matchAll(/\]\(ACCORD-SOUS-TRAITANCE\.md#([^)]+)\)/g)].map((m) => m[1])
    const headings = [...read(AGREEMENT).matchAll(/^#{2,} (.+)$/gm)].map((m) => slugifyHeading(m[1]))
    expect(anchors.length).toBeGreaterThan(0)
    for (const a of anchors) expect(headings, a).toContain(a)
  })

  describe("sub-processors match docs/rgpd/sous-traitants.md", () => {
    const internal = read("docs/rgpd/sous-traitants.md")
    // Current providers: the first table, before the technical inventory and former providers.
    const current = internal.slice(0, internal.indexOf("## Inventaire technique"))
    const internalProviders = [...current.matchAll(/^\| \*\*([^*]+)\*\*/gm)].map((m) => m[1].trim())
    // Public headings: "## <service> : <provider(s)>", the provider without its parenthesis.
    const publicProviders = [...read(LIST).matchAll(/^## [^:\n]+ : (.+)$/gm)]
      .flatMap((m) => m[1].replace(/\s*\(.*\)$/, "").split(/, | ou /))
      .map((p) => p.trim())

    it("finds providers on both sides", () => {
      expect(internalProviders).toEqual(expect.arrayContaining(["OVH SAS", "Gandi SAS", "Infomaniak Network SA", "Sentry"]))
      expect(publicProviders.length).toBeGreaterThanOrEqual(internalProviders.length)
    })

    it("every provider named in the public list is a current one of the internal list", () => {
      for (const p of publicProviders) expect(current, p).toContain(p)
    })

    it("every current provider of the internal list is published", () => {
      for (const p of internalProviders) expect(publicProviders, p).toContain(p)
    })

    it("names no former provider", () => {
      expect(read(LIST)).not.toMatch(/Dropbox/i)
      expect(read(AGREEMENT)).not.toMatch(/Dropbox/i)
    })
  })
})
