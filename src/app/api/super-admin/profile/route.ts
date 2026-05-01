import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { passwordSchema } from "@/lib/password"

const schema = z
  .object({
    email: z.string().email().optional(),
    currentPassword: z.string().min(1),
    newPassword: passwordSchema.optional(),
  })
  .refine((d) => d.email || d.newPassword, {
    message: "Au moins un champ à modifier (email ou nouveau mot de passe).",
  })

export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { email, currentPassword, newPassword } = parsed.data

  const user = await prisma.adminUser.findUnique({ where: { id: session.user.id } })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 400 })

  if (email && email !== user.email) {
    const conflict = await prisma.adminUser.findUnique({ where: { email } })
    if (conflict) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 })
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      ...(email ? { email } : {}),
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 12) } : {}),
    },
  })

  return NextResponse.json({ ok: true })
}
