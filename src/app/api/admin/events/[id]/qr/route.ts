import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { eventPublicUrl } from "@/lib/urls"
import QRCode from "qrcode"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const url = new URL(req.url)
  const format = (url.searchParams.get("format") ?? "png").toLowerCase()

  const event = await db.event.findFirst({
    where: { id },
    select: { slug: true, title: true, organization: { select: { slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const target = eventPublicUrl(event.organization.slug, event.slug)

  if (format === "svg") {
    const svg = await QRCode.toString(target, { type: "svg", margin: 2, width: 600 })
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `inline; filename="${event.slug}-qr.svg"`,
      },
    })
  }

  const buffer = await QRCode.toBuffer(target, { type: "png", margin: 2, width: 600 })
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${event.slug}-qr.png"`,
    },
  })
}
