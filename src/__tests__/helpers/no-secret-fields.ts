import { expect } from "vitest"

/**
 * Admin responses never carry a token, a hash, an encrypted value or a password (#1009). Fails on
 * any key, however deep, whose name looks like one. `allow` lists legitimate keys that only
 * resemble one, such as a `hasToken` boolean (no admin route returns one today).
 */
export const SECRET_KEY = /token(hash|enc|legacy)?$|hash|encrypted|secret|password|enc$/i

export function secretKeyPaths(value: unknown, allow: readonly string[] = [], path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => secretKeyPaths(v, allow, `${path}[${i}]`))
  if (!value || typeof value !== "object" || value instanceof Date) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
    ...(SECRET_KEY.test(k) && !allow.includes(k) ? [`${path}.${k}`] : []),
    ...secretKeyPaths(v, allow, `${path}.${k}`),
  ])
}

export function expectNoSecretFields(value: unknown, allow: readonly string[] = []): void {
  expect(secretKeyPaths(value, allow), "secret-looking fields in the response").toEqual([])
}

/**
 * What Prisma returns for `args.select` (or `args.include`) out of a full row, nested relations
 * included: lets a mocked model behave like the real one, so a route that forgets its `select`
 * hands back the token columns and the test sees them.
 */
export function applySelect<T extends Record<string, unknown>>(row: T, args?: { select?: unknown; include?: unknown }): Record<string, unknown> {
  const project = (r: Record<string, unknown>, spec: Record<string, unknown> | undefined, keepScalars: boolean) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      const isRelation = v !== null && typeof v === "object" && !(v instanceof Date)
      if (spec && k in spec) {
        const s = spec[k]
        if (!s) continue
        if (s === true || !isRelation) out[k] = v
        else out[k] = Array.isArray(v) ? v.map((x) => applySelect(x, s as never)) : applySelect(v as Record<string, unknown>, s as never)
      } else if (keepScalars && !isRelation) {
        out[k] = v
      }
    }
    return out
  }
  if (args?.select) return project(row, args.select as Record<string, unknown>, false)
  return project(row, args?.include as Record<string, unknown> | undefined, true)
}
