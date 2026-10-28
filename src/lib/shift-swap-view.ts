// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { selfCancelDeadline, type CancelDeadlineSetting } from "./cancel-deadline"
import {
  beforeSwapDeadline, isLiveSwapStatus, needsSwapApproval, personSwapCheck, swapCompatibility, swapDeadline, swapRefusalMessage,
  type HeldRegistration, type SwapEndReason, type SwapPerson, type SwapShift, type SwapStatus,
} from "./shift-swaps"

/**
 * What a volunteer's personal page shows of the shift swaps of their event (#1174), built from rows
 * the server read (src/lib/shift-swap-data.ts). Pure, no Prisma.
 *
 * - `publishable`: their confirmed registrations that can be published (« Je cherche à échanger ce
 *   créneau »): none already in a live request on either side, no poste assigned by the
 *   organisation only, still before the shift's self-cancellation deadline.
 * - `mine`: the requests they take part in, live or ended, with « Tu cèdes … » (`gives`) and « Tu
 *   reçois … » (`receives`), the state, the deadline and the revision their actions must carry.
 * - `offers`: the open requests of other people they could actually answer: only those where one of
 *   their own confirmed registrations passes every rule on both sides (compatibility, both plans,
 *   deadline). Only the mission is shown (date, times, poste, place): never who published it, so
 *   the page is no directory of volunteers (Codex, PR 2).
 */

export type SwapShiftView = { id: string; roleName: string; label: string; date: string; startTime: string; endTime: string; locationDetails: string | null; instructions: string | null }

export type MySwap = {
  requestId: string
  side: "requester" | "counterpart"
  status: SwapStatus
  revision: number
  /** ISO; the last instant any step can happen (strictly before). */
  deadline: string
  needsApproval: boolean
  gives: SwapShiftView
  receives: SwapShiftView | null
  /** Why it ended, in the volunteers' words; null while live, or ended by a person's choice. */
  endMessage: string | null
  /**
   * The other person, « Jean D. », once an offer exists, and only for the two of them (owner
   * decision, 2026-10-27); null before any offer. Open requests of others never carry a name.
   */
  otherName: string | null
}

export type SwapOfferable = { requestId: string; shift: SwapShiftView; deadline: string; registrationIds: string[] }

export type VolunteerSwapView = {
  enabled: boolean
  /**
   * Whom a swap can be with (#1175): « poste » (the same poste only), or « secteur » once the event
   * organises its postes by sectors (any poste of the same sector). Words only: volunteers never
   * see sectors, the page says « un poste où tu peux aller » and names each poste.
   */
  scope: "poste" | "secteur"
  publishable: { registrationId: string; deadline: string; shift: SwapShiftView }[]
  mine: MySwap[]
  offers: SwapOfferable[]
  /** The shift of each of my confirmed registrations, by registration id, to name what I would give. */
  ownShifts: Record<string, SwapShiftView>
}

export type ViewShift = SwapShift & { label: string; instructions?: string | null }
export type ViewRegistration = { id: string; volunteerId: string; eventId: string; status: string; shift: ViewShift }
export type ViewRequest = {
  id: string; status: string; registrationId: string; volunteerId: string; shiftId: string
  counterRegistrationId: string | null; counterVolunteerId: string | null; counterShiftId: string | null
  revision: number; declinedVolunteerIds: string[]; expiresAt: Date; endReason: string | null; updatedAt: Date
}

export type VolunteerSwapInput = {
  now: Date
  timeZone: string
  event: CancelDeadlineSetting & { shiftSwapsEnabled: boolean; shiftSwapsApproval: boolean; sectorsAdoptedAt?: Date | string | null }
  me: string
  /** Each person concerned (me and the requesters of open requests), by volunteer id. */
  persons: Map<string, SwapPerson>
  /** Their live registrations of the event, by volunteer id. */
  held: Map<string, (HeldRegistration & ViewRegistration)[]>
  /** Every shift the requests point to, by id (the snapshot shifts). */
  shifts: Map<string, ViewShift>
  /** The event's live requests, and mine whatever their state. */
  requests: ViewRequest[]
  reserved: Map<string, string[]>
  limits: Map<string, number>
  assignedOnlyRoles: Set<string>
  /** « Jean D. » of the other party of my requests, by volunteer id (rosterDisplayName). */
  names?: Map<string, string | null>
}

export function shiftView(s: ViewShift): SwapShiftView {
  const date = typeof s.date === "string" ? new Date(s.date) : s.date
  return { id: s.id, roleName: s.roleName, label: s.label, date: date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime, locationDetails: s.locationDetails?.trim() || null, instructions: s.instructions?.trim() || null }
}

const PERSONAL_ENDS = new Set(["withdrawn", "applied"])

