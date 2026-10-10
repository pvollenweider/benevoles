// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the SHIFT_RECURRENCE video (#866): a season of a grocery in the demo organization,
 * 13 weeks from the coming Monday, with one permanence already described (« Réception des
 * livraisons », every Wednesday) and two volunteers on two of its later dates, so stopping it
 * lists dates with people. The video then adds « Caisse et accueil » itself.
 *
 * Dates are relative to the take (never a fixed day): the video does not rot. Called through
 * scripts/seed-video-scenario.ts shift-recurrence, after scripts/seed-demo.ts.
 */
import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"
import { findTemplate, templateToEvent, type EventTemplate } from "../src/lib/event-templates"
import { addDays } from "../src/lib/shift-series"

export const RECURRENCE_VIDEO_EVENT_SLUG = "epicerie-permanences"
export const RECURRENCE_VIDEO_EVENT_TITLE = "Épicerie de la Gare — permanences"
const TIME_ZONE = "Europe/Zurich"

/** The coming Monday, local day of the organization (a Monday take starts next week). */
export function seasonStart(now: Date): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  return addDays(today, (8 - weekday) % 7 || 7)
}

/** The Wednesday of the fifth week: the « Arrêter à partir du » date of the video. */
export function stopFrom(start: string): string {
  return addDays(start, 4 * 7 + 2)
}

/** The Tuesday of the third week: the closure the video adds. */
export function closureDay(start: string): string {
  return addDays(start, 2 * 7 + 1)
}

export async function seedVideoRecurrence(prisma: PrismaClient) {
  const organizationId = "default"
  await prisma.event.deleteMany({ where: { organizationId, slug: RECURRENCE_VIDEO_EVENT_SLUG } })
  await prisma.organization.update({ where: { id: organizationId }, data: { timeZone: TIME_ZONE } })

  const epicerie = findTemplate("epicerie")!
  const delivery = epicerie.recurrences!.filter((r) => r.roleName === "Réception des livraisons")
  if (delivery.length !== 1) throw new Error("The « Épicerie participative » template lost its delivery permanence")
  const template: EventTemplate = { ...epicerie, recurrences: delivery }
  const start = seasonStart(new Date())
  const draft = templateToEvent(template, { title: RECURRENCE_VIDEO_EVENT_TITLE, startDate: start }, "CH")

  const event = await prisma.event.create({
    data: {
      organizationId,
      slug: RECURRENCE_VIDEO_EVENT_SLUG,
      title: draft.title,
      description: "L'épicerie est tenue par ses membres : chacun donne quelques heures par mois à la caisse, en rayon ou à la réception des livraisons.",
      location: "Rue de la Gare 12",
      publicStatus: "published",
      registrationsOpen: true,
      startDate: new Date(draft.startDate),
      endDate: new Date(draft.endDate),
    },
  })
  for (const { rule, shifts } of draft.recurrences) {
    const created = await prisma.shiftRecurrence.create({
      data: { ...rule, eventId: event.id, fromDate: new Date(rule.fromDate), untilDate: new Date(rule.untilDate) },
    })
    await prisma.shift.createMany({ data: shifts.map((s) => ({ ...s, eventId: event.id, date: new Date(s.date), status: "open", recurrenceId: created.id })) })
  }

  const people = [
    { id: "video-recurrence-aline", firstName: "Aline", lastName: "Dupraz", email: "video.recurrence.aline@example.org" },
    { id: "video-recurrence-bastien", firstName: "Bastien", lastName: "Meylan", email: "video.recurrence.bastien@example.org" },
  ]
  for (const person of people) await prisma.volunteer.upsert({ where: { id: person.id }, create: { ...person, organizationId }, update: person })
  const later = await prisma.shift.findMany({
    where: { eventId: event.id, date: { gte: new Date(stopFrom(start)) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })
  const registered = [later[1], later[3]]
  if (registered.some((s) => !s)) throw new Error("The delivery permanence needs four dates after the stop date")
  for (const [index, shift] of registered.entries()) {
    await prisma.registration.create({
      data: { eventId: event.id, shiftId: shift.id, volunteerId: people[index].id, status: "active", source: "public_form", ...registrationToken.data(`demo-recurrence-${index}-0001`) },
    })
  }

  const shiftCount = await prisma.shift.count({ where: { eventId: event.id } })
  console.log(`✓ Recurrence fixture: season ${draft.startDate} → ${draft.endDate}, « Réception des livraisons » ${shiftCount} dates, registrants on ${registered.map((s) => s.date.toISOString().slice(0, 10)).join(" and ")}, stop from ${stopFrom(start)}, closure ${closureDay(start)}`)
}
