// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The navigation of one event in the organiser admin: the tabs shown on every
 * /admin/events/[id]/* page (rendered once by src/app/admin/events/[id]/layout.tsx), the pages
 * each tab groups, and the header's one primary action, which follows the event's state.
 * Pure: no Prisma, no clock (the layout passes `today` in the organisation's zone). Used by a
 * client component, so nothing here may import a server module.
 */

import { currentStage, type StageId } from "./event-lifecycle"

export type EventTabId = "overview" | "day-of" | "shifts" | "registrations" | "communication" | "share" | "documents" | "settings"

/** A page of a tab: its path under /admin/events/[id] ("" = the overview) and its label in the tab's own navigation. */
export type EventSubPage = { path: string; label: string; /** Deeper pages shown as this one (staffing/search under staffing). */ nested?: string[] }

export type EventTabDef = { id: EventTabId; label: string; pages: EventSubPage[] }

/** In display order. « Jour J » is contextual (eventTabs decides whether it shows). */
export const EVENT_TABS: EventTabDef[] = [
  { id: "overview", label: "Aperçu", pages: [{ path: "", label: "Aperçu" }, { path: "review", label: "Vérification et publication" }] },
  { id: "day-of", label: "Jour J", pages: [{ path: "day-of", label: "Jour J" }] },
  { id: "shifts", label: "Créneaux", pages: [{ path: "shifts", label: "Créneaux" }, { path: "staffing", label: "Où manque-t-il du monde ?", nested: ["staffing/search"] }] },
  { id: "registrations", label: "Inscriptions", pages: [{ path: "registrations", label: "Inscriptions" }, { path: "invitations", label: "Invitations" }] },
  { id: "communication", label: "Messages", pages: [{ path: "message", label: "Messages" }] },
  {
    id: "share", label: "Partage",
    pages: [{ path: "share", label: "Liens" }, { path: "qr", label: "QR code" }, { path: "pages", label: "Pages d'information" }, { path: "preview", label: "Aperçu bénévole" }],
  },
  { id: "documents", label: "Documents", pages: [{ path: "print", label: "Documents à imprimer" }] },
  {
    id: "settings", label: "Réglages",
    pages: [{ path: "edit", label: "Informations" }, { path: "questions", label: "Questions" }, { path: "sector-leaders", label: "Responsables de secteur" }],
  },
]

/** The pages of the « ⋯ » menu: they belong to no tab. */
export const EVENT_MENU_PAGES = [
  { path: "log", label: "Journal" },
  { path: "duplicate", label: "Dupliquer" },
] as const

/** Anchor of the permanent deletion section, at the bottom of the Réglages page. */
export const DELETE_SECTION_ID = "suppression-definitive"

const eventBase = (eventId: string) => `/admin/events/${eventId}`

export const eventHref = (eventId: string, path: string) => (path ? `${eventBase(eventId)}/${path}` : eventBase(eventId))

/**
 * The path of `pathname` under the event ("" for the overview, "staffing/search", ...), or null
 * when the pathname is not one of this event's pages. Trailing slashes are ignored.
 */
export function eventSubPath(pathname: string, eventId: string): string | null {
  const base = eventBase(eventId)
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (clean === base) return ""
  if (!clean.startsWith(`${base}/`)) return null
  return clean.slice(base.length + 1)
}

/** Which tab a page belongs to, and which of its pages (by path) it is shown as. */
export function locatePage(subPath: string | null): { tab: EventTabId; page: string } | null {
  if (subPath === null) return null
  for (const tab of EVENT_TABS) {
    for (const p of tab.pages) {
      if (p.path === subPath || p.nested?.includes(subPath)) return { tab: tab.id, page: p.path }
    }
  }
  return null
}

/** The tab of `pathname`, or null (the menu pages, an unknown path). */
export function activeTab(pathname: string, eventId: string): EventTabId | null {
  return locatePage(eventSubPath(pathname, eventId))?.tab ?? null
}

