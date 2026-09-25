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

// Synchronous, admin-triggered broadcast to the opted-in beta-tester (AdminUser) pool — see
// issue #200. Not a queue: a handful of recipients, sent by hand, not periodically. Best-effort
// per recipient (one failed send doesn't stop the rest), logged as a single ProductUpdateSend row.
export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { db, session } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { subject, content } = parsed.data

  const recipients = await db.adminUser.findMany({
    where: { isActive: true, receiveProductUpdates: true },
    select: { id: true, email: true, name: true },
  })

  let successCount = 0
  await Promise.all(
    recipients.map(async (admin) => {
      const unsubscribeUrl = `${BASE_URL}/api/public/product-updates/unsubscribe?admin=${admin.id}&token=${unsubscribeToken(admin.id)}`
      const result = await sendNotification({
        kind: "product_update",
        recipient: { email: admin.email, name: admin.name },
        data: { subject, content, unsubscribeUrl },
      })
      if (result.ok) successCount++
    })
  )

  const send = await db.productUpdateSend.create({
    data: {
      subject,
      content,
      sentByAdminId: session.user?.id ?? null,
      recipientCount: recipients.length,
      successCount,
    },
  })

  return NextResponse.json(send, { status: 201 })
}
