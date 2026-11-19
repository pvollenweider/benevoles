// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What /mes-inscriptions/<token> shows (#1429, lot A), pure and client-safe: the server reads the
 * rows, this module decides what belongs to the page and in which order.
 *
 * The page lists every upcoming registration of one volunteer in one organisation, across all of
 * the organisation's events — unpublished and archived events included, as long as a shift is
 * still ahead: hiding one would prevent its cancellation (owner decision, 2026-11-19). Past and
 * started shifts are left out; the per-event page keeps their history.
 *
 * Only the states a registration can actually have are named: confirmé, liste d'attente, place
 * proposée, demande en attente de validation. Cancellation eligibility comes from the existing
 * per-event rules (src/lib/cancel-deadline.ts), never a second copy.
 */

import { selfCancelState, shiftStartsAt, type CancelDeadlineSetting, type SelfCancelReason } from "./cancel-deadline"
import { LIVE_STATUSES } from "./registration-capacity"

export const ORG_SCOPE_SENTENCE = (organizationName: string) =>
  `Ce lien donne accès à toutes tes inscriptions auprès de ${organizationName} et permet de les modifier. Ne le partage pas.`

/** The words of a registration's state on the organisation page. Never colour alone. */
export function orgRegistrationStatusLabel(status: string, waitingPosition?: number | null): string {
  switch (status) {
    case "active":
      return "Confirmé"
    case "waiting":
      return waitingPosition ? `Liste d'attente, position ${waitingPosition}` : "Liste d'attente"
    case "offered":
      return "Place proposée"
    case "requested":
      return "Demande en attente de validation"
    default:
      return status
  }
}

/** The status badge classes of DESIGN.md, with the word always next to them. */
export function orgRegistrationStatusClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700"
    case "waiting":
      return "bg-amber-100 text-amber-800"
    case "offered":
      return "bg-purple-100 text-purple-800"
    case "requested":
      return "bg-amber-100 text-amber-900"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

export type OrgPageShiftInput = {
  id: string
  roleName: string
  label: string
  date: Date | string
  startTime: string
  endTime: string
}

export type OrgPageEventInput = {
  id: string
  title: string
  slug: string
  publicStatus: string
  cancelDeadlineDays: number | null
  cancelDeadlineHours: number | null
}

export type OrgPageRegistrationInput = {
  id: string
  status: string
  waitingPosition: number | null
  waitingExpiresAt: Date | string | null
  shift: OrgPageShiftInput
  event: OrgPageEventInput
}

export type OrgPageSelfCancel =
  | { allowed: true; deadline: string | null }
  | { allowed: false; reason: SelfCancelReason }

export type OrgPageShift = {
  id: string
  roleName: string
  label: string
  /** Calendar day, ISO at midnight UTC, read in UTC by the page. */
  date: string
  startTime: string
  endTime: string
}

export type OrgPageRegistration = {
  id: string
  status: string
  statusLabel: string
  statusClass: string
  waitingPosition: number | null
  waitingExpiresAt: string | null
  selfCancel: OrgPageSelfCancel
  shift: OrgPageShift
  event: { id: string; title: string; slug: string; publicStatus: string }
}

export type OrgPageData = {
  volunteer: { firstName: string; lastName: string; email: string | null }
  organization: { name: string; slug: string }
  timeZone: string
  /** Id of the first upcoming confirmed registration, highlighted above the list. */
  nextId: string | null
  registrations: OrgPageRegistration[]
  orgHomeUrl: string
  contactEmail: string | null
  scopeSentence: string
}

export type OrgPageBuildInput = {
  volunteer: { firstName: string; lastName: string; email: string | null }
  organization: { name: string; slug: string; timeZone: string | null }
  registrations: OrgPageRegistrationInput[]
  now: Date
  timeZone: string
  orgHomeUrl: string
  contactEmail?: string | null
}

const LIVE = new Set<string>(LIVE_STATUSES)

/** The real instant of the shift's start, using the same rule as every cancellation decision. */
function shiftStart(reg: OrgPageRegistrationInput, timeZone: string): number {
  return shiftStartsAt(reg.shift, timeZone).getTime()
}

function settingOf(event: OrgPageEventInput): CancelDeadlineSetting {
  return { cancelDeadlineDays: event.cancelDeadlineDays, cancelDeadlineHours: event.cancelDeadlineHours }
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : value
}

/** Builds the page's serialisable data, filtered and ordered. */
export function buildOrgPageData(input: OrgPageBuildInput): OrgPageData {
  const { timeZone, now } = input
  const upcoming = input.registrations
    .filter((r) => LIVE.has(r.status))
    .filter((r) => shiftStart(r, timeZone) > now.getTime())
    .sort((a, b) => shiftStart(a, timeZone) - shiftStart(b, timeZone) || a.event.title.localeCompare(b.event.title, "fr") || a.id.localeCompare(b.id))

  const registrations: OrgPageRegistration[] = upcoming.map((r) => {
    const state = selfCancelState({ status: r.status, shift: r.shift, setting: settingOf(r.event), timeZone, now })
    return {
      id: r.id,
      status: r.status,
      statusLabel: orgRegistrationStatusLabel(r.status, r.waitingPosition),
      statusClass: orgRegistrationStatusClass(r.status),
      waitingPosition: r.waitingPosition,
      waitingExpiresAt: iso(r.waitingExpiresAt),
      selfCancel: state.allowed
        ? { allowed: true, deadline: state.deadline ? state.deadline.toISOString() : null }
        : { allowed: false, reason: state.reason },
      shift: {
        id: r.shift.id,
        roleName: r.shift.roleName,
        label: r.shift.label,
        date: typeof r.shift.date === "string" ? r.shift.date : r.shift.date.toISOString(),
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
      },
      event: { id: r.event.id, title: r.event.title, slug: r.event.slug, publicStatus: r.event.publicStatus },
    }
  })

  return {
    volunteer: input.volunteer,
    organization: { name: input.organization.name, slug: input.organization.slug },
    timeZone,
    nextId: registrations.find((r) => r.status === "active")?.id ?? null,
    registrations,
    orgHomeUrl: input.orgHomeUrl,
    contactEmail: input.contactEmail ?? null,
    scopeSentence: ORG_SCOPE_SENTENCE(input.organization.name),
  }
}
