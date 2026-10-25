import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { ADMIN_HELP_LINKS, FEEDBACK_SECTION, SECTION_DOC_LINKS, adminHelpLink, docHref, type AdminHelpRoute, type AdminHelpTarget } from "../help-links"
import { readDocUnits, type DocUnit } from "../doc-units"
import { renderDocUnit, renderPublicSource } from "../public-content"
import { CONTACT_EMAIL, REPOSITORY_URL } from "../landing-seo"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

// #568, #649: every contextual help link opens an existing page of the documentation (a unit of
// content/guide/ for organisers), at an existing heading when it names one. Renaming or removing a unit or
// a heading a page links to fails here: update src/lib/help-links.ts in the same change.
const root = path.join(__dirname, "..", "..", "..")
const units = readDocUnits()
const routes = Object.keys(ADMIN_HELP_LINKS) as AdminHelpRoute[]

// Heading text as written in the unit: inline markup removed (until none is left), then the few
// entities the renderer emits for headings. Headings never contain « < » or « > ».
const decode = (s: string) => {
  let previous: string
  let current = s
  do {
    previous = current
    current = current.replace(/<[^>]*>/g, "")
  } while (current !== previous)
  return current.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
}

const headingsOf = (html: string) => [...html.matchAll(/<h([2-6])(?: id="([^"]*)")?>([\s\S]*?)<\/h\1>/g)].map((m) => ({ id: m[2], text: decode(m[3]) }))
const unitBySlug = (slug: string): DocUnit => {
  const unit = units.find((u) => u.slug === slug)
  expect(unit, `content/guide/${slug}.md`).toBeDefined()
  return unit!
}

describe("docHref", () => {
  it("opens a unit, at the slug of a heading when given", () => {
    expect(docHref({ unit: "configurer-les-creneaux" })).toBe("/doc/configurer-les-creneaux")
    expect(docHref({ unit: "creer-un-evenement", heading: "Modifier un événement" })).toBe("/doc/creer-un-evenement#modifier-un-evenement")
  })
})

describe("ADMIN_HELP_LINKS", () => {
  it.each(routes)("%s opens an organisers' unit of content/guide/, and the heading it names, with the same wording", (route) => {
    const target: AdminHelpTarget = ADMIN_HELP_LINKS[route]
    const unit = unitBySlug(target.unit)
    expect(unit.roles, unit.slug).toContain("admin")
    const { section, href } = adminHelpLink(route, units)
    const [pathname, anchor] = href.split("#")
    expect(pathname).toBe(`/doc/${unit.slug}`)
    if (target.heading) {
      const headings = headingsOf(renderDocUnit(unit))
      expect(headings.find((h) => h.id === anchor)?.text, `#${anchor} for « ${target.heading} » in ${unit.source}`).toBe(target.heading)
      expect(section).toBe(target.heading)
    } else {
      expect(anchor).toBeUndefined()
      expect(section).toBe(unit.title)
    }
  })

  it.each(routes)("%s is an existing admin page that shows its help link", (route) => {
    const file = path.join(root, "src", "app", ...route.split("/").filter(Boolean), "page.tsx")
    expect(fs.existsSync(file), file).toBe(true)
    expect(fs.readFileSync(file, "utf-8")).toContain(`<HelpLink route="${route}" />`)
  })

  it("throws on a unit that doesn't exist", () => {
    expect(() => adminHelpLink("/admin/events/new", [])).toThrow(/unknown documentation unit « creer-un-evenement »/)
  })

  it("gives the edit page its own link, to editing an event", () => {
    expect(adminHelpLink("/admin/events/[id]/edit", units)).toEqual({ section: "Modifier un événement", href: "/doc/creer-un-evenement#modifier-un-evenement" })
    expect(adminHelpLink("/admin/events/new", units)).toEqual({ section: "Créer un événement", href: "/doc/creer-un-evenement" })
  })

  // #1096: the settings page shows the organisation's settings first, the team last.
  it("sends the settings page to the organisation's settings, not to the admin team", () => {
    expect(adminHelpLink("/admin/settings/admins", units)).toEqual({ section: "Personnaliser l'organisation", href: "/doc/personnaliser-l-organisation" })
  })

  // #1096: every admin screen of the navigation audit with a page of its own now links to it.
  it.each([
    "/admin/dashboard", "/admin/events", "/admin/events/[id]", "/admin/events/[id]/log", "/admin/events/[id]/duplicate",
    "/admin/events/[id]/qr", "/admin/events/[id]/pages", "/admin/events/[id]/preview", "/admin/events/[id]/staffing/search",
    "/admin/members", "/admin/members/[id]", "/admin/members/[id]/certificate", "/admin/members/[id]/merge",
    "/admin/members/duplicates", "/admin/settings/message-templates", "/admin/settings/activity", "/admin/search", "/admin/account",
  ])("%s has a help link", (route) => {
    expect(routes).toContain(route)
  })
})

describe("SECTION_DOC_LINKS", () => {
  const entries = (Object.entries(SECTION_DOC_LINKS) as [keyof typeof SECTION_DOC_LINKS, Record<string, AdminHelpTarget>][])
    .flatMap(([role, links]) => Object.entries(links).map(([name, target]) => [role, name, target] as const))

  it.each(entries)("%s/%s opens a unit for that role, at the heading it names", (role, _name, target) => {
    const unit = unitBySlug(target.unit)
    expect(unit.roles, unit.slug).toContain(role)
    const [pathname, anchor] = docHref(target).split("#")
    expect(pathname).toBe(`/doc/${unit.slug}`)
    if (target.heading) expect(headingsOf(renderDocUnit(unit)).find((h) => h.id === anchor)?.text, `#${anchor} in ${unit.source}`).toBe(target.heading)
    else expect(anchor).toBeUndefined()
  })

  it("points the broken-link page and the cancel button to their own sections", () => {
    expect(docHref(SECTION_DOC_LINKS.benevole.brokenLink)).toBe("/doc/lien-personnel#la-page-ce-lien-ne-fonctionne-pas-s-affiche")
    expect(docHref(SECTION_DOC_LINKS.benevole.cancelShift)).toBe("/doc/ma-page-personnelle#annuler-un-creneau")
  })
})

describe("the units' heading ids", () => {
  it("are given to every heading, unique within a unit and distinct from the main landmark's", () => {
    for (const unit of units) {
      const ids = headingsOf(renderDocUnit(unit)).map((h) => h.id)
      expect(ids.every((id) => !!id), unit.slug).toBe(true)
      expect(new Set(ids).size, unit.slug).toBe(ids.length)
      expect(ids, unit.slug).not.toContain(MAIN_CONTENT_ID)
    }
  })

  // Renders every unit, and the target unit again for each cross-unit link: over the 5 s default on
  // a busy CI runner.
  it("resolve every in-page link of a unit, and every link to another unit's heading", () => {
    for (const unit of units) {
      const html = renderDocUnit(unit)
      const own = new Set(headingsOf(html).map((h) => h.id))
      for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) expect(own.has(id), `${unit.slug}: #${id}`).toBe(true)
      for (const [, slug, id] of html.matchAll(/href="\/doc\/([a-z0-9-]+)#([^"]+)"/g)) {
        const other = units.find((u) => u.slug === slug)
        if (!other) continue // a role guide (/doc/admin#…), checked below
        expect(headingsOf(renderDocUnit(other)).map((h) => h.id), `${unit.slug} → /doc/${slug}#${id}`).toContain(id)
      }
    }
  }, 20_000)

  it("link to the admin guide only at a heading it still has", () => {
    const guideIds = new Set(headingsOf(renderPublicSource("content/guide/GUIDE_ADMIN.md", "x").html).map((h) => h.id))
    for (const unit of units) {
      for (const [, id] of renderDocUnit(unit).matchAll(/href="\/doc\/admin#([^"]+)"/g)) expect(guideIds.has(id), `${unit.slug} → /doc/admin#${id}`).toBe(true)
    }
  })
})

describe("feedback section", () => {
  const unit = unitBySlug(FEEDBACK_SECTION.unit)
  const html = renderDocUnit(unit)
  const href = docHref(FEEDBACK_SECTION)
  const anchor = href.split("#")[1]

  it("exists in its unit, and the admin guide's introduction links to it", () => {
    expect(headingsOf(html).find((h) => h.id === anchor)?.text).toBe(FEEDBACK_SECTION.heading)
    const guide = renderPublicSource("content/guide/GUIDE_ADMIN.md", "x").html
    expect(guide.indexOf(`href="${href}"`)).toBeGreaterThan(-1)
  })

  it("offers the contact address first, and GitHub only as an optional public channel", () => {
    const start = html.indexOf(`id="${anchor}"`)
    const next = html.slice(start).search(/<h[2-3] /)
    const section = html.slice(start, next === -1 ? undefined : start + next)
    expect(section).toContain(`href="mailto:${CONTACT_EMAIL}"`)
    expect(section).toContain(`href="${REPOSITORY_URL}/issues"`)
    expect(section.indexOf(`mailto:${CONTACT_EMAIL}`)).toBeLessThan(section.indexOf(REPOSITORY_URL))
    expect(section).toMatch(/facultatif/)
  })
})
