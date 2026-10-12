import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { RESERVED_EVENT_SLUGS, eventSlugFromTitle, isReservedEventSlug, reservedEventSlugError } from "../event-slug"
import { APEX_ONLY_PATHS as ROUTING_PATHS } from "../apex-redirect"
import { APEX_ONLY_PATHS, RESERVED_PATH_SEGMENTS } from "../reserved-paths"
import { PUBLIC_PAGES } from "../doc-pages"

describe("reserved event slugs", () => {
  // One list for the routing and the slug check: the proxy's apex-only paths are this very array.
  it("are read from the same list as the routing's apex-only paths", () => {
    expect(ROUTING_PATHS).toBe(APEX_ONLY_PATHS)
    for (const p of APEX_ONLY_PATHS) expect(RESERVED_EVENT_SLUGS.has(p.split("/")[1]), p).toBe(true)
    expect([...RESERVED_EVENT_SLUGS].sort()).toEqual([...RESERVED_PATH_SEGMENTS].sort())
  })

  it("cover every public page and every static folder of src/app, so a new route cannot be forgotten", () => {
    for (const page of PUBLIC_PAGES) expect(isReservedEventSlug(page.path.split("/")[1]), page.path).toBe(true)
    const app = path.join(process.cwd(), "src/app")
    // A name with a dot (og-image.png, sitemap-index.xml) is never a slug: slugify keeps [a-z0-9-] only.
    const folders = fs.readdirSync(app, { withFileTypes: true }).filter((d) => d.isDirectory() && !/^[[(_]/.test(d.name) && !d.name.includes(".")).map((d) => d.name)
    for (const name of folders) expect(isReservedEventSlug(name), name).toBe(true)
  })

  it("refuse a title giving a reserved address, with the address in the message", () => {
    expect(eventSlugFromTitle("Tarifs")).toEqual({ error: reservedEventSlugError("tarifs") })
    expect(eventSlugFromTitle("Pour qui ?")).toEqual({ error: reservedEventSlugError("pour-qui") })
    expect(eventSlugFromTitle("Fonctionnalités")).toEqual({ error: reservedEventSlugError("fonctionnalites") })
    expect(reservedEventSlugError("tarifs")).toContain("« /tarifs », réservée par le service")
  })

  it("accept any other title, a longer slug included", () => {
    expect(eventSlugFromTitle("Tarifs 2027")).toEqual({ slug: "tarifs-2027" })
    expect(eventSlugFromTitle("Fête du village")).toEqual({ slug: "fete-du-village" })
    expect(isReservedEventSlug("documentation")).toBe(false)
  })
})
