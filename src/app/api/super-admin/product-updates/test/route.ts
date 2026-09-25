import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { sendNotification } from "@/lib/notifications"
import { unsubscribeToken } from "@/lib/product-updates"
import { z } from "zod"

const schema = z.object({
  subject: z.string().min(1).max(150),
  content: z.string().min(1).max(10000),
})

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

// Sends only to the calling super admin, and never recorded in the ProductUpdateSend history —
// a preview, not a broadcast. See issue #200's "Envoyer un test".
export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { db, session } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { subject, content } = parsed.data

  if (!session.user?.id) return NextResponse.json({ error: "Session invalide" }, { status: 401 })
  const self = await db.adminUser.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true } })
  if (!self) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 })

  const unsubscribeUrl = `${BASE_URL}/api/public/product-updates/unsubscribe?admin=${self.id}&token=${unsubscribeToken(self.id)}`
  const result = await sendNotification({
    kind: "product_update",
    recipient: { email: self.email, name: self.name },
    data: { subject: `[Test] ${subject}`, content, unsubscribeUrl },
  })

  if (!result.ok) return NextResponse.json({ error: "Échec de l'envoi du test." }, { status: 502 })
  return NextResponse.json({ success: true })
}
