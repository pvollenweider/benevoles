// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Focused, idempotent datasets for the video masterclass. Never run outside the video DB. */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken, linkToken } from "../src/lib/token-vault"
import { workloadWarnings } from "../src/lib/workload"
import { staffingSummary } from "../src/lib/staffing"
import { selectRecipients, selectInvitedWithoutShift } from "../src/lib/targeted-message"
import { localDateTimeToUtc } from "../src/lib/time-zone"

const scenario = process.argv[2]
if (!scenario) throw new Error("Usage: seed-video-scenario.ts <scenario>")
if (!process.env.DATABASE_URL?.includes("benevoles_video")) {
  throw new Error("Refusing to seed a database whose URL does not contain benevoles_video")
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function freshOrganization() {
  const organizationId = "default"
  await prisma.event.deleteMany({ where: { organizationId } })
  await prisma.volunteer.deleteMany({ where: { organizationId } })
  await prisma.messageTemplate.deleteMany({ where: { organizationId } })
  await prisma.targetedMessage.deleteMany({ where: { organizationId } })
  await prisma.orgLog.deleteMany({ where: { organizationId } })
  await prisma.orgSlugHistory.deleteMany({ where: { organizationId } })
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: "Association Les Amis du Parc",
      slug: "amis-du-parc",
      publicTitle: null,
      volunteerCharter: null,
      timeZone: null,
      replyToEmail: null,
      notificationSettings: undefined,
      onboardingDismissedAt: null,
      hasOrgInsurance: true,
    },
  })
  await prisma.adminUser.updateMany({
    where: { organizationId },
    data: { name: "Camille Berger", isActive: true, role: "admin" },
  })
  console.log("✓ Video scenario fresh-organization: empty organization and visible onboarding")
}

