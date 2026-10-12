// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { eventPublicUrl } from "@/lib/urls"
import QRCode from "qrcode"
import { groupLinkUrl, groupQrFileStem } from "@/lib/group-links"

// The QR code of the event's public page, or with `?link=<id>` of one of its share links per
// group (#947): that link is read through the scoped client, so another event's or organisation's
// link answers 404 like an unknown one.

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

  // `download=1` (the group links' buttons, #947): saved as a file even when opened in a new tab.
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline"
  let target = eventPublicUrl(event.organization.slug, event.slug)
  let stem = `${event.slug}-qr`
  const linkId = url.searchParams.get("link")
  if (linkId) {
    const link = await db.eventGroupLink.findFirst({ where: { id: linkId, eventId: id }, select: { code: true, name: true } })
    if (!link) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
    target = groupLinkUrl(target, link.code)
    stem = groupQrFileStem(event.slug, link.name)
  }

  if (format === "svg") {
    const svg = await QRCode.toString(target, { type: "svg", margin: 2, width: 600 })
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `${disposition}; filename="${stem}.svg"`,
      },
    })
  }

  const buffer = await QRCode.toBuffer(target, { type: "png", margin: 2, width: 600 })
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `${disposition}; filename="${stem}.png"`,
    },
  })
}
