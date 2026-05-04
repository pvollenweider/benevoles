import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } })
  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const cookieStore = await cookies()
  cookieStore.set("sa-org-id", id, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000"
  const proto = req.headers.get("x-forwarded-proto") ?? "http"
  return NextResponse.redirect(`${proto}://${host}/admin/events`)
}