export function buildVolunteerSwapView(input: VolunteerSwapInput): VolunteerSwapView {
  const { now, timeZone, event, me } = input
  const scope = event.sectorsAdoptedAt ? "secteur" as const : "poste" as const
  const empty: VolunteerSwapView = { enabled: event.shiftSwapsEnabled, scope, publishable: [], mine: [], offers: [], ownShifts: {} }
  const myHeld = input.held.get(me) ?? []
  const deadlineOf = (expiresAt: Date, shifts: (ViewShift | undefined)[]) =>
    swapDeadline({ expiresAt, given: shifts.filter((s): s is ViewShift => !!s), setting: event, timeZone })

  const mine: MySwap[] = []
  for (const r of input.requests) {
    const side = r.volunteerId === me ? "requester" : r.counterVolunteerId === me ? "counterpart" : null
    if (!side) continue
    const own = input.shifts.get(side === "requester" ? r.shiftId : r.counterShiftId ?? "")
    if (!own) continue
    const other = input.shifts.get(side === "requester" ? r.counterShiftId ?? "" : r.shiftId)
    mine.push({
      requestId: r.id,
      side,
      status: r.status as SwapStatus,
      revision: r.revision,
      deadline: deadlineOf(r.expiresAt, [input.shifts.get(r.shiftId), r.counterShiftId ? input.shifts.get(r.counterShiftId) : undefined]).toISOString(),
      needsApproval: !!other && needsSwapApproval(own, other, event),
      gives: shiftView(own),
      receives: other ? shiftView(other) : null,
      endMessage: !isLiveSwapStatus(r.status) && !PERSONAL_ENDS.has(r.status) && r.endReason ? swapRefusalMessage(r.endReason as SwapEndReason) : null,
      otherName: r.counterVolunteerId ? input.names?.get(side === "requester" ? r.counterVolunteerId : r.volunteerId) ?? null : null,
    })
  }
  if (!event.shiftSwapsEnabled) return { ...empty, mine }

  // Registrations of mine already part of a live request, on either side.
  const busy = new Set<string>()
  for (const r of input.requests) {
    if (!isLiveSwapStatus(r.status)) continue
    busy.add(r.registrationId)
    if (r.counterRegistrationId && r.status !== "open") busy.add(r.counterRegistrationId)
  }

  const publishable = myHeld
    .filter((h) => h.status === "active" && !busy.has(h.id) && h.shift.status !== "cancelled" && !h.shift.assignedOnly && !input.assignedOnlyRoles.has(h.shift.roleName))
    .map((h) => ({ registrationId: h.id, deadline: selfCancelDeadline(h.shift, event, timeZone) }))
    .filter((p) => beforeSwapDeadline(now, p.deadline))
    .map((p) => ({ registrationId: p.registrationId, deadline: p.deadline.toISOString(), shift: shiftView(myHeld.find((h) => h.id === p.registrationId)!.shift) }))

  const meAsPerson = input.persons.get(me)
  const offers: SwapOfferable[] = []
  for (const r of input.requests) {
    if (r.status !== "open" || r.volunteerId === me || r.declinedVolunteerIds.includes(me) || !meAsPerson) continue
    const requester = input.persons.get(r.volunteerId)
    const theirHeld = input.held.get(r.volunteerId) ?? []
    const theirs = theirHeld.find((h) => h.id === r.registrationId && h.shift.id === r.shiftId)
    if (!requester || !theirs) continue
    const ids: string[] = []
    let deadline = null as Date | null
    for (const mineReg of myHeld) {
      if (mineReg.status !== "active" || busy.has(mineReg.id)) continue
      if (!swapCompatibility(theirs, mineReg, { assignedOnlyRoles: input.assignedOnlyRoles }).ok) continue
      const d = deadlineOf(r.expiresAt, [theirs.shift, mineReg.shift])
      if (!beforeSwapDeadline(now, d)) continue
      const rules = { reserved: input.reserved, limits: input.limits }
      if (!personSwapCheck({ person: meAsPerson, giving: mineReg, receiving: theirs.shift, held: myHeld, ...rules }).ok) continue
      if (!personSwapCheck({ person: requester, giving: theirs, receiving: mineReg.shift, held: theirHeld, ...rules }).ok) continue
      ids.push(mineReg.id)
      deadline = deadline && deadline < d ? deadline : d
    }
    if (ids.length > 0 && deadline) offers.push({ requestId: r.id, shift: shiftView(theirs.shift), deadline: deadline.toISOString(), registrationIds: ids })
  }

  const ownShifts = Object.fromEntries(myHeld.filter((h) => h.status === "active").map((h) => [h.id, shiftView(h.shift)]))
  return { enabled: true, scope, publishable, mine, offers, ownShifts }
}
