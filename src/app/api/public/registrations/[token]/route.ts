// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { blocksWorkload, workloadModeOf, workloadNotices, type WorkloadMode } from "@/lib/workload-view"
import { orgTimeZone } from "@/lib/time-zone"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { eventPublicUrl, orgBaseUrl } from "@/lib/urls"
import { signUpUrl, volunteerGroupCode } from "@/lib/personal-page-links"
import { keptAnswerRows, myAnswerRows, myAnswersQuery } from "@/lib/my-answers"
import { splitByScope } from "@/lib/question-scope"
import { answersEditState } from "@/lib/answer-changes"
import { promoteNextInWaitlist } from "@/lib/waitlist"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import { contactPhone } from "@/lib/contact-phone"
import { registrationToken } from "@/lib/token-vault"
import { calendarFeedKeyFromEnv, calendarFeedToken, calendarFeedUrls } from "@/lib/calendar-feed"
import { pickShiftInfo, withDayContact, withSectorLeaders } from "@/lib/shift-info"
import { LIVE_STATUSES, OCCUPYING_STATUSES } from "@/lib/registration-capacity"
import { WITHDRAWABLE_STATUSES, planVolunteerWithdraw } from "@/lib/volunteer-withdraw"
import { withdrawRequestSchema } from "@/lib/volunteer-withdraw-schema"
import { queueWithdrawalNotifications } from "@/lib/withdrawal-notifications"
import { queueWithdrawalConfirmation } from "@/lib/withdrawal-confirmation"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { cancelRefusedError, isLateWithdrawal, selfCancelState, shiftStartsAt } from "@/lib/cancel-deadline"
import { endSwapsAfter } from "@/lib/shift-swap-server"

const tooManyAttempts = () => NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

