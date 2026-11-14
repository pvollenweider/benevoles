// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Delivery side of a custom reminder (#1139), read at the very last moment by the outbox.
 *
 * The occurrence row is the claim: its unique key stops two cron runs from queueing the same
 * reminder twice. This module re-reads the registrations, cancellations, event/rule switches and
 * the shift's current start right before the email leaves, so a shift moved meanwhile defers or
 * moves the reminder, and an emptied group cancels it. No import of the outbox here: the sender
 * imports this module, the outbox imports this module, never the other way round.
 */

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import {
  groupRemindersByDay,
  type GroupableRegistration,
  type ReminderGroup,
} from "./reminder-groups"
import { orgTimeZone } from "./time-zone"
import { reminderPlaceActiveAt, reminderRuleDueAt, reminderRuleHours, type ReminderRuleInput } from "./reminder-rules"
import { pickShiftInfo, withDayContact, withSectorLeaders } from "./shift-info"
import { registrationToken } from "./token-vault"
import { hasEarlierDeadline, reminderCancelNotice, selfCancelDeadline } from "./cancel-deadline"
import type { NotificationPayload } from "./notifications/types"

export const CUSTOM_REMINDER_KIND = "reminder_rule" as const

/** Fields the email and the resolver need from the event; one select for both. */
export const customReminderEventSelect = {
  id: true,
  organizationId: true,
  title: true,
  publicStatus: true,
  remindersEnabled: true,
  latitude: true,
  longitude: true,
  dayContactName: true,
  dayContactPhone: true,
  cancelDeadlineDays: true,
  cancelDeadlineHours: true,
  organization: { select: { name: true, slug: true, timeZone: true } },
  sectorLeaders: { select: { roleName: true, name: true } },
} satisfies Prisma.EventSelect

export type CustomReminderEvent = Prisma.EventGetPayload<{ select: typeof customReminderEventSelect }>

export const customReminderRegistrationInclude = {
  volunteer: { select: { email: true, firstName: true } },
  shift: true,
  // The email confirmation (#1253) that made the place active: its `confirmedAt` is the real
  // activation instant, `Registration.createdAt` stays the request time (see reminderPlaceActiveAt).
  signupConfirmation: { select: { confirmedAt: true } },
} satisfies Prisma.RegistrationInclude

export type CustomReminderRegistration = Prisma.RegistrationGetPayload<{
  include: typeof customReminderRegistrationInclude
}>

export type CustomReminderGroup = ReminderGroup<CustomReminderRegistration & GroupableRegistration>

/** What the template and the resolver need, kept in the payload's data. */
export type CustomReminderData = {
  occurrenceId: string
  ruleId: string
  localDay: string
  volunteerName: string
  eventTitle: string
  eventId: string
  organizationName: string
  orgSlug: string
  shifts: {
    label: string
    roleName: string
    date: string
    startTime: string
    endTime: string
    locationDetails: string | null
    contactName: string | null
    contactPhone: string | null
    instructions: string | null
    latitude: number | null
    longitude: number | null
    dayContactName?: string | null
    dayContactPhone?: string | null
    sectorLeaderNames?: string[] | null
    mealOnTheGo?: boolean | null
    readBefore?: { slug: string; title: string }[] | null
  }[]
  editToken: string
  hoursUntil: number
  /** The rule's delay in elapsed hours, for the generic copy. */
  ruleHours: number
  cancelNotice: string | null
  cancelClosed: boolean
}

export function isCustomRuleReminder(payload: NotificationPayload): boolean {
  return payload.kind === CUSTOM_REMINDER_KIND
}

/** The grouped email of one occurrence, built from the current rows. */
export function buildCustomReminderPayload(input: {
  occurrenceId: string
  rule: Pick<ReminderRuleInput, "id" | "unit" | "value">
  event: CustomReminderEvent
  group: CustomReminderGroup
  now: Date
  timeZone: string
}): NotificationPayload {
  const { occurrenceId, rule, event, group, now, timeZone } = input
  const [first] = group.registrations
  const shifts = group.registrations.map((r) => ({
    label: r.shift.label,
    roleName: r.shift.roleName,
    date: r.shift.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    startTime: r.shift.startTime,
    endTime: r.shift.endTime,
    ...withSectorLeaders(withDayContact(pickShiftInfo(r.shift, event), event), r.shift.roleName, event.sectorLeaders),
  }))
  return {
    kind: CUSTOM_REMINDER_KIND,
    recipient: { email: first.volunteer.email, name: first.volunteer.firstName },
    volunteerId: group.volunteerId,
    organizationId: event.organizationId,
    data: {
      occurrenceId,
      ruleId: rule.id,
      localDay: group.localDay,
      volunteerName: first.volunteer.firstName,
      eventTitle: event.title,
      eventId: event.id,
      organizationName: event.organization.name,
      orgSlug: event.organization.slug,
      shifts,
      editToken: registrationToken.reveal(first),
      hoursUntil: Math.max(0, Math.round((group.earliestStart.getTime() - now.getTime()) / 3_600_000)),
      ruleHours: reminderRuleHours(rule) ?? 0,
      cancelNotice: reminderCancelNotice(first.shift, event, timeZone, now),
      cancelClosed: hasEarlierDeadline(event) && now >= selfCancelDeadline(first.shift, event, timeZone),
    },
  }
}

