import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12)

  await prisma.adminUser.upsert({
    where: { email: "admin@benevoles.fr" },
    update: {},
    create: {
      email: "admin@benevoles.fr",
      name: "Administrateur",
      passwordHash,
      role: "super_admin",
    },
  })

  console.log("✓ Admin créé : admin@benevoles.fr / admin123")

  const event = await prisma.event.upsert({
    where: { slug: "spectacle-cirque-2026" },
    update: {},
    create: {
      slug: "spectacle-cirque-2026",
      title: "Spectacle de Cirque 2026",
      description: "Le grand spectacle annuel de fin d'année.",
      location: "Salle des fêtes, Paris",
      publicStatus: "published",
      startDate: new Date("2026-06-14"),
      endDate: new Date("2026-06-15"),
      publicInstructions: "Merci pour votre aide ! Présentez-vous 15 minutes avant le début de votre créneau.",
      confirmationMessage: "Merci pour votre inscription ! Nous vous contacterons si besoin. À bientôt !",
    },
  })

  const shifts = [
    { roleName: "Billetterie", label: "Billetterie — Samedi matin", date: new Date("2026-06-14"), startTime: "09:00", endTime: "12:00", capacity: 3 },
    { roleName: "Billetterie", label: "Billetterie — Samedi après-midi", date: new Date("2026-06-14"), startTime: "13:00", endTime: "17:00", capacity: 3 },
    { roleName: "Buvette", label: "Buvette — Samedi", date: new Date("2026-06-14"), startTime: "10:00", endTime: "18:00", capacity: 4 },
    { roleName: "Loge", label: "Gestion des loges", date: new Date("2026-06-14"), startTime: "08:00", endTime: "12:00", capacity: 2 },
    { roleName: "Montage", label: "Montage décors", date: new Date("2026-06-14"), startTime: "07:00", endTime: "09:00", capacity: 5 },
    { roleName: "Billetterie", label: "Billetterie — Dimanche matin", date: new Date("2026-06-15"), startTime: "09:00", endTime: "12:00", capacity: 3 },
    { roleName: "Buvette", label: "Buvette — Dimanche", date: new Date("2026-06-15"), startTime: "10:00", endTime: "18:00", capacity: 4 },
    { roleName: "Démontage", label: "Démontage décors", date: new Date("2026-06-15"), startTime: "18:00", endTime: "21:00", capacity: 5 },
  ]

  for (const shift of shifts) {
    const shiftId = `seed-${event.id}-${shift.label.replace(/[^a-z0-9]/gi, "")}`
    await prisma.shift.upsert({
      where: { id: shiftId },
      update: {},
      create: {
        id: shiftId,
        eventId: event.id,
        ...shift,
        status: "open",
        displayOrder: 0,
      },
    })
  }

  console.log(`✓ Événement créé : ${event.title} avec ${shifts.length} créneaux`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