async function main() {
  if (scenario === "privacy-personal-links") {
    const { seedVideoPrivacy } = await import("./seed-video-privacy")
    return seedVideoPrivacy(prisma)
  }
  if (scenario === "last-minute-changes") {
    const { seedVideoLastMinute } = await import("./seed-video-last-minute")
    return seedVideoLastMinute(prisma)
  }
  if (scenario === "data-exports-archives") {
    const { seedVideoExports } = await import("./seed-video-exports")
    return seedVideoExports(prisma)
  }
  if (scenario === "fresh-organization") return freshOrganization()
  if (scenario === "event-activity-log") {
    const { seedVideoEventLog } = await import("./seed-video-event-log")
    return seedVideoEventLog(prisma)
  }
  if (scenario === "organization-activity-log") {
    const { seedVideoOrgActivity } = await import("./seed-video-org-activity")
    return seedVideoOrgActivity(prisma)
  }
  if (scenario === "attendance-check-in") {
    const { seedVideoAttendance } = await import("./seed-video-attendance")
    return seedVideoAttendance(prisma)
  }
  if (scenario === "event-reports" || scenario === "volunteer-badges") {
    const { seedVideoDocuments } = await import("./seed-video-documents")
    return seedVideoDocuments(prisma)
  }
  if (scenario === "reminders-changes") {
    const now = new Date()
    const timeZone = "Europe/Zurich"
    const slots = [48, 24, 3, 72].map(hours => {
      const instant = new Date(now.getTime() + hours * 3600000)
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant)
      const part = (type: string) => parts.find(p => p.type === type)!.value
      const iso = `${part("year")}-${part("month")}-${part("day")}`
      const startTime = `${part("hour")}:${part("minute")}`
      const endHour = (Number(part("hour")) + 2) % 24
      const endTime = `${String(endHour).padStart(2, "0")}:${part("minute")}`
      const date = new Date(`${iso}T00:00:00Z`)
      const actualHours = (localDateTimeToUtc(date, startTime, timeZone).getTime() - now.getTime()) / 3600000
      if (Math.abs(actualHours - hours) > 1 / 60) throw new Error("Dynamic reminder time was converted incorrectly")
      return { date, startTime, endTime, hours }
    })
    const slugs = ["atelier-rappels", "atelier-rappels-brouillon", "atelier-rappels-coupes"]
    await prisma.event.deleteMany({ where: { organizationId: "default", slug: { in: slugs } } })
    await prisma.organization.update({ where: { id: "default" }, data: { timeZone, notificationSettings: { reminders: { j2: true, j1: true, dd: true }, signupAdminEmail: true } } })
    const people = [
      { id: "video-reminder-j2", firstName: "Aline", lastName: "Mercier", email: "video.reminder.j2@example.org" },
      { id: "video-reminder-j1", firstName: "Nicolas", lastName: "Renaud", email: "video.reminder.j1@example.org" },
      { id: "video-reminder-dd", firstName: "Léa", lastName: "Giroud", email: "video.reminder.dd@example.org" },
      { id: "video-reminder-request", firstName: "Lucas", lastName: "Girard", email: "video.reminder.request@example.org" },
      { id: "video-reminder-waiting", firstName: "Anna", lastName: "Bühler", email: "video.reminder.waiting@example.org" },
    ]
    for (const person of people) await prisma.volunteer.upsert({ where: { id: person.id }, create: { ...person, organizationId: "default" }, update: person })
    const dates = slots.map(s => s.date).sort((a, b) => a.getTime() - b.getTime())
    for (const [eventIndex, slug] of slugs.entries()) {
      const event = await prisma.event.create({ data: { organizationId: "default", slug, title: ["Atelier des rappels", "Atelier en brouillon", "Atelier sans rappels"][eventIndex], publicStatus: eventIndex === 1 ? "draft" : "published", remindersEnabled: eventIndex !== 2, startDate: dates[0], endDate: dates.at(-1)!, reminderMessage: "Retrouve-nous au stand quinze minutes avant ton créneau. Merci pour ton aide !" } })
      const selected = eventIndex === 0 ? slots : slots.slice(2, 3)
      for (const [index, slot] of selected.entries()) {
        const shift = await prisma.shift.create({ data: { eventId: event.id, roleName: slot.hours === 72 ? "Préparation" : "Accueil", label: `Accueil — ${slot.hours} heures`, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, capacity: 5, status: slot.hours === 24 ? "closed" : "open", locationDetails: "Stand d'information, entrée nord", instructions: "Passer au stand avant de prendre son poste.", contactName: "Élodie", contactPhone: "079 000 00 00" } })
        const person = people[eventIndex === 0 ? Math.min(index, 2) : 2]
        await prisma.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: person.id, status: "active", ...registrationToken.data(`demo-reminder-${eventIndex}-${index}-0001`) } })
        if (eventIndex === 0 && slot.hours === 3) {
          for (const [status, volunteerId] of [["requested", people[3].id], ["waiting", people[4].id]]) await prisma.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId, status, ...(status === "waiting" ? { waitingPosition: 1 } : {}), ...registrationToken.data(`demo-reminder-excluded-${status}-0001`) } })
        }
        if (eventIndex === 0 && slot.hours === 72) {
          await prisma.shift.update({ where: { id: shift.id }, data: { requiresApproval: true, label: "Préparation — horaire à modifier" } })
          await prisma.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: people[3].id, status: "requested", ...registrationToken.data("demo-reminder-change-request-0001") } })
          const cancellation = await prisma.shift.create({ data: { eventId: event.id, roleName: "Caisse", label: "Caisse — créneau à annuler", date: slot.date, startTime: slot.startTime, endTime: slot.endTime, capacity: 2, requiresApproval: true } })
          for (const [status, volunteerId] of [["active", people[0].id], ["requested", people[3].id]]) await prisma.registration.create({ data: { eventId: event.id, shiftId: cancellation.id, volunteerId, status, ...registrationToken.data(`demo-reminder-cancel-${status}-0001`) } })
        }
      }
    }
    console.log(`✓ Reminder fixture: +48h/+24h/+3h local ${timeZone}; closed confirmed slot; draft/disabled witnesses; requested/waiting exclusions; separate change/cancel shifts; generated ${now.toISOString()}`)
    return
  }
  if (scenario === "targeted-messages") {
    const recorderModel = await prisma.messageTemplate.findMany({ where: {
      organizationId: "default", name: "Briefing avant le créneau",
      subject: "Ton briefing pour {poste}",
      body: "Bonjour {prénom},\n\nPour {événement}, retrouve-nous quinze minutes avant {créneau}.\nLe responsable te montrera le matériel et répondra à tes questions.\n\nMerci pour ton aide et à très vite !",
    }, select: { id: true } })
    if (recorderModel.length) {
      await prisma.messageTemplate.deleteMany({ where: { id: { in: recorderModel.map(m => m.id) } } })
      console.log(`✓ Reset ${recorderModel.length} exact recorder-owned briefing template(s) from a previous partial take`)
    }
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const shifts = await prisma.shift.findMany({ where: { eventId: event.id, roleName: "Buvette", status: "open" }, orderBy: [{ date: "asc" }, { startTime: "asc" }] })
    if (shifts.length < 2) throw new Error("Targeted messages needs two Buvette shifts")
    const fixtures = [
      { id: "video-message-lea", firstName: "Léa", lastName: "Giroud", email: "lea.giroud@example.org" },
      { id: "video-message-sansmail", firstName: "René", lastName: "Sansmail", email: null },
      { id: "video-message-invite", firstName: "Aline", lastName: "Mercier", email: "aline.message@example.org" },
    ]
    for (const fixture of fixtures) {
      await prisma.volunteer.upsert({ where: { id: fixture.id }, create: { ...fixture, organizationId: "default" }, update: fixture })
    }
    for (const [index, shift] of shifts.slice(0, 2).entries()) {
      const existing = await prisma.registration.findFirst({ where: { eventId: event.id, volunteerId: "video-message-lea", shiftId: shift.id, status: "active" } })
      if (!existing) await prisma.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: "video-message-lea", status: "active", source: "admin_manual", ...registrationToken.data(`demo-targeted-lea-${index}-0001`) } })
    }
    const withoutEmail = await prisma.registration.findFirst({ where: { eventId: event.id, volunteerId: "video-message-sansmail", shiftId: shifts[0].id, status: "active" } })
    if (!withoutEmail) await prisma.registration.create({ data: { eventId: event.id, shiftId: shifts[0].id, volunteerId: "video-message-sansmail", status: "active", source: "admin_manual", ...registrationToken.data("demo-targeted-sansmail-0001") } })
    await prisma.memberInvite.upsert({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: "video-message-invite" } }, create: { eventId: event.id, volunteerId: "video-message-invite", sentAt: new Date(), ...linkToken.data("demo-targeted-invite-0001") }, update: {} })
    for (const shift of shifts.slice(0, 2)) {
      const occupied = await prisma.registration.count({ where: { shiftId: shift.id, status: { in: ["active", "requested"] } } })
      if (occupied > shift.capacity) await prisma.shift.update({ where: { id: shift.id }, data: { capacity: occupied } })
    }
    const registrations = await prisma.registration.findMany({ where: { eventId: event.id }, include: { volunteer: true, shift: true } })
    const invites = await prisma.memberInvite.findMany({ where: { eventId: event.id }, include: { volunteer: true } })
    const counts = {
      event: selectRecipients(registrations, { kind: "event" }).length,
      role: selectRecipients(registrations, { kind: "role", roleName: "Buvette" }).length,
      shift: selectRecipients(registrations, { kind: "shift", shiftId: shifts[0].id }).length,
      waitlist: selectRecipients(registrations, { kind: "waitlist" }).length,
      invited: selectInvitedWithoutShift(invites, registrations).length,
    }
    const roleRecipients = selectRecipients(registrations, { kind: "role", roleName: "Buvette" })
    if (Object.values(counts).some(count => count < 1) || roleRecipients.filter(r => r.volunteerId === "video-message-lea").length !== 1 || roleRecipients.find(r => r.volunteerId === "video-message-lea")?.registrations.length !== 2 || roleRecipients.some(r => r.volunteerId === "video-message-sansmail") || !registrations.some(r => r.status === "requested")) throw new Error("Targeted messages fixture is incomplete")
    console.log(`✓ Targeted messages audiences: ${JSON.stringify(counts)}; two Léa registrations, one recipient; no-email excluded; requests present; no fake push subscription`)
    return
  }
  if (scenario === "staffing-gaps") {
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const accueil = await prisma.shift.findFirstOrThrow({ where: { eventId: event.id, roleName: "Accueil", startTime: "09:00" } })
    await prisma.shift.update({ where: { id: accueil.id }, data: { capacity: 6 } })
    await prisma.shift.updateMany({ where: { eventId: event.id, roleName: "Accueil", startTime: "15:00" }, data: { status: "closed" } })
    await prisma.shift.deleteMany({ where: { eventId: event.id, roleName: "Photos", label: "Photos — reportage bénévole" } })
    await prisma.shift.createMany({ data: [event.startDate!, event.endDate!].map(date => ({ eventId: event.id, roleName: "Photos", label: "Photos — reportage bénévole", date, startTime: "10:00", endTime: "12:00", capacity: 3, colorKey: "violet", displayOrder: 6 })) })
    const shifts = await prisma.shift.findMany({ where: { eventId: event.id, status: { not: "cancelled" } }, include: { registrations: true } })
    const leaders = await prisma.sectorLeader.findMany({ where: { eventId: event.id } })
    const summary = staffingSummary(shifts.map(s => ({ id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, active: s.registrations.filter(r => r.status === "active").length, waiting: s.registrations.filter(r => r.status === "waiting" || r.status === "offered").length, requested: s.registrations.filter(r => r.status === "requested").length, closed: s.status === "closed" })), leaders.map(l => l.roleName))
    if (!summary.emptyRoles.some(r => r.roleName === "Photos" && r.shiftCount === 2 && r.capacity === 6) || !summary.full.length || !summary.waitlisted.length || !summary.underfilled.length || summary.totals.requested !== 2) throw new Error("Staffing scenario doesn't cover every report group")
    console.log(`✓ Staffing scenario: ${summary.totals.shifts} shifts, all five report groups, two held requests and a closed shift`)
    return
  }
  if (scenario === "registrations-management") {
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteer: { email: { startsWith: "video.registration." } } } })
    await prisma.volunteer.deleteMany({ where: { organizationId: "default", email: { startsWith: "video.registration." } } })
    const shifts = await prisma.shift.findMany({ where: { eventId: event.id, status: { not: "cancelled" }, requiresApproval: false, reservedTags: { isEmpty: true } }, orderBy: [{ date: "asc" }, { startTime: "asc" }] })
    if (shifts.length < 6) throw new Error("Registration video needs six open fixture shifts")
    await prisma.shift.updateMany({ where: { id: { in: shifts.map(s => s.id) } }, data: { capacity: 15 } })
    const noah = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "noah.dubois@example.org" } })
    const morning = shifts.find(s => s.roleName === "Montage" && s.startTime === "07:00")
    const evening = shifts.find(s => s.roleName === "Buvette" && s.startTime === "18:00")
    if (!morning || !evening) throw new Error("Workload fixture needs morning and evening shifts")
    for (const [index, shift] of [morning, evening].entries()) {
      const existing = await prisma.registration.findFirst({ where: { eventId: event.id, volunteerId: noah.id, shiftId: shift.id, status: "active" } })
      if (!existing) await prisma.registration.create({ data: { eventId: event.id, volunteerId: noah.id, shiftId: shift.id, status: "active", source: "admin_manual", comment: "Horaire convenu avec Noah.", ...registrationToken.data(`demo-registration-workload-noah-${index}-0001`) } })
    }
    const noahRegistrations = await prisma.registration.findMany({ where: { eventId: event.id, volunteerId: noah.id, status: "active" }, include: { shift: true } })
    const warnings = workloadWarnings(noahRegistrations.map(r => r.shift), "Europe/Zurich")
    if (!warnings.some(w => w.kind === "daily" && w.minutes === 600) || warnings.some(w => w.kind === "continuous")) throw new Error("Expected exactly ten planned hours with real breaks for Noah")
    const existing = await prisma.registration.count({ where: { eventId: event.id } })
    for (let index = 0; index < 80 - existing; index++) {
      const volunteer = await prisma.volunteer.create({ data: { organizationId: "default", firstName: ["Aline", "Nicolas", "Émilie", "Sébastien", "Anaïs", "Léon"][index % 6], lastName: `Perrin ${index + 1}`, email: `video.registration.${index}@example.org`, phone: `079 000 ${String(index).padStart(2, "0")} 11`, tags: index % 2 ? ["accueil"] : ["logistique"], availabilityPeriods: ["morning"] } })
      const offered = index === 0
      await prisma.registration.create({ data: { eventId: event.id, volunteerId: volunteer.id, shiftId: shifts[index % shifts.length].id, source: index % 3 ? "public_form" : "admin_manual", status: offered ? "offered" : "active", ...(offered ? { waitingExpiresAt: new Date(Date.now() + 86400000) } : {}), comment: index % 4 === 0 ? "Préfère être près de l'entrée." : null, ...registrationToken.data(`demo-registration-management-${index}-0001`) } })
    }
    const count = await prisma.registration.count({ where: { eventId: event.id } })
    if (count !== 80) throw new Error(`Expected 80 registrations, got ${count}`)
    console.log("✓ Registration management scenario: 80 registrations, public/manual sources, active/waiting/offered/requested statuses")
    return
  }
  if (scenario === "members-management" || scenario === "members-invitations" || scenario === "members-reminders") {
    // The demo seed replaces example.org contacts, but cannot identify prior no-email
    // imports by address. Remove only named recorder-owned fixtures in the video DB.
    await prisma.volunteer.deleteMany({ where: { organizationId: "default", email: null, OR: [
      { firstName: "René", lastName: "Aubert" },
      { firstName: "René", lastName: "Sansmail" },
      { id: "video-member-management-2" },
    ] } })
    // The demo seed supplies 24 members. Add 36 deterministic fictional members for a
    // substantial list, including two distinct homonyms and a contact without email.
    for (let index = 0; index < 36; index++) {
      const id = `video-member-management-${index}`
      const homonym = index < 2
      const data = {
        organizationId: "default",
        firstName: homonym ? "Stéphane" : ["Aline", "Émilie", "Sébastien", "Anaïs", "Nicolas", "Léon"][index % 6],
        lastName: homonym ? "Favre" : `Morel ${index + 1}`,
        email: index === 2 ? null : `video.membre.${index}@example.org`,
        phone: `079 000 ${String(index).padStart(2, "0")} 00`,
        active: index !== 35,
        tags: index % 2 ? ["accueil"] : ["logistique", "permis-b"],
        notes: index === 2 ? "Contact à joindre par téléphone pour les horaires." : null,
        availabilityPeriods: index % 2 ? ["morning"] : ["evening"],
        availabilityNote: index === 3 ? "Pas le dimanche" : null,
      }
      await prisma.volunteer.upsert({ where: { id }, create: { id, ...data }, update: data })
    }
    const count = await prisma.volunteer.count({ where: { organizationId: "default" } })
    if (count !== 60) throw new Error(`Members scenario expects 60 members after demo seed, got ${count}`)
    if (scenario === "members-reminders") {
      const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
      const lucas = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "lucas.girard@example.org" } })
      await prisma.memberInvite.upsert({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: lucas.id } }, create: { eventId: event.id, volunteerId: lucas.id, ...linkToken.data("demo-reminder-lucas-0001"), sentAt: new Date(Date.now() - 2 * 86400000) }, update: { sentAt: new Date(Date.now() - 2 * 86400000) } })
      const tom = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", firstName: "Tom" } })
      await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: tom.id } })
      const shift = await prisma.shift.findFirstOrThrow({ where: { eventId: event.id, roleName: "Buvette", startTime: "18:00" } })
      await prisma.registration.create({ data: { eventId: event.id, volunteerId: tom.id, shiftId: shift.id, status: "offered", waitingExpiresAt: new Date(Date.now() + 86400000), ...registrationToken.data("demo-reminder-offer-tom-0001") } })
      console.log("✓ Reminder scenario: old/recent invitations, active Camille, waiting Anna, requested Lucas and offered Tom")
      return
    }
    if (scenario === "members-invitations") {
      await prisma.volunteer.update({ where: { id: "video-member-management-3" }, data: { firstName: "Aline", lastName: "Mercier", tags: ["accueil"] } })
      await prisma.volunteer.update({ where: { id: "video-member-management-4" }, data: { firstName: "Nicolas", lastName: "Renaud", tags: ["sécurité", "permis-b"] } })
      await prisma.volunteer.update({ where: { id: "video-member-management-2" }, data: { firstName: "René", lastName: "Sansmail", tags: ["accueil"] } })
      console.log("✓ Invitation scenario: 60 fictional members, two new invitees and a no-email contact; existing invitation statuses supplied by demo")
      return
    }
    console.log("✓ Members scenario: 60 fictional members, homonyms, contact without email and inactive member")
    return
  }
  if (scenario === "personal-session") {
    const camille = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
    await prisma.organization.update({ where: { id: "default" }, data: { replyToEmail: "organisation.montvert@example.org" } })
    await prisma.volunteer.update({ where: { id: camille.id }, data: { availabilityPeriods: [], availabilityNote: null } })
    console.log("✓ Personal session: Camille starts with empty availability preferences")
    return
  }
  if (scenario === "personal-calendar") {
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const camille = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
    const accueil = await prisma.shift.findFirstOrThrow({ where: { eventId: event.id, roleName: "Accueil", startTime: "09:00" } })
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: camille.id, shift: { roleName: "Démontage" } } })
    await prisma.shift.deleteMany({ where: { eventId: event.id, roleName: "Rangement", label: "Rangement de nuit — calendrier" } })
    await prisma.shift.update({ where: { id: accueil.id }, data: { contactName: "Manon Aebi", contactPhone: "079 000 00 03", instructions: "Arrive 15 minutes avant, au stand bleu.", latitude: 46.1805734, longitude: 6.1228285 } })
    const night = await prisma.shift.create({ data: { eventId: event.id, roleName: "Rangement", label: "Rangement de nuit — calendrier", date: accueil.date, startTime: "22:00", endTime: "02:00", capacity: 4, colorKey: "slate", displayOrder: 5, locationDetails: "Hangar communal, entrée nord", instructions: "Gants fournis sur place.", latitude: 46.1805734, longitude: 6.1228285 } })
    await prisma.registration.create({ data: { eventId: event.id, volunteerId: camille.id, shiftId: night.id, status: "active", source: "admin_manual", ...registrationToken.data("demo-calendar-night-camille-0001") } })
    const confirmed = await prisma.registration.count({ where: { eventId: event.id, volunteerId: camille.id, status: "active" } })
    if (confirmed !== 3) throw new Error(`Expected exactly three confirmed calendar shifts, got ${confirmed}`)
    console.log("✓ Calendar scenario: three confirmed shifts including overnight; waiting registration remains excluded from export")
    return
  }
  if (scenario === "personal-withdrawals") {
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const camille = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
    const shifts = await prisma.shift.findMany({ where: { eventId: event.id }, orderBy: { date: "asc" } })
    const accueil = shifts.find(s => s.roleName === "Accueil" && s.startTime === "09:00")!
    const offer = shifts.find(s => s.roleName === "Buvette" && s.startTime === "18:00")!
    if (!accueil || !offer) throw new Error("Run demo seed before personal-withdrawals")
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: camille.id, status: { in: ["offered", "requested"] } } })
    await prisma.shift.deleteMany({ where: { eventId: event.id, roleName: "Navette", label: "Navette du dimanche" } })
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: camille.id, status: "active", shiftId: { not: accueil.id } } })
    await prisma.shift.update({ where: { id: accueil.id }, data: { contactName: "Manon Aebi", contactPhone: "079 000 00 03", instructions: "Arrive 15 minutes avant, au stand bleu.", latitude: 46.1805734, longitude: 6.1228285 } })
    const sunday = shifts.find(s => s.roleName === "Démontage")!.date
    const request = await prisma.shift.create({ data: { eventId: event.id, roleName: "Navette", label: "Navette du dimanche", date: sunday, startTime: "08:00", endTime: "10:00", capacity: 2, requiresApproval: true, colorKey: "violet", displayOrder: 3 } })
    await prisma.registration.create({ data: { eventId: event.id, volunteerId: camille.id, shiftId: offer.id, status: "offered", source: "public_form", waitingExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), ...registrationToken.data("demo-offer-camille-0001") } })
    await prisma.registration.create({ data: { eventId: event.id, volunteerId: camille.id, shiftId: request.id, status: "requested", source: "public_form", ...registrationToken.data("demo-request-camille-0001") } })
    console.log("✓ Personal withdrawals: Camille has active, waiting, offered and requested registrations without overlapping shifts")
    return
  }
  throw new Error(`Unknown video scenario: ${scenario}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
