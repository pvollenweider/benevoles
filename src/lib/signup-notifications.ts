// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Notifications of a public sign-up (#293, #352), built into an outbox collector and returned as
 * payloads, each with its dedupe key (#315). The public registration route stores them in its
 * registration transaction, so the registrations and their notifications commit together.
 *
 * Server-only: the helpers read the organization's admins and sector leaders through Prisma.
 */

import { sendAdminNotification, sendConfirmationEmail } from "./notification-helpers"
import type { NotificationPayload } from "./notifications"
import { collectNotifications } from "./notifications/outbox"
import { notifySectorLeadersOfSignup } from "./sector-leaders"
import { pickShiftInfo, type ShiftInfo } from "./shift-info"

export type SignupShift = ShiftInfo & {
  id: string
  label: string
  roleName: string
  date: Date
  startTime: string
  endTime: string
}

export type SignupEvent = {
  id: string
  title: string
  organizationId: string
  organization: { slug: string }
  confirmationMessage: string | null
  latitude?: number | null
  longitude?: number | null
}

export type CreatedRegistration = { id: string; shiftId: string; status: string; waitingPosition: number | null }

export type SignupNotificationInput = {
  event: SignupEvent
  /** The shifts asked for, in the order of the sign-up. */
  shifts: SignupShift[]
  volunteer: { email: string; firstName: string; lastName: string }
  /** The registrations just created, in the order of `shifts`. */
  registrations: CreatedRegistration[]
  /** Clear registration token per shift id (#290); the first registration's opens the management page. */
  tokens: Map<string, string>
}

/**
 * Confirmation (active places), request acknowledgement (#484), admin notification, sector leaders
 * (not for requests, #484) and waitlist confirmations, in that order.
 */
export async function buildSignupNotifications(
  input: SignupNotificationInput,
): Promise<(NotificationPayload & { dedupeKey: string })[]> {
  const { event, shifts, registrations, tokens } = input
  const { email, firstName, lastName } = input.volunteer
  const editToken = tokens.get(registrations[0].shiftId)!
  const waitlistRegs = registrations.filter((r) => r.status === "waiting")
  const activeRegs = registrations.filter((r) => r.status === "active")
  const requestedRegs = registrations.filter((r) => r.status === "requested")

  const shiftData = (regs: CreatedRegistration[]) => shifts
    .filter((s) => regs.some((r) => r.shiftId === s.id))
    .map((s) => ({
      label: s.label,
      roleName: s.roleName,
      date: s.date.toLocaleDateString("fr-FR"),
      startTime: s.startTime,
      endTime: s.endTime,
      ...pickShiftInfo(s, event),
    }))
  const activeShiftData = shiftData(activeRegs)
  const outbox = collectNotifications()
  if (activeRegs.length > 0) {
    await sendConfirmationEmail({
      to: email,
      volunteerName: `${firstName} ${lastName}`,
      eventTitle: event.title,
      shifts: activeShiftData,
      editToken,
      orgSlug: event.organization.slug,
      confirmationMessage: event.confirmationMessage ?? undefined,
    }, outbox.send)
  }
  // Sign-up approval (#484): a request is not a place, and the email says so.
  if (requestedRegs.length > 0) {
    await outbox.send({
      kind: "registration_requested",
      recipient: { email, name: `${firstName} ${lastName}` },
      data: {
        volunteerName: `${firstName} ${lastName}`,
        eventTitle: event.title,
        shifts: shiftData(requestedRegs).map(({ label, date, startTime, endTime }) => ({ label, date, startTime, endTime })),
        editToken,
        orgSlug: event.organization.slug,
      },
    })
  }
  await sendAdminNotification({
    organizationId: event.organizationId,
    eventTitle: event.title,
    volunteerName: `${firstName} ${lastName}`,
    volunteerEmail: email,
    shifts: shifts.map((s) => ({
      label: s.label,
      roleName: s.roleName,
      date: s.date.toLocaleDateString("fr-FR"),
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  }, outbox.send)
  // Sector leaders hear of a request once it is accepted (#484).
  for (const shift of shifts.filter((s) => !requestedRegs.some((r) => r.shiftId === s.id))) {
    await notifySectorLeadersOfSignup({
      eventId: event.id,
      eventTitle: event.title,
      orgSlug: event.organization.slug,
      volunteerName: `${firstName} ${lastName}`,
      shift,
    }, outbox.send)
  }

  // Waitlist confirmation for waiting registrations
  for (const wr of waitlistRegs) {
    const shift = shifts.find((s) => s.id === wr.shiftId)
    if (!shift) continue
    await outbox.send({
      kind: "waitlist_confirmation",
      recipient: { email, name: `${firstName} ${lastName}` },
      data: {
        volunteerName: `${firstName} ${lastName}`,
        eventTitle: event.title,
        shiftLabel: shift.label,
        shiftDate: shift.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
        waitingPosition: wr.waitingPosition ?? 1,
        orgSlug: event.organization.slug,
      },
    })
  }

  // One key per notification of this sign-up (#315): a repeated enqueue stores it once.
  return outbox.payloads.map((p) => ({
    ...p,
    dedupeKey: `${p.kind}:${registrations[0].id}:${p.recipient.email ?? ""}`,
  }))
}
