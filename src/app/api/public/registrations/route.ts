import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken, shiftsOverlap, calculateAge } from "@/lib/utils"
import { sendConfirmationEmail, sendAdminNotification } from "@/lib/email"
import { sendNotification } from "@/lib/notifications"
import { notifySectorLeadersOfSignup } from "@/lib/sector-leaders"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { z } from "zod"

const schema = z.object({
  eventId: z.string(),
  shiftIds: z.array(z.string()).min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
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

  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, eventId, status: { in: ["open"] } },
    include: { registrations: { where: { status: "active" } } },
  })

  if (shifts.length !== shiftIds.length) {
    return NextResponse.json({ error: "Un ou plusieurs créneaux sont invalides ou fermés. Veuillez recharger la page." }, { status: 409 })
  }

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
    const age = calculateAge(birthDate)
    const tooYoungFor = ageGated.filter((s) => age < (s.minAge ?? 0))
    if (tooYoungFor.length > 0) {
      return NextResponse.json({
        error: `Âge minimum non atteint pour : ${tooYoungFor.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}.`,
      }, { status: 403 })
    }
  }

  // Volunteer is org-scoped: each (organizationId, email) is a unique roster entry.
  const organizationId = event.organizationId
  const birthDateValue = birthDate ? new Date(birthDate) : undefined
  let volunteer = await prisma.volunteer.findFirst({ where: { email, organizationId } })
  if (!volunteer) {
    volunteer = await prisma.volunteer.create({ data: { firstName, lastName, email, phone, birthDate: birthDateValue, organizationId } })
  } else {
    volunteer = await prisma.volunteer.update({
      where: { id: volunteer.id },
      // Keep the profile's existing birthDate if this submission didn't provide one (most
      // registrations aren't age-gated), rather than clearing it.
      data: { firstName, lastName, phone, ...(birthDateValue ? { birthDate: birthDateValue } : {}) },
    })
  }

  const existingRegs = await prisma.registration.findMany({
    where: { volunteerId: volunteer.id, shiftId: { in: shiftIds }, status: "active" },
  })
  if (existingRegs.length > 0) {
    return NextResponse.json({
      error: "Vous êtes déjà inscrit(e) à un de ces créneaux.",
      editToken: existingRegs[0].editToken,
    }, { status: 409 })
  }

  const allEventRegs = await prisma.registration.findMany({
    where: { volunteerId: volunteer.id, eventId, status: "active" },
    include: { shift: true },
  })
  for (const existing of allEventRegs) {
    for (const newShift of shifts) {
      if (shiftsOverlap(existing.shift, newShift)) {
        return NextResponse.json({
          error: `Ce créneau chevauche une inscription existante (${existing.shift.label}).`,
          editToken: existing.editToken,
        }, { status: 409 })
      }
    }
  }

  // Chaque inscription reçoit son propre token unique.
  // On retourne le token de la première comme lien de confirmation.

  // Determine which shifts go to waitlist
  const fullShiftIds = new Set(
    shifts.filter((s) => s.registrations.length >= s.capacity && s.waitlistEnabled).map((s) => s.id)
  )

  // For each shift going to waitlist, get current max position
  const waitlistPositions: Record<string, number> = {}
  for (const shiftId of fullShiftIds) {
    const maxPos = await prisma.registration.aggregate({
      where: { shiftId, status: { in: ["waiting", "offered"] } },
      _max: { waitingPosition: true },
    })
    waitlistPositions[shiftId] = (maxPos._max.waitingPosition ?? 0) + 1
  }

  const registrations = await prisma.$transaction(
    shiftIds.map((shiftId) => {
      const onWaitlist = fullShiftIds.has(shiftId)
      return prisma.registration.create({
        data: {
          eventId,
          shiftId,
          volunteerId: volunteer.id,
          source: "public_form",
          comment,
          editToken: generateToken(),
          status: onWaitlist ? "waiting" : "active",
          waitingPosition: onWaitlist ? waitlistPositions[shiftId] : null,
        },
      })
    })
  )

  const editToken = registrations[0].editToken

  for (const reg of registrations) {
    await logEvent({
      eventId,
      actor: { type: "volunteer", id: volunteer.id },
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
        where: { token: inviteToken, eventId, usedAt: null },
        data: { usedAt: new Date() },
      })
      .catch(() => {})
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
    })
    await Promise.all(
      shifts.map((shift) =>
        notifySectorLeadersOfSignup({
          eventId,
          eventTitle: event.title,
          orgSlug: event.organization.slug,
          volunteerName: `${firstName} ${lastName}`,
          shift,
        })
      )
    )
  } catch (e) {
    console.error("Email error:", e)
  }

  // Send waitlist confirmation for waiting registrations
  for (const wr of waitlistRegs) {
    const shift = shifts.find((s) => s.id === wr.shiftId)
    if (!shift) continue
    await sendNotification({
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
    }).catch(() => {})
  }

  const onWaitlist = waitlistRegs.length > 0 && activeRegs.length === 0

  return NextResponse.json({
    success: true,
    editToken,
    confirmationMessage: onWaitlist ? null : event.confirmationMessage,
    registrationCount: registrations.length,
    onWaitlist,
    waitlistShifts: waitlistRegs.length,
  }, { status: 201 })
}
