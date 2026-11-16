import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { signupSchema } from "../signup"
import { cleanSourceDetail, normalizeSignupSource, signupSourceLabel, signupSourceRows, SIGNUP_SOURCE_DETAIL_MAX, SIGNUP_SOURCES, SOURCE_DETAIL_LONG_MESSAGE, SOURCE_UNKNOWN_MESSAGE } from "../signup-source"

const base = { organizationName: "Fête du village", contactName: "Camille", email: "camille@example.org", description: "Fête de village, une centaine de bénévoles sur deux jours." }

describe("« Comment avez-vous connu … ? » on the space request (#1094)", () => {
  it("offers the issue's choices in order, « Autre » last", () => {
    expect(SIGNUP_SOURCES.map((s) => s.label)).toEqual(["Moteur de recherche", "Une autre association ou un bénévole", "Réseau social", "Article ou blog", "Salon ou événement", "Autre"])
  })

  it("is optional: absent, empty or null leaves the request valid and stores nothing", () => {
    for (const extra of [{}, { source: "", sourceDetail: "" }, { source: null, sourceDetail: null }]) {
      const parsed = signupSchema.safeParse({ ...base, ...extra })
      expect(parsed.success).toBe(true)
      if (!parsed.success) continue
      expect(normalizeSignupSource(parsed.data.source, parsed.data.sourceDetail)).toEqual({ source: null, detail: null })
    }
  })

  it("accepts each offered choice and refuses any other value", () => {
    for (const s of SIGNUP_SOURCES) expect(signupSchema.safeParse({ ...base, source: s.value }).success).toBe(true)
    const bad = signupSchema.safeParse({ ...base, source: "tiktok-ads" })
    expect(!bad.success && bad.error.issues[0]).toMatchObject({ message: SOURCE_UNKNOWN_MESSAGE, path: ["source"] })
  })

  it("keeps the precision on one line and limits its length", () => {
    expect(cleanSourceDetail("  la\r\nnewsletter\t de   la commune  ")).toBe("la newsletter de la commune")
    const ok = signupSchema.safeParse({ ...base, source: "other", sourceDetail: ` ${"a".repeat(SIGNUP_SOURCE_DETAIL_MAX)}\n` })
    expect(ok.success && ok.data.sourceDetail).toBe("a".repeat(SIGNUP_SOURCE_DETAIL_MAX))
    const long = signupSchema.safeParse({ ...base, source: "other", sourceDetail: "a".repeat(SIGNUP_SOURCE_DETAIL_MAX + 1) })
    expect(!long.success && long.error.issues[0]).toMatchObject({ message: SOURCE_DETAIL_LONG_MESSAGE, path: ["sourceDetail"] })
  })

  it("stores the precision only with « Autre », never an empty one", () => {
    expect(normalizeSignupSource("social", "Instagram")).toEqual({ source: "social", detail: null })
    expect(normalizeSignupSource("other", "  la commune ")).toEqual({ source: "other", detail: "la commune" })
    expect(normalizeSignupSource("other", "   ")).toEqual({ source: "other", detail: null })
    expect(normalizeSignupSource("other", "x".repeat(300))?.detail).toHaveLength(SIGNUP_SOURCE_DETAIL_MAX)
    expect(normalizeSignupSource("unknown", "x")).toEqual({ source: null, detail: null })
  })

  it("labels the answer for the operator", () => {
    expect(signupSourceLabel("search", null)).toBe("Moteur de recherche")
    expect(signupSourceLabel("other", "la commune")).toBe("Autre : la commune")
    expect(signupSourceLabel("other", null)).toBe("Autre")
    expect(signupSourceLabel(null, null)).toBeNull()
    expect(signupSourceLabel("gone", null)).toBeNull()
  })

  it("totals the spaces per answer, « Sans réponse » last with unknown values", () => {
    const rows = signupSourceRows([
      { source: "search", count: 3 },
      { source: "other", count: 1200 },
      { source: null, count: 5 },
      { source: "retired-choice", count: 2 },
    ])
    expect(rows.map((r) => r.key)).toEqual(["source-search", "source-association", "source-social", "source-article", "source-event", "source-other", "source-none"])
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toMatchObject({ "source-search": "3", "source-association": "0", "source-other": new Intl.NumberFormat("fr-FR").format(1200), "source-none": "7" })
    expect(signupSourceRows([]).every((r) => r.value === "0")).toBe(true)
  })
})

/**
 * Operator-only (#1094): the answers live on the organisation, but only the super admin space and
 * the sign-up code may read them. A new reader elsewhere (an admin API, an export) fails here.
 */
describe("signupSource stays out of the organisations' own pages and APIs (#1094)", () => {
  const root = join(__dirname, "..", "..")
  const allowed = new Set([
    "lib/signup-source.ts",
    "lib/signup-server.ts",
    "lib/usage-stats.ts",
    "app/super-admin/organizations/[slug]/page.tsx",
    "components/super-admin/OrgDetail.tsx",
    "app/super-admin/stats/page.tsx",
  ])
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (["generated", "__tests__", "__integration__", "node_modules"].includes(name)) return []
      return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
    })
  }

  it("is read only by the allowed files", () => {
    const readers = walk(root).filter((f) => /signupSource|sourceDetail/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f))
    // The form and its schema carry the typed answer in, never an organisation's stored one.
    const outside = readers.filter((f) => !allowed.has(f) && f !== "lib/signup.ts" && f !== "components/public/signup/SignupForm.tsx")
    expect(outside).toEqual([])
  })
})
