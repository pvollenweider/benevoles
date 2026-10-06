// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The old single-page guides are being split into units (#649): a link such as
 * `/doc/benevole#confirmation` must keep working once that section has moved to `/doc/<slug>`.
 * The fragment never reaches the server, so the guide's page hands the map of moved anchors
 * (legacyAnchorTargets in src/lib/doc-units.ts) to a small client component
 * (src/app/doc/LegacyAnchorRedirect.tsx), which asks this pure function where to go.
 *
 * Kept free of any server import: the client bundle loads it.
 */

/** A target is always a unit of the documentation, on this site: never anything else. */
const TARGET_RE = /^\/doc\/[a-z0-9]+(?:-[a-z0-9]+)*(?:#[a-z0-9]+(?:-[a-z0-9]+)*)?$/

/**
 * Where `hash` (`location.hash`, « # » included or not) now lives, or null to stay: no fragment, an
 * id still on the page (the section hasn't moved, or the guide still shows it during the split),
 * an anchor no unit claims, a malformed fragment or a target that isn't a documentation unit.
 */
export function legacyAnchorRedirect(
  hash: string,
  targets: Readonly<Record<string, string>>,
  isOnPage: (id: string) => boolean,
): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  if (raw === "") return null
  let id: string
  try {
    id = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (isOnPage(id) || !Object.hasOwn(targets, id)) return null
  const target = targets[id]
  return TARGET_RE.test(target) ? target : null
}
