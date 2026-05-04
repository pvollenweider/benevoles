import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { passwordErrors } from "@/lib/password"
import bcrypt from "bcryptjs"
import { z } from "zod"

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

  const errors = passwordErrors(newPassword)
  if (errors.length > 0) {
    return NextResponse.json({ error: "Password does not meet requirements", errors }, { status: 400 })
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: guard.session.user.id },
    select: { passwordHash: true },
  })
  if (!admin) return NextResponse.json({ error: "Account not found" }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, admin.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.adminUser.update({
    where: { id: guard.session.user.id },
    data: { passwordHash },
  })

  return NextResponse.json({ ok: true })
}
