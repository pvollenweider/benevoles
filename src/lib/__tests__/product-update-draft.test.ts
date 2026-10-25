import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { INTERNAL_MARKER, parseChangelog } from "../changelog"
import { absoluteLinks, fitBlocks, PRODUCT_UPDATE_CONTENT_MAX, productUpdateDraft, productUpdateDrafts, releasePageUrl } from "../product-update-draft"

// A product update email started from a released version of CHANGELOG.md (#762).
const SAMPLE = `# Changelog

## [Unreleased]

### Ajouté

- **Pas encore livré** : ne doit jamais apparaître.

## [1.3.0] — 2026-10-20

### En bref

- **Résumé** : ce que la version apporte, voir [le guide](GUIDE_ADMIN.md).

### Ajouté

- **Le détail** : reste sur la page.

## [1.2.0] — 2026-10-06

### Mise à jour depuis 1.1.x

Migration à lancer avant la mise à jour.

### Ajouté

- **Nouvelle page** : voir [le guide](content/guide/inviter.md#lien) et [le déploiement](docs/deploiement.md).
  - un détail en sous-liste
- **Tests** : 20 tests de plus. ${INTERNAL_MARKER}
- **Encore** : une ligne publique, [la version précédente](#1.1.0).

### Infrastructure

- Node.js 26.

## [1.1.0] — 2026-09-01

### Corrigé

- **Interne seulement** : un réglage. ${INTERNAL_MARKER}

### Infrastructure

- Rien pour le public.
`

const OPTIONS = { siteName: "benevol.app", baseUrl: "https://www.benevol.app", repositoryUrl: "https://github.com/o/r" }
const releases = parseChangelog(SAMPLE)