const dayBefore = (isoDay: string) => new Date(Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/**
 * The « Jour J » window: from the day before the first day (the critique's « la veille ») to the
 * last day, on calendar days of the organisation's zone. `today` is "YYYY-MM-DD" in that zone.
 */
export function inDayOfWindow(event: { startDate: string; endDate: string }, today: string): boolean {
  return today >= dayBefore(event.startDate) && today <= event.endDate.slice(0, 10)
}

/** aria-current of a link: "page" on the exact page, "true" on another page of the same group. */
export type Current = "page" | "true" | undefined

export type EventTab = { id: EventTabId; label: string; href: string; current: Current }

export type EventNavFacts = {
  eventId: string
  publicStatus: string
  /** "YYYY-MM-DD" */
  startDate: string
  /** "YYYY-MM-DD" */
  endDate: string
  /** "YYYY-MM-DD", today in the organisation's zone. */
  today: string
}

/**
 * The tabs to show on `pathname`. « Jour J » shows in its window unless the event is archived,
 * and always on the day-of page itself, so the page being read is never missing from the tabs.
 */
export function eventTabs(facts: EventNavFacts, pathname: string): EventTab[] {
  const located = locatePage(eventSubPath(pathname, facts.eventId))
  const dayOf = facts.publicStatus !== "archived" && inDayOfWindow(facts, facts.today)
  return EVENT_TABS
    .filter((t) => t.id !== "day-of" || dayOf || located?.tab === "day-of")
    .map((t) => {
      const first = t.pages[0].path
      const current: Current = located?.tab !== t.id ? undefined : located.page === first && eventSubPath(pathname, facts.eventId) === first ? "page" : "true"
      return { id: t.id, label: t.label, href: eventHref(facts.eventId, first), current }
    })
}

export type SubNavLink = { label: string; href: string; current: Current }

/**
 * The second-level navigation of the current tab, when it groups several pages (Créneaux,
 * Inscriptions, Partage, Réglages). Null otherwise. The review page, reached from the overview's
 * checklist, is not listed: it is a step, not a page of the tab.
 */
export function eventSubNav(pathname: string, eventId: string): { tabLabel: string; links: SubNavLink[] } | null {
  const sub = eventSubPath(pathname, eventId)
  const located = locatePage(sub)
  if (!located || located.tab === "overview") return null
  const tab = EVENT_TABS.find((t) => t.id === located.tab)!
  if (tab.pages.length < 2) return null
  return {
    tabLabel: tab.label,
    links: tab.pages.map((p) => ({
      label: p.label,
      href: eventHref(eventId, p.path),
      current: p.path === located.page ? (sub === p.path ? "page" : "true") : undefined,
    })),
  }
}

export type PrimaryAction =
  | { kind: "link"; label: string; href: string; /** The page it leads to: hidden there. */ path: string }
  | { kind: "publish"; /** The review page publishes too: hidden there. */ path: string }

export type PrimaryFacts = EventNavFacts & { shiftCount: number; isListed: boolean }

/**
 * The header's single primary action, from the event's stage: add shifts to an empty draft,
 * publish a ready one, open « Jour J » in its window, share the link of a published event,
 * read the summary once it is over. Nothing for an archived event.
 */
export function eventPrimaryAction(f: PrimaryFacts): PrimaryAction | null {
  const stage: StageId = currentStage({
    publicStatus: f.publicStatus, isListed: f.isListed, endDate: f.endDate, today: f.today, shiftCount: f.shiftCount,
    confirmationMessage: null, remindersEnabled: false,
  })
  const link = (label: string, path: string, hash = ""): PrimaryAction => ({ kind: "link", label, href: `${eventHref(f.eventId, path)}${hash}`, path })
  switch (stage) {
    case "draft":
      return link("Ajouter des créneaux", "shifts")
    case "ready":
      return { kind: "publish", path: "review" }
    case "published":
      return inDayOfWindow(f, f.today) ? link("Ouvrir le jour J", "day-of") : link("Partager le lien", "share")
    case "finished":
      return link("Voir le résumé", "print", "#reports-summary")
    case "archived":
      return null
  }
}

/** Whether the primary action leads to (or repeats) the page being read. */
export function primaryIsCurrent(action: PrimaryAction, pathname: string, eventId: string): boolean {
  return eventSubPath(pathname, eventId) === action.path
}

/**
 * The event's dates for the header, read as calendar days (stored as UTC midnights): « 4 juillet
 * 2026 », « 4 au 5 juillet 2026 », « 30 juin au 2 juillet 2026 », « 31 décembre 2026 au 1 janvier 2027 ».
 */
export function eventDatesLabel(startDate: string, endDate: string): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", ...opts })
  const [s, e] = [startDate.slice(0, 10), endDate.slice(0, 10)]
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }
  if (e <= s) return fmt(s, full)
  const from = s.slice(0, 4) !== e.slice(0, 4) ? fmt(s, full) : s.slice(0, 7) !== e.slice(0, 7) ? fmt(s, { day: "numeric", month: "long" }) : fmt(s, { day: "numeric" })
  return `${from} au ${fmt(e, full)}`
}
