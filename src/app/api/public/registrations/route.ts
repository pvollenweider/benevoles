// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { birthDateSchema } from "@/lib/civil-date"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/utils"
import { sendNotification } from "@/lib/notifications"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { buildSignupNotifications, type CreatedRegistration } from "@/lib/signup-notifications"
import { rateLimit, getClientIp, isRateLimited } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import {
  COMMITTED_STATUSES,
  LIVE_STATUSES,
  OCCUPYING_STATUSES,
  ShiftFullError,
  isUniqueViolation,
  lockShifts,
  planPlacement,
} from "@/lib/registration-capacity"
import { z } from "zod"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import { checkAnswers, planAnswerWrites } from "@/lib/event-questions"
import { reservedRoles } from "@/lib/role-reservation"
import {
  answersRefusal,
  existingOverlapRefusal,
  findOverlap,
  fullShift,
  fullShiftRefusal,
  minimumAgeRefusal,
  overlapWithExisting,
  registrationWindowRefusal,
  requiredPhoneRefusal,
  reservedRoleRefusal,
  selectionOverlapRefusal,
  type SignupRefusal,
} from "@/lib/signup-eligibility"
import { RoleLimitError, roleLimitBreaches, roleLimitMessage, roleLimits } from "@/lib/role-limit"

