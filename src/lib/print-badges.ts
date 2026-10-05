// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { esc, volunteersOf, type SheetShift } from "./print-sheets"
import type { ColorKey } from "./roles"
import { clockTime } from "@/lib/gantt-utils"
import { printLogoHtml, type OrgLogo } from "./org-logo"

/**
 * Printable identification badges (#190, V1): one badge per active volunteer of an event,
 * on A4 sheets to print and cut. Fixed layout, a few options, no photo, no QR code (a badge
 * can be photographed or lost, so it carries no link to personal data). Pure: the route loads
 * the data and calls renderBadges.
 */

export type BadgeOptions = {
  /** Only volunteers with a shift on this role. */
  role?: string | null
  /** Only this volunteer, by id: to reprint one badge (a name could match two homonyms). */
  volunteer?: string | null
  /** Print the last name under the first name (default true). */
  lastName: boolean
  /** Print the volunteer's shifts (default true). */
  shifts: boolean
  /** Colour of the band: the role's, the event's, or none. */
  color: "role" | "event" | "none"
}

export const DEFAULT_BADGE_OPTIONS: BadgeOptions = { role: null, volunteer: null, lastName: true, shifts: true, color: "role" }

/** Reads the options from a query string, ignoring anything unexpected. */
export function badgeOptionsFrom(params: URLSearchParams): BadgeOptions {
  const color = params.get("color")
  return {
    role: params.get("role")?.trim() || null,
    volunteer: params.get("volunteer")?.trim() || null,
    // From the hub's form a ticked box sends "1" and an unticked one nothing; "0" also hides.
    lastName: params.has("lastName") ? params.get("lastName") !== "0" : !params.has("shifts") && !params.has("color"),
    shifts: params.has("shifts") ? params.get("shifts") !== "0" : !params.has("lastName") && !params.has("color"),
    color: color === "event" || color === "none" ? color : "role",
  }
}

export type BadgeData = {
  eventTitle: string
  organizationName: string
  /** The organization's logo (#300), in a corner of each badge; its name stays on the band. */
  logo?: OrgLogo | null
  /** Event accent colour key (#300), if any. */
  accentColorKey?: string | null
  shifts: (SheetShift & { colorKey?: string | null })[]
}

export type Badge = {
  firstName: string
  lastName: string
  roles: string[]
  /** "sam. 4 juil. 18:00–23:00", chronological. */
  shifts: string[]
  /** Hex colour of the band, or null for the neutral band. */
  color: string | null
}

/** Print hex of each palette key: the -700 shade, dark enough for white text. */
export const PALETTE_HEX: Record<ColorKey, string> = {
  blue: "#1447e6", amber: "#973c00", pink: "#c6005c", violet: "#7008e7", red: "#c10007", orange: "#9f2d00",
  stone: "#44403b", teal: "#005f5a", indigo: "#432dd7", cyan: "#005f78", lime: "#3c6300", rose: "#c70036",
  fuchsia: "#a800b7", sky: "#00598a", emerald: "#006045", yellow: "#894b00",
}

const hexOf = (key: string | null | undefined): string | null =>
  key && Object.prototype.hasOwnProperty.call(PALETTE_HEX, key) ? PALETTE_HEX[key as ColorKey] : null

const fmtDayShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })


/** The badges to print, one per volunteer, filtered and coloured per the options. */
export function badgesOf(d: BadgeData, o: BadgeOptions = DEFAULT_BADGE_OPTIONS): Badge[] {
  const eventColor = hexOf(d.accentColorKey)
  return volunteersOf(d.shifts)
    .filter(({ shifts }) => !o.role || shifts.some((s) => s.roleName === o.role))
    .filter(({ volunteer }) => !o.volunteer || volunteer.id === o.volunteer)
    .map(({ volunteer, shifts }) => {
      const own = o.role ? shifts.filter((s) => s.roleName === o.role) : shifts
      const roles = [...new Set(own.map((s) => s.roleName))]
      const roleColor = hexOf((own as BadgeData["shifts"]).find((s) => s.colorKey)?.colorKey)
      const color = o.color === "none" ? null : o.color === "event" ? eventColor : roleColor ?? eventColor
      return {
        firstName: volunteer.firstName,
        lastName: volunteer.lastName,
        roles,
        shifts: own.map((s) => `${fmtDayShort(s.date)} ${clockTime(s.startTime)}–${clockTime(s.endTime)}${s.label && s.label !== s.roleName ? ` · ${s.label}` : ""}`),
        color,
      }
    })
}

