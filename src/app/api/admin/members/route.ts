import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { z } from "zod"

const memberSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
})

export async function GET(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const url = new URL(req.url)
  const search = url.searchParams.get("q")?.trim() ?? ""
  const tag = url.searchParams.get("tag")?.trim() ?? ""

  const members = await db.member.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  })

  return NextResponse.json(members)
}

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = memberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data

  if (data.email) {
    const existing = await db.member.findFirst({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json(
        { error: "Un membre avec cet email existe déjà." },
        { status: 409 },
      )
    }
  }

  const member = await db.member.create({
    data: {
      organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      tags: data.tags ?? [],
      notes: data.notes || null,
      active: data.active ?? true,
    },
  })

  return NextResponse.json(member, { status: 201 })
}
