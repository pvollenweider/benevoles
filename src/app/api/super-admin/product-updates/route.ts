import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"

// List past broadcasts (history, not a queue) and how many admins are currently opted in — see
// issue #200.
export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const [sends, recipientCount] = await Promise.all([
    db.productUpdateSend.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.adminUser.count({ where: { isActive: true, receiveProductUpdates: true } }),
  ])

  return NextResponse.json({ sends, recipientCount })
}
