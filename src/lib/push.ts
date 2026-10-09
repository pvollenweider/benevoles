// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { organizationBlocksSending } from "@/lib/notifications/org-send-guard"
import webpush from "web-push"
import { env } from "./env"
import { prisma } from "./prisma"
import { reportError } from "./report-error"
import { siteDomain } from "@/lib/site"

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  const email = env.VAPID_EMAIL ?? env.EMAIL_FROM ?? `mailto:admin@${siteDomain()}`

  if (!publicKey || !privateKey) return

  const mailtoEmail = email.includes("<")
    ? `mailto:${email.match(/<(.+)>/)?.[1] ?? `admin@${siteDomain()}`}`
    : email.startsWith("mailto:")
    ? email
    : `mailto:${email}`

  webpush.setVapidDetails(mailtoEmail, publicKey, privateKey)
  configured = true
}

export type PushOutcome = { sent: number; failed: number; removed: number }

/** Sends to every device of the volunteer; gone subscriptions (404/410) are removed. */
export async function sendPushToVolunteer(
  volunteerId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<PushOutcome> {
  ensureConfigured()
  if (!configured) return { sent: 0, failed: 0, removed: 0 }
  // Same rule as the emails (#814): nothing for a member of a deactivated or deleted organisation.
  const volunteer = await prisma.volunteer.findUnique({ where: { id: volunteerId }, select: { organizationId: true } })
  if (await organizationBlocksSending(volunteer?.organizationId)) return { sent: 0, failed: 0, removed: 0 }

  const subs = await prisma.pushSubscription.findMany({ where: { volunteerId } })
  const dead: string[] = []
  let sent = 0
  let failed = 0

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          JSON.stringify(payload),
          { TTL: 3 * 24 * 3600 }
        )
        sent++
      } catch (err: unknown) {
        failed++
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
      }
    })
  )

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(reportError("push.cleanup_dead_subscriptions"))
  }
  return { sent, failed, removed: dead.length }
}

/** Whether push is set up on this server (VAPID keys). */
export function pushConfigured(): boolean {
  ensureConfigured()
  return configured
}

/** Devices subscribed by these volunteers: the push count of a targeted message (#468). */
export async function pushDeviceCount(volunteerIds: string[]): Promise<number> {
  if (volunteerIds.length === 0 || !pushConfigured()) return 0
  return prisma.pushSubscription.count({ where: { volunteerId: { in: volunteerIds } } })
}

/**
 * The push of a targeted message (#468), after the response: one notification per device of each
 * recipient, outcomes added to the message's history row, separately from the emails.
 */
export async function sendTargetedPush(
  targetedMessageId: string,
  /** Per recipient: their link, and their own title and body when the text has variables (#482). */
  targets: { volunteerId: string; url: string; title?: string; body?: string }[],
  payload: { title: string; body: string; tag: string },
): Promise<PushOutcome> {
  const total: PushOutcome = { sent: 0, failed: 0, removed: 0 }
  for (const t of targets) {
    const o = await sendPushToVolunteer(t.volunteerId, { ...payload, ...(t.title ? { title: t.title } : {}), ...(t.body ? { body: t.body } : {}), url: t.url }).catch((e) => { reportError("push.targeted")(e); return { sent: 0, failed: 0, removed: 0 } })
    total.sent += o.sent
    total.failed += o.failed
    total.removed += o.removed
  }
  await prisma.targetedMessage.update({
    where: { id: targetedMessageId },
    data: { pushSent: { increment: total.sent }, pushFailed: { increment: total.failed } },
  }).catch(reportError("push.targeted_counts"))
  return total
}