const schema = z.object({
  eventId: z.string(),
  shiftIds: z.array(z.string()).min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().optional(),
  // A real, past day (audit): an invalid string became an Invalid Date that passed every age check.
  // The form sends "" when no shift needs it: that is no birth date, not an invalid one.
  birthDate: z.preprocess((v) => (v === "" ? undefined : v), birthDateSchema.optional()),
  comment: z.string().optional(),
  consent: z.literal(true),
  inviteToken: z.string().optional(),
  /** Answers to the event's custom questions (#483), by question id. */
  answers: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "registrations", 20, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { eventId, shiftIds, firstName, lastName, email, phone, birthDate, comment, inviteToken } = parsed.data

  const event = await prisma.event.findFirst({
    where: { id: eventId, publicStatus: "published", organization: { active: true } },
    include: { organization: { select: { slug: true, timeZone: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })
  const refuse = (r: SignupRefusal) => NextResponse.json(r.body, { status: r.status })

  const windowRefusal = registrationWindowRefusal(event)
  if (windowRefusal) return refuse(windowRefusal)

  const phoneRefusal = requiredPhoneRefusal(event.requirePhone, phone)
  if (phoneRefusal) return refuse(phoneRefusal)

  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, eventId, status: { in: ["open"] } },
    include: { registrations: { where: { status: { in: [...OCCUPYING_STATUSES] } } } },
  })

  if (shifts.length !== shiftIds.length) {
    return NextResponse.json({ error: "Un ou plusieurs créneaux sont invalides ou fermés. Recharge la page." }, { status: 409 })
  }

  // Early, unlocked check for a friendly error — the authoritative one runs under lock below.
  // A full shift with a waitlist goes on: its registration is created with status "waiting".
  const fullRefusal = fullShiftRefusal(shifts)
  if (fullRefusal) return refuse(fullRefusal)

  const selectionRefusal = selectionOverlapRefusal(shifts)
  if (selectionRefusal) return refuse(selectionRefusal)

  // Roles reserved to members with a tag (#470): all the role's shifts count, see reservedRoleRefusal.
  const reserved = reservedRoles(await prisma.shift.findMany({
    where: { eventId, roleName: { in: [...new Set(shifts.map((s) => s.roleName))] }, status: { not: "cancelled" } },
    select: { roleName: true, reservedTags: true },
  }))
  const roleRefusal = await reservedRoleRefusal({
    shifts,
    reserved,
    email,
    loadInvite: async () => inviteToken
      ? prisma.memberInvite.findFirst({
          where: { ...linkToken.where(inviteToken), eventId },
          select: { volunteer: { select: { email: true, tags: true, active: true } } },
        })
      : null,
  })
  if (roleRefusal) return refuse(roleRefusal)

  // Custom questions (#483), checked here whatever the page did; stored with the registration.
  const questions = await prisma.eventQuestion.findMany({
    where: { eventId, archivedAt: null },
    select: { id: true, label: true, type: true, options: true, required: true },
  })
  const answerCheck = checkAnswers(questions, parsed.data.answers)
  if (!answerCheck.ok) return refuse(answersRefusal(answerCheck)!)

  // Minimum age (#192), authoritative: see minimumAgeRefusal.
  const ageRefusal = minimumAgeRefusal(shifts, birthDate)
  if (ageRefusal) return refuse(ageRefusal)

  // Volunteer is org-scoped: each (organizationId, email) is a unique roster entry.
  //
  // Nothing here proves the submitter owns `email` (#285, #312): anyone can type someone else's
  // address, known to the organization or not. So the management link (editToken: it opens
  // /my, which lists the volunteer's registrations, tokens and phone) is never returned on
  // screen — it goes out by email only — and an existing profile isn't changed. The one proof
  // of ownership is a valid member invite, which was emailed to that very volunteer.
  const organizationId = event.organizationId
  const birthDateValue = birthDate ? new Date(birthDate) : undefined
  // Case-insensitive: addresses stored before normalization (#310) may still have capitals
  // (case-only duplicates left for manual review); `email` itself is already normalized.
  const existing = await prisma.volunteer.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, organizationId },
    select: { id: true },
  })
  let ownsEmail = false
  if (existing) {
    if (inviteToken) {
      const invite = await prisma.memberInvite.findFirst({
        where: { ...linkToken.where(inviteToken), eventId, volunteerId: existing.id },
        select: { id: true },
      })
      ownsEmail = invite != null
    }

    const existingRegs = await prisma.registration.findMany({
      where: { volunteerId: existing.id, shiftId: { in: shiftIds }, status: { in: [...LIVE_STATUSES] } },
      select: { id: true },
    })
    if (existingRegs.length > 0) return alreadyRegistered(existing.id, eventId)

    const allEventRegs = await prisma.registration.findMany({
      where: { volunteerId: existing.id, eventId, status: { in: [...COMMITTED_STATUSES] } },
      include: { shift: true },
    })
    const clashRefusal = existingOverlapRefusal(allEventRegs, shifts)
    if (clashRefusal) return refuse(clashRefusal)
  }

  // Chaque inscription reçoit son propre token unique.
  // On retourne le token de la première comme lien de confirmation.
  //
  // Capacity, waitlist position and creation happen in one transaction holding a lock on the
  // selected shifts (#264): two sign-ups racing for the last spot are serialized, so only one
  // gets it and the other is waitlisted or refused. The partial unique index backs up the
  // "already registered" check above against a double submit racing itself.
  // One token per new registration, kept in clear only in memory: the confirmation email and
  // the response need it, the DB only stores its hash and encrypted copy (#290).
  const tokens = new Map(shiftIds.map((id) => [id, generateToken()]))

  // Notifications of this sign-up, built by the usual helpers into an outbox collector (#293).
  // Built and stored inside the registration transaction (#352): the registrations and their
  // notifications commit together, then delivery runs after the response. The helpers only read
  // (admins, sector leaders), so the shift locks are held a few queries longer, no more.
  const buildNotifications = (registrations: CreatedRegistration[]) => buildSignupNotifications({
    event,
    shifts,
    volunteer: { email, firstName, lastName },
    registrations,
    tokens,
  })

  let outcome: { registrations: Awaited<ReturnType<typeof prisma.registration.create>>[]; volunteerId: string; createdNow: boolean; outboxIds: string[] }
  try {
    outcome = await prisma.$transaction(async (tx) => {
      await lockShifts(tx, shiftIds)

      // A new volunteer is created in the same transaction as their registrations (#309): if the
      // registration fails (shift full, overlap, duplicate), no member record is left behind.
      // ON CONFLICT DO NOTHING (skipDuplicates) so a concurrent first sign-up with the same
      // address doesn't abort this transaction; whoever inserted it "created" it.
      let volunteerId = existing?.id
      let createdNow = false
      if (!volunteerId) {
        const { count } = await tx.volunteer.createMany({
          data: [{ firstName, lastName, email, phone, birthDate: birthDateValue, organizationId }],
          skipDuplicates: true,
        })
        createdNow = count === 1
        volunteerId = (await tx.volunteer.findFirstOrThrow({ where: { email, organizationId }, select: { id: true } })).id
      }

      // Then the volunteer (#285): two concurrent sign-ups of the same person to two different,
      // overlapping shifts lock different shift rows, so the overlap check has to be redone under
      // a per-volunteer lock too. Always shifts first, then volunteer: same order everywhere.
      await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${volunteerId} FOR UPDATE`
      const liveNow = await tx.registration.findMany({
        where: { volunteerId, eventId, status: { in: [...COMMITTED_STATUSES] } },
        include: { shift: true },
      })
      const clashNow = findOverlap(liveNow, shifts)
      if (clashNow) throw new OverlapError(clashNow.label)

      // Shifts per volunteer for a role (#466), under the same volunteer lock, so two concurrent
      // sign-ups of one person can't both pass. Every live registration counts, waitlist included.
      const limits = roleLimits(await tx.shift.findMany({
        where: { eventId, roleName: { in: [...new Set(shifts.map((s) => s.roleName))] }, maxPerVolunteer: { not: null } },
        select: { roleName: true, maxPerVolunteer: true },
      }))
      if (limits.size > 0) {
        const held = await tx.registration.findMany({
          where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] }, shift: { roleName: { in: [...limits.keys()] } } },
          select: { shift: { select: { roleName: true } } },
        })
        const [breach] = roleLimitBreaches(shifts, held.map((h) => h.shift), limits)
        if (breach) throw new RoleLimitError(breach)
      }
      const created = []
      for (const shift of shifts) {
        const occupied = await tx.registration.count({
          where: { shiftId: shift.id, status: { in: [...OCCUPYING_STATUSES] } },
        })
        const maxPos = await tx.registration.aggregate({
          where: { shiftId: shift.id, status: { in: ["waiting", "offered"] } },
          _max: { waitingPosition: true },
        })
        const placement = planPlacement({
          capacity: shift.capacity,
          occupied,
          waitlistEnabled: shift.waitlistEnabled,
          maxWaitingPosition: maxPos._max.waitingPosition,
          requiresApproval: shift.requiresApproval,
        })
        if (placement.status === "full") throw new ShiftFullError(shift.id, shift.label)
        created.push(
          await tx.registration.create({
            data: {
              linkEmailedAt: new Date(), // the confirmation email carries the link (#376)
              eventId,
              shiftId: shift.id,
              volunteerId,
              source: "public_form",
              comment,
              phone: phone?.trim() || null,
              ...registrationToken.data(tokens.get(shift.id)!),
              status: placement.status,
              waitingPosition: placement.status === "waiting" ? placement.waitingPosition : null,
            },
          })
        )
      }
      const outboxIds = await enqueueNotifications(await buildNotifications(created), tx, { organizationId: event.organizationId })
      // Answers (#483): replaced only with proof the submitter owns the address, as for the
      // profile below; otherwise only missing answers are added (see planAnswerWrites).
      const writes = planAnswerWrites(questions.map((q) => q.id), answerCheck.values, createdNow || ownsEmail)
      for (const [questionId, values] of writes.replace) {
        await tx.questionAnswer.upsert({
          where: { questionId_volunteerId: { questionId, volunteerId } },
          create: { questionId, eventId, volunteerId, values },
          update: { values },
        })
      }
      if (writes.addMissing.length > 0) {
        await tx.questionAnswer.createMany({
          data: writes.addMissing.map(([questionId, values]) => ({ questionId, eventId, volunteerId, values })),
          skipDuplicates: true,
        })
      }
      if (writes.clear.length > 0) {
        await tx.questionAnswer.deleteMany({ where: { volunteerId, questionId: { in: writes.clear } } })
      }
      return { registrations: created, volunteerId, createdNow, outboxIds }
    })
  } catch (e) {
    if (e instanceof ShiftFullError) return refuse(fullShift(e.shiftId, e.label))
    if (e instanceof RoleLimitError) {
      return NextResponse.json({ error: roleLimitMessage(e.breach), roleLimit: e.breach.roleName }, { status: 409 })
    }
    if (e instanceof OverlapError) return refuse(overlapWithExisting(e.label))
    if (isUniqueViolation(e)) {
      // Our transaction rolled back; the duplicate belongs to a volunteer that exists
      // independently of it (created before, or by a concurrent sign-up).
      const owner = existing ?? await prisma.volunteer.findFirst({ where: { email: { equals: email, mode: "insensitive" }, organizationId }, select: { id: true } })
      if (owner) return alreadyRegistered(owner.id, eventId)
      return NextResponse.json({ error: "Tu as déjà une inscription pour l'un de ces créneaux." }, { status: 409 })
    }
    throw e
  }

  const { registrations, volunteerId, createdNow, outboxIds } = outcome

  // Only once the registration went through, and only with proof of ownership (see above):
  // an anonymous submission must not rewrite an existing volunteer's name, phone or birth date.
  if (ownsEmail && !createdNow) {
    await prisma.volunteer.update({
      where: { id: volunteerId },
      // Keep the profile's existing birthDate if this submission didn't provide one (most
      // registrations aren't age-gated), rather than clearing it.
      data: { firstName, lastName, phone, ...(birthDateValue ? { birthDate: birthDateValue } : {}) },
    })
  }

  // Clear tokens exist only in memory here (the DB keeps hash + encrypted copy, #290).
  const editToken = tokens.get(registrations[0].shiftId)!

  for (const reg of registrations) {
    await logEvent({
      eventId,
      actor: { type: "volunteer", id: volunteerId },
      action: reg.status === "waiting" ? "registration.waitlist_joined" : reg.status === "requested" ? "registration.requested" : "registration.created",
      entityType: "Registration",
      entityId: reg.id,
      changes: { shiftId: { from: null, to: reg.shiftId }, source: { from: null, to: "public_form" } },
    })
  }

  // Mark the member invite as used (kept valid for re-visits per product
  // decision — only the first usage is timestamped).
  if (inviteToken) {
    await prisma.memberInvite
      .updateMany({
        where: { ...linkToken.where(inviteToken), eventId, usedAt: null },
        data: { usedAt: new Date() },
      })
      .catch(reportError("member_invite.mark_used"))
  }

  const waitlistRegs = registrations.filter((r) => r.status === "waiting")
  const activeRegs = registrations.filter((r) => r.status === "active")
  const requestedRegs = registrations.filter((r) => r.status === "requested")

  // Stored with the registrations (#352); sent once this response is out, retried by the cron.
  deliverAfterResponse(outboxIds)

  const onWaitlist = waitlistRegs.length > 0 && activeRegs.length === 0 && requestedRegs.length === 0

  return NextResponse.json({
    success: true,
    // Only with proof of ownership (member invite); otherwise the link is in the email only.
    editToken: ownsEmail ? editToken : null,
    linkSentByEmail: !ownsEmail,
    confirmationMessage: activeRegs.length === 0 ? null : event.confirmationMessage,
    registrationCount: registrations.length,
    onWaitlist,
    waitlistShifts: waitlistRegs.length,
    // Requests waiting for the organizer's decision (#484), not places.
    requestedShifts: requestedRegs.length,
    activeShifts: activeRegs.length,
  }, { status: 201 })
}

class OverlapError extends Error {
  constructor(readonly label: string) {
    super(`Overlaps ${label}`)
  }
}

/**
 * "Already registered" (#285): never answers with the existing registration's editToken — the
 * submitter may not be that volunteer. The owner gets their management link by email instead
 * (throttled per volunteer, so the form can't be used to flood their inbox).
 *
 * The duplicate can be a live registration of any status. Only an active one or a request (#484)
 * gets its management link re-sent here, so the message only claims an email when one actually
 * went out: waitlisted / offered-only duplicates get the waitlist message instead.
 */
async function alreadyRegistered(volunteerId: string, eventId: string) {
  const reg = await prisma.registration.findFirst({
    where: { volunteerId, eventId, status: { in: [...COMMITTED_STATUSES] } },
    include: {
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      event: { select: { title: true, organization: { select: { slug: true } } } },
    },
  })
  if (!reg) {
    return NextResponse.json({
      error: "Tu es déjà sur la liste d'attente de ce créneau. Tu recevras un email si une place se libère.",
    }, { status: 409 })
  }

  let linkSent = false
  if (reg.volunteer.email) {
    if ((await rateLimit(volunteerId, "reg-link-resend", 3, 60 * 60 * 1000)).ok) {
      const name = `${reg.volunteer.firstName} ${reg.volunteer.lastName}`
      const result = await sendNotification({
        kind: "registration_link_resend",
        recipient: { email: reg.volunteer.email, name },
        data: { volunteerName: name, eventTitle: reg.event.title, orgSlug: reg.event.organization.slug, editToken: registrationToken.reveal(reg) },
      }).catch((e) => {
        reportError("notification.registration_link_resend")(e)
        return { ok: false }
      })
      linkSent = result.ok
      // Remember a *successful* send: the throttle counts attempts, failed ones included.
      if (result.ok) {
        await rateLimit(volunteerId, "reg-link-sent", 1, 60 * 60 * 1000)
        await prisma.registration.updateMany({ where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] } }, data: { linkEmailedAt: new Date() } })
      }
    } else {
      // Throttled: only claim the link was sent if a send actually succeeded within the hour.
      linkSent = await isRateLimited(volunteerId, "reg-link-sent", 1)
    }
  }
  return NextResponse.json({
    error: linkSent
      ? "Tu as déjà une inscription pour l'un de ces créneaux. Le lien pour gérer tes inscriptions a été envoyé à ton adresse email."
      : "Tu as déjà une inscription pour l'un de ces créneaux. Utilise le lien de ton email de confirmation pour gérer tes inscriptions.",
  }, { status: 409 })
}
