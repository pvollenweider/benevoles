import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * #760 acceptance criterion: « A guard test fails when a new hard-coded `benevol.app` string is
 * added outside an allowlist. » The instance's name, domain and contact come from src/lib/site.ts
 * (SITE_NAME, CONTACT_EMAIL, NEXT_PUBLIC_APP_URL); only the files below may name benevol.app.
 */

const ROOT = join(__dirname, "..", "..", "..")
const SRC = join(ROOT, "src")

/** Each allowed file, and why. */
const ALLOWED: Record<string, string> = {
  "src/lib/site.ts": "the upstream defaults themselves",
  "src/app/legal/privacy/page.tsx": "hosted service only (HOSTED_SERVICE)",
  "src/app/legal/terms/page.tsx": "hosted service only (HOSTED_SERVICE)",
  "src/lib/landing-seo.ts": "the hosted service's marketing home (HOSTED_SERVICE)",
  "src/app/legal/exploitant/page.tsx": "names the software the instance runs (attribution)",
  "src/components/PublicFooter.tsx": "« benevol.app vX.Y.Z » links to the upstream source code (AGPL attribution)",
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "__integration__" || name === "generated" ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** The code of a file without its comments: a comment may name the upstream project. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n")
}

describe("no hard-coded instance outside the allowlist (#760)", () => {
  it("names benevol.app only where it is allowed", () => {
    const offenders = sources(SRC)
      .map((path) => relative(ROOT, path))
      .filter((path) => !(path in ALLOWED))
      .filter((path) => /benevol\.app/.test(code(readFileSync(join(ROOT, path), "utf8"))))
    expect(offenders, "use siteName(), siteDomain() or contactEmail() from src/lib/site.ts").toEqual([])
  })

  it("keeps the allowlist honest: every allowed file still names it", () => {
    for (const path of Object.keys(ALLOWED)) expect(code(readFileSync(join(ROOT, path), "utf8")), path).toMatch(/benevol\.app/)
  })
})
