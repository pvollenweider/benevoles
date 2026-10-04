// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { env, releaseCheckEnabled } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { fetchLatestRelease } from "@/lib/release-check-fetch"
import { shouldNotify } from "@/lib/release-check"
import { REPOSITORY_URL } from "@/lib/landing-seo"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import pkg from "../../../../../package.json"

export const dynamic = "force-dynamic"

// Same rule as the other cron routes: Bearer CRON_SECRET, localhost in dev only.
function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET
  if (expected) return req.headers.get("authorization") === `Bearer ${expected}`
  if (process.env.NODE_ENV === "production") return false
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }

/**
 * Self-hosted release check (#612), once a day: compares the deployed version against the
 * latest published GitHub release and emails the super admins once per new version. Does
 * nothing at all — no outbound request — when RELEASE_CHECK=off. A failed GitHub request is
 * silent (logged by fetchLatestRelease, never thrown): this route always answers 200 once
 * authorized.
 */
async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  if (!releaseCheckEnabled()) {
    return NextResponse.json({ enabled: false })
  }

  const currentVersion = pkg.version as string
  const release = await fetchLatestRelease()

  const previous = await prisma.releaseCheckState.findUnique({ where: { id: "singleton" } })
  const state = await prisma.releaseCheckState.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      latestVersion: release?.version ?? null,
      releaseUrl: release?.url ?? null,
      lastCheckedAt: now,
    },
    update: {
      // A failed fetch keeps the last known release rather than erasing it; only the checked-at
      // timestamp always advances, so the health page shows the check is still running.
      ...(release ? { latestVersion: release.version, releaseUrl: release.url } : {}),
      lastCheckedAt: now,
    },
  })

  if (!release) {
    return NextResponse.json({ enabled: true, checked: false, latestVersion: state.latestVersion })
  }

  const notify = shouldNotify({
    currentVersion,
    latestVersion: release.version,
    lastNotifiedVersion: previous?.lastNotifiedVersion ?? null,
  })

  let notified = 0
  if (notify) {
    const superAdmins = await prisma.adminUser.findMany({
      where: { role: "super_admin", isActive: true },
      select: { email: true },
    })
    const upgradeDocsUrl = `${REPOSITORY_URL}/blob/main/docs/deploiement.md`
    const ids = await enqueueNotifications(
      superAdmins.map((admin) => ({
        kind: "release_available",
        recipient: { email: admin.email },
        dedupeKey: `release_available:${release.version}:${admin.email}`,
        data: {
          version: release.version,
          currentVersion,
          releaseUrl: release.url,
          upgradeDocsUrl,
        },
      })),
    )
    notified = ids.length
    deliverAfterResponse(ids)
    await prisma.releaseCheckState.update({ where: { id: "singleton" }, data: { lastNotifiedVersion: release.version } })
  }

  return NextResponse.json({
    enabled: true,
    checked: true,
    latestVersion: release.version,
    notified,
  })
}
