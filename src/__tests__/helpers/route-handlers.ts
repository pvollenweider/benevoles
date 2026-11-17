/**
 * The HTTP handlers of a route file, as the route guard tests read them from the source: every
 * form that exports one by name (`export async function POST(`, `export function POST(`,
 * `export const POST = …`). A handler exported another way (`export { POST }`, `export * from`)
 * would escape those tests, so `reExports` lists such lines and the tests refuse them.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

export const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

const HANDLER = /export\s+(?:async\s+function\s*\*?|function\s*\*?|const|let|var)\s+(GET|POST|PUT|PATCH|DELETE)\b/

/** Each exported handler and its source, up to the next exported handler. */
export function handlerBodies(source: string): Record<string, string> {
  const parts = source.split(new RegExp(HANDLER.source))
  const out: Record<string, string> = {}
  for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1]
  return out
}

/** The lines that export something without naming it in a declaration: `export {` or `export *`. */
export function reExports(source: string): string[] {
  return source.split("\n").filter((line) => /^\s*export\s*(\{|\*)/.test(line)).map((line) => line.trim())
}

/** Every `route.ts` under a directory. */
export function routeFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routeFilesUnder(path)
    return name === "route.ts" ? [path] : []
  })
}
