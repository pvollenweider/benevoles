import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { ADMIN_GUIDE_PATH, ADMIN_HELP_SECTIONS, FEEDBACK_SECTION, adminGuideHref, adminHelpLink, type AdminHelpRoute } from "../help-links"
import { publicPage } from "../doc-pages"
import { renderPublicSource } from "../public-content"
import { CONTACT_EMAIL, REPOSITORY_URL } from "../landing-seo"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

// #568: every contextual help link opens an existing section of the admin guide. Renaming or
// removing a heading of GUIDE_ADMIN.md that a page links to fails here: update
// src/lib/help-links.ts in the same change.
const root = path.join(__dirname, "..", "..", "..")
const { html } = renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur")

// Heading text as written in the guide: inline markup removed (until none is left), then the few
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

const headings = [...html.matchAll(/<h([2-6])(?: id="([^"]*)")?>([\s\S]*?)<\/h\1>/g)].map((m) => ({ id: m[2], text: decode(m[3]) }))
const textById = new Map(headings.map((h) => [h.id, h.text]))
const routes = Object.keys(ADMIN_HELP_SECTIONS) as AdminHelpRoute[]

describe("admin guide anchors", () => {
  it("gives every heading an id, unique within the page and distinct from the main landmark's", () => {
    expect(headings.length).toBeGreaterThan(50)
    const ids = headings.map((h) => h.id)
    expect(ids.every((id) => !!id)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(MAIN_CONTENT_ID)
  })

  it("resolves every in-page link of the guide to a heading", () => {
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
    expect(targets.length).toBeGreaterThan(0)
    for (const t of targets) expect(textById.has(t), `#${t}`).toBe(true)
  })
})

describe("ADMIN_HELP_SECTIONS", () => {
  it("points to the published admin guide", () => {
    expect(publicPage(ADMIN_GUIDE_PATH).source).toBe("GUIDE_ADMIN.md")
  })

  it.each(routes)("%s opens an existing heading of GUIDE_ADMIN.md, with the same wording", (route) => {
    const { section, href } = adminHelpLink(route)
    const [pathname, anchor] = href.split("#")
    expect(pathname).toBe("/doc/admin")
    expect(textById.get(anchor), `#${anchor} for « ${section} »`).toBe(section)
  })

  it.each(routes)("%s is an existing admin page that shows its help link", (route) => {
    const file = path.join(root, "src", "app", ...route.split("/").filter(Boolean), "page.tsx")
    expect(fs.existsSync(file), file).toBe(true)
    expect(fs.readFileSync(file, "utf-8")).toContain(`<HelpLink route="${route}" />`)
  })
})

describe("feedback section", () => {
  const anchor = adminGuideHref(FEEDBACK_SECTION).split("#")[1]

  it("exists in the guide, and the guide's introduction links to it", () => {
    expect(textById.get(anchor)).toBe(FEEDBACK_SECTION)
    expect(html.indexOf(`href="#${anchor}"`)).toBeGreaterThan(-1)
    expect(html.indexOf(`href="#${anchor}"`)).toBeLessThan(html.indexOf("<h2"))
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