/** One badge: DOM order = visual order (event line over the band, then the name as a heading). */
function badgeHtml(b: Badge, o: BadgeOptions, d: BadgeData): string {
  const band = b.color ? ` style="background:${b.color};color:#fff"` : ""
  return `<li class="badge${d.logo ? " has-logo" : ""}">
  <div class="band"${band}><p class="org">${esc(d.organizationName)} · ${esc(d.eventTitle)}</p></div>
  ${printLogoHtml(d.logo, "logo", { maxWidth: 76, maxHeight: 45 })}
  <h2 class="who">
    <span class="first">${esc(b.firstName)}</span>
    ${o.lastName && b.lastName ? `<span class="last">${esc(b.lastName)}</span>` : ""}
  </h2>
  <p class="role">${esc(b.roles.join(" · ")) || "&nbsp;"}</p>
  ${o.shifts && b.shifts.length ? `<ul class="shifts" role="list">${b.shifts.slice(0, 4).map((s) => `<li>${esc(s)}</li>`).join("")}${b.shifts.length > 4 ? `<li>+ ${b.shifts.length - 4} autre${b.shifts.length - 4 > 1 ? "s" : ""}</li>` : ""}</ul>` : ""}
</li>`
}

/** Ten badges per A4 sheet; each sheet is its own list so the page break is explicit. */
export const BADGES_PER_SHEET = 10
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Why no badge came out, in words that name what was chosen (the form is on another tab). */
export function emptyMessage(o: BadgeOptions, chosenName: string | null): string {
  if (o.volunteer && !chosenName) return "Ce bénévole n'a plus d'inscription active sur cet événement."
  if (o.volunteer && o.role) return `${esc(chosenName)} n'est inscrit·e sur aucun créneau du poste « ${esc(o.role)} ». Choisissez « Tous les postes » pour imprimer son badge.`
  return `Aucun bénévole inscrit${o.role ? ` pour le poste « ${esc(o.role)} »` : ""}.`
}