/** The personal page's workload notices (#1171): protected events only, committed missions only. */
function personalWorkload(regs: { status: string; shift: { id: string; date: Date; startTime: string; endTime: string; status: string } }[], mode: WorkloadMode): string[] {
  if (!blocksWorkload(mode)) return []
  const held = regs.filter((r) => (r.status === "active" || r.status === "requested") && r.shift.status !== "cancelled").map((r) => r.shift)
  return workloadNotices(held, mode).map((n) => n.text)
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Failed lookups count per IP, valid use per link (#609).
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()

  const { token } = await params

  // Waiting and offered registrations open the page too (#374): the volunteer sees where they stand.
  const LIVE = [...LIVE_STATUSES]
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: LIVE } },
    include: {
      volunteer: true,
      event: {
        select: {
          id: true, title: true, slug: true, confirmationMessage: true, publicStatus: true,
          location: true, latitude: true, longitude: true, publicInstructions: true,
          dayContactName: true, dayContactPhone: true,
          cancelDeadlineDays: true, cancelDeadlineHours: true,
          // Workload protection (#1171): the limits this person's own programme is judged against.
          workloadProtectionEnabled: true, workloadPolicy: true, startDate: true,
          // Whether a sign-up for more shifts is possible (#988).
          endDate: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true,
          pages: { select: { slug: true, title: true }, orderBy: { displayOrder: "asc" } },
          // The sector leaders' names only (#560): never their email nor their link.
          sectorLeaders: { select: { roleName: true, name: true } },
          organization: { select: { slug: true, timeZone: true, replyToEmail: true, ...ORG_LIFECYCLE_SELECT } },
        },
      },
    },
  })

  if (!registration) {
    await recordTokenMiss(req)
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }
  // Nothing of the page while the organisation is deactivated or suspended (src/lib/org-lifecycle.ts).
  if (!orgLinksOpen(registration.event.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "read"))) return tooManyAttempts()

  // Toutes les inscriptions actives du même bénévole pour le même événement
  const allRegistrations = await prisma.registration.findMany({
    where: {
      volunteerId: registration.volunteerId,
      eventId: registration.eventId,
      status: { in: LIVE },
    },
    include: { shift: true, groupLink: { select: { code: true } } },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  // « Mes réponses » (#984): the event's questions with this volunteer's own answers only, the
  // volunteer being the one of the link's registration.
  // Only the questions asked for the postes of their live registrations (#1140); the answers kept
  // for the others are shown apart, read-only.
  const { asked: questions, outOfScope } = splitByScope(
    await prisma.eventQuestion.findMany(myAnswersQuery(registration.eventId, registration.volunteerId)),
    allRegistrations.map((r) => r.shift.roleName),
  )

  const orgSlug = registration.event.organization.slug
  const baseUrl = orgBaseUrl(orgSlug)
  const eventUrl = `${baseUrl}/${registration.event.slug}`
  const { event } = registration
  const timeZone = orgTimeZone(registration.event.organization)
  const now = new Date()
  // The event's page with the organisation (`?org=` locally, #982): for more shifts (#988), with the
  // volunteer's group link, only while a sign-up is possible; for the page itself, while published.
  const publicUrl = eventPublicUrl(orgSlug, event.slug)
  const groupCode = volunteerGroupCode(allRegistrations, registration.id)
  const feedKey = calendarFeedKeyFromEnv()
  return NextResponse.json({
    // What the « Avant ta mission » block falls back on (#560). The information pages only
    // open once the event is published: no link to a page that would answer 404.
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      publicInstructions: event.publicInstructions,
      pages: event.publicStatus === "published" ? event.pages.map((p) => ({ title: p.title, url: `${eventUrl}/${p.slug}` })) : [],
    },
    confirmationMessage: registration.event.confirmationMessage ?? null,
    answers: myAnswerRows(questions),
    keptAnswers: keptAnswerRows(outOfScope),
    // Whether the answers can still change from this page (#984): the withdrawals' lock (#946).
    answersEdit: answersEditState({ registrations: allRegistrations, setting: event, timeZone, now }),
    orgHomeUrl: baseUrl,
    eventUrl,
    eventPageUrl: event.publicStatus === "published" ? publicUrl : null,
    signUpUrl: signUpUrl({ event, eventUrl: publicUrl, groupCode, now, timeZone }),
    timeZone,
    // Workload protection (#1171): the limits the person's own programme no longer respects (left
    // by a cancellation, say), from their confirmed places and pending requests. Their own data,
    // behind their link; nothing for an event without protection.
    workload: personalWorkload(allRegistrations, workloadModeOf(event, timeZone)),
    // The calendar subscription of this link (#961): a read-only address of its own, never the link.
    calendarFeed: feedKey ? calendarFeedUrls(baseUrl, calendarFeedToken(registration.id, registration.editTokenHash, feedKey)) : null,
    // The newest email carrying the link, across the volunteer's registrations on this event (#376).
    linkEmailedAt: allRegistrations.reduce<Date | null>((m, r) => (r.linkEmailedAt && (!m || r.linkEmailedAt > m) ? r.linkEmailedAt : m), null),
    contactEmail: registration.event.organization.replyToEmail || process.env.EMAIL_REPLY_TO || null,
    volunteer: {
      firstName: registration.volunteer.firstName,
      lastName: registration.volunteer.lastName,
      email: registration.volunteer.email,
      availabilityPeriods: registration.volunteer.availabilityPeriods,
      availabilityNote: registration.volunteer.availabilityNote,
      // Same number admins and sector leaders see (contactPhone): the one given for this
      // registration, else for another of this event's registrations, else the profile's.
      phone: contactPhone({
        phone: registration.phone?.trim() || allRegistrations.find((r) => r.phone?.trim())?.phone,
        volunteer: registration.volunteer,
      }) ?? "",
    },
    registrations: allRegistrations.map((r) => ({
      id: r.id,
      editToken: registrationToken.reveal(r),
      status: r.status,
      waitingPosition: r.waitingPosition,
      waitingExpiresAt: r.waitingExpiresAt,
      // Whether the volunteer can still cancel it by themself (#946), as of this answer: the
      // DELETE below decides again, so a page left open past the deadline is refused there.
      selfCancel: (() => {
        const state = selfCancelState({ status: r.status, shift: r.shift, setting: event, timeZone, now })
        return state.allowed ? { allowed: true, deadline: state.deadline } : { allowed: false, reason: state.reason }
      })(),
      shift: {
        id: r.shift.id,
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
        // The event's day-of contact (#560) stands in for a shift without a contact, and the role's
        // sector leaders are named, for a confirmed place only: never shown to someone on a
        // waitlist or awaiting approval.
        ...(r.status === "active"
          ? withSectorLeaders(withDayContact(pickShiftInfo(r.shift, event), event), r.shift.roleName, event.sectorLeaders)
          : pickShiftInfo(r.shift, event)),
      },
    })),
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()

  const { token } = await params

  // The optional « Un mot pour l'organisation ? » (#559): validated before touching the
  // database. Never stored on the registration nor in the event log — only in the outbox row
  // built below, until it is sent (src/lib/retention.ts).
  const parsedBody = withdrawRequestSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsedBody.success) return NextResponse.json({ error: "Message trop long." }, { status: 400 })
  const message = parsedBody.data.message?.trim() || null

  // Every live registration the personal page shows can be withdrawn: a place, a pending
  // request (#484), a waitlist entry or a spot offered from the waitlist.
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...WITHDRAWABLE_STATUSES] } },
    include: {
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true } },
      event: { select: { id: true, title: true, organizationId: true, cancelDeadlineDays: true, cancelDeadlineHours: true, organization: { select: { slug: true, timeZone: true, ...ORG_LIFECYCLE_SELECT } } } },
    },
  })
  const plan = registration && planVolunteerWithdraw(registration.status)

  if (!registration || !plan) {
    await recordTokenMiss(req)
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }
  // No withdrawal either: the registrations stay as they are while the organisation is closed.
  if (!orgLinksOpen(registration.event.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "withdraw"))) return tooManyAttempts()

  // Never once the shift has started, nor past the event's earlier deadline for a confirmed place
  // (#946). The source of truth: the page may have been loaded before the deadline.
  const timeZone = orgTimeZone(registration.event.organization)
  const now = new Date()
  const cancel = selfCancelState({ status: registration.status, shift: registration.shift, setting: registration.event, timeZone, now })
  if (!cancel.allowed) {
    return NextResponse.json({ error: cancelRefusedError(cancel.reason), code: "cancel_closed", reason: cancel.reason }, { status: 409 })
  }

  // Conditional on still being in the status read above (#264): a double click would otherwise
  // cancel twice, log twice and trigger two waitlist promotions for a single freed spot. Same
  // for a request the organizer is deciding on, an offer being confirmed or expiring, or a
  // waitlist entry being offered a spot right now: whichever runs first wins, the other finds
  // it settled.
  const { count } = await prisma.registration.updateMany({
    where: { id: registration.id, status: registration.status },
    data: { status: "cancelled" },
  })
  if (count === 0) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }
  // A swap request built on this place can no longer happen (#1174): ended, the other person told.
  await endSwapsAfter(prisma, { registrationIds: [registration.id] }, "registration_gone", { type: "volunteer", id: registration.volunteerId }, now)

  const cancelLogId = await logEvent({
    eventId: registration.eventId,
    actor: { type: "volunteer", id: registration.volunteerId },
    action: "registration.cancelled",
    entityType: "Registration",
    entityId: registration.id,
    // shiftId unchanged: recorded so the narrative can still name the shift — see
    // describeChanges's shiftId filter in event-log-narrative.ts. The optional message never
    // goes in `changes`: it must not end up in the event log (#559).
    changes: { status: { from: registration.status, to: "cancelled" }, shiftId: { from: registration.shiftId, to: registration.shiftId } },
  })

  // Only a withdrawal that held a spot (place, request, offered spot) hands it to the next
  // person on the waitlist. Leaving the waitlist frees nothing: the entries behind move up.
  let waitlistTookSpot = false
  if (plan.releasesSpot) {
    waitlistTookSpot = await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch((e) => { reportError("waitlist.promote")(e); return false })
  }

  // Tells the organization's admins and the role's sector leaders (#559): only for a confirmed
  // place or a pending request. Best-effort: a failure here must not undo the withdrawal just
  // recorded, already answered to the volunteer as settled.
  if (plan.notifiesOrganizers) {
    try {
      const occupied = await prisma.registration.count({ where: { shiftId: registration.shiftId, status: { in: [...OCCUPYING_STATUSES] } } })
      // Grouped (#869): withdrawals of the event within a few minutes make one email per person.
      // Less than 24 hours before the start (#946): sent at once, not grouped.
      const late = isLateWithdrawal(shiftStartsAt(registration.shift, timeZone), now)
      const dueIds = await queueWithdrawalNotifications({
        registrationId: registration.id,
        event: registration.event,
        shift: registration.shift,
        volunteerName: `${registration.volunteer.firstName} ${registration.volunteer.lastName}`,
        message,
        waitlistTookSpot,
        placesMissing: Math.max(registration.shift.capacity - occupied, 0),
        late,
        timeZone,
      }, now)
      deliverAfterResponse(dueIds)
    } catch (e) {
      reportError("withdrawal.notify")(e)
    }
  }

  // Says back to the volunteer what was just done from their link (#809): if the link is in
  // someone else's hands, they learn it and can tell the organisation. Grouped (#1190): several
  // withdrawals of the event in a row make one email listing them. Best-effort too.
  if (registration.volunteer.email) {
    try {
      const outboxIds = await queueWithdrawalConfirmation({
        registrationId: registration.id,
        previousStatus: registration.status,
        event: registration.event,
        shift: registration.shift,
        volunteer: { id: registration.volunteerId, firstName: registration.volunteer.firstName, lastName: registration.volunteer.lastName, email: registration.volunteer.email },
        timeZone,
      }, now)
      deliverAfterResponse(outboxIds)
    } catch (e) {
      reportError("withdrawal.confirm")(e)
    }
  }

  return NextResponse.json({ success: true })
}
