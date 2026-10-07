import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { renderChangelog } from "../public-content"
import { findRelease, formatReleaseDate, repositoryLinks, INTERNAL_MARKER, isPublicSection, parseChangelog, publicMarkdown, releaseMarkdown } from "../changelog"

// CHANGELOG.md read for people (#757): released versions, newest first, public sections only.
const SAMPLE = `# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

---

## [Unreleased]

### Ajouté

- **Pas encore livré** : ne doit jamais apparaître.

## [1.2.0] — 2026-10-06

### En bref

- **Résumé** : ce que la version apporte.

### Mise à jour depuis 1.1.x

Migration à lancer avant la mise à jour.

- **Migrations** : \`ma_migration\`.

### Ajouté

- **Nouvelle page** : voir [le guide](GUIDE_ADMIN.md#creer).
  - un détail en sous-liste
- **Tests** : 20 tests de plus. ${INTERNAL_MARKER}
- **Encore** : une ligne publique.

### Infrastructure

- Node.js 26.

---

## [1.1.0] - 2026-09-01

Première version stable.

### Corrigé

- **Un bug** : corrigé.

---

## [1.1.1] — 2026-09-01

### Corrigé

- **Le même jour** : publié après 1.1.0 dans le fichier.

## [1.0.9]

### Ajouté

- **Sans date** : titre mal formé, ignoré.

## [1.0.8] — 2026-02-30

### Ajouté

- **Date impossible** : ignorée.

## Notes diverses

- **Hors version** : ignoré.

## [1.0.0-beta.2] — 2026-04-26

### Refactoring

- **Interne seulement** : la version n'a rien à dire au public.

## [1.0.0-beta.1] — 2026-04-24

### Fonctionnalités

- **Timeline publique** : planning.
`

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE)

  it("lists the released versions with their date, newest first, a tie kept in the file's order", () => {
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ["1.2.0", "2026-10-06"],
      ["1.1.0", "2026-09-01"],
      ["1.1.1", "2026-09-01"],
      ["1.0.0-beta.1", "2026-04-24"],
    ])
  })

  it("never shows [Unreleased]", () => {
    expect(releases.map((r) => r.version)).not.toContain("Unreleased")
    expect(JSON.stringify(releases)).not.toContain("Pas encore livré")
  })

  it("ignores a malformed version heading (no date, an impossible date, no version) and its content", () => {
    const text = JSON.stringify(releases)
    for (const ignored of ["Sans date", "Date impossible", "Hors version"]) expect(text).not.toContain(ignored)
  })

  it("keeps the public sections in their order and leaves out the operators' and developers' ones", () => {
    expect(findRelease(releases, "1.2.0")?.sections.map((s) => s.title)).toEqual(["En bref", "Ajouté"])
    expect(JSON.stringify(releases)).not.toMatch(/Migration|Node\.js 26/)
  })

  it("drops a bullet marked internal, keeps the others with their sub-items and links as written", () => {
    const added = findRelease(releases, "1.2.0")!.sections[1].markdown
    expect(added).toBe("- **Nouvelle page** : voir [le guide](GUIDE_ADMIN.md#creer).\n  - un détail en sous-liste\n- **Encore** : une ligne publique.")
    expect(added).not.toContain("20 tests")
  })

  it("keeps the text before a version's first section, and drops the --- between versions", () => {
    const stable = findRelease(releases, "1.1.0")!
    expect(stable.intro).toBe("Première version stable.")
    expect(stable.sections).toEqual([{ title: "Corrigé", markdown: "- **Un bug** : corrigé." }])
  })

  it("turns a heading of a version's intro into a bold paragraph, never an <h4> under the version's <h2>", () => {
    const [release] = parseChangelog("## [3.0.0] — 2026-11-01\n\nIntro.\n\n#### Points forts\n\n- un point\n\n### Ajouté\n\n#### Sous-titre\n\n- x\n")
    expect(release.intro).toBe("Intro.\n\n**Points forts**\n\n- un point")
    expect(release.intro).not.toMatch(/^#/m)
    // Inside a section, under its <h3>, a #### stays a heading (<h4>).
    expect(release.sections[0].markdown).toBe("#### Sous-titre\n\n- x")
  })

  it("drops a version left with nothing public", () => {
    expect(findRelease(releases, "1.0.0-beta.2")).toBeNull()
  })

  it("accepts Windows line endings and returns nothing for a file without a released version", () => {
    expect(parseChangelog(SAMPLE.replace(/\n/g, "\r\n")).map((r) => r.version)).toEqual(releases.map((r) => r.version))
    expect(parseChangelog("# Changelog\n\n## [Unreleased]\n\n### Ajouté\n\n- x\n")).toEqual([])
    expect(parseChangelog("")).toEqual([])
  })
})

