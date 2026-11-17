// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireOrgSession } from "@/lib/auth-guard"
import { eventPublicUrl } from "@/lib/urls"
import { groupQrFileStem } from "@/lib/group-links"
import { shiftShareLinkUrl } from "@/lib/shift-share-links"

// The QR code of one shift's share link (#1386), like the group links' (#947). The link is read
// through the scoped client, so another event's or organisation's link answers 404 like an unknown
// one. `format=png` (the panel's « QR code PNG ») or `svg`; `download=1` saves it as a file.

export async function GET(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id, linkId } = await params
  const url = new URL(req.url)
  const format = (url.searchParams.get("format") ?? "png").toLowerCase()

  const event = await db.event.findFirst({
    where: { id },
    select: { slug: true, organization: { select: { slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const link = await db.shiftShareLink.findFirst({
    where: { id: linkId, eventId: id },
    select: { code: true, shift: { select: { label: true, roleName: true } } },
  })
  if (!link) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const target = shiftShareLinkUrl(eventPublicUrl(event.organization.slug, event.slug), link.code)
  const stem = groupQrFileStem(event.slug, link.shift.label || link.shift.roleName)
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline"

  if (format === "svg") {
    const svg = await QRCode.toString(target, { type: "svg", margin: 2, width: 600 })
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `${disposition}; filename="${stem}.svg"` },
    })
  }

  const buffer = await QRCode.toBuffer(target, { type: "png", margin: 2, width: 600 })
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `${disposition}; filename="${stem}.png"` },
  })
}
