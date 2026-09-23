import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

// Read-only roster for a sector leader (#186): who's signed up for their roleName's shifts.
// No mutation here — v1 is intentionally read-only, see prisma/schema.prisma's SectorLeader doc.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = rateLimit(getClientIp(req), "leader-token-read", 30, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  const leader = await prisma.sectorLeader.findUnique({
    where: { token },
    include: { event: { select: { id: true, title: true, slug: true } } },
  })
  if (!leader) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 })

  const registrations = await prisma.registration.findMany({
    where: {
      eventId: leader.eventId,
      status: { in: ["active", "waiting"] },
      shift: { roleName: leader.roleName },
    },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  return NextResponse.json({
    event: { title: leader.event.title, slug: leader.event.slug },
    roleName: leader.roleName,
    leaderName: leader.name,
    registrations: registrations.map((r) => ({
      id: r.id,
      status: r.status,
      comment: r.comment,
      volunteer: {
        firstName: r.volunteer.firstName,
        lastName: r.volunteer.lastName,
        email: r.volunteer.email,
        phone: r.volunteer.phone ?? "",
      },
      shift: {
        label: r.shift.label,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
      },
    })),
  })
}
