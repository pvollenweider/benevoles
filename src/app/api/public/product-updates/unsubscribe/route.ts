// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyUnsubscribeToken } from "@/lib/product-updates"
import { checkAdminMutation } from "@/lib/request-origin"
import { configuredAppUrl } from "@/lib/urls"

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

// The link in an email keeps its old address. Opening it no longer unsubscribes anyone: mail
// scanners open links by themselves. GET only leads to the confirmation page, where the person
// presses « Me désabonner » (POST), like every other link that acts in this app.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const adminId = url.searchParams.get("admin")
  const token = url.searchParams.get("token")

  if (!adminId || !token || !verifyUnsubscribeToken(adminId, token)) {
    return NextResponse.redirect(`${BASE_URL}/product-updates/unsubscribed?ok=0`)
  }

  const confirm = new URL(`${BASE_URL}/product-updates/unsubscribe`)
  confirm.searchParams.set("admin", adminId)
  confirm.searchParams.set("token", token)
  return NextResponse.redirect(confirm)
}

/**
 * The « Me désabonner » button of the confirmation page. The token and admin id are checked again
 * here, never trusted from the page; the origin and form-body policy is the one of
 * src/lib/request-origin.ts, also applied by the proxy to this path.
 */
export async function POST(req: Request) {
  const refused = checkAdminMutation({
    method: req.method,
    pathname: new URL(req.url).pathname,
    headers: req.headers,
    configuredAppUrl: configuredAppUrl(),
    nodeEnv: process.env.NODE_ENV,
  })
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })

  const form = await req.formData().catch(() => null)
  const adminId = form?.get("admin")
  const token = form?.get("token")

  if (typeof adminId !== "string" || typeof token !== "string" || !verifyUnsubscribeToken(adminId, token)) {
    return NextResponse.redirect(`${BASE_URL}/product-updates/unsubscribed?ok=0`, 303)
  }

  try {
    await prisma.adminUser.update({
      where: { id: adminId },
      data: { receiveProductUpdates: false, productUpdatesUnsubscribedAt: new Date() },
    })
  } catch {
    return NextResponse.redirect(`${BASE_URL}/product-updates/unsubscribed?ok=0`, 303)
  }

  return NextResponse.redirect(`${BASE_URL}/product-updates/unsubscribed?ok=1`, 303)
}
