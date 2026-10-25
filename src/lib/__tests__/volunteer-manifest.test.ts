import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { VOLUNTEER_APP_SCOPE, VOLUNTEER_MANIFEST_PATH, volunteerManifest } from "../volunteer-manifest"
import { GET } from "@/app/my/manifest.webmanifest/route"
import { isServerNotFound, reachesEventRoute } from "../server-not-found"

// Web app manifest of the personal page « Mes inscriptions » (#593).
describe("volunteerManifest", () => {
  const m = volunteerManifest()

  it("names the app as the page, the emails and the guides do (#1099), and opens standalone", () => {
    expect(m.name).toBe("Mes inscriptions")
    expect(m.short_name).toBe("Mes inscriptions")
    expect(m.display).toBe("standalone")
    expect(m.lang).toBe("fr")
  })

  it("has no start address and no id: the installed app opens the page it was installed from", () => {
    // A start_url would be either one volunteer's token or a page that isn't theirs.
    expect(m).not.toHaveProperty("start_url")
    expect(m).not.toHaveProperty("id")
    expect(m.scope).toBe(VOLUNTEER_APP_SCOPE)
    expect(new URL(`/my/abc`, "https://org.benevol.app").pathname.startsWith(VOLUNTEER_APP_SCOPE)).toBe(true)
  })

  it("takes its colours from DESIGN.md (surface-page)", () => {
    const design = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8")
    const surfacePage = design.match(/surface-page: "(#[0-9a-f]{6})"/)?.[1]
    expect(m.background_color).toBe(surfacePage)
    expect(m.theme_color).toBe(surfacePage)
  })

  it("lists 192 and 512 px icons, plain and maskable, that exist with those sizes", () => {
    const icons = m.icons ?? []
    for (const purpose of ["any", "maskable"]) {
      expect(icons.filter((i) => i.purpose === purpose).map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"])
    }
    for (const icon of icons) {
      const file = join(process.cwd(), "public", icon.src)
      expect(existsSync(file), icon.src).toBe(true)
      const png = readFileSync(file)
      // PNG header: width and height, big-endian, at bytes 16 and 20.
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes)
      expect(icon.type).toBe("image/png")
    }
  })
})

describe("GET /my/manifest.webmanifest", () => {
  it("serves the manifest as application/manifest+json, cacheable, with no token in it", async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toMatch(/^application\/manifest\+json/)
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600")
    const body = await res.text()
    expect(JSON.parse(body)).toEqual(volunteerManifest())
    // Only fixed addresses: the scope and the icons.
    expect([...body.matchAll(/"(\/[^"]*)"/g)].map((x) => x[1]).every((p) => p === "/my/" || p.startsWith("/icons/"))).toBe(true)
  })

  it("is not rewritten to the 404 page by the proxy, with or without an organisation", () => {
    const lookups = { docSlugExists: () => false, videoExists: () => false, blogPostExists: () => false }
    expect(reachesEventRoute(VOLUNTEER_MANIFEST_PATH)).toBe(false)
    expect(isServerNotFound(VOLUNTEER_MANIFEST_PATH, { hasOrg: false, ...lookups })).toBe(false)
    expect(isServerNotFound(VOLUNTEER_MANIFEST_PATH, { hasOrg: true, ...lookups })).toBe(false)
  })
})