/** A printable A4 page of badges (2 × 5 per sheet, 90 × 55 mm each), with a screen header. */
export function renderBadges(d: BadgeData, o: BadgeOptions = DEFAULT_BADGE_OPTIONS): string {
  const badges = badgesOf(d, o)
  // The chosen person, looked up across every post, so an empty result can still name them.
  const chosen = o.volunteer ? volunteersOf(d.shifts).find((e) => e.volunteer.id === o.volunteer)?.volunteer ?? null : null
  const chosenName = chosen ? `${chosen.firstName} ${chosen.lastName}`.trim() : null
  const scope = [o.role ? `poste « ${o.role} »` : null, chosenName].filter(Boolean).join(", ")
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Badges – ${esc(d.eventTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --ink: #111; --ink-2: #444; --rule: #bbb; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: #fff; padding: 20px 24px; }
    .doc-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 10px; margin-bottom: 18px; border-bottom: 2px solid var(--ink); }
    .doc-head h1 { font-size: 22px; font-weight: 700; line-height: 1.15; }
    .doc-head .kind { font-size: 13px; color: var(--ink-2); margin-top: 3px; }
    .print-btn { background: var(--ink); color: #fff; border: 2px solid var(--ink); border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .print-btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
    .empty { font-style: italic; color: var(--ink-2); }

    /* Sheets: two columns of 90 mm, five rows of 55 mm; the dashed rule is the cutting line. */
    .sheet { list-style: none; display: grid; grid-template-columns: repeat(2, 90mm); grid-auto-rows: 54.6mm; gap: 0; width: 180mm; margin: 0 auto 10mm; }
    .badge { position: relative; border: 1px dashed var(--rule); padding: 5mm 6mm 4mm 6mm; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
    .badge .band { position: absolute; left: 0; right: 0; top: 0; height: 8mm; background: var(--ink); color: #fff; }
    .badge .org { padding: 1.6mm 6mm 0; font-size: 8pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .badge .who { margin-top: 6mm; font-weight: 400; }
    .badge .first { display: block; font-size: 22pt; font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; text-wrap: balance; }
    .badge .last { display: block; font-size: 13pt; font-weight: 600; font-variant-caps: all-small-caps; letter-spacing: 0.03em; margin-top: 1mm; }
    .badge .role { font-size: 11pt; font-weight: 700; margin-top: auto; color: var(--ink); }
    .badge .shifts { list-style: none; font-size: 8.5pt; color: var(--ink-2); line-height: 1.3; margin-top: 1mm; }
    /* The logo (#300) in the top right corner under the band, on the white of the badge; the name keeps clear of it. */
    .badge .logo { position: absolute; top: 10.5mm; right: 5mm; max-width: 20mm; max-height: 12mm; width: auto; height: auto; object-fit: contain; }
    .badge.has-logo .who { padding-right: 22mm; }
    .mono .badge .logo { filter: grayscale(1); }
    .sheet-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    @page { size: A4 portrait; margin: 10mm 15mm; }
    @media print {
      body { padding: 0; }
      .doc-head, .no-print { display: none; }
      .sheet { width: auto; margin-bottom: 0; break-after: page; page-break-after: always; }
      .sheet:last-child { break-after: auto; page-break-after: auto; }
      .badge { border-color: #999; }
      .badge .band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header class="doc-head">
    <div>
      <h1>${esc(d.eventTitle)}</h1>
      <p class="kind"><strong>Badges</strong> · ${esc(d.organizationName)} · ${badges.length} badge${badges.length > 1 ? "s" : ""}${scope ? ` · ${esc(scope)}` : ""}${badges.length ? ` · ${BADGES_PER_SHEET} par feuille A4, à découper sur les pointillés` : ""}</p>
    </div>
    <button type="button" class="print-btn" onclick="window.print()">Imprimer</button>
  </header>
  <main${o.color === "none" ? ` class="mono"` : ""}>
    ${badges.length === 0
      ? `<p class="empty">${emptyMessage(o, chosenName)}</p>`
      : chunk(badges, BADGES_PER_SHEET).map((group, i, all) => `<ul class="sheet" role="list" aria-label="Feuille ${i + 1} sur ${all.length}">${group.map((b) => badgeHtml(b, o, d)).join("")}</ul>`).join("")}
  </main>
</body>
</html>`
}

/**
 * Options of the badge reprint select: one per volunteer id, sorted by name. People sharing a name
 * are told apart by their email; if that is still ambiguous (no email), by their first post, and
 * as a last resort by a number, so no two options ever read the same.
 */
export function reprintOptions(people: { id: string; firstName: string; lastName: string; email: string | null; post?: string | null }[]): { id: string; label: string }[] {
  const unique = [...new Map(people.map((p) => [p.id, p])).values()]
  const nameOf = (p: (typeof unique)[number]) => `${p.firstName} ${p.lastName}`.trim()
  const tally = (labels: string[]) => labels.reduce((m, l) => m.set(l.toLowerCase(), (m.get(l.toLowerCase()) ?? 0) + 1), new Map<string, number>())
  let labels = unique.map(nameOf)
  let seen = tally(labels)
  labels = unique.map((p, i) => ((seen.get(labels[i].toLowerCase()) ?? 0) > 1 ? `${nameOf(p)} (${p.email ?? "sans email"})` : labels[i]))
  seen = tally(labels)
  labels = unique.map((p, i) => ((seen.get(labels[i].toLowerCase()) ?? 0) > 1 && p.post ? `${labels[i].slice(0, -1)}, ${p.post})` : labels[i]))
  seen = tally(labels)
  const rank = new Map<string, number>()
  labels = labels.map((l) => {
    if ((seen.get(l.toLowerCase()) ?? 0) < 2) return l
    const n = (rank.get(l.toLowerCase()) ?? 0) + 1
    rank.set(l.toLowerCase(), n)
    return `${l} n° ${n}`
  })
  return unique.map((p, i) => ({ id: p.id, label: labels[i] })).sort((a, b) => a.label.localeCompare(b.label, "fr"))
}