export type CustomReminderResolution =
  | { kind: "send"; payload: NotificationPayload }
  | { kind: "cancel"; reason: string }
  | { kind: "defer"; until: Date }

/**
 * Re-read everything one last time before the outbox sends a custom reminder (#1139). Null
 * payloads never leave: the outbox cancels the row with the returned reason.
 */
export async function resolveCustomRuleReminder(payload: NotificationPayload, now: Date): Promise<CustomReminderResolution> {
  const data = payload.data as CustomReminderData
  if (!data?.occurrenceId) return { kind: "cancel", reason: "Rappel introuvable." }
  const occurrence = await prisma.reminderOccurrence.findUnique({
    where: { id: data.occurrenceId },
    select: { id: true, eventId: true, volunteerId: true, localDay: true, ruleId: true, status: true, lastError: true },
  })
  if (!occurrence) return { kind: "cancel", reason: "Rappel introuvable." }
  if (occurrence.status === "sent") return { kind: "cancel", reason: "Rappel déjà envoyé." }
  if (occurrence.status === "cancelled") return { kind: "cancel", reason: occurrence.lastError ?? "Rappel annulé." }
  if (occurrence.status === "failed") return { kind: "cancel", reason: occurrence.lastError ?? "Rappel en échec définitif." }

  const event = await prisma.event.findUnique({ where: { id: occurrence.eventId }, select: customReminderEventSelect })
  if (!event || event.publicStatus !== "published" || !event.remindersEnabled) {
    return { kind: "cancel", reason: "Rappels coupés pour cet événement." }
  }
  const rule = await prisma.eventReminderRule.findUnique({ where: { id: occurrence.ruleId } })
  if (!rule || !rule.enabled || rule.eventId !== event.id) {
    return { kind: "cancel", reason: "Rappel désactivé pour cet événement." }
  }
  const registrations = await prisma.registration.findMany({
    where: {
      eventId: occurrence.eventId,
      volunteerId: occurrence.volunteerId,
      status: "active",
      shift: { status: { not: "cancelled" } },
    },
    include: customReminderRegistrationInclude,
  })
  const timeZone = orgTimeZone(event.organization)
  const group = groupRemindersByDay(
    registrations as (typeof registrations[number] & GroupableRegistration)[],
    () => timeZone,
  ).find((g) => g.localDay === occurrence.localDay) as CustomReminderGroup | undefined
  if (!group) return { kind: "cancel", reason: "Plus aucune inscription confirmée ce jour-là." }
  if (group.earliestStart.getTime() <= now.getTime()) {
    return { kind: "cancel", reason: "Le créneau a commencé." }
  }
  const hours = reminderRuleHours(rule)
  if (hours === null) return { kind: "cancel", reason: "Délai de rappel invalide." }
  const dueAt = reminderRuleDueAt(group.earliestStart, hours)
  if (dueAt.getTime() > now.getTime()) return { kind: "defer", until: dueAt }
  if (!group.registrations.some((r) => reminderPlaceActiveAt(r).getTime() <= dueAt.getTime())) {
    return { kind: "cancel", reason: "Inscription confirmée après l'heure du rappel." }
  }
  const built = buildCustomReminderPayload({ occurrenceId: occurrence.id, rule, event, group, now, timeZone })
  if (!built.recipient.email?.trim()) return { kind: "cancel", reason: "Aucune adresse email." }
  return { kind: "send", payload: built }
}

/**
 * Best-effort push of a custom reminder, once the email was accepted (#1139, same guard as the
 * legacy path: only after `sendNotification` said yes, so a suspended organisation never pushes).
 */
export async function sendCustomReminderPush(payload: NotificationPayload): Promise<void> {
  const data = payload.data as CustomReminderData
  if (!payload.volunteerId || !data?.editToken || !data.shifts?.length) return
  const [first] = data.shifts
  const body = data.shifts.length === 1
    ? `Rappel : ton créneau « ${first.label} » du ${first.date} arrive.`
    : `Rappel : tes ${data.shifts.length} créneaux du ${first.date} arrivent.`
  // Loaded here, not at module import: the push module reads the environment, and the outbox is
  // imported by routes and tests that do not send push at all.
  const { sendPushToVolunteer } = await import("./push")
  await sendPushToVolunteer(payload.volunteerId, {
    title: data.eventTitle,
    body,
    url: `/my/${data.editToken}`,
    tag: `reminder-rule-${data.occurrenceId}`,
  })
}