describe("productUpdateDraft", () => {
  it("prefills subject and content from an existing version, ending with its /nouveautes link", () => {
    const draft = productUpdateDraft(releases, "1.2.0", OPTIONS)!
    expect(draft.subject).toBe("Nouveautés de benevol.app, version 1.2.0")
    expect(draft.dateLabel).toBe("6 octobre 2026")
    expect(draft.content.startsWith("Voici les nouveautés de la version 1.2.0 de benevol.app, publiée le 6 octobre 2026.")).toBe(true)
    expect(draft.content).toContain("### Ajouté\n\n- **Nouvelle page**")
    expect(draft.content).toContain("  - un détail en sous-liste")
    expect(draft.content.endsWith("Tout le détail sur la page [Nouveautés de la version 1.2.0](https://www.benevol.app/nouveautes#1.2.0).")).toBe(true)
  })

  it("leaves out internal bullets and non-public sections, exactly as /nouveautes", () => {
    const content = productUpdateDraft(releases, "1.2.0", OPTIONS)!.content
    expect(content).not.toContain("Tests")
    expect(content).not.toContain("<!--")
    expect(content).not.toContain("Migration à lancer")
    expect(content).not.toContain("Node.js 26")
    expect(content).not.toContain("Pas encore livré")
  })

  it("makes every link absolute: guide pages, repository files, version anchors", () => {
    const content = productUpdateDraft(releases, "1.2.0", OPTIONS)!.content
    expect(content).toContain("[le guide](https://www.benevol.app/doc/inviter#lien)")
    expect(content).toContain("[le déploiement](https://github.com/o/r/blob/main/docs/deploiement.md)")
    expect(content).toContain("[la version précédente](https://www.benevol.app/nouveautes#1.1.0)")
  })

  it("starts from « En bref » when the version has one", () => {
    const content = productUpdateDraft(releases, "1.3.0", OPTIONS)!.content
    expect(content).toContain("### En bref\n\n- **Résumé**")
    expect(content).toContain("[le guide](https://www.benevol.app/doc/admin)")
    expect(content).not.toContain("Le détail")
  })

  it("returns null for an unknown, unreleased or empty version", () => {
    expect(productUpdateDraft(releases, "9.9.9", OPTIONS)).toBeNull()
    expect(productUpdateDraft(releases, "Unreleased", OPTIONS)).toBeNull()
    // 1.1.0 has only an internal bullet and a non-public section: nothing to say, not offered.
    expect(productUpdateDraft(releases, "1.1.0", OPTIONS)).toBeNull()
    expect(productUpdateDrafts(releases, OPTIONS).map((d) => d.version)).toEqual(["1.3.0", "1.2.0"])
  })

  it("fits the routes' limit by leaving out whole bullets from the end, and says so", () => {
    const long = `## [2.0.0] — 2026-10-01\n\n### Ajouté\n\n${Array.from({ length: 40 }, (_, i) => `- **Point ${i}** : ${"x".repeat(80)}\n  - sous-point ${i}`).join("\n")}\n`
    const draft = productUpdateDraft(parseChangelog(long), "2.0.0", { ...OPTIONS, maxLength: 1500 })!
    expect(draft.content.length).toBeLessThanOrEqual(1500)
    expect(draft.content).toContain("- **Point 0**")
    expect(draft.content).not.toContain("- **Point 39**")
    // Never a bullet without its sub-item.
    const last = draft.content.match(/- \*\*Point (\d+)\*\*/g)!.length - 1
    expect(draft.content).toContain(`  - sous-point ${last}`)
    expect(draft.content).toMatch(/La suite de cette version n'est pas reprise ici, tout est sur la page \[Nouveautés de la version 2\.0\.0\]\(https:\/\/www\.benevol\.app\/nouveautes#2\.0\.0\)\.$/)
  })

  it("keeps the subject within the routes' limit with a long instance name", () => {
    const draft = productUpdateDraft(releases, "1.2.0", { ...OPTIONS, siteName: "x".repeat(140) })!
    expect(draft.subject).toBe("Nouveautés de la version 1.2.0")
  })

  it("keeps every version of the real CHANGELOG.md within the routes' limit", () => {
    const real = parseChangelog(fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf-8"))
    const drafts = productUpdateDrafts(real, OPTIONS)
    expect(drafts.length).toBe(real.length)
    for (const d of drafts) {
      expect(d.content.length).toBeLessThanOrEqual(PRODUCT_UPDATE_CONTENT_MAX)
      expect(d.subject.length).toBeLessThanOrEqual(150)
      expect(d.content).toContain(`(https://www.benevol.app/nouveautes#${d.version})`)
      expect(d.content).not.toContain(INTERNAL_MARKER)
    }
  })
})

describe("draft helpers", () => {
  it("links to the version's anchor on /nouveautes", () => {
    expect(releasePageUrl("https://x.test", "1.0.0-beta.6")).toBe("https://x.test/nouveautes#1.0.0-beta.6")
  })

  it("resolves site paths and lone anchors, leaves full URLs and mailto alone", () => {
    expect(absoluteLinks("[a](/doc) [b](#2.0.0) [c](https://e.test/x) [d](mailto:a@b.c) [e](//cdn.test/x)", "https://s.test")).toBe(
      "[a](https://s.test/doc) [b](https://s.test/nouveautes#2.0.0) [c](https://e.test/x) [d](mailto:a@b.c) [e](//cdn.test/x)",
    )
  })

  it("resolves angle-bracket destinations and reference definitions too", () => {
    expect(absoluteLinks("[a](</doc/admin>) [b][g] [c][h]\n\n[g]: /doc/admin\n  [h]: <#2.0.0>\n[i]: https://e.test", "https://s.test")).toBe(
      "[a](<https://s.test/doc/admin>) [b][g] [c][h]\n\n[g]: https://s.test/doc/admin\n  [h]: <https://s.test/nouveautes#2.0.0>\n[i]: https://e.test",
    )
  })

  it("never cuts a paragraph or a bullet whose next line continues at the margin", () => {
    expect(fitBlocks("First line\ncontinuation longer than the budget", 12)).toEqual({ markdown: "", truncated: true })
    expect(fitBlocks("- un\n- deux\nsuite de deux, longue", 12)).toEqual({ markdown: "- un", truncated: true })
    expect(fitBlocks("#### Titre\nUn paragraphe trop long", 12)).toEqual({ markdown: "", truncated: true })
  })

  it("never leaves a heading alone at the end of a shortened text", () => {
    const md = "- un\n\n#### Titre\n\n- un long point qui ne tient pas"
    expect(fitBlocks(md, 20)).toEqual({ markdown: "- un", truncated: true })
    expect(fitBlocks(md, 1000)).toEqual({ markdown: md, truncated: false })
  })
})
