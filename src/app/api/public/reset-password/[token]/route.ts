import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

const schema = z.object({
  password: z.string().min(8).max(200),
})

/**
 * GET — quickly check if the token is still valid before showing the form.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const reset = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { email: true } } },
  })
  if (!reset) return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  if (reset.usedAt) return NextResponse.json({ error: "Lien déjà utilisé" }, { status: 410 })
  if (reset.expiresAt < new Date()) return NextResponse.json({ error: "Lien expiré" }, { status: 410 })

  return NextResponse.json({ email: reset.user.email })
}

/**
 * POST — actually reset. Marks the token as used and updates the
 * user's password hash atomically.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const reset = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!reset) return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  if (reset.usedAt) return NextResponse.json({ error: "Lien déjà utilisé" }, { status: 410 })
  if (reset.expiresAt < new Date()) return NextResponse.json({ error: "Lien expiré" }, { status: 410 })

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ])

  return NextResponse.json({ success: true })
}
