import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken, shiftsOverlap, shiftsTooYoungFor } from "@/lib/utils"
import { sendConfirmationEmail, sendAdminNotification } from "@/lib/email"
import { sendNotification } from "@/lib/notifications"
import { collectNotifications, enqueueAndDeliver } from "@/lib/notifications/outbox"
import { notifySectorLeadersOfSignup } from "@/lib/sector-leaders"
import { rateLimit, getClientIp, isRateLimited } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import {
  LIVE_STATUSES,
  OCCUPYING_STATUSES,
  ShiftFullError,
  isUniqueViolation,
  lockShifts,
  planPlacement,
} from "@/lib/registration-capacity"
import { z } from "zod"
import { linkToken, registrationToken } from "@/lib/token-vault"

const schema = z.object({
  eventId: z.string(),
  shiftIds: z.array(z.string()).min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  comment: z.string().optional(),
  consent: z.literal(true),
  inviteToken: z.string().optional(),
})

export async function POST(req: Request) {
  const rl = rateLimit(getClientIp(req), "registrations", 20, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 })
  }

  const { eventId, shiftIds, firstName, lastName, email, phone, birthDate, comment, inviteToken } = parsed.data

  const event = await prisma.event.findFirst({
    where: { id: eventId, publicStatus: "published", organization: { active: true } },
    include: { organization: { select: { slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })

  // Authoritative check: the form marks the field required too, but only as a courtesy.
  if (event.requirePhone && !phone?.trim()) {
    return NextResponse.json({ error: "Le téléphone est obligatoire pour cet événement." }, { status: 400 })
  }

  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, eventId, status: { in: ["open"] } },
    include: { registrations: { where: { status: { in: [...OCCUPYING_STATUSES] } } } },
  })

  if (shifts.length !== shiftIds.length) {
    return NextResponse.json({ error: "Un ou plusieurs créneaux sont invalides ou fermés. Veuillez recharger la page." }, { status: 409 })
  }

  // Early, unlocked check for a friendly error — the authoritative one runs under lock below.
  for (const shift of shifts) {
    if (shift.registrations.length >= shift.capacity) {
      if (!shift.waitlistEnabled) {
        return NextResponse.json({
          error: `Le créneau "${shift.label}" est complet. Veuillez recharger la page.`,
          fullShiftId: shift.id,
        }, { status: 409 })
      }
      // Waitlist enabled — fall through; will be created with status "waiting" below
    }
  }

  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shiftsOverlap(shifts[i], shifts[j])) {
        return NextResponse.json({
          error: `Les créneaux "${shifts[i].label}" et "${shifts[j].label}" se chevauchent.`,
        }, { status: 400 })
      }
    }
  }

  // Minimum age (#192) — authoritative check, the client-side one in EventPageClient.tsx is
  // only a courtesy. Never trust an age the client itself computed: birthDate is what's
  // validated, not a client-supplied age.
  const ageGated = shifts.filter((s) => s.minAge != null)
  if (ageGated.length > 0) {
    if (!birthDate) {
      return NextResponse.json({
        error: `Date de naissance requise pour : ${ageGated.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}.`,
      }, { status: 400 })
    }
    const tooYoungFor = shiftsTooYoungFor(birthDate, ageGated)
    if (tooYoungFor.length > 0) {
      return NextResponse.json({
        error: `Âge minimum non atteint pour : ${tooYoungFor.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}.`,
      }, { status: 403 })
    }
  }

  // Volunteer is org-scoped: each (organizationId, email) is a unique roster entry.
  //
  // Nothing here proves the submitter owns `email` (#285): anyone can type someone else's
  // address. So for a volunteer who already exists, this request must neither reveal anything
  // (no editToken in the response — it opens /my, which lists their registrations, tokens and
  // phone) nor change their profile. Proof of ownership is either a brand-new address (nothing
  // to leak yet) or a valid member invite, which was emailed to that volunteer.
  const organizationId = event.organizationId
  const birthDateValue = birthDate ? new Date(birthDate) : undefined
  let volunteer = await prisma.volunteer.findFirst({ where: { email, organizationId } })
  let ownsEmail = false
  let createdNow = false
  if (!volunteer) {
    try {
      volunteer = await prisma.volunteer.create({ data: { firstName, lastName, email, phone, birthDate: birthDateValue, organizationId } })
      ownsEmail = true
      createdNow = true
    } catch (e) {
      // A concurrent submission for the same new email created it first (#264).
      if (!isUniqueViolation(e)) throw e
      volunteer = await prisma.volunteer.findFirstOrThrow({ where: { email, organizationId } })
    }
  } else if (inviteToken) {
    const invite = await prisma.memberInvite.findFirst({
      where: { ...linkToken.where(inviteToken), eventId, volunteerId: volunteer.id },
      select: { id: true },
    })
    ownsEmail = invite != null
  }
  const volunteerId = volunteer.id

  const existingRegs = await prisma.registration.findMany({
    where: { volunteerId, shiftId: { in: shiftIds }, status: { in: [...LIVE_STATUSES] } },
    select: { id: true },
  })
  if (existingRegs.length > 0) return alreadyRegistered(volunteerId, eventId)

  const allEventRegs = await prisma.registration.findMany({
    where: { volunteerId, eventId, status: "active" },
    include: { shift: true },
  })
  const clash = findOverlap(allEventRegs, shifts)
  if (clash) {
    return NextResponse.json({
      error: `Ce créneau chevauche une inscription existante (${clash.label}).`,
    }, { status: 409 })
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
  let registrations
  try {
    registrations = await prisma.$transaction(async (tx) => {
      await lockShifts(tx, shiftIds)
      // Then the volunteer (#285): two concurrent sign-ups of the same person to two different,
      // overlapping shifts lock different shift rows, so the overlap check has to be redone under
      // a per-volunteer lock too. Always shifts first, then volunteer: same order everywhere.
      await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${volunteerId} FOR UPDATE`
      const liveNow = await tx.registration.findMany({
        where: { volunteerId, eventId, status: "active" },
        include: { shift: true },
      })
      const clashNow = findOverlap(liveNow, shifts)
      if (clashNow) throw new OverlapError(clashNow.label)
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
        })
        if (placement.status === "full") throw new ShiftFullError(shift.id, shift.label)
        created.push(
          await tx.registration.create({
            data: {
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
      return created
    })
  } catch (e) {
    if (e instanceof ShiftFullError) {
      return NextResponse.json({
        error: `Le créneau "${e.label}" est complet. Veuillez recharger la page.`,
        fullShiftId: e.shiftId,
      }, { status: 409 })
    }
    if (e instanceof OverlapError) {
      return NextResponse.json({
        error: `Ce créneau chevauche une inscription existante (${e.label}).`,
      }, { status: 409 })
    }
    if (isUniqueViolation(e)) return alreadyRegistered(volunteerId, eventId)
    throw e
  }

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
      action: reg.status === "waiting" ? "registration.waitlist_joined" : "registration.created",
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

  const activeShiftData = shifts
    .filter((s) => activeRegs.some((r) => r.shiftId === s.id))
    .map((s) => ({
      label: s.label,
      roleName: s.roleName,
      date: s.date.toLocaleDateString("fr-FR"),
      startTime: s.startTime,
      endTime: s.endTime,
    }))

  // Notifications go through the outbox (#293): built by the usual helpers into `outbox`,
  // stored, and sent right after this response — the volunteer doesn't wait on SMTP, and a
  // failed send is retried by the cron instead of being lost.
  const outbox = collectNotifications()
  try {
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
    for (const shift of shifts) {
      await notifySectorLeadersOfSignup({
        eventId,
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

    await enqueueAndDeliver(outbox.payloads)
  } catch (e) {
    // The registration itself is done; only building/storing its notifications failed.
    reportError("notification.registration_outbox")(e)
  }

  const onWaitlist = waitlistRegs.length > 0 && activeRegs.length === 0

  return NextResponse.json({
    success: true,
    // Without proof of ownership the link only goes out by email (confirmation email above).
    editToken: ownsEmail ? editToken : null,
    linkSentByEmail: !ownsEmail,
    confirmationMessage: onWaitlist ? null : event.confirmationMessage,
    registrationCount: registrations.length,
    onWaitlist,
    waitlistShifts: waitlistRegs.length,
  }, { status: 201 })
}

class OverlapError extends Error {
  constructor(readonly label: string) {
    super(`Overlaps ${label}`)
  }
}

function findOverlap(
  existing: { shift: Parameters<typeof shiftsOverlap>[0] & { label: string } }[],
  shifts: Parameters<typeof shiftsOverlap>[1][],
): { label: string } | null {
  for (const reg of existing) {
    for (const shift of shifts) {
      if (shiftsOverlap(reg.shift, shift)) return { label: reg.shift.label }
    }
  }
  return null
}

/**
 * "Already registered" (#285): never answers with the existing registration's editToken — the
 * submitter may not be that volunteer. The owner gets their management link by email instead
 * (throttled per volunteer, so the form can't be used to flood their inbox).
 *
 * The duplicate can be a live registration of any status. Only an *active* one has a management
 * link (/my requires it), so the message only claims an email when one actually went out:
 * waitlisted / offered-only duplicates get the waitlist message instead.
 */
async function alreadyRegistered(volunteerId: string, eventId: string) {
  const reg = await prisma.registration.findFirst({
    where: { volunteerId, eventId, status: "active" },
    include: {
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      event: { select: { title: true, organization: { select: { slug: true } } } },
    },
  })
  if (!reg) {
    return NextResponse.json({
      error: "Vous êtes déjà sur la liste d'attente de ce créneau. Vous serez prévenu(e) par email si une place se libère.",
    }, { status: 409 })
  }

  let linkSent = false
  if (reg.volunteer.email) {
    if (rateLimit(volunteerId, "reg-link-resend", 3, 60 * 60 * 1000).ok) {
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
      if (result.ok) rateLimit(volunteerId, "reg-link-sent", 1, 60 * 60 * 1000)
    } else {
      // Throttled: only claim the link was sent if a send actually succeeded within the hour.
      linkSent = isRateLimited(volunteerId, "reg-link-sent", 1)
    }
  }
  return NextResponse.json({
    error: linkSent
      ? "Vous êtes déjà inscrit(e) à un de ces créneaux. Le lien pour gérer vos inscriptions a été envoyé à votre adresse email."
      : "Vous êtes déjà inscrit(e) à un de ces créneaux. Utilisez le lien de votre email de confirmation pour gérer vos inscriptions.",
  }, { status: 409 })
}
