import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken, shiftsOverlap } from "@/lib/utils"
import { sendConfirmationEmail, sendAdminNotification } from "@/lib/email"
import { z } from "zod"

const schema = z.object({
  eventId: z.string(),
  shiftIds: z.array(z.string()).min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  comment: z.string().optional(),
  consent: z.literal(true),
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 })
  }

  const { eventId, shiftIds, firstName, lastName, email, phone, comment } = parsed.data

  const event = await prisma.event.findFirst({
    where: { id: eventId, publicStatus: "published" },
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
      return NextResponse.json({
        error: `Le créneau "${shift.label}" est complet. Veuillez recharger la page.`,
        fullShiftId: shift.id,
      }, { status: 409 })
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

  let volunteer = await prisma.volunteer.findFirst({ where: { email } })
  if (!volunteer) {
    volunteer = await prisma.volunteer.create({ data: { firstName, lastName, email, phone } })
  } else {
    volunteer = await prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { firstName, lastName, phone },
    })
  }

  const existingRegs = await prisma.registration.findMany({
    where: { volunteerId: volunteer.id, shiftId: { in: shiftIds }, status: "active" },
  })
  if (existingRegs.length > 0) {
    return NextResponse.json({ error: "Vous êtes déjà inscrit(e) à un de ces créneaux." }, { status: 409 })
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
        }, { status: 409 })
      }
    }
  }

  const editToken = generateToken()

  const registrations = await prisma.$transaction(
    shiftIds.map((shiftId) =>
      prisma.registration.create({
        data: {
          eventId,
          shiftId,
          volunteerId: volunteer.id,
          source: "public_form",
          comment,
          editToken: generateToken(),
        },
      })
    )
  )

  const groupToken = editToken

  await prisma.registration.updateMany({
    where: { id: { in: registrations.map((r) => r.id) } },
    data: { editToken: groupToken },
  })
  if (registrations.length > 1) {
    for (let i = 1; i < registrations.length; i++) {
      await prisma.registration.update({
        where: { id: registrations[i].id },
        data: { editToken: generateToken() },
      })
    }
    await prisma.registration.update({
      where: { id: registrations[0].id },
      data: { editToken: groupToken },
    })
  }

  const shiftData = shifts.map((s) => ({
    label: s.label,
    date: s.date.toLocaleDateString("fr-FR"),
    startTime: s.startTime,
    endTime: s.endTime,
  }))

  try {
    await sendConfirmationEmail({
      to: email,
      volunteerName: `${firstName} ${lastName}`,
      eventTitle: event.title,
      shifts: shiftData,
      editToken: groupToken,
    })
    await sendAdminNotification({
      eventTitle: event.title,
      volunteerName: `${firstName} ${lastName}`,
      volunteerEmail: email,
      shifts: shiftData,
    })
  } catch (e) {
    console.error("Email error:", e)
  }

  return NextResponse.json({
    success: true,
    editToken: groupToken,
    confirmationMessage: event.confirmationMessage,
    registrationCount: registrations.length,
  }, { status: 201 })
}
