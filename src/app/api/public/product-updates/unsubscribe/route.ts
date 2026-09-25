import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyUnsubscribeToken } from "@/lib/product-updates"

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

// No login required — the link itself is the credential (HMAC-signed, see product-updates.ts),
// same spirit as every other token-bearing public link in this app.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const adminId = url.searchParams.get("admin")
  const token = url.searchParams.get("token")

  if (!adminId || !token || !verifyUnsubscribeToken(adminId, token)) {
    return NextResponse.redirect(`${BASE_URL}/product-updates/unsubscribed?ok=0`)
  }

  await prisma.adminUser
    .update({
      where: { id: adminId },
      data: { receiveProductUpdates: false, productUpdatesUnsubscribedAt: new Date() },
    })
    .catch(() => null)

  return NextResponse.redirect(`${BASE_URL}/product-updates/unsubscribed?ok=1`)
}
