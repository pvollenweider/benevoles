import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { handlerBodies, reExports, routeFilesUnder as routeFiles, ROUTE_METHODS as METHODS } from "../helpers/route-handlers"

/**
 * Every admin route and method has a cross-tenant test (rule in CLAUDE.md): this guard lists each
 * method exported by a route under src/app/api/admin and looks, in cross-tenant-isolation.test.ts,
 * for a test that imports that route module and calls that method. A new route, or a new method
 * on an existing one, fails here until its test is written.
 */

const root = resolve(import.meta.dirname, "../../..")
const adminDir = join(root, "src/app/api/admin")
const guardFile = join(root, "src/__tests__/security/cross-tenant-isolation.test.ts")

/** The test blocks of the guard file: the text of each `it(...)`. */
function testBlocks(source: string): string[] {
  return source.split(/\n\s*it(?:\.each\([^)]*\))?\(/).slice(1)
}

function uncoveredRoutes(files: { path: string; source: string }[], guardSource: string): string[] {
  const blocks = testBlocks(guardSource)
  const missing: string[] = []
  for (const { path, source } of files) {
    const specifier = `"@/${path.replace(/^src\//, "").replace(/\.ts$/, "")}"`
    const handlers = handlerBodies(source)
    for (const method of METHODS) {
      if (!(method in handlers)) continue
      const call = new RegExp(`[\\s.(]${method}\\(`)
      if (!blocks.some((b) => b.includes(specifier) && call.test(b))) missing.push(`${method} /${path.replace(/^src\/app\//, "").replace(/\/route\.ts$/, "")}`)
    }
  }
  return missing
}

describe("admin routes: cross-tenant test coverage", () => {
  it("finds the admin routes", () => {
    expect(routeFiles(adminDir).length).toBeGreaterThan(50)
  })

  it("every admin route and method has a test in cross-tenant-isolation.test.ts", () => {
    const files = routeFiles(adminDir).map((p) => ({ path: relative(root, p), source: readFileSync(p, "utf8") }))
    expect(uncoveredRoutes(files, readFileSync(guardFile, "utf8"))).toEqual([])
  })

  it("reports a method that no test imports and calls", () => {
    const files = [{ path: "src/app/api/admin/things/route.ts", source: "export async function GET() {}\nexport async function DELETE() {}" }]
    const guard = `describe("x", () => {\n  it("GET things", async () => {\n    const { GET } = await import("@/app/api/admin/things/route")\n    await GET()\n  })\n})`
    expect(uncoveredRoutes(files, guard)).toEqual(["DELETE /api/admin/things"])
  })

  it("sees a handler whatever the form that exports it by name", () => {
    const files = [{ path: "src/app/api/admin/things/route.ts", source: "export function GET() {}\nexport const POST = async () => {}\nexport async function PATCH() {}" }]
    expect(uncoveredRoutes(files, "")).toEqual(["GET /api/admin/things", "POST /api/admin/things", "PATCH /api/admin/things"])
  })
})

describe("API route files export their handlers by name", () => {
  const apiDir = join(root, "src/app/api")

  it("no route file re-exports (`export {` or `export *`): such a handler would escape the guard tests", () => {
    const offenders = routeFiles(apiDir).flatMap((p) => reExports(readFileSync(p, "utf8")).map((line) => `${relative(root, p)}: ${line}`))
    expect(offenders).toEqual([])
  })

  it("reads the re-export forms", () => {
    expect(reExports("export { POST } from \"./x\"\nexport * from \"./y\"\n  export {GET as PUT}\nexport const GET = 1")).toEqual(["export { POST } from \"./x\"", "export * from \"./y\"", "export {GET as PUT}"])
  })
})
