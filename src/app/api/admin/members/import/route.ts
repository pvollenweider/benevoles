import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { parseCsv, parseXlsx } from "@/lib/csv-import"

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const form = await req.formData()
  const file = form.get("file")
  const onDuplicate = (form.get("onDuplicate") as string) ?? "skip" // "skip" | "update"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

  let preview
  try {
    preview = isXlsx ? await parseXlsx(buffer) : parseCsv(buffer)
  } catch (err) {
    return NextResponse.json(
      { error: "Impossible de lire le fichier", detail: String(err) },
      { status: 400 },
    )
  }

  if (preview.rows.length === 0 && preview.errors.length === 0) {
    return NextResponse.json({ error: "Le fichier est vide" }, { status: 400 })
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const errors = [...preview.errors]

  // Pre-fetch existing emails to avoid one query per row.
  const emailsInImport = preview.rows.map((r) => r.email).filter((e): e is string => !!e)
  const existing = emailsInImport.length
    ? await prisma.member.findMany({
        where: { organizationId, email: { in: emailsInImport } },
        select: { id: true, email: true },
      })
    : []
  const existingByEmail = new Map(existing.map((m) => [m.email, m.id]))

  for (const row of preview.rows) {
    const existingId = row.email ? existingByEmail.get(row.email) : undefined
    if (existingId) {
      if (onDuplicate === "update") {
        await prisma.member.update({
          where: { id: existingId },
          data: {
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone ?? null,
            tags: row.tags ?? [],
            active: true,
          },
        })
        updated++
      } else {
        skipped++
      }
    } else {
      try {
        await prisma.member.create({
          data: {
            organizationId,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email ?? null,
            phone: row.phone ?? null,
            tags: row.tags ?? [],
          },
        })
        created++
      } catch (err) {
        errors.push({ line: -1, reason: `Échec création ${row.firstName} ${row.lastName} : ${String(err).slice(0, 100)}` })
      }
    }
  }

  return NextResponse.json({
    created,
    updated,
    skipped,
    errors,
    detectedColumns: preview.detectedColumns,
    totalParsed: preview.rows.length,
  })
}
