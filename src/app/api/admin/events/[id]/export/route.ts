import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { stringify } from "csv-stringify/sync"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shifts: {
        include: {
          registrations: {
            where: { status: "active" },
            include: { volunteer: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const rows: string[][] = [
    ["Jour", "Heure début", "Heure fin", "Poste", "Statut créneau", "Prénom", "Nom", "Email", "Téléphone", "Commentaire", "Source"],
  ]

  for (const shift of event.shifts) {
    if (shift.registrations.length === 0) {
      rows.push([
        shift.date.toLocaleDateString("fr-FR"),
        shift.startTime,
        shift.endTime,
        shift.label,
        shift.status,
        "", "", "", "", "", "",
      ])
    } else {
      for (const reg of shift.registrations) {
        rows.push([
          shift.date.toLocaleDateString("fr-FR"),
          shift.startTime,
          shift.endTime,
          shift.label,
          shift.status,
          reg.volunteer.firstName,
          reg.volunteer.lastName,
          reg.volunteer.email,
          reg.volunteer.phone ?? "",
          reg.comment ?? "",
          reg.source,
        ])
      }
    }
  }

  const csv = stringify(rows)
  const filename = `${event.slug}-inscriptions.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
