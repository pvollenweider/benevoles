// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Documentation captures (public/doc-img/*.png, made by scripts/screenshots.mjs) and the screens
 * they show. Run in CI by scripts/check-doc-screenshots.mjs: a PR that changes the source of a
 * screen shown in a capture regenerates that capture in the same PR, or says `doc-img: unchanged`
 * in its description or a commit message (a change that is not visible, e.g. a refactor).
 *
 * Each capture names the route files it shows; the files they import from src/app and
 * src/components (.tsx/.ts, followed transitively) count as its sources. src/lib is left out on
 * purpose: logic modules are shared by many screens and would flag every capture. Layouts are not
 * followed either (the admin menu would flag every admin capture for any menu change).
 *
 * Plain TypeScript without path aliases: the CI script imports it directly (Node type stripping).
 */

/** Capture name (file public/doc-img/<name>.png) → route files it shows. */
export const DOC_SCREENSHOTS: Record<string, string[]> = {
  "public-timeline": ["src/app/[eventSlug]/page.tsx"],
  "public-selection": ["src/app/[eventSlug]/page.tsx"],
  "public-registration-birthdate": ["src/app/[eventSlug]/page.tsx"],
  "public-timeline-mobile": ["src/app/[eventSlug]/page.tsx"],
  "public-group-link": ["src/app/[eventSlug]/page.tsx"],
  "public-permanences-mobile": ["src/app/[eventSlug]/page.tsx"],
  "public-waitlist-selection": ["src/app/[eventSlug]/page.tsx"],
  "public-my-page": ["src/app/my/[token]/page.tsx"],
  "public-personal-link": ["src/app/my/[token]/page.tsx"],
  "public-link-invalid": ["src/app/my/[token]/page.tsx"],
  "public-signup": ["src/app/inscription/page.tsx"],
  "leader-page": ["src/app/leader/[token]/page.tsx"],
  "admin-dashboard": ["src/app/admin/dashboard/page.tsx"],
  "admin-event-overview": ["src/app/admin/events/[id]/page.tsx"],
  "admin-group-links": ["src/app/admin/events/[id]/page.tsx"],
  "admin-embed": ["src/app/admin/events/[id]/page.tsx"],
  "admin-reminders": ["src/app/admin/events/[id]/page.tsx"],
  "admin-event-review": ["src/app/admin/events/[id]/review/page.tsx"],
  "admin-day-of": ["src/app/admin/events/[id]/day-of/page.tsx"],
  "admin-staffing": ["src/app/admin/events/[id]/staffing/page.tsx"],
  "admin-shifts": ["src/app/admin/events/[id]/shifts/page.tsx"],
  "admin-shift-series": ["src/app/admin/events/[id]/shifts/page.tsx"],
  "admin-recurrence-form": ["src/app/admin/events/[id]/shifts/page.tsx"],
  "admin-recurrences": ["src/app/admin/events/[id]/shifts/page.tsx"],
  "admin-invitations": ["src/app/admin/events/[id]/invitations/page.tsx"],
  "admin-registrations": ["src/app/admin/events/[id]/registrations/page.tsx"],
  "admin-registrations-requests": ["src/app/admin/events/[id]/registrations/page.tsx"],
  "admin-refuse-request": ["src/app/admin/events/[id]/registrations/page.tsx"],
  "admin-make-leader-modal": ["src/app/admin/events/[id]/registrations/page.tsx"],
  "admin-sector-leaders": ["src/app/admin/events/[id]/sector-leaders/page.tsx"],
  "admin-questions": ["src/app/admin/events/[id]/questions/page.tsx"],
  "admin-pages": ["src/app/admin/events/[id]/pages/page.tsx"],
  "admin-message": ["src/app/admin/events/[id]/message/page.tsx"],
  "admin-print": ["src/app/admin/events/[id]/print/page.tsx"],
  "admin-event-archive": ["src/app/admin/events/[id]/print/page.tsx"],
  "admin-members": ["src/app/admin/members/page.tsx"],
  "admin-member-activity": ["src/app/admin/members/[id]/page.tsx"],
}

export const OPT_OUT = "doc-img: unchanged"

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g

/** Module specifiers a source file imports or re-exports (static and dynamic imports). */
export function importSpecifiers(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(IMPORT)) found.push(match[1] ?? match[2])
  return found
}

function normalize(path: string): string {
  const out: string[] = []
  for (const part of path.split("/")) {
    if (part === "..") out.pop()
    else if (part !== "." && part !== "") out.push(part)
  }
  return out.join("/")
}

/**
 * Repository path of a local import followed for captures (src/app or src/components), or null
 * for packages, src/lib and anything else.
 */
export function resolveLocalImport(fromFile: string, specifier: string, exists: (path: string) => boolean): string | null {
  let base: string
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`
  else if (specifier.startsWith(".")) base = normalize(`${fromFile.split("/").slice(0, -1).join("/")}/${specifier}`)
  else return null
  if (!base.startsWith("src/app/") && !base.startsWith("src/components/")) return null
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (/\.tsx?$/.test(candidate) && exists(candidate)) return candidate
  }
  return null
}

/** Every source file a capture depends on: its route files and what they import, transitively. */
export function screenshotSources(entries: string[], read: (path: string) => string, exists: (path: string) => boolean): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const specifier of importSpecifiers(read(file))) {
      const resolved = resolveLocalImport(file, specifier, exists)
      if (resolved && !seen.has(resolved)) queue.push(resolved)
    }
  }
  return seen
}

/** True when a PR description or commit message opts out of regenerating captures. */
export function hasOptOut(texts: string[]): boolean {
  return texts.some((text) => text.toLowerCase().includes(OPT_OUT))
}

export type StaleScreenshot = { name: string; changedSources: string[] }

/**
 * Captures whose sources a PR changed while their PNG did not change. `changed` holds the
 * repository paths the PR touches.
 */
export function staleScreenshots(changed: Set<string>, sourcesByShot: Record<string, Set<string>>): StaleScreenshot[] {
  const stale: StaleScreenshot[] = []
  for (const [name, sources] of Object.entries(sourcesByShot)) {
    if (changed.has(`public/doc-img/${name}.png`)) continue
    const changedSources = [...sources].filter((path) => changed.has(path)).sort()
    if (changedSources.length > 0) stale.push({ name, changedSources })
  }
  return stale.sort((a, b) => a.name.localeCompare(b.name))
}
