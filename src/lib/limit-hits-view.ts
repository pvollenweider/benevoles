// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the super admin reads about sending limits reached (#1100): pure functions, no Prisma (the
 * rows come from src/lib/limit-hits-data.ts). Grouped by organisation, newest first; each limit in
 * plain French; held emails (queued, they leave when the window ends) apart from refused ones (they
 * did not leave), which matter more.
 */

/** How far back the organisations page looks, and what « recently » means for the marker. */
export const LIMIT_HITS_DAYS = 7

/** The anchor of the block on an organisation's page, target of the list's marker. */
export const LIMIT_HITS_ANCHOR = "plafonds-envoi"

const LIMIT_LABELS: Record<string, string> = {
  org_per_minute: "Plafond par minute de l'organisation",
  org_per_day: "Plafond par jour de l'organisation",
  org_bulk_per_day: "Plafond par jour des envois en masse (messages, invitations, rappels, créneaux à compléter)",
  org_account_per_day: "Plafond par jour des emails de compte administrateur",
  global_per_minute: "Plafond par minute de toute la plateforme",
  recipient_per_hour: "Trop de demandes publiques pour une même adresse en une heure",
  signup_per_hour: "Trop de demandes d'inscription sur la plateforme en une heure",
}

/** A limit's name in plain French; an unknown name is shown as is rather than hidden. */
export function limitLabel(limit: string): string {
  return LIMIT_LABELS[limit] ?? `Plafond ${limit}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « 1 email retenu », « 3 emails retenus »; null when none. */
export function heldText(n: number): string | null {
  return n > 0 ? plural(n, "email retenu", "emails retenus") : null
}

/** « 1 refusé », « 2 refusés »; null when none. */
export function refusedText(n: number): string | null {
  return n > 0 ? plural(n, "refusé", "refusés") : null
}

/**
 * Whether the emails held for this organisation are still waiting: only what the outbox still
 * holds back is known, so « plus aucun en attente » never claims they all went (some may have
 * failed or been cancelled since).
 */
export function queueStatusText(stillHeld: number): string {
  if (stillHeld === 0) return "Plus aucun email retenu en attente"
  return `${plural(stillHeld, "email retenu", "emails retenus")} encore en attente`
}

const parts = (d: Date, timeZone: string) => ({
  day: d.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "short" }),
  time: d.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }),
})

/** « 23 oct. à 21:04 », « 23 oct. de 21:04 à 21:17 », or across days « du 23 oct. à 23:58 au 24 oct. à 00:01 ». */
export function limitHitWhen(firstAt: Date, lastAt: Date, timeZone: string): string {
  const a = parts(firstAt, timeZone)
  const b = parts(lastAt, timeZone)
  if (a.day !== b.day) return `du ${a.day} à ${a.time} au ${b.day} à ${b.time}`
  if (a.time === b.time) return `${a.day} à ${a.time}`
  return `${a.day} de ${a.time} à ${b.time}`
}

export type LimitHitRow = {
  id: string
  organizationId: string | null
  organization: { name: string; slug: string } | null
  limit: string
  heldCount: number
  refusedCount: number
  firstAt: Date
  lastAt: Date
}

export type LimitHitLine = {
  id: string
  label: string
  when: string
  firstAt: string
  lastAt: string
  held: string | null
  refused: string | null
}

export type OrgLimitHits = {
  /** The organisation's id, or « platform » for emails outside any organisation. */
  key: string
  name: string
  /** Null for the platform: no page to link to. */
  slug: string | null
  /** Null when nothing was held (only refused emails): the queue has nothing to say then. */
  queueStatus: string | null
  stillHeld: number
  refusedTotal: number
  hits: LimitHitLine[]
}

/** « Heures de Zurich. »: the zone every time of the block is shown in, named once. */
export function zoneSentence(timeZone: string): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") || timeZone
  return `Heures de ${city}.`
}

/** Said when only the latest rows could be shown. */
export const TRUNCATED_SENTENCE = "Seuls les relevés les plus récents sont montrés."

export const PLATFORM_LABEL = "Plateforme (emails sans organisation)"

/**
 * One entry per organisation, the one that hit a limit last first, each with its hits newest
 * first. `stillHeld`: per organisation id (« platform » for null), emails still held in the queue.
 */
export function groupLimitHits(rows: LimitHitRow[], stillHeld: Record<string, number>, timeZone: string): OrgLimitHits[] {
  const groups = new Map<string, { entry: OrgLimitHits; latest: number }>()
  const sorted = [...rows].sort((x, y) => y.lastAt.getTime() - x.lastAt.getTime())
  for (const r of sorted) {
    const key = r.organizationId ?? "platform"
    let g = groups.get(key)
    if (!g) {
      const waiting = stillHeld[key] ?? 0
      g = {
        latest: r.lastAt.getTime(),
        entry: {
          key,
          name: r.organization?.name ?? (r.organizationId ? "Organisation supprimée" : PLATFORM_LABEL),
          slug: r.organization?.slug ?? null,
          queueStatus: queueStatusText(waiting),
          stillHeld: waiting,
          refusedTotal: 0,
          hits: [],
        },
      }
      groups.set(key, g)
    }
    g.entry.refusedTotal += r.refusedCount
    g.entry.hits.push({
      id: r.id,
      label: limitLabel(r.limit),
      when: limitHitWhen(r.firstAt, r.lastAt, timeZone),
      firstAt: r.firstAt.toISOString(),
      lastAt: r.lastAt.toISOString(),
      held: heldText(r.heldCount),
      refused: refusedText(r.refusedCount),
    })
  }
  const anyHeld = new Set(rows.filter((r) => r.heldCount > 0).map((r) => r.organizationId ?? "platform"))
  return [...groups.values()]
    .sort((x, y) => y.latest - x.latest)
    .map((g) => (g.entry.stillHeld === 0 && !anyHeld.has(g.entry.key) ? { ...g.entry, queueStatus: null } : g.entry))
}