describe("isPublicSection", () => {
  it("matches a public section by the start of its title", () => {
    expect(isPublicSection("Ajouté")).toBe(true)
    expect(isPublicSection("Ajouté (repris de la période beta.6 → 1.10.0, jamais documenté)")).toBe(true)
    expect(isPublicSection("Corrections notables")).toBe(true)
    expect(isPublicSection("Mise à jour depuis 2.0.x")).toBe(false)
    expect(isPublicSection("Documentation")).toBe(false)
    expect(isPublicSection("Ajoutés")).toBe(false)
  })
})

describe("publicMarkdown", () => {
  it("removes an internal bullet with its continuation lines, and any leftover HTML comment", () => {
    const md = `- garder\n- retirer ${INTERNAL_MARKER}\n  - sa sous-liste\n\n#### Sous-titre\n\n- garder aussi <!-- note -->`
    expect(publicMarkdown(md)).toBe("- garder\n\n#### Sous-titre\n\n- garder aussi")
  })
})

describe("repositoryLinks", () => {
  const REPO = "https://github.com/pvollenweider/benevoles"

  it("sends a link to an unpublished file of the repository to GitHub, its anchor kept", () => {
    expect(repositoryLinks("voir [Mise à jour](docs/deploiement.md#mise-à-jour-depuis-1x)", REPO)).toBe(`voir [Mise à jour](${REPO}/blob/main/docs/deploiement.md#mise-à-jour-depuis-1x)`)
    expect(repositoryLinks("[a](./SECURITY.md)", REPO)).toBe(`[a](${REPO}/blob/main/SECURITY.md)`)
  })

  it("leaves site paths, anchors, full URLs and email addresses alone", () => {
    const md = "[a](/doc/admin) [b](#2.1.0) [c](https://example.org/x.md) [d](mailto:contact@benevol.app)"
    expect(repositoryLinks(md, REPO)).toBe(md)
  })
})

describe("releaseMarkdown and formatReleaseDate", () => {
  it("rebuilds a version's public content as Markdown, the starting point of a product update email (#762)", () => {
    const [latest, stable] = parseChangelog(SAMPLE)
    expect(releaseMarkdown(latest)).toBe(
      "### En bref\n\n- **Résumé** : ce que la version apporte.\n\n### Ajouté\n\n- **Nouvelle page** : voir [le guide](GUIDE_ADMIN.md#creer).\n  - un détail en sous-liste\n- **Encore** : une ligne publique.",
    )
    expect(releaseMarkdown(stable)).toBe("Première version stable.\n\n### Corrigé\n\n- **Un bug** : corrigé.")
  })

  it("writes a date the French way", () => {
    expect(formatReleaseDate("2026-10-06")).toBe("6 octobre 2026")
    expect(formatReleaseDate("2026-08-01")).toBe("1er août 2026")
    expect(formatReleaseDate("2026-02-28")).toBe("28 février 2026")
  })
})

describe("CHANGELOG.md, the source of /nouveautes", () => {
  const md = fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf-8")
  const releases = parseChangelog(md)

  it("parses every released version heading of the file", () => {
    const headings = md.match(/^## \[(?!Unreleased)[^\]]+\]/gm) ?? []
    expect(releases.length).toBe(headings.length)
    expect(releases.length).toBeGreaterThan(10)
    expect(releases.map((r) => r.date)).toEqual([...releases.map((r) => r.date)].sort().reverse())
  })

  it("shows no operator section and no internal bullet", () => {
    const text = JSON.stringify(releases)
    expect(text).not.toContain("k8s/job-migrate.yaml")
    expect(text).not.toContain(INTERNAL_MARKER)
    expect(text).not.toContain("20 tests d'isolation cross-tenant")
  })

  it("renders as the page shows it: dated, sanitized HTML, no comment left", () => {
    const rendered = renderChangelog()
    expect(rendered.map((r) => r.version)).toEqual(releases.map((r) => r.version))
    expect(rendered[0].dateLabel).toBe(formatReleaseDate(releases[0].date))
    const html = rendered.flatMap((r) => [r.introHtml, ...r.sections.map((s) => s.html)]).join("")
    expect(html).toContain("<li>")
    expect(html).not.toMatch(/<!--|<script/)
    // Every link leads to a page of the site or to a full URL, never to a relative file (a 404).
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href).toMatch(/^(\/|#|https:\/\/|mailto:)/)
    expect(html).toContain('href="https://github.com/pvollenweider/benevoles/blob/main/docs/deploiement.md#')
  })
})
