// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { reportError } from "./report-error"
import { ACTIVITY_THROTTLE_MS } from "./org-inactivity"

/**
 * Records that an organisation was used (#811): its administrators changed something through the
 * organisation's own client (src/lib/prisma-org.ts), or a volunteer registered to one of its
 * events. Never from scheduled jobs (they use the raw client) nor from page views. At most one
 * write per hour and per organisation. Never throws: a statistic must not fail a request.
 */
export async function touchOrgActivity(organizationId: string, now: Date = new Date()): Promise<void> {
  try {
    await prisma.organization.updateMany({
      where: {
        id: organizationId,
        OR: [{ lastMeaningfulActivityAt: null }, { lastMeaningfulActivityAt: { lt: new Date(now.getTime() - ACTIVITY_THROTTLE_MS) } }],
      },
      data: { lastMeaningfulActivityAt: now },
    })
  } catch (e) {
    reportError("org_activity.touch")(e)
  }
}
